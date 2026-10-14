import {
  alignByDate,
  annualizedVolatility,
  beta,
  correlationMatrix,
  maxDrawdownOfPrices,
  returnDistribution,
  RISK_CONVENTIONS,
  securityRisk,
  simpleReturns,
  type BetaResult,
  type CorrelationMatrix,
  type ISODate,
  type PricePoint,
  type ReturnDistribution,
  type SecurityRisk,
  type StatResult,
} from "@/calc";
import { addMonths } from "@/calc/dates";
import { buildPortfolioSnapshot, type PortfolioSnapshot } from "./portfolio";
import { getPriceSeries } from "./market-data";

export type RiskWindow = "6M" | "1Y" | "3Y" | "ALL";

export interface PortfolioRisk {
  snapshot: PortfolioSnapshot;
  window: { key: RiskWindow; from: ISODate; to: ISODate; observations: number };
  conventions: typeof RISK_CONVENTIONS;
  portfolio: { volatility: StatResult; beta: BetaResult; maxDrawdown: number | null; distribution: ReturnDistribution; returnSource: string };
  positions: SecurityRisk[];
  correlation: CorrelationMatrix;
  benchmark: { symbol: string; adjustment: string | null; volatility: StatResult; maxDrawdown: number | null };
}

export function buildPortfolioRisk(portfolioId: string, windowKey: RiskWindow = "1Y"): PortfolioRisk | null {
  const snapshot = buildPortfolioSnapshot(portfolioId, { period: "1M" });
  if (!snapshot) return null;
  const to = snapshot.asOf;
  const inception = snapshot.series[0]?.date ?? to;
  const from = windowKey === "ALL" ? inception : windowKey === "6M" ? addMonths(to, -6) : windowKey === "1Y" ? addMonths(to, -12) : addMonths(to, -36);
  const effectiveFrom = from < inception ? inception : from;

  // Portfolio daily returns from the TWR growth index (deposits removed).
  const index = snapshot.twr.growthIndex.filter((p) => p.date >= effectiveFrom && p.date <= to);
  const indexAsPrices: PricePoint[] = index.map((p) => ({ date: p.date, price: p.value }));
  const benchSeries = getPriceSeries(snapshot.portfolio.benchmarkSymbol, effectiveFrom, to);
  const aligned = alignByDate([indexAsPrices, benchSeries.points]);
  const portfolioReturns = simpleReturns(aligned.columns[0] ?? []);
  const benchReturns = simpleReturns(aligned.columns[1] ?? []);
  const portfolioAllReturns = simpleReturns(indexAsPrices.map((p) => p.price));

  const heldSymbols = snapshot.holdings.map((h) => h.symbol);
  const seriesFor = (s: string) => getPriceSeries(s, effectiveFrom, to).points;
  const positions = heldSymbols.map((s) => securityRisk(s, seriesFor(s), benchSeries.points));
  const corrLabels = heldSymbols.includes(snapshot.portfolio.benchmarkSymbol) ? heldSymbols : [...heldSymbols, snapshot.portfolio.benchmarkSymbol];
  const correlation = correlationMatrix(corrLabels, corrLabels.map(seriesFor));
  const benchReturnsAll = simpleReturns(benchSeries.points.map((p) => p.price));

  return {
    snapshot,
    window: { key: windowKey, from: effectiveFrom, to, observations: portfolioAllReturns.length },
    conventions: RISK_CONVENTIONS,
    portfolio: {
      volatility: annualizedVolatility(portfolioAllReturns),
      beta: beta(portfolioReturns, benchReturns),
      maxDrawdown: indexAsPrices.length >= 2 ? maxDrawdownOfPrices(indexAsPrices).maxDrawdown : null,
      distribution: returnDistribution(portfolioAllReturns),
      returnSource: "Daily returns of the portfolio's time-weighted growth index (external flows removed); valuation at raw closes.",
    },
    positions,
    correlation,
    benchmark: {
      symbol: snapshot.portfolio.benchmarkSymbol,
      adjustment: benchSeries.adjustment,
      volatility: annualizedVolatility(benchReturnsAll),
      maxDrawdown: benchSeries.points.length >= 2 ? maxDrawdownOfPrices(benchSeries.points).maxDrawdown : null,
    },
  };
}
