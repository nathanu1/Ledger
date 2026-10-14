import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { importBatches, portfolios, transactions, type Portfolio, type TransactionRow } from "@/db/schema";
import {
  attributePnl,
  benchmarkGrowth,
  benchmarkReturn,
  buildValuationSeries,
  concentration,
  drawdownFromIndex,
  investmentGain,
  makePriceLookup,
  moneyWeightedReturn,
  periodReturn,
  periodStart,
  replayLedger,
  sectorExposure,
  timeWeightedReturn,
  transactionFingerprint,
  unionCalendar,
  valuePortfolio,
  type AttributionResult,
  type BenchmarkReturn,
  type Concentration,
  type DailyPoint,
  type DrawdownResult,
  type ExposurePosition,
  type IndexPoint,
  type InvestmentGain,
  type ISODate,
  type LedgerIssue,
  type LedgerState,
  type LedgerTransaction,
  type MoneyWeightedResult,
  type PeriodKey,
  type PeriodReturn,
  type PortfolioValuation,
  type PricePoint,
  type SectorExposure,
  type TransactionType,
  type TwrResult,
  type ValuedPosition,
} from "@/calc";
import { newId, nowIso } from "@/lib/ids";
import { getDb as db } from "@/db/client";
import { getEtfHoldings } from "./etf";
import { getLatestPrices, getPriceSeriesMap, type LatestPrice, type PriceSeries } from "./market-data";
import { getSecurities } from "./securities";
import { getAsOfDate, getDefaultPortfolioId } from "./settings";

export function listPortfolios(): Portfolio[] {
  return getDb().select().from(portfolios).orderBy(portfolios.createdAt).all();
}

export function getPortfolio(id: string): Portfolio | null {
  return getDb().select().from(portfolios).where(eq(portfolios.id, id)).get() ?? null;
}

export function resolvePortfolioId(requested?: string | null): string | null {
  if (requested && getPortfolio(requested)) return requested;
  const def = getDefaultPortfolioId();
  if (def && getPortfolio(def)) return def;
  return listPortfolios()[0]?.id ?? null;
}

export function createPortfolio(input: { name: string; benchmarkSymbol?: string; description?: string | null }): Portfolio {
  const now = nowIso();
  const id = newId("pf");
  getDb()
    .insert(portfolios)
    .values({ id, name: input.name.trim(), baseCurrency: "USD", benchmarkSymbol: (input.benchmarkSymbol ?? "SPY").toUpperCase(), costBasisMethod: "FIFO", description: input.description ?? null, createdAt: now, updatedAt: now })
    .run();
  return getPortfolio(id)!;
}

export function updatePortfolio(id: string, input: { name?: string; benchmarkSymbol?: string; description?: string | null }): Portfolio | null {
  const set: Partial<Portfolio> = { updatedAt: nowIso() };
  if (input.name !== undefined) set.name = input.name.trim();
  if (input.benchmarkSymbol !== undefined) set.benchmarkSymbol = input.benchmarkSymbol.toUpperCase();
  if (input.description !== undefined) set.description = input.description;
  getDb().update(portfolios).set(set).where(eq(portfolios.id, id)).run();
  return getPortfolio(id);
}

export function deletePortfolio(id: string): void {
  getDb().delete(portfolios).where(eq(portfolios.id, id)).run();
}

export function rowToTransaction(row: TransactionRow): LedgerTransaction {
  return {
    id: row.id,
    type: row.type as TransactionType,
    date: row.date,
    sequence: row.sequence,
    symbol: row.symbol,
    quantity: row.quantity,
    price: row.price,
    amount: row.amount,
    fee: row.fee,
    splitNumerator: row.splitNumerator,
    splitDenominator: row.splitDenominator,
    linkedTransactionId: row.linkedTransactionId,
    note: row.note,
  };
}

export function listTransactionRows(portfolioId: string): TransactionRow[] {
  return getDb().select().from(transactions).where(eq(transactions.portfolioId, portfolioId)).orderBy(transactions.date, transactions.sequence).all();
}

export function listTransactions(portfolioId: string): LedgerTransaction[] {
  return listTransactionRows(portfolioId).map(rowToTransaction);
}

export function getTransaction(id: string): TransactionRow | null {
  return getDb().select().from(transactions).where(eq(transactions.id, id)).get() ?? null;
}

export type TransactionInput = Omit<LedgerTransaction, "id" | "sequence"> & { importBatchId?: string | null };

function nextSequence(portfolioId: string, date: ISODate): number {
  const row = getDb()
    .select({ max: sql<number | null>`max(${transactions.sequence})` })
    .from(transactions)
    .where(and(eq(transactions.portfolioId, portfolioId), eq(transactions.date, date)))
    .get();
  return (row?.max ?? 0) + 1;
}

export function addTransaction(portfolioId: string, input: TransactionInput): TransactionRow {
  const now = nowIso();
  const id = newId("tx");
  const symbol = input.symbol ? input.symbol.trim().toUpperCase() : null;
  const tx = { ...input, symbol };
  getDb()
    .insert(transactions)
    .values({
      id,
      portfolioId,
      type: tx.type,
      date: tx.date,
      sequence: nextSequence(portfolioId, tx.date),
      symbol,
      quantity: tx.quantity ?? null,
      price: tx.price ?? null,
      amount: tx.amount ?? null,
      fee: tx.fee ?? null,
      splitNumerator: tx.splitNumerator ?? null,
      splitDenominator: tx.splitDenominator ?? null,
      linkedTransactionId: tx.linkedTransactionId ?? null,
      note: tx.note ?? null,
      fingerprint: transactionFingerprint(tx),
      importBatchId: input.importBatchId ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  touchPortfolio(portfolioId);
  return getTransaction(id)!;
}

export function updateTransaction(id: string, input: TransactionInput): TransactionRow | null {
  const existing = getTransaction(id);
  if (!existing) return null;
  const symbol = input.symbol ? input.symbol.trim().toUpperCase() : null;
  const tx = { ...input, symbol };
  getDb()
    .update(transactions)
    .set({
      type: tx.type,
      date: tx.date,
      sequence: tx.date === existing.date ? existing.sequence : nextSequence(existing.portfolioId, tx.date),
      symbol,
      quantity: tx.quantity ?? null,
      price: tx.price ?? null,
      amount: tx.amount ?? null,
      fee: tx.fee ?? null,
      splitNumerator: tx.splitNumerator ?? null,
      splitDenominator: tx.splitDenominator ?? null,
      linkedTransactionId: tx.linkedTransactionId ?? null,
      note: tx.note ?? null,
      fingerprint: transactionFingerprint(tx),
      updatedAt: nowIso(),
    })
    .where(eq(transactions.id, id))
    .run();
  touchPortfolio(existing.portfolioId);
  return getTransaction(id);
}

export function deleteTransaction(id: string): void {
  const existing = getTransaction(id);
  if (!existing) return;
  getDb().delete(transactions).where(eq(transactions.id, id)).run();
  touchPortfolio(existing.portfolioId);
}

export function existingFingerprints(portfolioId: string): Set<string> {
  return new Set(
    getDb()
      .select({ fp: transactions.fingerprint })
      .from(transactions)
      .where(eq(transactions.portfolioId, portfolioId))
      .all()
      .map((r) => r.fp),
  );
}

export function recordImportBatch(input: { portfolioId: string; fileName: string; mapping: unknown; rowCount: number; importedCount: number; skippedCount: number }): string {
  const id = newId("imp");
  getDb()
    .insert(importBatches)
    .values({ id, portfolioId: input.portfolioId, fileName: input.fileName, mapping: JSON.stringify(input.mapping), rowCount: input.rowCount, importedCount: input.importedCount, skippedCount: input.skippedCount, createdAt: nowIso() })
    .run();
  return id;
}

export function listImportBatches(portfolioId: string) {
  return getDb().select().from(importBatches).where(eq(importBatches.portfolioId, portfolioId)).orderBy(desc(importBatches.createdAt)).all();
}

function touchPortfolio(id: string): void {
  db().update(portfolios).set({ updatedAt: nowIso() }).where(eq(portfolios.id, id)).run();
}

// ----------------------------------------------------------------- snapshot

export interface HoldingView extends ValuedPosition {
  name: string;
  securityType: "stock" | "etf" | "unknown";
  sector: string | null;
  industry: string | null;
  dayChange: number | null;
  dayChangePct: number | null;
  latest: LatestPrice | null;
}

export interface BenchmarkView {
  symbol: string;
  name: string;
  adjustment: PriceSeries["adjustment"];
  /** total: adjusted for dividends; price: splits only or raw. */
  returnType: "total" | "price" | "unavailable";
  growth: Array<IndexPoint | { date: ISODate; value: null }>;
  periodReturn: BenchmarkReturn | null;
  inceptionReturn: BenchmarkReturn | null;
  available: boolean;
}

export interface PeriodView {
  key: PeriodKey;
  from: ISODate;
  to: ISODate;
  twr: PeriodReturn | null;
  gain: InvestmentGain | null;
  mwr: MoneyWeightedResult;
  attribution: AttributionResult | null;
  benchmark: BenchmarkReturn | null;
}

export interface PortfolioSnapshot {
  portfolio: Portfolio;
  asOf: ISODate;
  transactions: LedgerTransaction[];
  ledger: LedgerState;
  valuation: PortfolioValuation;
  holdings: HoldingView[];
  closedPositions: HoldingView[];
  series: DailyPoint[];
  twr: TwrResult;
  mwr: MoneyWeightedResult;
  gain: InvestmentGain | null;
  drawdown: DrawdownResult;
  benchmark: BenchmarkView;
  period: PeriodView;
  dayChange: { value: number | null; pct: number | null; date: ISODate | null; previousDate: ISODate | null };
  concentration: Concentration;
  sectorExposure: SectorExposure;
  issues: LedgerIssue[];
  missingPrices: string[];
  calendar: { from: ISODate | null; to: ISODate | null; tradingDays: number };
  priceSeries: Map<string, PriceSeries>;
}

export function buildPortfolioSnapshot(portfolioId: string, options: { period?: PeriodKey; asOf?: ISODate } = {}): PortfolioSnapshot | null {
  const portfolio = getPortfolio(portfolioId);
  if (!portfolio) return null;
  const asOf = options.asOf ?? getAsOfDate();
  const periodKey = options.period ?? "1M";
  const txs = listTransactions(portfolioId).filter((t) => t.date <= asOf);
  const symbols = [...new Set(txs.map((t) => t.symbol).filter((s): s is string => !!s))];
  const allSymbols = [...new Set([...symbols, portfolio.benchmarkSymbol])];
  const priceSeries = getPriceSeriesMap(allSymbols, undefined, asOf);
  const seriesRecord: Record<string, PricePoint[]> = {};
  for (const [s, ps] of priceSeries) if (ps.points.length) seriesRecord[s] = ps.points.map((p) => ({ date: p.date, price: p.price }));
  // Valuation uses raw closes (what the shares are worth), not dividend-adjusted series.
  const rawRecord: Record<string, PricePoint[]> = {};
  for (const [s, ps] of priceSeries) if (ps.raw.length) rawRecord[s] = ps.raw;
  const calendar = unionCalendar(...Object.values(rawRecord).map((pts) => pts.map((p) => p.date))).filter((d) => d <= asOf);
  const { points: series, finalState: ledger } = buildValuationSeries(txs, rawRecord, calendar, { to: asOf });
  const lookup = makePriceLookup(rawRecord);
  const valuation = valuePortfolio(ledger, lookup, asOf);

  const securities = getSecurities(symbols);
  const latest = getLatestPrices(symbols);
  const toView = (p: ValuedPosition): HoldingView => {
    const sec = securities.get(p.symbol);
    const lp = latest.get(p.symbol) ?? null;
    const qty = Number(p.quantity);
    const dayChange = lp && lp.change !== null && qty > 0 ? qty * lp.change : null;
    return {
      ...p,
      name: sec?.name ?? p.symbol,
      securityType: (sec?.securityType as "stock" | "etf" | undefined) ?? "unknown",
      sector: sec?.sector ?? null,
      industry: sec?.industry ?? null,
      dayChange,
      dayChangePct: lp?.changePct ?? null,
      latest: lp,
    };
  };
  const holdings = valuation.positions.filter((p) => Number(p.quantity) > 0).map(toView).sort((a, b) => (Number(b.marketValue ?? 0) - Number(a.marketValue ?? 0)));
  const closedPositions = valuation.positions.filter((p) => Number(p.quantity) <= 0 && (Number(p.realizedPnl) !== 0 || Number(p.dividends) !== 0)).map(toView);

  const twr = timeWeightedReturn(series);
  const mwr = moneyWeightedReturn(series);
  const gain = investmentGain(series);
  const drawdown = drawdownFromIndex(twr.growthIndex);

  const benchSeries = priceSeries.get(portfolio.benchmarkSymbol);
  const benchPoints = benchSeries?.points ?? [];
  const benchName = getSecurities([portfolio.benchmarkSymbol]).get(portfolio.benchmarkSymbol)?.name ?? portfolio.benchmarkSymbol;
  const inceptionDate = series[0]?.date ?? null;
  const benchmark: BenchmarkView = {
    symbol: portfolio.benchmarkSymbol,
    name: benchName,
    adjustment: benchSeries?.adjustment ?? null,
    returnType: benchPoints.length === 0 ? "unavailable" : benchSeries?.adjustment === "splits_dividends" ? "total" : "price",
    growth: benchmarkGrowth(benchPoints, series.map((p) => p.date)),
    periodReturn: null,
    inceptionReturn: inceptionDate ? benchmarkReturn(benchPoints, inceptionDate, asOf) : null,
    available: benchPoints.length > 0,
  };

  // Selected period.
  const from = periodStart(periodKey, asOf) ?? inceptionDate ?? asOf;
  const effectiveFrom = inceptionDate && from < inceptionDate ? inceptionDate : from;
  const periodTwr = periodReturn(twr, effectiveFrom, asOf);
  const periodGain = investmentGain(series, periodKey === "ALL" ? undefined : effectiveFrom, asOf);
  const periodMwr = moneyWeightedReturn(series, periodKey === "ALL" ? undefined : effectiveFrom, asOf);
  const startValuation = valuePortfolio(replayLedger(txs, { asOf: effectiveFrom }), lookup, effectiveFrom);
  const attribution = series.length > 1 ? attributePnl({ transactions: txs, start: startValuation, end: valuation }) : null;
  benchmark.periodReturn = benchmarkReturn(benchPoints, effectiveFrom, asOf);
  const period: PeriodView = { key: periodKey, from: effectiveFrom, to: asOf, twr: periodTwr, gain: periodGain, mwr: periodMwr, attribution, benchmark: benchmark.periodReturn };

  // Daily movement: change in value net of today's external flows.
  const lastIdx = series.length - 1;
  const dayChange =
    lastIdx >= 1
      ? { value: series[lastIdx].value - series[lastIdx - 1].value - series[lastIdx].externalFlow, pct: twr.dailyReturns[lastIdx - 1]?.r ?? null, date: series[lastIdx].date, previousDate: series[lastIdx - 1].date }
      : { value: null, pct: null, date: series[lastIdx]?.date ?? null, previousDate: null };

  const conc = concentration(holdings.map((h) => ({ symbol: h.symbol, weight: h.weight })));
  const totalValue = Number(valuation.totalValue);
  const etfHoldings = getEtfHoldings(holdings.filter((h) => h.securityType === "etf").map((h) => h.symbol));
  const exposurePositions: ExposurePosition[] = holdings.map((h) => ({
    symbol: h.symbol,
    weight: h.weight,
    sector: h.sector,
    securityType: h.securityType === "etf" ? "etf" : "stock",
    lookThrough: h.securityType === "etf" ? etfHoldings.get(h.symbol)?.map((x) => ({ sector: x.sector ?? "Unclassified", weight: x.weight })) ?? null : null,
  }));
  const exposure = sectorExposure(exposurePositions, totalValue > 0 ? Number(valuation.cash) / totalValue : 0);

  return {
    portfolio,
    asOf,
    transactions: txs,
    ledger,
    valuation,
    holdings,
    closedPositions,
    series,
    twr,
    mwr,
    gain,
    drawdown,
    benchmark,
    period,
    dayChange,
    concentration: conc,
    sectorExposure: exposure,
    issues: ledger.issues,
    missingPrices: valuation.missingPrices,
    calendar: { from: calendar[0] ?? null, to: calendar[calendar.length - 1] ?? null, tradingDays: calendar.length },
    priceSeries,
  };
}
