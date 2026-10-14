/**
 * Alpha Vantage adapter.
 *
 * Verified October 2026 with the public demo key against https://www.alphavantage.co/query:
 *   GLOBAL_QUOTE          "Global Quote": { "05. price", "07. latest trading day", "08. previous close", "09. change", "10. change percent" }
 *   TIME_SERIES_DAILY     free; outputsize=compact returns the latest 100 unadjusted sessions ("full" requires premium)
 *   TIME_SERIES_DAILY_ADJUSTED  premium only ("5. adjusted close", "7. dividend amount", "8. split coefficient")
 *   OVERVIEW              Sector, Industry, Description, Exchange, AssetType, FiscalYearEnd, CIK, SharesOutstanding
 *   EARNINGS_CALENDAR     CSV: symbol,name,reportDate,fiscalDateEnding,estimate,currency,timeOfTheDay
 *   SYMBOL_SEARCH         bestMatches[] "1. symbol", "2. name", "3. type", "4. region"
 *   Free tier: 25 requests per day; quota and demo-key notices arrive as HTTP 200 with an "Information" key.
 */
import type { ISODate } from "@/calc/types";
import { fetchJson, fetchText } from "./http";
import { ProviderError, type EarningsEvent, type EarningsProvider, type MarketDataCapabilities, type MarketDataProvider, type PriceHistory, type Provenance, type Quote, type SearchResult, type SecurityProfile } from "./types";

const BASE = "https://www.alphavantage.co/query";

type AvPayload = Record<string, unknown> & { Information?: string; Note?: string; "Error Message"?: string };

function assertNoNotice(provider: "alphavantage", payload: AvPayload, endpoint: string): void {
  const notice = payload.Information ?? payload.Note;
  if (typeof notice === "string") {
    const quota = /rate limit|requests per day|premium|frequency/i.test(notice);
    throw new ProviderError(provider, quota ? "quota" : "invalid", `Alpha Vantage ${endpoint}: ${notice}`, { retryAfterMs: quota ? 3_600_000 : null });
  }
  if (typeof payload["Error Message"] === "string") {
    throw new ProviderError(provider, "invalid", `Alpha Vantage ${endpoint}: ${payload["Error Message"]}`);
  }
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "" || v === "None" || v === "-") return null;
  const n = Number(String(v).replace(/%$/, ""));
  return Number.isFinite(n) ? n : null;
}

export class AlphaVantageProvider implements MarketDataProvider, EarningsProvider {
  readonly id = "alphavantage" as const;
  readonly capabilities: MarketDataCapabilities;
  constructor(
    private readonly apiKey: string,
    private readonly premium = false,
  ) {
    if (!apiKey) throw new ProviderError("alphavantage", "not_configured", "ALPHAVANTAGE_API_KEY is not set.");
    this.capabilities = premium
      ? { adjustment: "splits_dividends", historyYears: 20, quoteTiming: "delayed", rateLimit: "per premium plan", notes: ["Adjusted closes include dividends and splits (total return)."] }
      : {
          adjustment: null,
          historyYears: 0.4,
          quoteTiming: "end-of-day",
          rateLimit: "25 requests per day (free tier)",
          notes: [
            "The free tier returns only the latest 100 daily sessions, unadjusted for splits or dividends.",
            "Quotes update at the end of each trading day on the free tier.",
            "25 requests per day: Ledger caches aggressively and surfaces quota errors instead of guessing.",
          ],
        };
  }

  private provenance(fn: string, symbol?: string): Provenance {
    return { provider: "alphavantage", sourceRef: `${BASE}?function=${fn}${symbol ? `&symbol=${symbol}` : ""}`, retrievedAt: new Date().toISOString() };
  }

  private url(params: Record<string, string>): string {
    const q = new URLSearchParams({ ...params, apikey: this.apiKey });
    return `${BASE}?${q.toString()}`;
  }

  async getQuote(symbol: string): Promise<Quote> {
    const payload = await fetchJson<AvPayload & { "Global Quote"?: Record<string, string> }>(this.url({ function: "GLOBAL_QUOTE", symbol }), {
      provider: "alphavantage",
      endpoint: "GLOBAL_QUOTE",
      failFastOnQuota: true,
    });
    assertNoNotice("alphavantage", payload, "GLOBAL_QUOTE");
    const q = payload["Global Quote"];
    const price = num(q?.["05. price"]);
    if (!q || price === null) throw new ProviderError("alphavantage", "not_found", `No quote for ${symbol}.`);
    const day = q["07. latest trading day"];
    return {
      symbol: symbol.toUpperCase(),
      price,
      change: num(q["09. change"]),
      changePct: num(q["10. change percent"]) !== null ? (num(q["10. change percent"]) as number) / 100 : null,
      previousClose: num(q["08. previous close"]),
      asOf: day ? `${day}T21:00:00.000Z` : new Date().toISOString(),
      session: "eod",
      currency: "USD",
      provenance: this.provenance("GLOBAL_QUOTE", symbol),
    };
  }

  async getDailyHistory(symbol: string, from: ISODate, to: ISODate): Promise<PriceHistory> {
    const fn = this.premium ? "TIME_SERIES_DAILY_ADJUSTED" : "TIME_SERIES_DAILY";
    const payload = await fetchJson<AvPayload & { "Time Series (Daily)"?: Record<string, Record<string, string>> }>(
      this.url({ function: fn, symbol, outputsize: this.premium ? "full" : "compact" }),
      { provider: "alphavantage", endpoint: fn, failFastOnQuota: true },
    );
    assertNoNotice("alphavantage", payload, fn);
    const series = payload["Time Series (Daily)"];
    if (!series) throw new ProviderError("alphavantage", "not_found", `No daily history for ${symbol}.`);
    const bars = Object.entries(series)
      .map(([date, row]) => ({
        date,
        open: num(row["1. open"]),
        high: num(row["2. high"]),
        low: num(row["3. low"]),
        close: num(row["4. close"]) as number,
        adjClose: this.premium ? num(row["5. adjusted close"]) : null,
        volume: num(this.premium ? row["6. volume"] : row["5. volume"]),
      }))
      .filter((b) => b.close !== null && b.date >= from && b.date <= to)
      .sort((a, b) => (a.date < b.date ? -1 : 1));
    return { symbol: symbol.toUpperCase(), bars, adjustment: this.premium ? "splits_dividends" : null, provenance: this.provenance(fn, symbol) };
  }

  async getProfile(symbol: string): Promise<SecurityProfile | null> {
    const payload = await fetchJson<AvPayload & Record<string, string>>(this.url({ function: "OVERVIEW", symbol }), { provider: "alphavantage", endpoint: "OVERVIEW", failFastOnQuota: true });
    assertNoNotice("alphavantage", payload, "OVERVIEW");
    if (!payload.Symbol) return null;
    const assetType = String(payload.AssetType ?? "");
    const fye = payload.FiscalYearEnd ? monthToMMDD(String(payload.FiscalYearEnd)) : null;
    return {
      symbol: String(payload.Symbol),
      name: String(payload.Name ?? payload.Symbol),
      exchange: payload.Exchange ? String(payload.Exchange) : null,
      securityType: /etf/i.test(assetType) ? "etf" : "stock",
      sector: payload.Sector ? titleCase(String(payload.Sector)) : null,
      industry: payload.Industry ? titleCase(String(payload.Industry)) : null,
      classificationBasis: payload.Sector ? "Alpha Vantage company overview" : null,
      cik: payload.CIK ? String(payload.CIK).padStart(10, "0") : null,
      sic: null,
      description: payload.Description ? String(payload.Description) : null,
      website: payload.OfficialSite ? String(payload.OfficialSite) : null,
      fiscalYearEnd: fye,
      sharesOutstanding: num(payload.SharesOutstanding),
      provenance: this.provenance("OVERVIEW", symbol),
    };
  }

  async search(query: string): Promise<SearchResult[]> {
    const payload = await fetchJson<AvPayload & { bestMatches?: Array<Record<string, string>> }>(this.url({ function: "SYMBOL_SEARCH", keywords: query }), {
      provider: "alphavantage",
      endpoint: "SYMBOL_SEARCH",
      failFastOnQuota: true,
    });
    assertNoNotice("alphavantage", payload, "SYMBOL_SEARCH");
    return (payload.bestMatches ?? [])
      .filter((m) => m["4. region"] === "United States")
      .map((m) => ({
        symbol: m["1. symbol"],
        name: m["2. name"],
        exchange: null,
        securityType: /etf/i.test(m["3. type"] ?? "") ? "etf" : /equity/i.test(m["3. type"] ?? "") ? "stock" : null,
        cik: null,
        provider: "alphavantage" as const,
      }));
  }

  /** One market-wide calendar request (cached by the caller), filtered to the requested symbols. */
  async getUpcomingEarnings(symbols: string[]): Promise<EarningsEvent[]> {
    const text = await fetchText(this.url({ function: "EARNINGS_CALENDAR", horizon: "3month" }), { provider: "alphavantage", endpoint: "EARNINGS_CALENDAR", failFastOnQuota: true, timeoutMs: 60_000 });
    if (text.trim().startsWith("{")) {
      assertNoNotice("alphavantage", JSON.parse(text) as AvPayload, "EARNINGS_CALENDAR");
    }
    const wanted = new Set(symbols.map((s) => s.toUpperCase()));
    const lines = text.split(/\r?\n/).filter(Boolean);
    const header = lines[0]?.split(",") ?? [];
    const col = (name: string) => header.indexOf(name);
    const [iSym, iDate, iFiscal, iEst, iTime] = [col("symbol"), col("reportDate"), col("fiscalDateEnding"), col("estimate"), col("timeOfTheDay")];
    const retrievedAt = new Date().toISOString();
    const out: EarningsEvent[] = [];
    for (const line of lines.slice(1)) {
      const cells = line.split(",");
      const symbol = cells[iSym]?.toUpperCase();
      if (!symbol || !wanted.has(symbol)) continue;
      const time = (cells[iTime] ?? "").trim();
      out.push({
        symbol,
        date: cells[iDate],
        status: "estimated",
        timeOfDay: time === "pre-market" ? "pre-market" : time === "post-market" ? "post-market" : null,
        fiscalPeriodEnd: cells[iFiscal] || null,
        epsEstimate: num(cells[iEst]),
        basis: "Provider calendar (Alpha Vantage). Dates are projections until the company confirms them.",
        sourceUrl: null,
        provenance: { provider: "alphavantage", sourceRef: `${BASE}?function=EARNINGS_CALENDAR&horizon=3month`, retrievedAt },
      });
    }
    return out;
  }
}

function monthToMMDD(month: string): string | null {
  const months = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
  const idx = months.indexOf(month.trim().toLowerCase());
  if (idx < 0) return null;
  const lastDay = new Date(Date.UTC(2023, idx + 1, 0)).getUTCDate();
  return `${String(idx + 1).padStart(2, "0")}${String(lastDay).padStart(2, "0")}`;
}

function titleCase(s: string): string {
  return s.toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase());
}
