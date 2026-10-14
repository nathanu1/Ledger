/**
 * SEC EDGAR adapter: company tickers, XBRL company facts and submissions.
 *
 * Endpoints (documented at https://www.sec.gov/search-filings/edgar-application-programming-interfaces):
 *   https://www.sec.gov/files/company_tickers_exchange.json
 *   https://data.sec.gov/api/xbrl/companyfacts/CIK##########.json
 *   https://data.sec.gov/submissions/CIK##########.json
 *
 * Fair-access policy: declare a User-Agent with contact information and stay
 * under 10 requests per second. No API key is required.
 */
import { relevantConcepts, type RawFact } from "@/calc/fundamentals";
import { fetchJson } from "./http";
import { classifySic } from "./sic-sectors";
import { ProviderError, type CompanyFacts, type FilingRecord, type FundamentalsProvider, type Provenance, type SearchResult, type SecurityProfile } from "./types";

const TICKERS_URL = "https://www.sec.gov/files/company_tickers_exchange.json";
const FACTS_URL = (cik: string) => `https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`;
const SUBMISSIONS_URL = (cik: string) => `https://data.sec.gov/submissions/CIK${cik}.json`;

export function padCik(cik: string | number): string {
  return String(cik).replace(/\D/g, "").padStart(10, "0");
}

interface TickersPayload {
  fields: string[];
  data: Array<Array<string | number>>;
}

interface FactsPayload {
  cik: number;
  entityName: string;
  facts: Record<string, Record<string, { label: string; units: Record<string, Array<{ start?: string; end: string; val: number; accn: string; fy: number; fp: string; form: string; filed: string; frame?: string }>> }>>;
}

interface SubmissionsPayload {
  cik: string;
  name: string;
  tickers: string[];
  exchanges: string[];
  sic: string;
  sicDescription: string;
  fiscalYearEnd: string;
  description: string;
  website: string;
  category: string;
  filings: {
    recent: {
      accessionNumber: string[];
      filingDate: string[];
      reportDate: string[];
      form: string[];
      primaryDocument: string[];
      primaryDocDescription: string[];
      items: string[];
    };
  };
}

export interface SecEdgarOptions {
  /** Required by the SEC fair-access policy, e.g. "Ledger research app you@example.com". */
  userAgent: string;
  /** Injected so tests can stub the ticker map. */
  tickerCache?: { entries: TickerEntry[]; fetchedAt: number } | null;
}

export interface TickerEntry {
  cik: string;
  name: string;
  ticker: string;
  exchange: string | null;
}

export class SecEdgarProvider implements FundamentalsProvider {
  readonly id = "sec-edgar" as const;
  private tickerCache: { entries: TickerEntry[]; fetchedAt: number } | null;
  private readonly headers: Record<string, string>;

  constructor(private readonly options: SecEdgarOptions) {
    if (!options.userAgent || !/@/.test(options.userAgent)) {
      throw new ProviderError("sec-edgar", "not_configured", "SEC EDGAR requires SEC_USER_AGENT with an app name and contact email, e.g. \"Ledger research app you@example.com\".");
    }
    this.headers = { "User-Agent": options.userAgent, Accept: "application/json" };
    this.tickerCache = options.tickerCache ?? null;
  }

  private provenance(sourceRef: string): Provenance {
    return { provider: "sec-edgar", sourceRef, retrievedAt: new Date().toISOString() };
  }

  async tickers(): Promise<TickerEntry[]> {
    const dayMs = 86_400_000;
    if (this.tickerCache && Date.now() - this.tickerCache.fetchedAt < dayMs) return this.tickerCache.entries;
    const payload = await fetchJson<TickersPayload>(TICKERS_URL, { provider: "sec-edgar", endpoint: "company_tickers_exchange", headers: this.headers });
    const idx = (name: string) => payload.fields.indexOf(name);
    const [iCik, iName, iTicker, iExchange] = [idx("cik"), idx("name"), idx("ticker"), idx("exchange")];
    const entries: TickerEntry[] = payload.data
      .filter((row) => row[iTicker])
      .map((row) => ({
        cik: padCik(row[iCik] as number),
        name: String(row[iName]),
        ticker: String(row[iTicker]).toUpperCase(),
        exchange: row[iExchange] ? String(row[iExchange]) : null,
      }));
    this.tickerCache = { entries, fetchedAt: Date.now() };
    return entries;
  }

  async lookupCik(symbol: string): Promise<{ cik: string; name: string; exchange: string | null } | null> {
    const upper = symbol.trim().toUpperCase();
    const entries = await this.tickers();
    const hit = entries.find((e) => e.ticker === upper) ?? entries.find((e) => e.ticker === upper.replace(".", "-"));
    return hit ? { cik: hit.cik, name: hit.name, exchange: hit.exchange } : null;
  }

  async search(query: string): Promise<SearchResult[]> {
    const q = query.trim().toUpperCase();
    if (!q) return [];
    const entries = await this.tickers();
    const starts = entries.filter((e) => e.ticker.startsWith(q));
    const names = entries.filter((e) => !e.ticker.startsWith(q) && e.name.toUpperCase().includes(q));
    return [...starts, ...names].slice(0, 20).map((e) => ({
      symbol: e.ticker,
      name: e.name,
      exchange: e.exchange,
      securityType: null,
      cik: e.cik,
      provider: "sec-edgar" as const,
    }));
  }

  async getCompanyFacts(cik: string): Promise<CompanyFacts> {
    const padded = padCik(cik);
    const url = FACTS_URL(padded);
    const payload = await fetchJson<FactsPayload>(url, { provider: "sec-edgar", endpoint: "companyfacts", headers: this.headers, timeoutMs: 45_000 });
    const wanted = new Set(relevantConcepts());
    const facts: RawFact[] = [];
    for (const [taxonomy, concepts] of Object.entries(payload.facts ?? {})) {
      if (taxonomy !== "us-gaap" && taxonomy !== "dei") continue;
      for (const [concept, body] of Object.entries(concepts)) {
        if (!wanted.has(concept)) continue;
        for (const [unit, values] of Object.entries(body.units)) {
          for (const v of values) {
            if (typeof v.val !== "number" || !Number.isFinite(v.val)) continue;
            facts.push({
              concept: `${taxonomy}:${concept}`,
              unit,
              value: v.val,
              start: v.start ?? null,
              end: v.end,
              fy: typeof v.fy === "number" ? v.fy : null,
              fp: v.fp ?? null,
              form: v.form,
              filed: v.filed,
              accession: v.accn,
            });
          }
        }
      }
    }
    return { cik: padded, entityName: payload.entityName, facts, provenance: this.provenance(url) };
  }

  async getSubmissions(cik: string): Promise<{ profile: Partial<SecurityProfile>; filings: FilingRecord[]; provenance: Provenance }> {
    const padded = padCik(cik);
    const url = SUBMISSIONS_URL(padded);
    const payload = await fetchJson<SubmissionsPayload>(url, { provider: "sec-edgar", endpoint: "submissions", headers: this.headers });
    const recent = payload.filings?.recent;
    const filings: FilingRecord[] = [];
    if (recent) {
      const cikNumeric = String(Number(padded));
      for (let i = 0; i < recent.accessionNumber.length; i += 1) {
        const accession = recent.accessionNumber[i];
        const primaryDocument = recent.primaryDocument[i] || null;
        filings.push({
          accession,
          form: recent.form[i],
          filedAt: recent.filingDate[i],
          reportDate: recent.reportDate[i] || null,
          primaryDocument,
          description: recent.primaryDocDescription[i] || null,
          url: primaryDocument ? `https://www.sec.gov/Archives/edgar/data/${cikNumeric}/${accession.replace(/-/g, "")}/${primaryDocument}` : null,
          items: (recent.items?.[i] ?? "").split(",").map((s) => s.trim()).filter(Boolean),
        });
      }
    }
    const classification = classifySic(payload.sic, payload.sicDescription);
    const profile: Partial<SecurityProfile> = {
      name: payload.name,
      exchange: payload.exchanges?.[0] ?? null,
      cik: padded,
      sic: payload.sic || null,
      sector: classification?.sector ?? null,
      industry: classification?.industry ?? null,
      classificationBasis: payload.sic ? `Derived from SIC code ${payload.sic} (${payload.sicDescription})` : null,
      description: payload.description || null,
      website: payload.website || null,
      fiscalYearEnd: payload.fiscalYearEnd || null,
    };
    return { profile, filings, provenance: this.provenance(url) };
  }
}

/**
 * Estimate the next earnings release from the cadence of prior 8-K Item 2.02
 * filings (Results of Operations and Financial Condition). Clearly an estimate.
 */
export function estimateNextEarningsFromFilings(filings: readonly FilingRecord[], today: string): { date: string; basis: string; lastReleaseDate: string } | null {
  const releases = filings
    .filter((f) => f.form === "8-K" && f.items.some((i) => i.startsWith("2.02")))
    .map((f) => f.filedAt)
    .sort()
    .reverse();
  if (releases.length < 2) return null;
  const gaps: number[] = [];
  for (let i = 0; i < Math.min(releases.length - 1, 6); i += 1) {
    gaps.push((Date.parse(releases[i]) - Date.parse(releases[i + 1])) / 86_400_000);
  }
  const sorted = [...gaps].sort((a, b) => a - b);
  const medianGap = sorted[Math.floor(sorted.length / 2)];
  if (!Number.isFinite(medianGap) || medianGap < 60 || medianGap > 130) return null;
  let next = new Date(Date.parse(releases[0]) + Math.round(medianGap) * 86_400_000);
  while (next.toISOString().slice(0, 10) < today) next = new Date(next.getTime() + Math.round(medianGap) * 86_400_000);
  return {
    date: next.toISOString().slice(0, 10),
    basis: `Estimated from the cadence of prior 8-K Item 2.02 filings (median gap ${Math.round(medianGap)} days; last release filed ${releases[0]}).`,
    lastReleaseDate: releases[0],
  };
}
