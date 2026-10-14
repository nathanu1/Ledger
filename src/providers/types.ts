/**
 * Provider abstraction. Market-data and fundamentals vendors are replaceable
 * behind these interfaces. Every value returned carries provenance.
 */
import type { RawFact } from "@/calc/fundamentals";
import type { ISODate } from "@/calc/types";

export type ProviderId = "sec-edgar" | "massive" | "alphavantage" | "demo";

export interface Provenance {
  provider: ProviderId;
  /** URL, accession number or endpoint identifying the source record. */
  sourceRef: string | null;
  /** When Ledger retrieved the data (ISO 8601 timestamp). */
  retrievedAt: string;
}

export type ProviderErrorKind = "quota" | "auth" | "not_found" | "network" | "invalid" | "unsupported" | "not_configured";

export class ProviderError extends Error {
  readonly kind: ProviderErrorKind;
  readonly provider: ProviderId;
  readonly retryAfterMs: number | null;
  readonly status: number | null;
  constructor(provider: ProviderId, kind: ProviderErrorKind, message: string, options: { retryAfterMs?: number | null; status?: number | null; cause?: unknown } = {}) {
    super(message, { cause: options.cause });
    this.name = "ProviderError";
    this.provider = provider;
    this.kind = kind;
    this.retryAfterMs = options.retryAfterMs ?? null;
    this.status = options.status ?? null;
  }
}

export interface SecurityProfile {
  symbol: string;
  name: string;
  exchange: string | null;
  securityType: "stock" | "etf";
  sector: string | null;
  industry: string | null;
  /** How sector/industry were established (e.g. "SIC 3571 Electronic Computers"). */
  classificationBasis: string | null;
  cik: string | null;
  sic: string | null;
  description: string | null;
  website: string | null;
  /** MMDD */
  fiscalYearEnd: string | null;
  sharesOutstanding: number | null;
  provenance: Provenance;
}

export type MarketSession = "regular" | "pre" | "post" | "closed" | "eod";

export interface Quote {
  symbol: string;
  price: number;
  change: number | null;
  changePct: number | null;
  previousClose: number | null;
  /** Market timestamp (ISO 8601) the quote refers to. */
  asOf: string;
  session: MarketSession;
  currency: string;
  provenance: Provenance;
}

export type PriceAdjustment = "splits" | "splits_dividends" | null;

export interface DailyBar {
  date: ISODate;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number;
  adjClose: number | null;
  volume: number | null;
}

export interface PriceHistory {
  symbol: string;
  bars: DailyBar[];
  /** What adjClose is adjusted for. Raw close is always kept alongside. */
  adjustment: PriceAdjustment;
  provenance: Provenance;
}

export interface FilingRecord {
  accession: string;
  form: string;
  filedAt: ISODate;
  reportDate: ISODate | null;
  primaryDocument: string | null;
  description: string | null;
  url: string | null;
  /** 8-K item codes when present (e.g. "2.02"). */
  items: string[];
}

export interface CompanyFacts {
  cik: string;
  entityName: string;
  facts: RawFact[];
  provenance: Provenance;
}

export interface EarningsEvent {
  symbol: string;
  date: ISODate;
  status: "confirmed" | "estimated";
  timeOfDay: "pre-market" | "post-market" | null;
  fiscalPeriodEnd: ISODate | null;
  epsEstimate: number | null;
  basis: string;
  sourceUrl: string | null;
  provenance: Provenance;
}

export interface SearchResult {
  symbol: string;
  name: string;
  exchange: string | null;
  securityType: "stock" | "etf" | null;
  cik: string | null;
  provider: ProviderId;
}

export interface MarketDataCapabilities {
  adjustment: PriceAdjustment;
  historyYears: number;
  quoteTiming: "end-of-day" | "delayed" | "real-time";
  rateLimit: string;
  notes: string[];
}

export interface FundamentalsProvider {
  readonly id: ProviderId;
  lookupCik(symbol: string): Promise<{ cik: string; name: string; exchange: string | null } | null>;
  getCompanyFacts(cik: string): Promise<CompanyFacts>;
  getSubmissions(cik: string): Promise<{ profile: Partial<SecurityProfile>; filings: FilingRecord[]; provenance: Provenance }>;
  search(query: string): Promise<SearchResult[]>;
}

export interface MarketDataProvider {
  readonly id: ProviderId;
  readonly capabilities: MarketDataCapabilities;
  getQuote(symbol: string): Promise<Quote>;
  getDailyHistory(symbol: string, from: ISODate, to: ISODate): Promise<PriceHistory>;
  getProfile?(symbol: string): Promise<SecurityProfile | null>;
  search?(query: string): Promise<SearchResult[]>;
}

export interface EarningsProvider {
  readonly id: ProviderId;
  getUpcomingEarnings(symbols: string[]): Promise<EarningsEvent[]>;
}

export interface RequestLogEntry {
  provider: ProviderId;
  endpoint: string;
  status: number | null;
  ok: boolean;
  outcome: "ok" | "quota" | "auth" | "network" | "error";
  durationMs: number;
  error: string | null;
  requestedAt: string;
}

export type RequestLogger = (entry: RequestLogEntry) => void;
