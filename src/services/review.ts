import { REVIEW_POLICY, reviewPortfolio } from "@/calc/review";
import { getFilingsSince, getUpcomingEarnings } from "./fundamentals";
import { addDays } from "@/calc/dates";
import type { PortfolioSnapshot } from "./portfolio";
import { listTheses } from "./thesis";

/** No remote fetches or mutations: results are reproducible from local evidence. */
export function buildResearchReview(snapshot: PortfolioSnapshot) {
  const theses = listTheses().map((t) => ({ symbol: t.thesis.symbol, status: t.thesis.status, revisedAt: t.current?.createdAt ?? null }));
  const symbols = snapshot.holdings.map((h) => h.symbol);
  const since = theses.reduce((date, t) => t.revisedAt && t.revisedAt.slice(0, 10) < date ? t.revisedAt.slice(0, 10) : date, snapshot.asOf);
  const findings = reviewPortfolio({
    asOf: snapshot.asOf,
    portfolioId: snapshot.portfolio.id,
    positions: snapshot.holdings,
    theses,
    filings: getFilingsSince(symbols, since, snapshot.asOf),
    earnings: getUpcomingEarnings(symbols, snapshot.asOf, addDays(snapshot.asOf, REVIEW_POLICY.earningsWindowDays)),
  });
  return {
    schemaVersion: 1,
    asOf: snapshot.asOf,
    portfolio: { id: snapshot.portfolio.id, name: snapshot.portfolio.name },
    policy: REVIEW_POLICY,
    coverage: { heldSymbols: symbols.length, unpricedSymbols: snapshot.missingPrices, incompleteValuation: snapshot.missingPrices.length > 0 },
    limitations: ["Stored evidence only; no automatic provider refresh.", "Research checks cover direct stock holdings of at least 5% of known portfolio value; funds are not looked through.", "Filing dates have day precision; same-day filings are not treated as newer than a thesis revision.", "Earnings estimates may change. Price freshness uses calendar days, not an exchange holiday calendar.", "Weights exclude unpriced positions; coverage is incomplete when unpricedSymbols is nonempty.", "Findings request research review and are not trading instructions."],
    findings,
  };
}
