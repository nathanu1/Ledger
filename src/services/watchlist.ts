import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { savedViews, watchlistItems, watchlists, type SavedViewRow, type WatchlistItemRow } from "@/db/schema";
import { newId, nowIso } from "@/lib/ids";
import { buildMetricsForSymbols, type CompanyMetrics } from "./metrics";
import { listSecurities } from "./securities";

export interface WatchlistRow {
  item: WatchlistItemRow;
  tags: string[];
  metrics: CompanyMetrics;
}

export function listWatchlists() {
  return getDb().select().from(watchlists).orderBy(watchlists.createdAt).all();
}

export function ensureDefaultWatchlist() {
  const existing = listWatchlists();
  if (existing.length) return existing[0];
  const id = newId("wl");
  getDb().insert(watchlists).values({ id, name: "Watchlist", createdAt: nowIso() }).run();
  return getDb().select().from(watchlists).where(eq(watchlists.id, id)).get()!;
}

export function getWatchlistRows(watchlistId: string): WatchlistRow[] {
  const items = getDb().select().from(watchlistItems).where(eq(watchlistItems.watchlistId, watchlistId)).orderBy(watchlistItems.addedAt).all();
  const metrics = buildMetricsForSymbols(items.map((i) => i.symbol));
  const bySymbol = new Map(metrics.map((m) => [m.symbol, m]));
  return items.map((item) => ({ item, tags: parseTags(item.tags), metrics: bySymbol.get(item.symbol)! }));
}

export function parseTags(raw: string): string[] {
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function addWatchlistItem(watchlistId: string, symbol: string): WatchlistItemRow {
  const upper = symbol.toUpperCase();
  const existing = getDb().select().from(watchlistItems).where(and(eq(watchlistItems.watchlistId, watchlistId), eq(watchlistItems.symbol, upper))).get();
  if (existing) return existing;
  const id = newId("wli");
  getDb().insert(watchlistItems).values({ id, watchlistId, symbol: upper, tags: "[]", note: null, addedAt: nowIso() }).run();
  return getDb().select().from(watchlistItems).where(eq(watchlistItems.id, id)).get()!;
}

export function updateWatchlistItem(id: string, input: { tags?: string[]; note?: string | null }): void {
  const set: Partial<WatchlistItemRow> = {};
  if (input.tags) set.tags = JSON.stringify(input.tags.map((t) => t.trim()).filter(Boolean));
  if (input.note !== undefined) set.note = input.note?.trim() || null;
  getDb().update(watchlistItems).set(set).where(eq(watchlistItems.id, id)).run();
}

export function removeWatchlistItem(id: string): void {
  getDb().delete(watchlistItems).where(eq(watchlistItems.id, id)).run();
}

export function isWatched(symbol: string): boolean {
  return !!getDb().select().from(watchlistItems).where(eq(watchlistItems.symbol, symbol.toUpperCase())).get();
}

export function watchedSymbols(): string[] {
  return [...new Set(getDb().select({ s: watchlistItems.symbol }).from(watchlistItems).all().map((r) => r.s))];
}

/** Screener rows over the coverage universe (every security with local data). */
export function getUniverseRows(): CompanyMetrics[] {
  return buildMetricsForSymbols(listSecurities().map((s) => s.symbol));
}

export interface ViewConfig {
  columns: string[];
  sort: { column: string; direction: "asc" | "desc" } | null;
  filters: Array<{ column: string; operator: "gt" | "lt" | "eq" | "contains"; value: number | string }>;
}

export function listSavedViews(scope: "watchlist" | "screener"): Array<SavedViewRow & { parsed: ViewConfig }> {
  return getDb()
    .select()
    .from(savedViews)
    .where(eq(savedViews.scope, scope))
    .orderBy(desc(savedViews.updatedAt))
    .all()
    .map((v) => ({ ...v, parsed: parseViewConfig(v.config) }));
}

export function parseViewConfig(raw: string): ViewConfig {
  try {
    const v = JSON.parse(raw) as Partial<ViewConfig>;
    return { columns: Array.isArray(v.columns) ? v.columns : [], sort: v.sort ?? null, filters: Array.isArray(v.filters) ? v.filters : [] };
  } catch {
    return { columns: [], sort: null, filters: [] };
  }
}

export function saveView(scope: "watchlist" | "screener", name: string, config: ViewConfig, id?: string): SavedViewRow {
  const now = nowIso();
  if (id) {
    getDb().update(savedViews).set({ name: name.trim(), config: JSON.stringify(config), updatedAt: now }).where(eq(savedViews.id, id)).run();
    return getDb().select().from(savedViews).where(eq(savedViews.id, id)).get()!;
  }
  const newIdValue = newId("view");
  getDb().insert(savedViews).values({ id: newIdValue, scope, name: name.trim(), config: JSON.stringify(config), createdAt: now, updatedAt: now }).run();
  return getDb().select().from(savedViews).where(eq(savedViews.id, newIdValue)).get()!;
}

export function deleteView(id: string): void {
  getDb().delete(savedViews).where(eq(savedViews.id, id)).run();
}
