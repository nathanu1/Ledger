import { desc, gte, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { providerCache, providerRequests } from "@/db/schema";

export interface ProviderUsage {
  provider: string;
  total: number;
  ok: number;
  quota: number;
  auth: number;
  errors: number;
  lastError: { at: string; message: string; endpoint: string } | null;
}

export function getProviderUsage(hours = 24): ProviderUsage[] {
  const since = new Date(Date.now() - hours * 3_600_000).toISOString();
  const db = getDb();
  const rows = db
    .select({ provider: providerRequests.provider, outcome: providerRequests.outcome, n: sql<number>`count(*)` })
    .from(providerRequests)
    .where(gte(providerRequests.requestedAt, since))
    .groupBy(providerRequests.provider, providerRequests.outcome)
    .all();
  const map = new Map<string, ProviderUsage>();
  for (const r of rows) {
    const u = map.get(r.provider) ?? { provider: r.provider, total: 0, ok: 0, quota: 0, auth: 0, errors: 0, lastError: null };
    u.total += r.n;
    if (r.outcome === "ok") u.ok += r.n;
    else if (r.outcome === "quota") u.quota += r.n;
    else if (r.outcome === "auth") u.auth += r.n;
    else u.errors += r.n;
    map.set(r.provider, u);
  }
  for (const u of map.values()) {
    const last = db.select().from(providerRequests).where(gte(providerRequests.requestedAt, since)).orderBy(desc(providerRequests.requestedAt)).all().find((r) => r.provider === u.provider && !r.ok);
    if (last) u.lastError = { at: last.requestedAt, message: last.error ?? `HTTP ${last.status}`, endpoint: last.endpoint };
  }
  return [...map.values()];
}

export function getCacheStats(): { entries: number; oldest: string | null; newest: string | null } {
  const row = getDb().select({ n: sql<number>`count(*)`, oldest: sql<string | null>`min(${providerCache.fetchedAt})`, newest: sql<string | null>`max(${providerCache.fetchedAt})` }).from(providerCache).get();
  return { entries: row?.n ?? 0, oldest: row?.oldest ?? null, newest: row?.newest ?? null };
}
