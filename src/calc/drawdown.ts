import type { ISODate } from "./types";
import type { IndexPoint } from "./returns";

export interface DrawdownPoint {
  date: ISODate;
  /** Fraction below the running peak, 0 at a new high, negative otherwise. */
  drawdown: number;
}

export interface DrawdownResult {
  points: DrawdownPoint[];
  /** Deepest drawdown as a negative fraction, or null when fewer than two points. */
  maxDrawdown: number | null;
  peakDate: ISODate | null;
  troughDate: ISODate | null;
  /** First date after the trough at which the series regained its prior peak, if any. */
  recoveryDate: ISODate | null;
  /** Calendar days from peak to trough. */
  declineDays: number | null;
}

/**
 * Drawdown of an index series (for a portfolio, the TWR growth index so that
 * deposits and withdrawals do not masquerade as gains or losses).
 */
export function drawdownFromIndex(index: readonly IndexPoint[]): DrawdownResult {
  const points: DrawdownPoint[] = [];
  if (index.length === 0) {
    return { points, maxDrawdown: null, peakDate: null, troughDate: null, recoveryDate: null, declineDays: null };
  }
  let peak = index[0].value;
  let peakDate = index[0].date;
  let maxDrawdown = 0;
  let maxPeakDate: ISODate | null = index[0].date;
  let troughDate: ISODate | null = null;
  let troughIdx = -1;
  for (let i = 0; i < index.length; i += 1) {
    const p = index[i];
    if (p.value > peak) {
      peak = p.value;
      peakDate = p.date;
    }
    const dd = peak > 0 ? p.value / peak - 1 : 0;
    points.push({ date: p.date, drawdown: dd });
    if (dd < maxDrawdown) {
      maxDrawdown = dd;
      maxPeakDate = peakDate;
      troughDate = p.date;
      troughIdx = i;
    }
  }
  let recoveryDate: ISODate | null = null;
  if (troughIdx >= 0 && maxPeakDate) {
    const peakValue = index.find((p) => p.date === maxPeakDate)?.value ?? peak;
    for (let i = troughIdx + 1; i < index.length; i += 1) {
      if (index[i].value >= peakValue) {
        recoveryDate = index[i].date;
        break;
      }
    }
  }
  const declineDays =
    maxPeakDate && troughDate
      ? Math.round((Date.parse(troughDate) - Date.parse(maxPeakDate)) / 86_400_000)
      : null;
  return {
    points,
    maxDrawdown: index.length >= 2 ? maxDrawdown : null,
    peakDate: index.length >= 2 ? maxPeakDate : null,
    troughDate: index.length >= 2 ? troughDate : null,
    recoveryDate,
    declineDays: index.length >= 2 ? declineDays : null,
  };
}

/** Max drawdown of a plain price series (adjusted closes). */
export function maxDrawdownOfPrices(prices: readonly { date: ISODate; price: number }[]): DrawdownResult {
  return drawdownFromIndex(prices.map((p) => ({ date: p.date, value: p.price })));
}
