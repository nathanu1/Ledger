import { LedgerReplayer, sortTransactions } from "./ledger";
import { Decimal, ZERO } from "./money";
import { addDays } from "./dates";
import { periodStart, type PeriodKey } from "./periods";
import type { ISODate, LedgerTransaction } from "./types";

type Totals = { deposits: Decimal; withdrawals: Decimal; dividends: Decimal; interest: Decimal; standaloneFees: Decimal; tradingFees: Decimal; realizedPnl: Decimal };
const empty = (): Totals => ({ deposits: ZERO, withdrawals: ZERO, dividends: ZERO, interest: ZERO, standaloneFees: ZERO, tradingFees: ZERO, realizedPnl: ZERO });
const serialize = (t: Totals) => Object.fromEntries(Object.entries(t).map(([key, value]) => [key, value.toString()])) as { [K in keyof Totals]: string };

/** Returns the first included calendar day for a selected return period. */
export function activityStart(period: PeriodKey, asOf: ISODate, transactions: readonly LedgerTransaction[]): ISODate {
  const boundary = periodStart(period, asOf);
  if (boundary) return addDays(boundary, 1);
  return transactions.reduce((first, t) => t.date < first ? t.date : first, asOf);
}

/** Replays the entire history before selecting a period so FIFO and rejected rows stay correct. */
export function portfolioActivity(transactions: readonly LedgerTransaction[], from: ISODate, to: ISODate) {
  const replay = new LedgerReplayer();
  const total = empty();
  const monthly = new Map<string, Totals>();
  const dividends = new Map<string, Decimal>();
  let rejected = 0;
  let applied = 0;
  for (const t of sortTransactions(transactions)) {
    if (t.date > to) break;
    const before = { deposits: replay.deposits, withdrawals: replay.withdrawals, dividends: replay.dividends, interest: replay.interest, standaloneFees: replay.standaloneFees, tradingFees: replay.tradingFees, realizedPnl: replay.realizedPnl };
    const accepted = replay.apply(t);
    if (t.date < from) continue;
    if (!accepted) { rejected++; continue; }
    applied++;
    const month = t.date.slice(0, 7);
    const bucket = monthly.get(month) ?? empty();
    for (const key of Object.keys(total) as Array<keyof Totals>) {
      const delta = replay[key].minus(before[key]);
      total[key] = total[key].plus(delta);
      bucket[key] = bucket[key].plus(delta);
      if (key === "dividends" && !delta.isZero() && t.symbol) {
        const symbol = t.symbol.trim().toUpperCase();
        dividends.set(symbol, (dividends.get(symbol) ?? ZERO).plus(delta));
      }
    }
    monthly.set(month, bucket);
  }
  return {
    from, to, applied, rejected,
    totals: { ...serialize(total), netContributions: total.deposits.minus(total.withdrawals).toString(), totalFees: total.standaloneFees.plus(total.tradingFees).toString() },
    monthly: [...monthly.entries()].sort(([a], [b]) => b.localeCompare(a)).map(([month, values]) => ({ month, ...serialize(values), totalFees: values.standaloneFees.plus(values.tradingFees).toString() })),
    dividendsBySymbol: [...dividends.entries()].sort((a, b) => b[1].cmp(a[1]) || a[0].localeCompare(b[0])).map(([symbol, amount]) => ({ symbol, amount: amount.toString() })),
  };
}
