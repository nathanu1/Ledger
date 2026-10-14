import { and, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { prices, quotes, type PriceRow, type QuoteRow } from "@/db/schema";
import { addDays, addMonths } from "@/calc/dates";
import type { ISODate, PricePoint } from "@/calc/types";
import { getMarketDataProvider } from "@/providers/registry";
import { ProviderError, type PriceAdjustment } from "@/providers/types";
import { nowIso } from "@/lib/ids";
import { installRequestLogger } from "./cache-store";
import { getAsOfDate, getDataMode } from "./settings";

export interface PriceSeries {
  symbol: string;
  /** Adjusted when available, otherwise raw close. */
  points: PricePoint[];
  raw: PricePoint[];
  adjustment: PriceAdjustment;
  source: string | null;
  from: ISODate | null;
  to: ISODate | null;
  retrievedAt: string | null;
}

export function getPriceRows(symbol: string, from?: ISODate, to?: ISODate): PriceRow[] {
  const conditions = [eq(prices.symbol, symbol.toUpperCase())];
  if (from) conditions.push(gte(prices.date, from));
  if (to) conditions.push(lte(prices.date, to));
  return getDb().select().from(prices).where(and(...conditions)).orderBy(prices.date).all();
}

export function getPriceSeries(symbol: string, from?: ISODate, to?: ISODate): PriceSeries {
  const rows = getPriceRows(symbol, from, to);
  const hasAdj = rows.length > 0 && rows.every((r) => r.adjClose !== null);
  return {
    symbol: symbol.toUpperCase(),
    points: rows.map((r) => ({ date: r.date, price: hasAdj ? (r.adjClose as number) : r.close })),
    raw: rows.map((r) => ({ date: r.date, price: r.close })),
    adjustment: hasAdj ? ((rows[rows.length - 1].adjustment as PriceAdjustment) ?? "splits") : null,
    source: rows[rows.length - 1]?.source ?? null,
    from: rows[0]?.date ?? null,
    to: rows[rows.length - 1]?.date ?? null,
    retrievedAt: rows[rows.length - 1]?.retrievedAt ?? null,
  };
}

/** Price series for several symbols, adjusted where available. */
export function getPriceSeriesMap(symbols: string[], from?: ISODate, to?: ISODate): Map<string, PriceSeries> {
  const out = new Map<string, PriceSeries>();
  for (const s of new Set(symbols.map((x) => x.toUpperCase()))) out.set(s, getPriceSeries(s, from, to));
  return out;
}

export function getQuote(symbol: string): QuoteRow | null {
  return getDb().select().from(quotes).where(eq(quotes.symbol, symbol.toUpperCase())).get() ?? null;
}

export function getQuotes(symbols: string[]): Map<string, QuoteRow> {
  if (symbols.length === 0) return new Map();
  const rows = getDb().select().from(quotes).where(inArray(quotes.symbol, symbols.map((s) => s.toUpperCase()))).all();
  return new Map(rows.map((r) => [r.symbol, r]));
}

export interface LatestPrice {
  symbol: string;
  price: number;
  date: ISODate;
  change: number | null;
  changePct: number | null;
  source: string;
  session: string;
  asOf: string;
}

/** Latest price per symbol: the quote when present, otherwise the last stored close. */
export function getLatestPrices(symbols: string[]): Map<string, LatestPrice> {
  const out = new Map<string, LatestPrice>();
  const q = getQuotes(symbols);
  for (const symbol of new Set(symbols.map((s) => s.toUpperCase()))) {
    const quote = q.get(symbol);
    if (quote) {
      out.set(symbol, { symbol, price: quote.price, date: quote.asOf.slice(0, 10), change: quote.change, changePct: quote.changePct, source: quote.source, session: quote.session, asOf: quote.asOf });
      continue;
    }
    const last = getDb().select().from(prices).where(eq(prices.symbol, symbol)).orderBy(desc(prices.date)).limit(2).all();
    if (last.length) {
      const [l, p] = last;
      out.set(symbol, {
        symbol,
        price: l.close,
        date: l.date,
        change: p ? l.close - p.close : null,
        changePct: p ? l.close / p.close - 1 : null,
        source: l.source,
        session: "eod",
        asOf: `${l.date}T21:00:00.000Z`,
      });
    }
  }
  return out;
}

export interface Freshness {
  mode: "demo" | "connected";
  asOf: ISODate;
  latestPriceDate: ISODate | null;
  latestRetrievedAt: string | null;
  symbolsWithPrices: number;
  provider: string | null;
}

export function getFreshness(): Freshness {
  const row = getDb()
    .select({ maxDate: sql<string | null>`max(${prices.date})`, maxRetrieved: sql<string | null>`max(${prices.retrievedAt})`, n: sql<number>`count(distinct ${prices.symbol})` })
    .from(prices)
    .get();
  return {
    mode: getDataMode(),
    asOf: getAsOfDate(),
    latestPriceDate: row?.maxDate ?? null,
    latestRetrievedAt: row?.maxRetrieved ?? null,
    symbolsWithPrices: row?.n ?? 0,
    provider: getDataMode() === "demo" ? "demo" : (getMarketDataProvider()?.id ?? null),
  };
}

export interface RefreshOutcome {
  symbol: string;
  ok: boolean;
  message: string;
  bars?: number;
  kind?: "quota" | "auth" | "not_found" | "network" | "invalid" | "unsupported" | "not_configured" | "demo";
}

/**
 * Fetch history and a quote for a symbol from the configured market-data
 * provider and store them. Never substitutes synthetic data: on failure the
 * previously stored rows stay and the failure is returned to the caller.
 */
export async function refreshMarketData(symbolRaw: string, options: { force?: boolean; years?: number } = {}): Promise<RefreshOutcome> {
  const symbol = symbolRaw.toUpperCase();
  if (getDataMode() === "demo") return { symbol, ok: false, kind: "demo", message: "Demo mode uses the built-in dataset; switch to connected mode in Settings to fetch live data." };
  const provider = getMarketDataProvider();
  if (!provider) return { symbol, ok: false, kind: "not_configured", message: "No market-data provider is configured. Add MASSIVE_API_KEY or ALPHAVANTAGE_API_KEY to .env.local." };
  installRequestLogger();
  const db = getDb();
  const last = db.select({ date: prices.date, retrievedAt: prices.retrievedAt }).from(prices).where(eq(prices.symbol, symbol)).orderBy(desc(prices.date)).limit(1).get();
  const today = getAsOfDate();
  if (!options.force && last && last.date >= addDays(today, -1) && Date.now() - Date.parse(last.retrievedAt) < 6 * 3_600_000) {
    return { symbol, ok: true, message: `Prices are current through ${last.date}.`, bars: 0 };
  }
  const years = options.years ?? Math.min(provider.capabilities.historyYears, 2);
  const from = last && !options.force ? addDays(last.date, -5) : addMonths(today, -Math.round(years * 12));
  try {
    const history = await provider.getDailyHistory(symbol, from, today);
    const now = nowIso();
    db.transaction((tx) => {
      for (const bar of history.bars) {
        tx.insert(prices)
          .values({
            symbol,
            date: bar.date,
            open: bar.open,
            high: bar.high,
            low: bar.low,
            close: bar.close,
            adjClose: bar.adjClose,
            adjustment: bar.adjClose === null ? null : history.adjustment,
            volume: bar.volume,
            source: history.provenance.provider,
            retrievedAt: now,
          })
          .onConflictDoUpdate({
            target: [prices.symbol, prices.date],
            set: { open: bar.open, high: bar.high, low: bar.low, close: bar.close, adjClose: bar.adjClose, adjustment: bar.adjClose === null ? null : history.adjustment, volume: bar.volume, source: history.provenance.provider, retrievedAt: now },
          })
          .run();
      }
    });
    let quoteMessage = "";
    try {
      const quote = await provider.getQuote(symbol);
      // Fill change from stored closes when the provider only gives a price.
      let change = quote.change;
      let changePct = quote.changePct;
      let previousClose = quote.previousClose;
      if (change === null) {
        const lastTwo = db.select().from(prices).where(and(eq(prices.symbol, symbol), lte(prices.date, quote.asOf.slice(0, 10)))).orderBy(desc(prices.date)).limit(2).all();
        const prev = lastTwo.find((r) => r.close !== quote.price) ?? lastTwo[1];
        if (prev) {
          previousClose = prev.close;
          change = quote.price - prev.close;
          changePct = quote.price / prev.close - 1;
        }
      }
      db.insert(quotes)
        .values({ symbol, price: quote.price, change, changePct, previousClose, asOf: quote.asOf, session: quote.session, currency: quote.currency, source: quote.provenance.provider, retrievedAt: now })
        .onConflictDoUpdate({ target: quotes.symbol, set: { price: quote.price, change, changePct, previousClose, asOf: quote.asOf, session: quote.session, source: quote.provenance.provider, retrievedAt: now } })
        .run();
    } catch (error) {
      quoteMessage = ` Quote not updated: ${error instanceof Error ? error.message : String(error)}`;
    }
    return { symbol, ok: true, bars: history.bars.length, message: `Stored ${history.bars.length} daily bars from ${provider.id}.${quoteMessage}` };
  } catch (error) {
    if (error instanceof ProviderError) return { symbol, ok: false, kind: error.kind, message: error.message };
    return { symbol, ok: false, kind: "network", message: error instanceof Error ? error.message : String(error) };
  }
}

/** Refresh several symbols sequentially (rate limits are enforced per provider). */
export async function refreshMarketDataMany(symbols: string[], options: { force?: boolean } = {}): Promise<RefreshOutcome[]> {
  const out: RefreshOutcome[] = [];
  for (const s of new Set(symbols.map((x) => x.toUpperCase()))) {
    const r = await refreshMarketData(s, options);
    out.push(r);
    if (!r.ok && (r.kind === "quota" || r.kind === "auth" || r.kind === "not_configured" || r.kind === "demo")) break;
  }
  return out;
}
