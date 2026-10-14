/**
 * Portfolio returns.
 *
 * Time-weighted return (TWR): daily sub-period returns linked geometrically.
 * External flows (deposits and withdrawals) are assumed to arrive at the START
 * of the day they are recorded, so each day's return is
 *     r_t = V_t / (V_{t-1} + F_t) - 1.
 * This convention is robust at inception (the first deposit funds the first day)
 * and is stated in the UI wherever a TWR figure appears.
 *
 * Money-weighted return (MWR): the annualised internal rate of return of the
 * dated external flows plus the terminal value (XIRR, ACT/365). The solver scans
 * for sign changes before refining so that "no solution" and "more than one
 * solution" are reported explicitly instead of returning an arbitrary root.
 */
import { yearFraction, daysBetween, lastIndexOnOrBefore } from "./dates";
import type { DailyPoint, ISODate, PricePoint } from "./types";

export const TWR_CONVENTION =
  "External flows are treated as arriving at the start of the day they are recorded. Daily return = V(t) / (V(t-1) + flow(t)) - 1, linked geometrically.";

export interface DailyReturn {
  date: ISODate;
  /** Simple return for the day. */
  r: number;
  value: number;
  flow: number;
  /** Set when the denominator was not positive and the day was treated as flat. */
  flagged?: "non_positive_base";
}

export interface IndexPoint {
  date: ISODate;
  value: number;
}

export interface TwrResult {
  dailyReturns: DailyReturn[];
  /** Growth of 100 from the first point. */
  growthIndex: IndexPoint[];
  totalReturn: number | null;
  /** Only populated when the span is at least 365 days. */
  annualizedReturn: number | null;
  startDate: ISODate | null;
  endDate: ISODate | null;
  flaggedDays: number;
  convention: string;
}

export function timeWeightedReturn(points: readonly DailyPoint[]): TwrResult {
  const dailyReturns: DailyReturn[] = [];
  const growthIndex: IndexPoint[] = [];
  if (points.length === 0) {
    return {
      dailyReturns,
      growthIndex,
      totalReturn: null,
      annualizedReturn: null,
      startDate: null,
      endDate: null,
      flaggedDays: 0,
      convention: TWR_CONVENTION,
    };
  }
  let index = 100;
  growthIndex.push({ date: points[0].date, value: index });
  let flaggedDays = 0;
  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1];
    const cur = points[i];
    const base = prev.value + cur.externalFlow;
    let r = 0;
    let flagged: DailyReturn["flagged"];
    if (base > 0) {
      r = cur.value / base - 1;
    } else if (prev.value === 0 && cur.externalFlow === 0 && cur.value === 0) {
      r = 0;
    } else {
      flagged = "non_positive_base";
      flaggedDays += 1;
    }
    index *= 1 + r;
    dailyReturns.push({ date: cur.date, r, value: cur.value, flow: cur.externalFlow, flagged });
    growthIndex.push({ date: cur.date, value: index });
  }
  const totalReturn = points.length >= 2 ? index / 100 - 1 : null;
  const span = daysBetween(points[0].date, points[points.length - 1].date);
  const annualizedReturn =
    totalReturn !== null && span >= 365 ? Math.pow(1 + totalReturn, 365 / span) - 1 : null;
  return {
    dailyReturns,
    growthIndex,
    totalReturn,
    annualizedReturn,
    startDate: points[0].date,
    endDate: points[points.length - 1].date,
    flaggedDays,
    convention: TWR_CONVENTION,
  };
}

export interface PeriodReturn {
  from: ISODate;
  to: ISODate;
  /** Linked return over (from, to]. */
  totalReturn: number;
  annualizedReturn: number | null;
  days: number;
}

/**
 * TWR between two dates using the daily return series. `from` snaps to the
 * last series date on or before it; `to` snaps to the last date on or before it.
 */
export function periodReturn(twr: TwrResult, from: ISODate, to: ISODate): PeriodReturn | null {
  if (twr.growthIndex.length < 2) return null;
  const dates = twr.growthIndex.map((p) => p.date);
  const fromIdx = lastIndexOnOrBefore(dates, from);
  const toIdx = lastIndexOnOrBefore(dates, to);
  if (fromIdx < 0 || toIdx < 0 || toIdx <= fromIdx) return null;
  const start = twr.growthIndex[fromIdx];
  const end = twr.growthIndex[toIdx];
  if (start.value <= 0) return null;
  const totalReturn = end.value / start.value - 1;
  const days = daysBetween(start.date, end.date);
  return {
    from: start.date,
    to: end.date,
    totalReturn,
    annualizedReturn: days >= 365 ? Math.pow(1 + totalReturn, 365 / days) - 1 : null,
    days,
  };
}

export interface CashFlow {
  date: ISODate;
  /** Investor's perspective: deposits negative, withdrawals and terminal value positive. */
  amount: number;
}

export type XirrResult =
  | { status: "ok"; rate: number; iterations: number }
  | { status: "no_solution"; message: string }
  | { status: "not_unique"; message: string; candidates: number[] }
  | { status: "insufficient_data"; message: string };

const SCAN_GRID: number[] = [
  -0.9999, -0.999, -0.99, -0.97, -0.95, -0.9, -0.85, -0.8, -0.7, -0.6, -0.5, -0.4, -0.3, -0.2, -0.15, -0.1, -0.05,
  0, 0.025, 0.05, 0.075, 0.1, 0.15, 0.2, 0.3, 0.4, 0.5, 0.75, 1, 1.5, 2, 3, 5, 10, 20, 50, 100,
];

export function xirr(flows: readonly CashFlow[], options: { tolerance?: number; maxIterations?: number } = {}): XirrResult {
  const tolerance = options.tolerance ?? 1e-10;
  const maxIterations = options.maxIterations ?? 200;
  const nonZero = flows.filter((f) => f.amount !== 0 && Number.isFinite(f.amount));
  if (nonZero.length < 2) {
    return { status: "insufficient_data", message: "At least one inflow and one outflow are needed." };
  }
  const hasPositive = nonZero.some((f) => f.amount > 0);
  const hasNegative = nonZero.some((f) => f.amount < 0);
  if (!hasPositive || !hasNegative) {
    return { status: "insufficient_data", message: "Cash flows must include both money in and money out." };
  }
  const sorted = [...nonZero].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const t0 = sorted[0].date;
  const times = sorted.map((f) => yearFraction(t0, f.date));
  if (times[times.length - 1] <= 0) {
    return { status: "insufficient_data", message: "All cash flows fall on the same day; a rate of return is undefined." };
  }
  const amounts = sorted.map((f) => f.amount);

  const npv = (rate: number): number => {
    let total = 0;
    for (let i = 0; i < amounts.length; i += 1) {
      total += amounts[i] * Math.pow(1 + rate, -times[i]);
    }
    return total;
  };
  const dnpv = (rate: number): number => {
    let total = 0;
    for (let i = 0; i < amounts.length; i += 1) {
      total += -times[i] * amounts[i] * Math.pow(1 + rate, -times[i] - 1);
    }
    return total;
  };

  // 1. Bracket every sign change on a coarse grid.
  const brackets: Array<[number, number]> = [];
  let prevRate = SCAN_GRID[0];
  let prevValue = npv(prevRate);
  for (let i = 1; i < SCAN_GRID.length; i += 1) {
    const rate = SCAN_GRID[i];
    const value = npv(rate);
    if (Number.isFinite(prevValue) && Number.isFinite(value)) {
      if (prevValue === 0) brackets.push([prevRate, prevRate]);
      else if (Math.sign(prevValue) !== Math.sign(value)) brackets.push([prevRate, rate]);
    }
    prevRate = rate;
    prevValue = value;
  }
  if (brackets.length === 0) {
    return {
      status: "no_solution",
      message: "No discount rate between -99.99% and +10,000% sets the net present value of these flows to zero.",
    };
  }

  // 2. Refine each bracket by bisection, then polish with guarded Newton steps.
  const roots: number[] = [];
  let iterationsUsed = 0;
  for (const [lo0, hi0] of brackets) {
    let lo = lo0;
    let hi = hi0;
    let root = lo;
    if (lo === hi) {
      root = lo;
    } else {
      let fLo = npv(lo);
      for (let i = 0; i < maxIterations; i += 1) {
        iterationsUsed += 1;
        const mid = (lo + hi) / 2;
        const fMid = npv(mid);
        if (Math.abs(fMid) < tolerance || (hi - lo) / 2 < 1e-12) {
          root = mid;
          break;
        }
        if (Math.sign(fMid) === Math.sign(fLo)) {
          lo = mid;
          fLo = fMid;
        } else {
          hi = mid;
        }
        root = mid;
      }
      for (let i = 0; i < 8; i += 1) {
        const d = dnpv(root);
        if (!Number.isFinite(d) || d === 0) break;
        const next = root - npv(root) / d;
        if (!Number.isFinite(next) || next <= -1 || next < lo0 - 1e-9 || next > hi0 + 1e-9) break;
        root = next;
        if (Math.abs(npv(root)) < tolerance) break;
      }
    }
    if (!roots.some((r) => Math.abs(r - root) < 1e-7)) roots.push(root);
  }
  roots.sort((a, b) => a - b);
  if (roots.length === 1) return { status: "ok", rate: roots[0], iterations: iterationsUsed };
  return {
    status: "not_unique",
    message: `The cash flows admit ${roots.length} internal rates of return; the money-weighted return is not uniquely defined.`,
    candidates: roots,
  };
}

export interface MoneyWeightedResult {
  result: XirrResult;
  flows: CashFlow[];
  from: ISODate | null;
  to: ISODate | null;
  /** (1 + rate)^(years) - 1 when a unique rate exists; the un-annualised equivalent for the window. */
  holdingPeriodEquivalent: number | null;
  years: number | null;
}

/**
 * Money-weighted return for a window of the valuation series. The opening value
 * (if any) is treated as an initial investment, external flows are taken from the
 * daily points in (from, to], and the closing value as the terminal receipt.
 */
export function moneyWeightedReturn(points: readonly DailyPoint[], from?: ISODate, to?: ISODate): MoneyWeightedResult {
  if (points.length === 0) {
    return {
      result: { status: "insufficient_data", message: "No valuation data." },
      flows: [],
      from: null,
      to: null,
      holdingPeriodEquivalent: null,
      years: null,
    };
  }
  const dates = points.map((p) => p.date);
  const startIdx = from ? Math.max(lastIndexOnOrBefore(dates, from), 0) : 0;
  const endIdx = to ? lastIndexOnOrBefore(dates, to) : points.length - 1;
  if (endIdx < 0 || endIdx <= startIdx) {
    return {
      result: { status: "insufficient_data", message: "The selected window contains fewer than two valuation days." },
      flows: [],
      from: points[Math.max(startIdx, 0)]?.date ?? null,
      to: points[Math.max(endIdx, 0)]?.date ?? null,
      holdingPeriodEquivalent: null,
      years: null,
    };
  }
  const start = points[startIdx];
  const end = points[endIdx];
  const flows: CashFlow[] = [];
  // Opening value is money already at work when the window begins.
  if (from && startIdx > 0 && start.value !== 0) flows.push({ date: start.date, amount: -start.value });
  else if (!from || startIdx === 0) {
    // Inception window: the first day's flow funds the portfolio.
    if (start.externalFlow !== 0) flows.push({ date: start.date, amount: -start.externalFlow });
    const residual = start.value - start.externalFlow;
    if (residual !== 0) flows.push({ date: start.date, amount: -residual });
  }
  for (let i = startIdx + 1; i <= endIdx; i += 1) {
    const p = points[i];
    if (p.externalFlow !== 0) flows.push({ date: p.date, amount: -p.externalFlow });
  }
  if (end.value !== 0) flows.push({ date: end.date, amount: end.value });
  const result = xirr(flows);
  const years = yearFraction(start.date, end.date);
  return {
    result,
    flows,
    from: start.date,
    to: end.date,
    holdingPeriodEquivalent: result.status === "ok" && years > 0 ? Math.pow(1 + result.rate, years) - 1 : null,
    years,
  };
}

export interface InvestmentGain {
  from: ISODate;
  to: ISODate;
  beginValue: number;
  endValue: number;
  deposits: number;
  withdrawals: number;
  netContributions: number;
  /** endValue - beginValue - netContributions. External deposits are never gains. */
  investmentGain: number;
}

export function investmentGain(points: readonly DailyPoint[], from?: ISODate, to?: ISODate): InvestmentGain | null {
  if (points.length === 0) return null;
  const dates = points.map((p) => p.date);
  const startIdx = from ? lastIndexOnOrBefore(dates, from) : 0;
  const endIdx = to ? lastIndexOnOrBefore(dates, to) : points.length - 1;
  if (endIdx < 0) return null;
  let deposits = 0;
  let withdrawals = 0;
  let beginValue: number;
  let begin: ISODate;
  if (from === undefined || startIdx < 0) {
    // Since inception: begin from nothing and count every flow, including the first day's.
    beginValue = 0;
    begin = points[0].date;
    for (let i = 0; i <= endIdx; i += 1) {
      const f = points[i].externalFlow;
      if (f > 0) deposits += f;
      else withdrawals += -f;
    }
  } else {
    beginValue = points[startIdx].value;
    begin = points[startIdx].date;
    for (let i = startIdx + 1; i <= endIdx; i += 1) {
      const f = points[i].externalFlow;
      if (f > 0) deposits += f;
      else withdrawals += -f;
    }
  }
  const endValue = points[endIdx].value;
  const netContributions = deposits - withdrawals;
  return {
    from: begin,
    to: points[endIdx].date,
    beginValue,
    endValue,
    deposits,
    withdrawals,
    netContributions,
    investmentGain: endValue - beginValue - netContributions,
  };
}

/** Benchmark growth of 100 along the given dates using the last close on or before each date. */
export function benchmarkGrowth(series: readonly PricePoint[], dates: readonly ISODate[]): Array<IndexPoint | { date: ISODate; value: null }> {
  const seriesDates = series.map((p) => p.date);
  let base: number | null = null;
  return dates.map((date) => {
    const idx = lastIndexOnOrBefore(seriesDates, date);
    if (idx < 0) return { date, value: null };
    const price = series[idx].price;
    if (base === null) base = price;
    return { date, value: (price / base) * 100 };
  });
}

export interface BenchmarkReturn {
  from: ISODate;
  to: ISODate;
  /** Dates of the prices actually used (last close on or before from/to). */
  priceDateFrom: ISODate;
  priceDateTo: ISODate;
  totalReturn: number;
  annualizedReturn: number | null;
}

export function benchmarkReturn(series: readonly PricePoint[], from: ISODate, to: ISODate): BenchmarkReturn | null {
  const seriesDates = series.map((p) => p.date);
  const i0 = lastIndexOnOrBefore(seriesDates, from);
  const i1 = lastIndexOnOrBefore(seriesDates, to);
  if (i0 < 0 || i1 < 0 || i1 <= i0) return null;
  const p0 = series[i0];
  const p1 = series[i1];
  if (p0.price <= 0) return null;
  const totalReturn = p1.price / p0.price - 1;
  const days = daysBetween(p0.date, p1.date);
  return {
    from,
    to,
    priceDateFrom: p0.date,
    priceDateTo: p1.date,
    totalReturn,
    annualizedReturn: days >= 365 ? Math.pow(1 + totalReturn, 365 / days) - 1 : null,
  };
}
