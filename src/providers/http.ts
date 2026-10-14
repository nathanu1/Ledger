/**
 * Shared HTTP plumbing for providers: per-provider rate limiting (token
 * bucket), in-flight request de-duplication, exponential backoff with jitter,
 * timeouts, and request logging for quota monitoring.
 */
import { ProviderError, type ProviderId, type RequestLogger } from "./types";

class TokenBucket {
  private tokens: number;
  private last = Date.now();
  constructor(
    private readonly capacity: number,
    private readonly refillPerMs: number,
  ) {
    this.tokens = capacity;
  }
  /** Milliseconds to wait before a token is available; consumes one when ready. */
  take(): number {
    const now = Date.now();
    this.tokens = Math.min(this.capacity, this.tokens + (now - this.last) * this.refillPerMs);
    this.last = now;
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return 0;
    }
    const wait = (1 - this.tokens) / this.refillPerMs;
    this.tokens = 0;
    return Math.ceil(wait);
  }
}

const buckets = new Map<string, TokenBucket>();
const inFlight = new Map<string, Promise<Response>>();

export interface RateLimitSpec {
  /** Maximum burst. */
  capacity: number;
  /** Sustained requests per second. */
  perSecond: number;
}

export const RATE_LIMITS: Record<ProviderId, RateLimitSpec> = {
  // SEC fair-access policy: at most 10 requests per second. Stay under it.
  "sec-edgar": { capacity: 4, perSecond: 6 },
  // Massive (formerly Polygon) Basic plan: 5 API calls per minute.
  massive: { capacity: 2, perSecond: 5 / 60 },
  // Alpha Vantage free tier: 25 requests per day; spacing requests also avoids per-minute throttling.
  alphavantage: { capacity: 1, perSecond: 1 / 15 },
  demo: { capacity: 1000, perSecond: 1000 },
};

function bucketFor(provider: ProviderId): TokenBucket {
  let b = buckets.get(provider);
  if (!b) {
    const spec = RATE_LIMITS[provider];
    b = new TokenBucket(spec.capacity, spec.perSecond / 1000);
    buckets.set(provider, b);
  }
  return b;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

let logger: RequestLogger | null = null;
export function setRequestLogger(fn: RequestLogger | null): void {
  logger = fn;
}

export interface ProviderFetchOptions {
  provider: ProviderId;
  /** Short label for logs (no secrets). */
  endpoint: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
  maxAttempts?: number;
  /** When true, a 429 is surfaced immediately as a quota error instead of retried. */
  failFastOnQuota?: boolean;
}

export async function providerFetch(url: string, options: ProviderFetchOptions): Promise<Response> {
  const key = `${options.provider}|${url}`;
  const existing = inFlight.get(key);
  if (existing) return existing.then((r) => r.clone());
  const promise = fetchWithRetry(url, options).finally(() => inFlight.delete(key));
  inFlight.set(key, promise);
  return promise.then((r) => r.clone());
}

async function fetchWithRetry(url: string, options: ProviderFetchOptions): Promise<Response> {
  const maxAttempts = options.maxAttempts ?? 3;
  const timeoutMs = options.timeoutMs ?? 20_000;
  let attempt = 0;
  let lastError: unknown = null;
  while (attempt < maxAttempts) {
    attempt += 1;
    const wait = bucketFor(options.provider).take();
    if (wait > 0) await sleep(wait);
    const started = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { headers: options.headers, signal: controller.signal, cache: "no-store" });
      const durationMs = Date.now() - started;
      if (response.status === 429) {
        const retryAfter = Number(response.headers.get("retry-after"));
        const retryMs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : Math.min(60_000, 2 ** attempt * 1000);
        log(options, response.status, false, "quota", durationMs, "Rate limit exceeded");
        if (options.failFastOnQuota || attempt >= maxAttempts) {
          throw new ProviderError(options.provider, "quota", `${options.provider} rate limit exceeded. Try again in about ${Math.ceil(retryMs / 1000)} seconds.`, {
            retryAfterMs: retryMs,
            status: 429,
          });
        }
        await sleep(retryMs + Math.random() * 250);
        continue;
      }
      if (response.status === 401 || response.status === 403) {
        log(options, response.status, false, "auth", durationMs, "Unauthorized");
        throw new ProviderError(options.provider, "auth", `${options.provider} rejected the API key (HTTP ${response.status}). Check the key in your environment.`, { status: response.status });
      }
      if (response.status === 404) {
        log(options, response.status, false, "error", durationMs, "Not found");
        throw new ProviderError(options.provider, "not_found", `${options.provider} has no data for this request.`, { status: 404 });
      }
      if (response.status >= 500) {
        log(options, response.status, false, "error", durationMs, `HTTP ${response.status}`);
        lastError = new ProviderError(options.provider, "network", `${options.provider} returned HTTP ${response.status}.`, { status: response.status });
        if (attempt < maxAttempts) {
          await sleep(2 ** attempt * 500 + Math.random() * 250);
          continue;
        }
        throw lastError;
      }
      if (!response.ok) {
        log(options, response.status, false, "error", durationMs, `HTTP ${response.status}`);
        throw new ProviderError(options.provider, "invalid", `${options.provider} returned HTTP ${response.status}.`, { status: response.status });
      }
      log(options, response.status, true, "ok", durationMs, null);
      return response;
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      const durationMs = Date.now() - started;
      const message = error instanceof Error ? (error.name === "AbortError" ? `Timed out after ${timeoutMs} ms` : error.message) : String(error);
      log(options, null, false, "network", durationMs, message);
      lastError = new ProviderError(options.provider, "network", `Could not reach ${options.provider}: ${message}`, { cause: error });
      if (attempt < maxAttempts) {
        await sleep(2 ** attempt * 500 + Math.random() * 250);
        continue;
      }
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError instanceof Error ? lastError : new ProviderError(options.provider, "network", "Request failed.");
}

function log(options: ProviderFetchOptions, status: number | null, ok: boolean, outcome: "ok" | "quota" | "auth" | "network" | "error", durationMs: number, error: string | null) {
  try {
    logger?.({ provider: options.provider, endpoint: options.endpoint, status, ok, outcome, durationMs, error, requestedAt: new Date().toISOString() });
  } catch {
    // Logging must never break a request.
  }
}

export async function fetchJson<T>(url: string, options: ProviderFetchOptions): Promise<T> {
  const response = await providerFetch(url, options);
  try {
    return (await response.json()) as T;
  } catch (error) {
    throw new ProviderError(options.provider, "invalid", `${options.provider} returned a response that is not valid JSON.`, { cause: error });
  }
}

export async function fetchText(url: string, options: ProviderFetchOptions): Promise<string> {
  const response = await providerFetch(url, options);
  return response.text();
}
