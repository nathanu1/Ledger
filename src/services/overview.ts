import { addDays } from "@/calc/dates";
import type { ISODate, PeriodKey } from "@/calc";
import type { EarningsEventRow, FilingRow } from "@/db/schema";
import { getFilingsSince, getUpcomingEarnings } from "./fundamentals";
import { getLatestPrices, type LatestPrice } from "./market-data";
import { buildPortfolioSnapshot, listPortfolios, resolvePortfolioId, type PortfolioSnapshot } from "./portfolio";
import { getSecurities } from "./securities";
import { getAsOfDate } from "./settings";
import { collectThesisAlerts, type ThesisAlert } from "./thesis";
import { watchedSymbols } from "./watchlist";

export interface OverviewAlert {
  kind: "thesis" | "review_date" | "concentration" | "data" | "ledger";
  symbol: string | null;
  title: string;
  detail: string;
  href: string;
}

export interface WatchlistChange {
  symbol: string;
  name: string;
  price: LatestPrice | null;
  newFilings: FilingRow[];
}

export interface OverviewData {
  asOf: ISODate;
  portfolios: ReturnType<typeof listPortfolios>;
  snapshot: PortfolioSnapshot | null;
  period: PeriodKey;
  upcomingEarnings: Array<EarningsEventRow & { name: string; held: boolean }>;
  watchlistChanges: WatchlistChange[];
  alerts: OverviewAlert[];
  thesisAlerts: ThesisAlert[];
}

export function buildOverview(options: { portfolioId?: string | null; period?: PeriodKey } = {}): OverviewData {
  const asOf = getAsOfDate();
  const portfoliosList = listPortfolios();
  const portfolioId = resolvePortfolioId(options.portfolioId);
  const period = options.period ?? "1M";
  const snapshot = portfolioId ? buildPortfolioSnapshot(portfolioId, { period }) : null;
  const held = new Set(snapshot?.holdings.map((h) => h.symbol) ?? []);
  const watched = watchedSymbols();
  const universe = [...new Set([...held, ...watched])];
  const securities = getSecurities(universe);

  const earnings = getUpcomingEarnings(universe, asOf, addDays(asOf, 60)).map((e) => ({ ...e, name: securities.get(e.symbol)?.name ?? e.symbol, held: held.has(e.symbol) }));

  const prices = getLatestPrices(watched);
  const recentFilings = getFilingsSince(watched, addDays(asOf, -14), asOf);
  const watchlistChanges: WatchlistChange[] = watched
    .map((symbol) => ({ symbol, name: securities.get(symbol)?.name ?? symbol, price: prices.get(symbol) ?? null, newFilings: recentFilings.filter((f) => f.symbol === symbol) }))
    .sort((a, b) => Math.abs(b.price?.changePct ?? 0) - Math.abs(a.price?.changePct ?? 0));

  const thesisAlerts = collectThesisAlerts(asOf);
  const alerts: OverviewAlert[] = thesisAlerts.map((a) => ({
    kind: a.kind === "rule" ? "thesis" : "review_date",
    symbol: a.symbol,
    title: `${a.symbol}: ${a.title}`,
    detail: a.detail,
    href: `/company/${a.symbol}?tab=thesis`,
  }));
  if (snapshot) {
    if (snapshot.concentration.largest && snapshot.concentration.largest.weight > 0.25) {
      alerts.push({
        kind: "concentration",
        symbol: snapshot.concentration.largest.symbol,
        title: `${snapshot.concentration.largest.symbol} is ${(snapshot.concentration.largest.weight * 100).toFixed(1)}% of the portfolio`,
        detail: "Largest position weight is above 25% of total value (cash included).",
        href: `/risk?portfolio=${snapshot.portfolio.id}`,
      });
    }
    if (snapshot.missingPrices.length) {
      alerts.push({
        kind: "data",
        symbol: null,
        title: `${snapshot.missingPrices.length} position${snapshot.missingPrices.length > 1 ? "s" : ""} without price data`,
        detail: `${snapshot.missingPrices.join(", ")}: excluded from totals rather than valued at zero.`,
        href: `/portfolio?portfolio=${snapshot.portfolio.id}`,
      });
    }
    for (const issue of snapshot.issues.filter((i) => i.severity === "error")) {
      alerts.push({ kind: "ledger", symbol: null, title: "Transaction could not be applied", detail: issue.message, href: `/portfolio/transactions?portfolio=${snapshot.portfolio.id}` });
    }
  }

  return { asOf, portfolios: portfoliosList, snapshot, period, upcomingEarnings: earnings, watchlistChanges, alerts, thesisAlerts };
}
