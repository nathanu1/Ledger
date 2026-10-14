/**
 * Ledger engine: derives cash, lots, holdings and realized P/L from the
 * transaction ledger. FIFO cost basis. Decimal-safe throughout.
 *
 * Accounting conventions (also documented in docs/METHODOLOGY.md):
 * - BUY cost basis = quantity x price + fee. Buy-side fees are capitalised into the lot.
 * - SELL proceeds = quantity x price - fee. Realized P/L = proceeds - cost of lots sold (FIFO).
 * - SPLIT multiplies every open lot's quantity by the ratio; lot cost is unchanged.
 * - DIVIDEND adds cash and is recorded as income against the symbol. A DRIP is a
 *   DIVIDEND plus a linked BUY, so dividend income is counted exactly once and the
 *   reinvestment is an ordinary purchase (not an external contribution).
 * - DEPOSIT / WITHDRAWAL are the only external flows.
 * - Realized figures are accounting estimates, not tax lots for reporting.
 */
import { Decimal, dec, decOrNull, ZERO, toDecimalString } from "./money";
import { lastIndexOnOrBefore } from "./dates";
import type {
  DailyPoint,
  ISODate,
  LedgerIssue,
  LedgerState,
  LedgerTransaction,
  PortfolioValuation,
  PositionState,
  PriceLookup,
  PricePoint,
  ValuedPosition,
} from "./types";

interface MutableLot {
  openedAt: ISODate;
  quantity: Decimal;
  /** Total remaining cost of the lot (fees included). */
  cost: Decimal;
  sourceTransactionId: string;
}

interface MutablePosition {
  symbol: string;
  lots: MutableLot[];
  realizedPnl: Decimal;
  dividends: Decimal;
}

export function normalizeSymbol(symbol: string | null | undefined): string | null {
  if (!symbol) return null;
  const s = symbol.trim().toUpperCase();
  return s.length ? s : null;
}

export function sortTransactions<T extends LedgerTransaction>(transactions: readonly T[]): T[] {
  return [...transactions].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    if (a.sequence !== b.sequence) return a.sequence - b.sequence;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

/**
 * Incremental replayer. `replayLedger` and `buildValuationSeries` share it so
 * the two can never disagree about holdings.
 */
export class LedgerReplayer {
  cash: Decimal = ZERO;
  readonly positions = new Map<string, MutablePosition>();
  readonly issues: LedgerIssue[] = [];
  appliedCount = 0;
  lastDate: ISODate | null = null;
  deposits = ZERO;
  withdrawals = ZERO;
  dividends = ZERO;
  interest = ZERO;
  standaloneFees = ZERO;
  tradingFees = ZERO;
  realizedPnl = ZERO;

  private position(symbol: string): MutablePosition {
    let p = this.positions.get(symbol);
    if (!p) {
      p = { symbol, lots: [], realizedPnl: ZERO, dividends: ZERO };
      this.positions.set(symbol, p);
    }
    return p;
  }

  private reject(t: LedgerTransaction, code: LedgerIssue["code"], message: string): null {
    this.issues.push({ transactionId: t.id, severity: "error", code, message });
    return null;
  }

  private warn(t: LedgerTransaction, code: LedgerIssue["code"], message: string): void {
    this.issues.push({ transactionId: t.id, severity: "warning", code, message });
  }

  private requireSymbol(t: LedgerTransaction): string | null {
    const s = normalizeSymbol(t.symbol);
    if (!s) return this.reject(t, "MISSING_SYMBOL", `${t.type} on ${t.date} has no symbol.`);
    return s;
  }

  private requireAmount(t: LedgerTransaction): Decimal | null {
    const a = decOrNull(t.amount);
    if (!a || a.lte(0)) {
      return this.reject(t, "INVALID_AMOUNT", `${t.type} on ${t.date} needs a positive amount.`);
    }
    return a;
  }

  private requireQuantity(t: LedgerTransaction): Decimal | null {
    const q = decOrNull(t.quantity);
    if (!q || q.lte(0)) {
      return this.reject(t, "INVALID_QUANTITY", `${t.type} on ${t.date} needs a positive quantity.`);
    }
    return q;
  }

  private requirePrice(t: LedgerTransaction): Decimal | null {
    const p = decOrNull(t.price);
    if (!p || p.lt(0)) {
      return this.reject(t, "INVALID_PRICE", `${t.type} on ${t.date} needs a price of zero or more.`);
    }
    return p;
  }

  private optionalFee(t: LedgerTransaction): Decimal | null {
    if (t.fee === null || t.fee === undefined || t.fee === "") return ZERO;
    const f = decOrNull(t.fee);
    if (!f || f.lt(0)) {
      return this.reject(t, "INVALID_AMOUNT", `${t.type} on ${t.date} has an invalid fee.`);
    }
    return f;
  }

  /** Returns true when the transaction was applied, false when rejected. */
  apply(t: LedgerTransaction): boolean {
    const ok = this.applyInner(t);
    if (ok) {
      this.appliedCount += 1;
      this.lastDate = t.date;
    }
    return ok;
  }

  /** Net external flow (deposits - withdrawals) contributed by a transaction, as applied. */
  static externalFlowOf(t: LedgerTransaction): Decimal {
    if (t.type === "DEPOSIT") return decOrNull(t.amount) ?? ZERO;
    if (t.type === "WITHDRAWAL") return (decOrNull(t.amount) ?? ZERO).neg();
    return ZERO;
  }

  private applyInner(t: LedgerTransaction): boolean {
    switch (t.type) {
      case "DEPOSIT": {
        const amount = this.requireAmount(t);
        if (!amount) return false;
        this.cash = this.cash.plus(amount);
        this.deposits = this.deposits.plus(amount);
        return true;
      }
      case "WITHDRAWAL": {
        const amount = this.requireAmount(t);
        if (!amount) return false;
        this.cash = this.cash.minus(amount);
        this.withdrawals = this.withdrawals.plus(amount);
        return true;
      }
      case "INTEREST": {
        const amount = this.requireAmount(t);
        if (!amount) return false;
        this.cash = this.cash.plus(amount);
        this.interest = this.interest.plus(amount);
        return true;
      }
      case "FEE": {
        const amount = this.requireAmount(t);
        if (!amount) return false;
        this.cash = this.cash.minus(amount);
        this.standaloneFees = this.standaloneFees.plus(amount);
        return true;
      }
      case "DIVIDEND": {
        const symbol = this.requireSymbol(t);
        if (!symbol) return false;
        const amount = this.requireAmount(t);
        if (!amount) return false;
        this.cash = this.cash.plus(amount);
        this.dividends = this.dividends.plus(amount);
        const p = this.position(symbol);
        p.dividends = p.dividends.plus(amount);
        return true;
      }
      case "BUY": {
        const symbol = this.requireSymbol(t);
        if (!symbol) return false;
        const quantity = this.requireQuantity(t);
        if (!quantity) return false;
        const price = this.requirePrice(t);
        if (!price) return false;
        const fee = this.optionalFee(t);
        if (!fee) return false;
        const cost = quantity.times(price).plus(fee);
        this.cash = this.cash.minus(cost);
        this.tradingFees = this.tradingFees.plus(fee);
        this.position(symbol).lots.push({
          openedAt: t.date,
          quantity,
          cost,
          sourceTransactionId: t.id,
        });
        return true;
      }
      case "SELL": {
        const symbol = this.requireSymbol(t);
        if (!symbol) return false;
        const quantity = this.requireQuantity(t);
        if (!quantity) return false;
        const price = this.requirePrice(t);
        if (!price) return false;
        const fee = this.optionalFee(t);
        if (!fee) return false;
        const p = this.position(symbol);
        const held = p.lots.reduce((acc, lot) => acc.plus(lot.quantity), ZERO);
        if (quantity.gt(held)) {
          this.reject(
            t,
            "SELL_EXCEEDS_HOLDINGS",
            `Sell of ${quantity.toString()} ${symbol} on ${t.date} exceeds the ${held.toString()} shares held. Short positions are not supported; the transaction was ignored.`,
          );
          return false;
        }
        const proceeds = quantity.times(price).minus(fee);
        let remaining = quantity;
        let costRemoved = ZERO;
        while (remaining.gt(0) && p.lots.length > 0) {
          const lot = p.lots[0];
          if (lot.quantity.lte(remaining)) {
            costRemoved = costRemoved.plus(lot.cost);
            remaining = remaining.minus(lot.quantity);
            p.lots.shift();
          } else {
            const fraction = remaining.div(lot.quantity);
            const costPart = lot.cost.times(fraction);
            costRemoved = costRemoved.plus(costPart);
            lot.cost = lot.cost.minus(costPart);
            lot.quantity = lot.quantity.minus(remaining);
            remaining = ZERO;
          }
        }
        const realized = proceeds.minus(costRemoved);
        p.realizedPnl = p.realizedPnl.plus(realized);
        this.realizedPnl = this.realizedPnl.plus(realized);
        this.cash = this.cash.plus(proceeds);
        this.tradingFees = this.tradingFees.plus(fee);
        return true;
      }
      case "SPLIT": {
        const symbol = this.requireSymbol(t);
        if (!symbol) return false;
        const num = t.splitNumerator;
        const den = t.splitDenominator;
        if (!num || !den || num <= 0 || den <= 0 || !Number.isFinite(num) || !Number.isFinite(den)) {
          this.reject(t, "INVALID_SPLIT", `Split on ${t.date} needs positive numerator and denominator.`);
          return false;
        }
        const ratio = new Decimal(num).div(den);
        const p = this.positions.get(symbol);
        if (!p || p.lots.length === 0) {
          this.warn(t, "SPLIT_WITHOUT_POSITION", `Split for ${symbol} on ${t.date} found no open lots; nothing to adjust.`);
          return true;
        }
        for (const lot of p.lots) {
          lot.quantity = lot.quantity.times(ratio);
        }
        return true;
      }
      default: {
        const never: never = t.type;
        throw new Error(`Unknown transaction type ${String(never)}`);
      }
    }
  }

  snapshot(asOf: ISODate | null): LedgerState {
    const positions: Record<string, PositionState> = {};
    for (const [symbol, p] of [...this.positions.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
      const quantity = p.lots.reduce((acc, lot) => acc.plus(lot.quantity), ZERO);
      const costBasis = p.lots.reduce((acc, lot) => acc.plus(lot.cost), ZERO);
      positions[symbol] = {
        symbol,
        quantity: toDecimalString(quantity),
        costBasis: toDecimalString(costBasis),
        averageCost: quantity.gt(0) ? toDecimalString(costBasis.div(quantity)) : null,
        realizedPnl: toDecimalString(p.realizedPnl),
        dividends: toDecimalString(p.dividends),
        lots: p.lots.map((lot) => ({
          openedAt: lot.openedAt,
          quantity: toDecimalString(lot.quantity),
          costPerShare: toDecimalString(lot.quantity.gt(0) ? lot.cost.div(lot.quantity) : ZERO),
          costBasis: toDecimalString(lot.cost),
          sourceTransactionId: lot.sourceTransactionId,
        })),
      };
    }
    const issues = [...this.issues];
    if (this.cash.lt(0)) {
      issues.push({
        transactionId: "",
        severity: "warning",
        code: "NEGATIVE_CASH",
        message: `Cash balance is negative (${this.cash.toFixed(2)}). Margin is not modelled; check for missing deposits.`,
      });
    }
    return {
      method: "FIFO",
      asOf: asOf ?? this.lastDate,
      cash: toDecimalString(this.cash),
      positions,
      totals: {
        deposits: toDecimalString(this.deposits),
        withdrawals: toDecimalString(this.withdrawals),
        dividends: toDecimalString(this.dividends),
        interest: toDecimalString(this.interest),
        standaloneFees: toDecimalString(this.standaloneFees),
        tradingFees: toDecimalString(this.tradingFees),
        realizedPnl: toDecimalString(this.realizedPnl),
      },
      issues,
      appliedCount: this.appliedCount,
    };
  }

  /** Current share count per symbol (open positions only). */
  holdings(): Map<string, Decimal> {
    const out = new Map<string, Decimal>();
    for (const [symbol, p] of this.positions) {
      const q = p.lots.reduce((acc, lot) => acc.plus(lot.quantity), ZERO);
      if (q.gt(0)) out.set(symbol, q);
    }
    return out;
  }
}

export interface ReplayOptions {
  /** Only apply transactions dated on or before this date. */
  asOf?: ISODate;
}

export function replayLedger(transactions: readonly LedgerTransaction[], options: ReplayOptions = {}): LedgerState {
  const replayer = new LedgerReplayer();
  for (const t of sortTransactions(transactions)) {
    if (options.asOf && t.date > options.asOf) break;
    replayer.apply(t);
  }
  return replayer.snapshot(options.asOf ?? null);
}

/** Build a lookup returning the last known price on or before a date. */
export function makePriceLookup(prices: Record<string, readonly PricePoint[]>): PriceLookup {
  const dateIndex = new Map<string, ISODate[]>();
  for (const [symbol, points] of Object.entries(prices)) {
    dateIndex.set(symbol, points.map((p) => p.date));
  }
  return (symbol, date) => {
    const points = prices[symbol];
    const dates = dateIndex.get(symbol);
    if (!points || !dates || points.length === 0) return null;
    const idx = lastIndexOnOrBefore(dates, date);
    if (idx < 0) return null;
    return points[idx];
  };
}

/**
 * Value a ledger state using a price lookup. Positions without a price are
 * reported in `missingPrices` and excluded from totals; they are never valued at zero.
 */
export function valuePortfolio(state: LedgerState, lookup: PriceLookup, asOf: ISODate): PortfolioValuation {
  const cash = dec(state.cash);
  const missingPrices: string[] = [];
  const interim: Array<{ position: PositionState; price: PricePoint | null; quantity: Decimal; marketValue: Decimal | null }> = [];

  for (const position of Object.values(state.positions)) {
    const quantity = dec(position.quantity);
    if (quantity.lte(0)) {
      interim.push({ position, price: null, quantity, marketValue: ZERO });
      continue;
    }
    const price = lookup(position.symbol, asOf);
    if (!price) {
      missingPrices.push(position.symbol);
      interim.push({ position, price: null, quantity, marketValue: null });
      continue;
    }
    interim.push({ position, price, quantity, marketValue: quantity.times(price.price) });
  }

  const marketValue = interim.reduce((acc, row) => (row.marketValue ? acc.plus(row.marketValue) : acc), ZERO);
  const totalValue = cash.plus(marketValue);

  const positions: ValuedPosition[] = interim.map(({ position, price, marketValue: mv }) => {
    const costBasis = dec(position.costBasis);
    const unrealized = mv === null ? null : mv.minus(costBasis);
    const realized = dec(position.realizedPnl);
    const dividends = dec(position.dividends);
    return {
      symbol: position.symbol,
      quantity: position.quantity,
      costBasis: position.costBasis,
      averageCost: position.averageCost,
      price: price?.price ?? null,
      priceDate: price?.date ?? null,
      marketValue: mv === null ? null : toDecimalString(mv),
      unrealizedPnl: unrealized === null ? null : toDecimalString(unrealized),
      unrealizedPnlPct: unrealized === null || costBasis.lte(0) ? null : unrealized.div(costBasis).toNumber(),
      realizedPnl: position.realizedPnl,
      dividends: position.dividends,
      totalGain: unrealized === null ? null : toDecimalString(unrealized.plus(realized).plus(dividends)),
      weight: mv === null || totalValue.lte(0) ? null : mv.div(totalValue).toNumber(),
    };
  });

  return {
    asOf,
    cash: toDecimalString(cash),
    positions,
    marketValue: toDecimalString(marketValue),
    totalValue: toDecimalString(totalValue),
    missingPrices,
  };
}

export interface ValuationSeriesOptions {
  /** Inclusive end of the series. Defaults to the last calendar date. */
  to?: ISODate;
}

export interface ValuationSeries {
  points: DailyPoint[];
  /** Ledger state after the last point. */
  finalState: LedgerState;
}

/**
 * Daily portfolio values along a trading calendar. Transactions dated on a
 * non-calendar day are applied on the next calendar day. Prices are carried
 * forward from the last known close; a held symbol with no price at all is
 * listed in `missingPriceSymbols` and excluded from that day's value.
 */
export function buildValuationSeries(
  transactions: readonly LedgerTransaction[],
  prices: Record<string, readonly PricePoint[]>,
  calendar: readonly ISODate[],
  options: ValuationSeriesOptions = {},
): ValuationSeries {
  const sorted = sortTransactions(transactions);
  const replayer = new LedgerReplayer();
  const lookup = makePriceLookup(prices);
  const points: DailyPoint[] = [];
  if (sorted.length === 0) {
    return { points, finalState: replayer.snapshot(null) };
  }
  const firstDate = sorted[0].date;
  const to = options.to ?? calendar[calendar.length - 1];
  let txIndex = 0;
  for (const day of calendar) {
    if (day > to) break;
    if (day < firstDate) continue;
    let flow = ZERO;
    while (txIndex < sorted.length && sorted[txIndex].date <= day) {
      const t = sorted[txIndex];
      if (replayer.apply(t)) flow = flow.plus(LedgerReplayer.externalFlowOf(t));
      txIndex += 1;
    }
    let value = replayer.cash;
    const missing: string[] = [];
    for (const [symbol, quantity] of replayer.holdings()) {
      const price = lookup(symbol, day);
      if (!price) {
        missing.push(symbol);
        continue;
      }
      value = value.plus(quantity.times(price.price));
    }
    points.push({
      date: day,
      value: value.toNumber(),
      cash: replayer.cash.toNumber(),
      externalFlow: flow.toNumber(),
      missingPriceSymbols: missing,
    });
  }
  // Apply any transactions after the last calendar day so the final state is complete.
  while (txIndex < sorted.length && sorted[txIndex].date <= to) {
    replayer.apply(sorted[txIndex]);
    txIndex += 1;
  }
  return { points, finalState: replayer.snapshot(to) };
}
