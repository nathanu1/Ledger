/**
 * Provider response cache. The store is injected so the provider layer stays
 * free of database dependencies; the app wires it to the provider_cache table.
 */
export interface CacheEntry<T> {
  value: T;
  fetchedAt: string;
  expiresAt: string;
}

export interface CacheStore {
  get<T>(key: string): CacheEntry<T> | null;
  set<T>(key: string, entry: CacheEntry<T>, provider: string): void;
  delete(key: string): void;
}

export const memoryCache = (): CacheStore => {
  const map = new Map<string, CacheEntry<unknown>>();
  return {
    get: <T>(key: string) => (map.get(key) as CacheEntry<T> | undefined) ?? null,
    set: (key, entry) => void map.set(key, entry),
    delete: (key) => void map.delete(key),
  };
};

export interface CachedResult<T> {
  value: T;
  /** True when the value came from the cache. */
  fromCache: boolean;
  fetchedAt: string;
  /** Set when a fresh fetch failed and a stale value was served instead. */
  staleError: Error | null;
}

export interface CachedOptions {
  ttlMs: number;
  provider: string;
  /** Skip the cache and fetch fresh (manual refresh). */
  force?: boolean;
  /** Serve an expired entry if the fetch fails (never synthetic data, only older real data). */
  allowStaleOnError?: boolean;
}

export async function cached<T>(store: CacheStore, key: string, options: CachedOptions, fetcher: () => Promise<T>): Promise<CachedResult<T>> {
  const now = new Date();
  const entry = store.get<T>(key);
  if (!options.force && entry && new Date(entry.expiresAt) > now) {
    return { value: entry.value, fromCache: true, fetchedAt: entry.fetchedAt, staleError: null };
  }
  try {
    const value = await fetcher();
    const fetchedAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + options.ttlMs).toISOString();
    store.set(key, { value, fetchedAt, expiresAt }, options.provider);
    return { value, fromCache: false, fetchedAt, staleError: null };
  } catch (error) {
    if (options.allowStaleOnError && entry) {
      return { value: entry.value, fromCache: true, fetchedAt: entry.fetchedAt, staleError: error instanceof Error ? error : new Error(String(error)) };
    }
    throw error;
  }
}

export const TTL = {
  minutes: (n: number) => n * 60_000,
  hours: (n: number) => n * 3_600_000,
  days: (n: number) => n * 86_400_000,
};
