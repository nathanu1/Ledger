/**
 * Position-level profit attribution over a window (from, to].
 *
 * For each symbol:
 *   P/L = marketValue(to) - marketValue(from) - netInvested + dividends
 * where netInvested = cost of buys (fees included) - proceeds of sells (net of fees)
 * inside the window. This is exact accounting rather than an approximation from
 * price changes, and it reconciles to the portfolio's investment gain together
 * with cash interest and standalone fees.
 */
import { Decimal, dec, decOrNull, ZERO, toDecimalString } from "./money";
import { sortTransactions } from "./ledger";
import type { DecimalString, ISODate, LedgerTransaction, PortfolioValuation } from "./types";

export interface PositionPnl {
  symbol: string;
  startValue: DecimalString | null;
  endValue: DecimalString | null;
  netInvested: DecimalString;
  dividends: DecimalString;
  /** null when a market value is unknown at either end. */
  pnl: DecimalString | null;
  /** pnl as a share of the starting portfolio value, when both are available. */
  contributionPct: number | null;
}

export interface AttributionResult {
  from: ISODate;
  to: ISODate;
  positions: PositionPnl[];
  interest: DecimalString;
  standaloneFees: DecimalString;
  /** Sum of position P/L (only positions with known values) + interest - standalone fees. */
  explainedGain: DecimalString;
  unpricedSymbols: string[];
}

export function attributePnl(params: {
  transactions: readonly LedgerTransaction[];
  start: PortfolioValuation;
  end: PortfolioValuation;
}): AttributionResult {
  const { transactions, start, end } = params;
  const from = start.asOf;
  const to = end.asOf;
  const startValues = new Map<string, Decimal | null>();
  const endValues = new Map<string, Decimal | null>();
  for (const p of start.positions) startValues.set(p.symbol, p.marketValue === null ? null : dec(p.marketValue));
  for (const p of end.positions) endValues.set(p.symbol, p.marketValue === null ? null : dec(p.marketValue));

  const netInvested = new Map<string, Decimal>();
  const dividends = new Map<string, Decimal>();
  let interest = ZERO;
  let fees = ZERO;
  const symbols = new Set<string>([...startValues.keys(), ...endValues.keys()]);

  for (const t of sortTransactions(transactions)) {
    if (t.date <= from || t.date > to) continue;
    const symbol = t.symbol?.trim().toUpperCase();
    switch (t.type) {
      case "BUY": {
        if (!symbol) break;
        const q = decOrNull(t.quantity);
        const p = decOrNull(t.price);
        if (!q || !p) break;
        const fee = decOrNull(t.fee) ?? ZERO;
        netInvested.set(symbol, (netInvested.get(symbol) ?? ZERO).plus(q.times(p).plus(fee)));
        symbols.add(symbol);
        break;
      }
      case "SELL": {
        if (!symbol) break;
        const q = decOrNull(t.quantity);
        const p = decOrNull(t.price);
        if (!q || !p) break;
        const fee = decOrNull(t.fee) ?? ZERO;
        netInvested.set(symbol, (netInvested.get(symbol) ?? ZERO).minus(q.times(p).minus(fee)));
        symbols.add(symbol);
        break;
      }
      case "DIVIDEND": {
        if (!symbol) break;
        const a = decOrNull(t.amount);
        if (!a) break;
        dividends.set(symbol, (dividends.get(symbol) ?? ZERO).plus(a));
        symbols.add(symbol);
        break;
      }
      case "INTEREST": {
        const a = decOrNull(t.amount);
        if (a) interest = interest.plus(a);
        break;
      }
      case "FEE": {
        const a = decOrNull(t.amount);
        if (a) fees = fees.plus(a);
        break;
      }
      default:
        break;
    }
  }

  const startTotal = dec(start.totalValue);
  const positions: PositionPnl[] = [];
  const unpriced: string[] = [];
  let explained = ZERO;
  for (const symbol of [...symbols].sort()) {
    const sv = startValues.has(symbol) ? startValues.get(symbol)! : ZERO;
    const ev = endValues.has(symbol) ? endValues.get(symbol)! : ZERO;
    const ni = netInvested.get(symbol) ?? ZERO;
    const dv = dividends.get(symbol) ?? ZERO;
    if (sv === null || ev === null) {
      unpriced.push(symbol);
      positions.push({
        symbol,
        startValue: sv === null ? null : toDecimalString(sv),
        endValue: ev === null ? null : toDecimalString(ev),
        netInvested: toDecimalString(ni),
        dividends: toDecimalString(dv),
        pnl: null,
        contributionPct: null,
      });
      continue;
    }
    const pnl = ev.minus(sv).minus(ni).plus(dv);
    explained = explained.plus(pnl);
    positions.push({
      symbol,
      startValue: toDecimalString(sv),
      endValue: toDecimalString(ev),
      netInvested: toDecimalString(ni),
      dividends: toDecimalString(dv),
      pnl: toDecimalString(pnl),
      contributionPct: startTotal.gt(0) ? pnl.div(startTotal).toNumber() : null,
    });
  }
  explained = explained.plus(interest).minus(fees);
  positions.sort((a, b) => {
    const pa = a.pnl === null ? 0 : Number(a.pnl);
    const pb = b.pnl === null ? 0 : Number(b.pnl);
    return pb - pa;
  });
  return {
    from,
    to,
    positions,
    interest: toDecimalString(interest),
    standaloneFees: toDecimalString(fees),
    explainedGain: toDecimalString(explained),
    unpricedSymbols: unpriced,
  };
}
