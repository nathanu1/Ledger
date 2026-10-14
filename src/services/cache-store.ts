import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { providerCache, providerRequests } from "@/db/schema";
import { setRequestLogger } from "@/providers/http";
import type { CacheEntry, CacheStore } from "@/providers/cache";

export const dbCacheStore: CacheStore = {
  get<T>(key: string): CacheEntry<T> | null {
    const row = getDb().select().from(providerCache).where(eq(providerCache.key, key)).get();
    if (!row) return null;
    try {
      return { value: JSON.parse(row.payload) as T, fetchedAt: row.fetchedAt, expiresAt: row.expiresAt };
    } catch {
      return null;
    }
  },
  set<T>(key: string, entry: CacheEntry<T>, provider: string): void {
    getDb()
      .insert(providerCache)
      .values({ key, provider, payload: JSON.stringify(entry.value), fetchedAt: entry.fetchedAt, expiresAt: entry.expiresAt })
      .onConflictDoUpdate({ target: providerCache.key, set: { payload: JSON.stringify(entry.value), fetchedAt: entry.fetchedAt, expiresAt: entry.expiresAt, provider } })
      .run();
  },
  delete(key: string): void {
    getDb().delete(providerCache).where(eq(providerCache.key, key)).run();
  },
};

let installed = false;
/** Persist every provider request so the settings page can show quota usage and failures. */
export function installRequestLogger(): void {
  if (installed) return;
  installed = true;
  setRequestLogger((entry) => {
    getDb()
      .insert(providerRequests)
      .values({
        provider: entry.provider,
        endpoint: entry.endpoint,
        status: entry.status,
        ok: entry.ok,
        outcome: entry.outcome,
        durationMs: entry.durationMs,
        error: entry.error,
        requestedAt: entry.requestedAt,
      })
      .run();
  });
}

export function clearProviderCache(): number {
  const db = getDb();
  const n = db.select().from(providerCache).all().length;
  db.delete(providerCache).run();
  return n;
}
