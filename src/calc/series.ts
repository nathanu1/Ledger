import type { ISODate, PricePoint } from "./types";

export interface AlignedSeries {
  dates: ISODate[];
  /** One column per input series, aligned to `dates`. */
  columns: number[][];
}

/**
 * Inner-join several date-sorted series on their common dates. No interpolation:
 * a date missing from any series is dropped from all of them.
 */
export function alignByDate(series: ReadonlyArray<readonly PricePoint[]>): AlignedSeries {
  if (series.length === 0) return { dates: [], columns: [] };
  const maps = series.map((s) => new Map(s.map((p) => [p.date, p.price] as const)));
  const dates = series[0].map((p) => p.date).filter((d) => maps.every((m) => m.has(d))).sort();
  const columns = maps.map((m) => dates.map((d) => m.get(d) as number));
  return { dates, columns };
}

/** Simple period returns p_t / p_{t-1} - 1. Length is prices.length - 1. */
export function simpleReturns(prices: readonly number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < prices.length; i += 1) {
    const prev = prices[i - 1];
    out.push(prev > 0 ? prices[i] / prev - 1 : 0);
  }
  return out;
}

export function mean(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  let s = 0;
  for (const v of values) s += v;
  return s / values.length;
}

/** Sample standard deviation (n - 1). */
export function stdev(values: readonly number[]): number | null {
  if (values.length < 2) return null;
  const m = mean(values) as number;
  let s = 0;
  for (const v of values) s += (v - m) * (v - m);
  return Math.sqrt(s / (values.length - 1));
}

export function covariance(a: readonly number[], b: readonly number[]): number | null {
  if (a.length !== b.length || a.length < 2) return null;
  const ma = mean(a) as number;
  const mb = mean(b) as number;
  let s = 0;
  for (let i = 0; i < a.length; i += 1) s += (a[i] - ma) * (b[i] - mb);
  return s / (a.length - 1);
}

export function correlation(a: readonly number[], b: readonly number[]): number | null {
  const cov = covariance(a, b);
  const sa = stdev(a);
  const sb = stdev(b);
  if (cov === null || sa === null || sb === null || sa === 0 || sb === 0) return null;
  return cov / (sa * sb);
}

export function percentile(sortedValues: readonly number[], p: number): number | null {
  if (sortedValues.length === 0) return null;
  const idx = (sortedValues.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sortedValues[lo];
  return sortedValues[lo] + (sortedValues[hi] - sortedValues[lo]) * (idx - lo);
}

/** Restrict a price series to [from, to]. */
export function sliceSeries(series: readonly PricePoint[], from?: ISODate, to?: ISODate): PricePoint[] {
  return series.filter((p) => (!from || p.date >= from) && (!to || p.date <= to));
}
