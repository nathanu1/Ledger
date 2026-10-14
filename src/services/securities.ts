import { eq, inArray, like, or } from "drizzle-orm";
import { getDb } from "@/db/client";
import { securities, type Security } from "@/db/schema";
import { getFundamentalsProvider, getMarketDataProvider } from "@/providers/registry";
import type { SearchResult, SecurityProfile } from "@/providers/types";
import { ProviderError } from "@/providers/types";
import { nowIso } from "@/lib/ids";
import { getDataMode } from "./settings";

export function getSecurity(symbol: string): Security | null {
  return getDb().select().from(securities).where(eq(securities.symbol, symbol.toUpperCase())).get() ?? null;
}

export function getSecurities(symbols: string[]): Map<string, Security> {
  if (symbols.length === 0) return new Map();
  const rows = getDb().select().from(securities).where(inArray(securities.symbol, symbols.map((s) => s.toUpperCase()))).all();
  return new Map(rows.map((r) => [r.symbol, r]));
}

export function listSecurities(): Security[] {
  return getDb().select().from(securities).orderBy(securities.symbol).all();
}

export function upsertSecurityFromProfile(symbol: string, profile: Partial<SecurityProfile>, source: string): Security {
  const db = getDb();
  const existing = getSecurity(symbol);
  const now = nowIso();
  const row = {
    symbol: symbol.toUpperCase(),
    name: profile.name ?? existing?.name ?? symbol.toUpperCase(),
    exchange: profile.exchange ?? existing?.exchange ?? null,
    securityType: profile.securityType ?? existing?.securityType ?? "stock",
    sector: profile.sector ?? existing?.sector ?? null,
    industry: profile.industry ?? existing?.industry ?? null,
    cik: profile.cik ?? existing?.cik ?? null,
    sic: profile.sic ?? existing?.sic ?? null,
    description: profile.description ?? existing?.description ?? null,
    website: profile.website ?? existing?.website ?? null,
    currency: "USD",
    fiscalYearEnd: profile.fiscalYearEnd ?? existing?.fiscalYearEnd ?? null,
    source,
    retrievedAt: now,
  };
  db.insert(securities)
    .values(row)
    .onConflictDoUpdate({ target: securities.symbol, set: { ...row } })
    .run();
  return getSecurity(symbol)!;
}

export interface EnsureSecurityResult {
  security: Security | null;
  errors: string[];
}

/**
 * Make sure a security exists locally. In connected mode, unknown symbols are
 * resolved through SEC EDGAR (CIK, SIC-derived sector, filings) and, when
 * configured, the market-data provider's profile (description, ETF flag).
 */
export async function ensureSecurity(symbolRaw: string): Promise<EnsureSecurityResult> {
  const symbol = symbolRaw.trim().toUpperCase();
  const existing = getSecurity(symbol);
  if (existing || getDataMode() === "demo") return { security: existing, errors: existing ? [] : ["This symbol is not part of the demo universe."] };
  const errors: string[] = [];
  let profile: Partial<SecurityProfile> = {};
  const sec = getFundamentalsProvider();
  if (sec) {
    try {
      const hit = await sec.lookupCik(symbol);
      if (hit) {
        profile = { name: hit.name, exchange: hit.exchange, cik: hit.cik };
        const subs = await sec.getSubmissions(hit.cik);
        profile = { ...profile, ...subs.profile };
      } else {
        errors.push(`SEC EDGAR has no filer with ticker ${symbol}; it may be an ETF or not US-listed.`);
      }
    } catch (error) {
      errors.push(error instanceof ProviderError ? error.message : `SEC EDGAR lookup failed: ${String(error)}`);
    }
  }
  const market = getMarketDataProvider();
  if (market?.getProfile) {
    try {
      const p = await market.getProfile(symbol);
      if (p) {
        profile = {
          ...profile,
          name: profile.name ?? p.name,
          exchange: profile.exchange ?? p.exchange,
          securityType: p.securityType,
          sector: profile.sector ?? p.sector,
          industry: profile.industry ?? p.industry,
          description: p.description ?? profile.description,
          website: p.website ?? profile.website,
          sharesOutstanding: p.sharesOutstanding,
        };
      }
    } catch (error) {
      errors.push(error instanceof ProviderError ? error.message : `Profile lookup failed: ${String(error)}`);
    }
  }
  if (!profile.name) return { security: null, errors: errors.length ? errors : [`No provider could identify ${symbol}.`] };
  const source = sec && market ? "sec-edgar+" + market.id : sec ? "sec-edgar" : market?.id ?? "unknown";
  return { security: upsertSecurityFromProfile(symbol, profile, source), errors };
}

/** Local search over known securities; connected mode also consults providers. */
export async function searchSecurities(query: string, options: { remote?: boolean } = {}): Promise<SearchResult[]> {
  const q = query.trim().toUpperCase();
  if (!q) return [];
  const local = getDb()
    .select()
    .from(securities)
    .where(or(like(securities.symbol, `${q}%`), like(securities.name, `%${query.trim()}%`)))
    .limit(12)
    .all()
    .map<SearchResult>((s) => ({ symbol: s.symbol, name: s.name, exchange: s.exchange, securityType: s.securityType as "stock" | "etf", cik: s.cik, provider: "demo" }));
  if (getDataMode() === "demo" || !options.remote) return local;
  const seen = new Set(local.map((r) => r.symbol));
  const remote: SearchResult[] = [];
  const sec = getFundamentalsProvider();
  if (sec) {
    try {
      for (const r of await sec.search(q)) if (!seen.has(r.symbol)) remote.push(r);
    } catch {
      // Search degrades to local results; the caller shows provider status separately.
    }
  }
  return [...local, ...remote.slice(0, 10)];
}
