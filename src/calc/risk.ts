/**
 * Historical risk statistics and a hypothetical stress test.
 *
 * Conventions (shown in the interface next to every figure):
 * - Returns: simple daily returns on adjusted closes (or on the portfolio's
 *   time-weighted growth index, which already removes the effect of deposits).
 * - Annualisation: volatility x sqrt(252); 252 trading days per year.
 * - Missing data: dates missing in any series are dropped (inner join); no interpolation.
 * - Minimum sample: 60 aligned observations, otherwise the figure is not computed.
 */
import { alignByDate, correlation, covariance, mean, percentile, simpleReturns, stdev } from "./series";
import { maxDrawdownOfPrices } from "./drawdown";
import type { ISODate, PricePoint } from "./types";

export const RISK_CONVENTIONS = {
  returnType: "Simple daily returns on adjusted closes",
  annualization: "Volatility annualised by sqrt(252)",
  missingData: "Dates missing from any series are dropped; nothing is interpolated",
  minimumObservations: 60,
  tradingDaysPerYear: 252,
} as const;

export interface StatResult {
  value: number | null;
  observations: number;
  reason?: string;
}

export function annualizedVolatility(dailyReturns: readonly number[], minObservations = RISK_CONVENTIONS.minimumObservations): StatResult {
  if (dailyReturns.length < minObservations) {
    return { value: null, observations: dailyReturns.length, reason: `Needs at least ${minObservations} daily observations; ${dailyReturns.length} available.` };
  }
  const sd = stdev(dailyReturns);
  if (sd === null) return { value: null, observations: dailyReturns.length, reason: "Not enough variation." };
  return { value: sd * Math.sqrt(RISK_CONVENTIONS.tradingDaysPerYear), observations: dailyReturns.length };
}

export interface BetaResult extends StatResult {
  rSquared: number | null;
}

export function beta(assetReturns: readonly number[], benchmarkReturns: readonly number[], minObservations = RISK_CONVENTIONS.minimumObservations): BetaResult {
  if (assetReturns.length !== benchmarkReturns.length) {
    return { value: null, observations: 0, rSquared: null, reason: "Series are not aligned." };
  }
  if (assetReturns.length < minObservations) {
    return { value: null, observations: assetReturns.length, rSquared: null, reason: `Needs at least ${minObservations} aligned observations; ${assetReturns.length} available.` };
  }
  const cov = covariance(assetReturns, benchmarkReturns);
  const sb = stdev(benchmarkReturns);
  if (cov === null || sb === null || sb === 0) return { value: null, observations: assetReturns.length, rSquared: null, reason: "Benchmark has no variance." };
  const corr = correlation(assetReturns, benchmarkReturns);
  return { value: cov / (sb * sb), observations: assetReturns.length, rSquared: corr === null ? null : corr * corr };
}

export interface CorrelationMatrix {
  labels: string[];
  /** matrix[i][j] in [-1, 1], null when not computable. */
  matrix: Array<Array<number | null>>;
  observations: number;
  reason?: string;
}

/** Pairwise correlation of daily returns over the dates common to ALL series. */
export function correlationMatrix(labels: readonly string[], series: ReadonlyArray<readonly PricePoint[]>, minObservations = RISK_CONVENTIONS.minimumObservations): CorrelationMatrix {
  const aligned = alignByDate(series);
  const returns = aligned.columns.map((c) => simpleReturns(c));
  const observations = returns[0]?.length ?? 0;
  if (observations < minObservations) {
    return {
      labels: [...labels],
      matrix: labels.map(() => labels.map(() => null)),
      observations,
      reason: `Needs at least ${minObservations} common observations; ${observations} available.`,
    };
  }
  const matrix = returns.map((a, i) => returns.map((b, j) => (i === j ? 1 : correlation(a, b))));
  return { labels: [...labels], matrix, observations };
}

export interface ReturnDistribution {
  observations: number;
  bins: Array<{ from: number; to: number; count: number }>;
  mean: number | null;
  stdev: number | null;
  min: number | null;
  max: number | null;
  p5: number | null;
  p50: number | null;
  p95: number | null;
  /** Share of days with a positive return. */
  positiveShare: number | null;
}

export function returnDistribution(dailyReturns: readonly number[], binCount = 24): ReturnDistribution {
  const n = dailyReturns.length;
  if (n === 0) return { observations: 0, bins: [], mean: null, stdev: null, min: null, max: null, p5: null, p50: null, p95: null, positiveShare: null };
  const sorted = [...dailyReturns].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[n - 1];
  const width = max > min ? (max - min) / binCount : 1;
  const bins = Array.from({ length: binCount }, (_, i) => ({ from: min + i * width, to: min + (i + 1) * width, count: 0 }));
  for (const r of dailyReturns) {
    let idx = Math.floor((r - min) / width);
    if (idx >= binCount) idx = binCount - 1;
    if (idx < 0) idx = 0;
    bins[idx].count += 1;
  }
  return {
    observations: n,
    bins,
    mean: mean(dailyReturns),
    stdev: stdev(dailyReturns),
    min,
    max,
    p5: percentile(sorted, 0.05),
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    positiveShare: dailyReturns.filter((r) => r > 0).length / n,
  };
}

export interface Concentration {
  largest: { symbol: string; weight: number } | null;
  top5Weight: number;
  /** Herfindahl index of position weights (cash excluded). */
  hhi: number | null;
  /** 1 / HHI: the number of equal-sized positions with the same concentration. */
  effectivePositions: number | null;
  positions: number;
}

export function concentration(weights: ReadonlyArray<{ symbol: string; weight: number | null }>): Concentration {
  const valid = weights.filter((w): w is { symbol: string; weight: number } => w.weight !== null && w.weight > 0).sort((a, b) => b.weight - a.weight);
  if (valid.length === 0) return { largest: null, top5Weight: 0, hhi: null, effectivePositions: null, positions: 0 };
  const totalInvested = valid.reduce((acc, w) => acc + w.weight, 0);
  const hhi = totalInvested > 0 ? valid.reduce((acc, w) => acc + Math.pow(w.weight / totalInvested, 2), 0) : null;
  return {
    largest: valid[0],
    top5Weight: valid.slice(0, 5).reduce((acc, w) => acc + w.weight, 0),
    hhi,
    effectivePositions: hhi ? 1 / hhi : null,
    positions: valid.length,
  };
}

export interface ExposurePosition {
  symbol: string;
  weight: number | null;
  sector: string | null;
  securityType: "stock" | "etf" | "cash";
  /** Actual fund holdings by sector when available (weights sum to <= 1). */
  lookThrough?: Array<{ sector: string; weight: number }> | null;
}

export interface SectorExposure {
  sectors: Array<{ sector: string; weight: number; source: "direct" | "mixed" }>;
  /** Weight in ETFs for which no holdings data exists; look-through unavailable. */
  unavailableLookThroughWeight: number;
  unavailableLookThroughSymbols: string[];
  cashWeight: number;
  unclassifiedWeight: number;
}

export function sectorExposure(positions: readonly ExposurePosition[], cashWeight: number): SectorExposure {
  const acc = new Map<string, { weight: number; etfContribution: boolean }>();
  let unavailable = 0;
  const unavailableSymbols: string[] = [];
  let unclassified = 0;
  for (const p of positions) {
    if (p.weight === null || p.weight <= 0) continue;
    if (p.securityType === "etf") {
      if (p.lookThrough && p.lookThrough.length > 0) {
        for (const h of p.lookThrough) {
          const cur = acc.get(h.sector) ?? { weight: 0, etfContribution: false };
          cur.weight += p.weight * h.weight;
          cur.etfContribution = true;
          acc.set(h.sector, cur);
        }
      } else {
        unavailable += p.weight;
        unavailableSymbols.push(p.symbol);
      }
      continue;
    }
    if (!p.sector) {
      unclassified += p.weight;
      continue;
    }
    const cur = acc.get(p.sector) ?? { weight: 0, etfContribution: false };
    cur.weight += p.weight;
    acc.set(p.sector, cur);
  }
  return {
    sectors: [...acc.entries()]
      .map(([sector, v]) => ({ sector, weight: v.weight, source: v.etfContribution ? ("mixed" as const) : ("direct" as const) }))
      .sort((a, b) => b.weight - a.weight),
    unavailableLookThroughWeight: unavailable,
    unavailableLookThroughSymbols: unavailableSymbols,
    cashWeight,
    unclassifiedWeight: unclassified,
  };
}

export interface StressPosition {
  symbol: string;
  marketValue: number;
  sector: string | null;
  securityType: "stock" | "etf";
}

export interface StressShocks {
  /** Percentage shock per symbol, e.g. -0.2 for -20%. Overrides sector shocks. */
  bySymbol: Record<string, number>;
  bySector: Record<string, number>;
}

export interface StressResult {
  impacts: Array<{ symbol: string; marketValue: number; shock: number; source: "symbol" | "sector" | "none"; impact: number }>;
  totalImpact: number;
  portfolioValue: number;
  impactPct: number | null;
  assumptions: string[];
}

export const STRESS_ASSUMPTIONS = [
  "Shocks are applied instantly and linearly to the current market value of each position.",
  "No correlation effects: a shock to one position does not move any other position.",
  "Cash is unaffected. ETFs are shocked at fund level only; underlying holdings are not modelled.",
  "Sector shocks apply to every position classified in that sector unless a position-specific shock is given.",
  "This is a hypothetical scenario, not a forecast and not a historical estimate.",
];

export function stressTest(positions: readonly StressPosition[], cash: number, shocks: StressShocks): StressResult {
  const impacts = positions.map((p) => {
    let shock = 0;
    let source: "symbol" | "sector" | "none" = "none";
    if (p.symbol in shocks.bySymbol) {
      shock = shocks.bySymbol[p.symbol];
      source = "symbol";
    } else if (p.sector && p.sector in shocks.bySector) {
      shock = shocks.bySector[p.sector];
      source = "sector";
    }
    return { symbol: p.symbol, marketValue: p.marketValue, shock, source, impact: p.marketValue * shock };
  });
  const totalImpact = impacts.reduce((acc, i) => acc + i.impact, 0);
  const portfolioValue = cash + positions.reduce((acc, p) => acc + p.marketValue, 0);
  return {
    impacts: impacts.sort((a, b) => a.impact - b.impact),
    totalImpact,
    portfolioValue,
    impactPct: portfolioValue > 0 ? totalImpact / portfolioValue : null,
    assumptions: STRESS_ASSUMPTIONS,
  };
}

export interface SecurityRisk {
  symbol: string;
  window: { from: ISODate; to: ISODate } | null;
  volatility: StatResult;
  maxDrawdown: number | null;
  beta: BetaResult;
  observations: number;
}

/** Risk statistics for one security against a benchmark over a window. */
export function securityRisk(symbol: string, prices: readonly PricePoint[], benchmark: readonly PricePoint[]): SecurityRisk {
  const aligned = alignByDate([prices, benchmark]);
  const r = simpleReturns(aligned.columns[0] ?? []);
  const rb = simpleReturns(aligned.columns[1] ?? []);
  return {
    symbol,
    window: aligned.dates.length ? { from: aligned.dates[0], to: aligned.dates[aligned.dates.length - 1] } : null,
    volatility: annualizedVolatility(r),
    maxDrawdown: prices.length >= 2 ? maxDrawdownOfPrices(prices).maxDrawdown : null,
    beta: beta(r, rb),
    observations: r.length,
  };
}
