/**
 * Shared types for the Ledger calculation engine.
 *
 * The engine is deliberately free of framework and database dependencies:
 * it only depends on decimal.js. Money and share quantities travel as decimal
 * strings (exact), ratios and returns as JavaScript numbers.
 */

/** Calendar date in ISO `YYYY-MM-DD` form (sortable as a plain string). */
export type ISODate = string;

/** Exact decimal rendered as a string, e.g. "1234.5600". */
export type DecimalString = string;

export type TransactionType =
  | "BUY"
  | "SELL"
  | "DEPOSIT"
  | "WITHDRAWAL"
  | "DIVIDEND"
  | "INTEREST"
  | "FEE"
  | "SPLIT";

export const TRANSACTION_TYPES: readonly TransactionType[] = [
  "BUY",
  "SELL",
  "DEPOSIT",
  "WITHDRAWAL",
  "DIVIDEND",
  "INTEREST",
  "FEE",
  "SPLIT",
];

/**
 * One row of the transaction ledger. The ledger is the source of truth;
 * holdings and cash are always derived from it.
 */
export interface LedgerTransaction {
  id: string;
  type: TransactionType;
  date: ISODate;
  /** Ordering within a day. Lower runs first. */
  sequence: number;
  /** Required for BUY, SELL, DIVIDEND, SPLIT. */
  symbol?: string | null;
  /** Shares for BUY/SELL (positive decimal string). */
  quantity?: DecimalString | null;
  /** Per-share price for BUY/SELL (decimal string, >= 0). */
  price?: DecimalString | null;
  /** Cash amount for DEPOSIT, WITHDRAWAL, DIVIDEND, INTEREST, FEE (positive). */
  amount?: DecimalString | null;
  /** Commission or fee attached to a BUY/SELL (positive, may be "0"). */
  fee?: DecimalString | null;
  /** SPLIT: new shares received per `splitDenominator` old shares (4:1 => 4 / 1). */
  splitNumerator?: number | null;
  splitDenominator?: number | null;
  /** DRIP: the BUY created by reinvesting a DIVIDEND points at that dividend. */
  linkedTransactionId?: string | null;
  note?: string | null;
}

export type CostBasisMethod = "FIFO";

export interface LotState {
  openedAt: ISODate;
  quantity: DecimalString;
  costPerShare: DecimalString;
  costBasis: DecimalString;
  sourceTransactionId: string;
}

export interface PositionState {
  symbol: string;
  quantity: DecimalString;
  /** Remaining cost basis of open lots (includes buy-side fees). */
  costBasis: DecimalString;
  /** costBasis / quantity, or null when nothing is held. */
  averageCost: DecimalString | null;
  /** Cumulative realized P/L from sells: proceeds net of fees minus cost of lots sold. */
  realizedPnl: DecimalString;
  /** Cumulative cash dividends recorded against this symbol. */
  dividends: DecimalString;
  lots: LotState[];
}

export interface LedgerIssue {
  transactionId: string;
  severity: "error" | "warning";
  code:
    | "SELL_EXCEEDS_HOLDINGS"
    | "MISSING_SYMBOL"
    | "INVALID_QUANTITY"
    | "INVALID_PRICE"
    | "INVALID_AMOUNT"
    | "INVALID_SPLIT"
    | "SPLIT_WITHOUT_POSITION"
    | "NEGATIVE_CASH";
  message: string;
}

export interface LedgerTotals {
  deposits: DecimalString;
  withdrawals: DecimalString;
  dividends: DecimalString;
  interest: DecimalString;
  /** Standalone FEE transactions (not attached to a trade). */
  standaloneFees: DecimalString;
  /** Fees embedded in BUY/SELL transactions (already inside cost basis / proceeds). */
  tradingFees: DecimalString;
  realizedPnl: DecimalString;
}

export interface LedgerState {
  method: CostBasisMethod;
  asOf: ISODate | null;
  cash: DecimalString;
  positions: Record<string, PositionState>;
  totals: LedgerTotals;
  issues: LedgerIssue[];
  /** Number of transactions applied (excluding rejected ones). */
  appliedCount: number;
}

/** Latest known close on or before a date, used for valuation. */
export interface PricePoint {
  date: ISODate;
  price: number;
}

export type PriceLookup = (symbol: string, date: ISODate) => PricePoint | null;

export interface ValuedPosition {
  symbol: string;
  quantity: DecimalString;
  costBasis: DecimalString;
  averageCost: DecimalString | null;
  price: number | null;
  priceDate: ISODate | null;
  /** quantity x price, or null when no price is known. */
  marketValue: DecimalString | null;
  /** marketValue - costBasis, or null when no price is known. */
  unrealizedPnl: DecimalString | null;
  unrealizedPnlPct: number | null;
  realizedPnl: DecimalString;
  dividends: DecimalString;
  /** realized + unrealized + dividends, or null when unrealized is unknown. */
  totalGain: DecimalString | null;
  /** Share of total portfolio value (cash included), or null when unpriced. */
  weight: number | null;
}

export interface PortfolioValuation {
  asOf: ISODate;
  cash: DecimalString;
  positions: ValuedPosition[];
  /** Sum of priced position market values. */
  marketValue: DecimalString;
  /** cash + marketValue. Excludes unpriced positions (listed in missingPrices). */
  totalValue: DecimalString;
  missingPrices: string[];
}

export interface DailyPoint {
  date: ISODate;
  /** Total portfolio value (cash + priced positions). */
  value: number;
  cash: number;
  /** Net external flow applied on this date: deposits - withdrawals. */
  externalFlow: number;
  /** Symbols held on this date without any known price. */
  missingPriceSymbols: string[];
}
