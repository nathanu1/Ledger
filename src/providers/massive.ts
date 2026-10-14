/**
 * Massive (formerly Polygon.io) adapter.
 *
 * Verified October 2026 against https://massive.com/docs/rest/quickstart and
 * https://massive.com/docs/rest/stocks/aggregates/custom-bars:
 *   Base URL  https://api.massive.com
 *   Auth      Authorization: Bearer <key>  (or ?apiKey=)
 *   Bars      GET /v2/aggs/ticker/{ticker}/range/1/day/{from}/{to}?adjusted=true&sort=asc&limit=50000
 *             results[]: c h l o v vw t(ms) n
 *   Basic plan (free): 5 API calls/minute, 2 years of history, end-of-day data,
 *             reference data and corporate actions included; "individual use".
 *   `adjusted` adjusts for splits only (not dividends).
 */
import type { ISODate } from "@/calc/types";
import { fetchJson } from "./http";
import { classifySic } from "./sic-sectors";
import { ProviderError, type MarketDataCapabilities, type MarketDataProvider, type PriceHistory, type Provenance, type Quote, type SearchResult, type SecurityProfile } from "./types";

interface AggsPayload {
  ticker: string;
  adjusted: boolean;
  resultsCount: number;
  status: string;
  results?: Array<{ c: number; h: number; l: number; o: number; v: number; vw?: number; t: number; n?: number }>;
  next_url?: string;
}

interface TickerDetailsPayload {
  results?: {
    ticker: string;
    name: string;
    market: string;
    locale: string;
    primary_exchange?: string;
    type?: string;
    description?: string;
    homepage_url?: string;
    sic_code?: string;
    sic_description?: string;
    share_class_shares_outstanding?: number;
    weighted_shares_outstanding?: number;
    cik?: string;
  };
}

interface TickerSearchPayload {
  results?: Array<{ ticker: string; name: string; primary_exchange?: string; type?: string; cik?: string }>;
}

const nyDate = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" });

export function msToNewYorkDate(ms: number): ISODate {
  return nyDate.format(new Date(ms));
}

export class MassiveProvider implements MarketDataProvider {
  readonly id = "massive" as const;
  readonly capabilities: MarketDataCapabilities = {
    adjustment: "splits",
    historyYears: 2,
    quoteTiming: "end-of-day",
    rateLimit: "5 requests per minute (Basic plan)",
    notes: [
      "Daily bars are adjusted for splits only; dividends are not reinvested, so benchmark comparisons from this source are price returns.",
      "The Basic plan returns end-of-day data; quotes are the previous session's close.",
      "History is limited to the most recent two years on the Basic plan.",
    ],
  };
  private readonly headers: Record<string, string>;
  constructor(
    private readonly apiKey: string,
    private readonly baseUrl = "https://api.massive.com",
  ) {
    if (!apiKey) throw new ProviderError("massive", "not_configured", "MASSIVE_API_KEY is not set.");
    this.headers = { Authorization: `Bearer ${apiKey}`, Accept: "application/json" };
  }

  private provenance(sourceRef: string): Provenance {
    return { provider: "massive", sourceRef, retrievedAt: new Date().toISOString() };
  }

  async getDailyHistory(symbol: string, from: ISODate, to: ISODate): Promise<PriceHistory> {
    const path = `/v2/aggs/ticker/${encodeURIComponent(symbol.toUpperCase())}/range/1/day/${from}/${to}`;
    const url = `${this.baseUrl}${path}?adjusted=true&sort=asc&limit=50000`;
    const payload = await fetchJson<AggsPayload>(url, { provider: "massive", endpoint: "aggregates/day", headers: this.headers, failFastOnQuota: true });
    const bars = (payload.results ?? []).map((r) => ({
      date: msToNewYorkDate(r.t),
      open: r.o,
      high: r.h,
      low: r.l,
      close: r.c,
      // The endpoint returns split-adjusted prices when adjusted=true; raw close is not provided separately.
      adjClose: r.c,
      volume: r.v,
    }));
    return { symbol: symbol.toUpperCase(), bars, adjustment: "splits", provenance: this.provenance(`${this.baseUrl}${path}`) };
  }

  async getQuote(symbol: string): Promise<Quote> {
    const path = `/v2/aggs/ticker/${encodeURIComponent(symbol.toUpperCase())}/prev`;
    const url = `${this.baseUrl}${path}?adjusted=true`;
    const payload = await fetchJson<AggsPayload>(url, { provider: "massive", endpoint: "aggregates/prev", headers: this.headers, failFastOnQuota: true });
    const bar = payload.results?.[0];
    if (!bar) throw new ProviderError("massive", "not_found", `No previous-close data for ${symbol}.`);
    return {
      symbol: symbol.toUpperCase(),
      price: bar.c,
      change: null,
      changePct: null,
      previousClose: null,
      asOf: new Date(bar.t).toISOString(),
      session: "eod",
      currency: "USD",
      provenance: this.provenance(`${this.baseUrl}${path}`),
    };
  }

  async getProfile(symbol: string): Promise<SecurityProfile | null> {
    const path = `/v3/reference/tickers/${encodeURIComponent(symbol.toUpperCase())}`;
    const url = `${this.baseUrl}${path}`;
    let payload: TickerDetailsPayload;
    try {
      payload = await fetchJson<TickerDetailsPayload>(url, { provider: "massive", endpoint: "reference/tickers", headers: this.headers, failFastOnQuota: true });
    } catch (error) {
      if (error instanceof ProviderError && error.kind === "not_found") return null;
      throw error;
    }
    const r = payload.results;
    if (!r) return null;
    const classification = classifySic(r.sic_code ?? null, r.sic_description ?? null);
    const isEtf = (r.type ?? "").toUpperCase() === "ETF" || (r.type ?? "").toUpperCase() === "ETN" || (r.type ?? "").toUpperCase() === "ETV";
    return {
      symbol: r.ticker,
      name: r.name,
      exchange: r.primary_exchange ?? null,
      securityType: isEtf ? "etf" : "stock",
      sector: classification?.sector ?? null,
      industry: classification?.industry ?? null,
      classificationBasis: r.sic_code ? `Derived from SIC code ${r.sic_code} (${r.sic_description ?? ""})` : null,
      cik: r.cik ? r.cik.padStart(10, "0") : null,
      sic: r.sic_code ?? null,
      description: r.description ?? null,
      website: r.homepage_url ?? null,
      fiscalYearEnd: null,
      sharesOutstanding: r.weighted_shares_outstanding ?? r.share_class_shares_outstanding ?? null,
      provenance: this.provenance(url),
    };
  }

  async search(query: string): Promise<SearchResult[]> {
    const url = `${this.baseUrl}/v3/reference/tickers?search=${encodeURIComponent(query)}&market=stocks&active=true&limit=20`;
    const payload = await fetchJson<TickerSearchPayload>(url, { provider: "massive", endpoint: "reference/tickers/search", headers: this.headers, failFastOnQuota: true });
    return (payload.results ?? []).map((r) => ({
      symbol: r.ticker,
      name: r.name,
      exchange: r.primary_exchange ?? null,
      securityType: (r.type ?? "").toUpperCase() === "ETF" ? "etf" : (r.type ?? "").toUpperCase() === "CS" ? "stock" : null,
      cik: r.cik ?? null,
      provider: "massive" as const,
    }));
  }
}
