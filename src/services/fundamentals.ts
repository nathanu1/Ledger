import { and, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { earningsEvents, filings, financialFacts, type EarningsEventRow, type FilingRow } from "@/db/schema";
import { normalizeFacts, type NormalizedFinancials, type RawFact } from "@/calc/fundamentals";
import type { ISODate } from "@/calc/types";
import { getEarningsProvider, getFundamentalsProvider } from "@/providers/registry";
import { estimateNextEarningsFromFilings } from "@/providers/sec-edgar";
import { ProviderError } from "@/providers/types";
import { newId, nowIso } from "@/lib/ids";
import { installRequestLogger } from "./cache-store";
import { getSecurity, upsertSecurityFromProfile } from "./securities";
import { getAsOfDate, getDataMode } from "./settings";

export function getFacts(symbol: string): RawFact[] {
  return getDb()
    .select()
    .from(financialFacts)
    .where(eq(financialFacts.symbol, symbol.toUpperCase()))
    .all()
    .map((r) => ({ concept: r.concept, unit: r.unit, value: r.value, start: r.start, end: r.end, fy: r.fy, fp: r.fp, form: r.form, filed: r.filed, accession: r.accession }));
}

const financialsCache = new Map<string, { key: string; value: NormalizedFinancials }>();

export function getFinancials(symbolRaw: string): NormalizedFinancials | null {
  const symbol = symbolRaw.toUpperCase();
  const meta = getDb()
    .select({ n: sql<number>`count(*)`, maxRetrieved: sql<string | null>`max(${financialFacts.retrievedAt})`, source: sql<string | null>`max(${financialFacts.source})` })
    .from(financialFacts)
    .where(eq(financialFacts.symbol, symbol))
    .get();
  if (!meta || meta.n === 0) return null;
  const key = `${meta.n}|${meta.maxRetrieved}`;
  const cached = financialsCache.get(symbol);
  if (cached && cached.key === key) return cached.value;
  const value = normalizeFacts(getFacts(symbol), { provider: meta.source ?? "unknown" });
  financialsCache.set(symbol, { key, value });
  return value;
}

export function getFilings(symbol: string, options: { limit?: number; forms?: string[] } = {}): FilingRow[] {
  const conditions = [eq(filings.symbol, symbol.toUpperCase())];
  if (options.forms?.length) conditions.push(inArray(filings.form, options.forms));
  return getDb()
    .select()
    .from(filings)
    .where(and(...conditions))
    .orderBy(desc(filings.filedAt))
    .limit(options.limit ?? 50)
    .all();
}

export function getFilingsSince(symbols: string[], since: ISODate, until: ISODate): FilingRow[] {
  if (symbols.length === 0) return [];
  return getDb()
    .select()
    .from(filings)
    .where(and(inArray(filings.symbol, symbols), gte(filings.filedAt, since), lte(filings.filedAt, until)))
    .orderBy(desc(filings.filedAt))
    .all();
}

export function getUpcomingEarnings(symbols: string[], from: ISODate, to: ISODate): EarningsEventRow[] {
  if (symbols.length === 0) return [];
  return getDb()
    .select()
    .from(earningsEvents)
    .where(and(inArray(earningsEvents.symbol, symbols), gte(earningsEvents.date, from), lte(earningsEvents.date, to)))
    .orderBy(earningsEvents.date)
    .all();
}

export function getNextEarnings(symbol: string, from: ISODate): EarningsEventRow | null {
  return getDb().select().from(earningsEvents).where(and(eq(earningsEvents.symbol, symbol.toUpperCase()), gte(earningsEvents.date, from))).orderBy(earningsEvents.date).limit(1).get() ?? null;
}

export interface FundamentalsRefreshOutcome {
  symbol: string;
  ok: boolean;
  message: string;
  facts?: number;
  filings?: number;
  kind?: string;
}

/**
 * Pull XBRL facts and filings from SEC EDGAR for a symbol. Existing facts for
 * the symbol are replaced atomically; a failed fetch leaves them untouched.
 */
export async function refreshFundamentals(symbolRaw: string, options: { force?: boolean } = {}): Promise<FundamentalsRefreshOutcome> {
  const symbol = symbolRaw.toUpperCase();
  if (getDataMode() === "demo") return { symbol, ok: false, kind: "demo", message: "Demo mode uses the built-in dataset." };
  const sec = getFundamentalsProvider();
  if (!sec) return { symbol, ok: false, kind: "not_configured", message: "SEC EDGAR is not configured. Set SEC_USER_AGENT in .env.local." };
  installRequestLogger();
  const db = getDb();
  const latest = db.select({ retrievedAt: sql<string | null>`max(${financialFacts.retrievedAt})` }).from(financialFacts).where(eq(financialFacts.symbol, symbol)).get();
  if (!options.force && latest?.retrievedAt && Date.now() - Date.parse(latest.retrievedAt) < 24 * 3_600_000) {
    return { symbol, ok: true, message: `Fundamentals were refreshed ${latest.retrievedAt.slice(0, 16).replace("T", " ")} UTC; use Force refresh to fetch again.` };
  }
  try {
    const security = getSecurity(symbol);
    let cik = security?.cik ?? null;
    if (!cik) {
      const hit = await sec.lookupCik(symbol);
      if (!hit) return { symbol, ok: false, kind: "not_found", message: `SEC EDGAR has no filer with ticker ${symbol}. ETFs and foreign issuers without XBRL filings are not covered.` };
      cik = hit.cik;
    }
    const [facts, subs] = await Promise.all([sec.getCompanyFacts(cik), sec.getSubmissions(cik)]);
    const now = nowIso();
    db.transaction((tx) => {
      tx.delete(financialFacts).where(eq(financialFacts.symbol, symbol)).run();
      const rows = facts.facts.map((f) => ({ ...f, symbol, cik, source: "sec-edgar", retrievedAt: now }));
      for (let i = 0; i < rows.length; i += 400) tx.insert(financialFacts).values(rows.slice(i, i + 400)).run();
      for (const f of subs.filings) {
        tx.insert(filings)
          .values({ accession: f.accession, symbol, cik, form: f.form, filedAt: f.filedAt, reportDate: f.reportDate, primaryDocument: f.primaryDocument, description: f.description, url: f.url, source: "sec-edgar", retrievedAt: now })
          .onConflictDoUpdate({ target: filings.accession, set: { form: f.form, filedAt: f.filedAt, reportDate: f.reportDate, primaryDocument: f.primaryDocument, description: f.description, url: f.url, retrievedAt: now } })
          .run();
      }
      // Estimated next release from 8-K cadence, unless a provider calendar already supplied a date.
      const estimate = estimateNextEarningsFromFilings(subs.filings, getAsOfDate());
      if (estimate) {
        const existing = tx.select().from(earningsEvents).where(and(eq(earningsEvents.symbol, symbol), gte(earningsEvents.date, getAsOfDate()))).all();
        if (!existing.some((e) => e.source !== "sec-edgar")) {
          tx.delete(earningsEvents).where(and(eq(earningsEvents.symbol, symbol), eq(earningsEvents.source, "sec-edgar"))).run();
          tx.insert(earningsEvents)
            .values({ id: newId("earn"), symbol, date: estimate.date, status: "estimated", timeOfDay: null, fiscalPeriodEnd: null, epsEstimate: null, basis: estimate.basis, sourceUrl: null, source: "sec-edgar", retrievedAt: now })
            .run();
        }
      }
    });
    upsertSecurityFromProfile(symbol, { ...subs.profile, name: subs.profile.name ?? facts.entityName, cik }, security?.source ?? "sec-edgar");
    financialsCache.delete(symbol);
    return { symbol, ok: true, facts: facts.facts.length, filings: subs.filings.length, message: `Stored ${facts.facts.length} XBRL facts and ${subs.filings.length} filings from SEC EDGAR.` };
  } catch (error) {
    if (error instanceof ProviderError) return { symbol, ok: false, kind: error.kind, message: error.message };
    return { symbol, ok: false, kind: "error", message: error instanceof Error ? error.message : String(error) };
  }
}

/** Refresh the provider earnings calendar for a set of symbols (one request, cached by the provider's TTL). */
export async function refreshEarningsCalendar(symbols: string[]): Promise<{ ok: boolean; message: string; events?: number }> {
  if (getDataMode() === "demo") return { ok: false, message: "Demo mode uses the built-in dataset." };
  const provider = getEarningsProvider();
  if (!provider) return { ok: false, message: "No earnings-calendar provider is configured (needs ALPHAVANTAGE_API_KEY)." };
  installRequestLogger();
  try {
    const events = await provider.getUpcomingEarnings(symbols);
    const now = nowIso();
    const db = getDb();
    db.transaction((tx) => {
      for (const e of events) {
        tx.delete(earningsEvents).where(and(eq(earningsEvents.symbol, e.symbol), gte(earningsEvents.date, getAsOfDate()))).run();
        tx.insert(earningsEvents)
          .values({ id: newId("earn"), symbol: e.symbol, date: e.date, status: e.status, timeOfDay: e.timeOfDay, fiscalPeriodEnd: e.fiscalPeriodEnd, epsEstimate: e.epsEstimate, basis: e.basis, sourceUrl: e.sourceUrl, source: e.provenance.provider, retrievedAt: now })
          .run();
      }
    });
    return { ok: true, events: events.length, message: `Stored ${events.length} upcoming earnings dates from ${provider.id}.` };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
}

/** Mark an earnings date as confirmed by the user, with a source link. */
export function confirmEarningsDate(symbol: string, date: ISODate, sourceUrl: string | null): void {
  const db = getDb();
  const now = nowIso();
  db.delete(earningsEvents).where(and(eq(earningsEvents.symbol, symbol.toUpperCase()), gte(earningsEvents.date, getAsOfDate()))).run();
  db.insert(earningsEvents)
    .values({ id: newId("earn"), symbol: symbol.toUpperCase(), date, status: "confirmed", timeOfDay: null, fiscalPeriodEnd: null, epsEstimate: null, basis: "Confirmed manually by the user" + (sourceUrl ? " from the linked source." : "."), sourceUrl, source: "user", retrievedAt: now })
    .run();
}
