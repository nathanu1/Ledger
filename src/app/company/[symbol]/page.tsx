import Link from "next/link";
import { notFound } from "next/navigation";
import { FinancialsTab } from "@/components/company/financials-tab";
import { NotesButton, RefreshButton, WatchToggle } from "@/components/company/company-actions";
import { OverviewTab, type SinceVisit } from "@/components/company/overview-tab";
import { ValuationTab } from "@/components/company/valuation-tab";
import { RiskTab } from "@/components/company/risk-tab";
import { ThesisTab } from "@/components/company/thesis-tab";
import { PageHeader } from "@/components/shell/page-header";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty";
import { LinkTabs } from "@/components/ui/link-tabs";
import { Delta } from "@/components/metrics/value";
import { formatDate, formatDateTime, formatMoney } from "@/lib/format";
import { defaultDcfInputs, listScenarios } from "@/services/dcf";
import { getFilings, getFinancials, getNextEarnings } from "@/services/fundamentals";
import { getLatestPrices, getPriceRows, getPriceSeries } from "@/services/market-data";
import { buildCompanyMetrics } from "@/services/metrics";
import { listNotes, recordVisit } from "@/services/notes";
import { getPortfolio, resolvePortfolioId } from "@/services/portfolio";
import { ensureSecurity, searchSecurities } from "@/services/securities";
import { getAsOfDate, getDataMode } from "@/services/settings";
import { evaluateRules, getThesis } from "@/services/thesis";
import { isWatched } from "@/services/watchlist";
import { securityRisk } from "@/calc/risk";
import { addMonths } from "@/calc/dates";
import { maxDrawdownOfPrices } from "@/calc/drawdown";
import { returnDistribution } from "@/calc/risk";
import { alignByDate, simpleReturns } from "@/calc/series";

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "financials", label: "Financials" },
  { key: "valuation", label: "Valuation" },
  { key: "risk", label: "Risk" },
  { key: "thesis", label: "Thesis" },
];

type Params = Promise<{ symbol: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export async function generateMetadata({ params }: { params: Params }) {
  const { symbol } = await params;
  return { title: decodeURIComponent(symbol).toUpperCase() };
}

export default async function CompanyPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const { symbol: raw } = await params;
  const sp = await searchParams;
  const symbol = decodeURIComponent(raw).trim().toUpperCase();
  if (!/^[A-Z0-9.\-]{1,12}$/.test(symbol)) notFound();
  const tab = TABS.some((t) => t.key === first(sp.tab)) ? (first(sp.tab) as string) : "overview";
  const mode = getDataMode();
  const { security, errors } = await ensureSecurity(symbol);

  if (!security) {
    const suggestions = await searchSecurities(symbol.slice(0, 3));
    return (
      <>
        <PageHeader eyebrow="Company" title={symbol} />
        <EmptyState
          tone="warning"
          title={`${symbol} is not available`}
          description={
            <>
              {mode === "demo" ? "Demo mode covers a fictional universe of 15 securities. " : ""}
              {errors.join(" ")}
              {suggestions.length ? (
                <span className="mt-2 block">
                  Did you mean{" "}
                  {suggestions.slice(0, 6).map((s, i) => (
                    <span key={s.symbol}>
                      <Link href={`/company/${s.symbol}`} className="num text-accent hover:underline">
                        {s.symbol}
                      </Link>
                      {i < Math.min(suggestions.length, 6) - 1 ? ", " : ""}
                    </span>
                  ))}
                  ?
                </span>
              ) : null}
            </>
          }
          action={<Link href="/screener" className="text-accent hover:underline">Browse the coverage universe</Link>}
        />
      </>
    );
  }

  const asOf = getAsOfDate();
  const visit = recordVisit(symbol);
  const metrics = buildCompanyMetrics(symbol);
  const fin = security.securityType === "etf" ? null : getFinancials(symbol);
  const priceRows = getPriceRows(symbol, undefined, asOf);
  const prices = priceRows.map((r) => ({ date: r.date, close: r.close, adjClose: r.adjClose }));
  const adjustment = priceRows.length && priceRows.every((r) => r.adjClose !== null) ? (priceRows[priceRows.length - 1].adjustment ?? "splits") : null;
  const retrievedAt = priceRows[priceRows.length - 1]?.retrievedAt ?? null;
  const portfolioId = resolvePortfolioId(null);
  const benchmarkSymbol = portfolioId ? (getPortfolio(portfolioId)?.benchmarkSymbol ?? null) : null;
  const benchmarkSeries = benchmarkSymbol && benchmarkSymbol !== symbol ? getPriceSeries(benchmarkSymbol, undefined, asOf) : null;
  const filings = getFilings(symbol, { limit: 12, forms: ["10-K", "10-Q", "8-K", "DEF 14A", "10-K/A", "10-Q/A", "20-F", "6-K"] });
  const nextEarnings = getNextEarnings(symbol, asOf);
  const watched = isWatched(symbol);
  const notes = listNotes("company", symbol);
  const quote = getLatestPrices([symbol]).get(symbol) ?? null;

  const since: SinceVisit = {
    previousVisitAt: visit.previousVisitAt,
    priceThen: null,
    newFilings: [],
    newPeriods: [],
  };
  if (visit.previousVisitAt) {
    const prevDate = visit.previousVisitAt.slice(0, 10);
    const then = [...priceRows].reverse().find((r) => r.date <= prevDate);
    since.priceThen = then ? { date: then.date, price: then.close } : null;
    since.newFilings = filings.filter((f) => f.filedAt > prevDate);
    since.newPeriods = [...(fin?.quarterly ?? []), ...(fin?.annual ?? [])].filter((p) => p.filedAt && p.filedAt > prevDate).map((p) => p.label);
  }

  // Risk tab inputs (one-year window by default; the tab lets the user widen it).
  const riskWindows = (["6M", "1Y", "3Y", "ALL"] as const).map((key) => {
    const from = key === "ALL" ? null : addMonths(asOf, key === "6M" ? -6 : key === "1Y" ? -12 : -36);
    const own = getPriceSeries(symbol, from ?? undefined, asOf).points;
    const bench = benchmarkSeries ? benchmarkSeries.points.filter((p) => !from || p.date >= from) : [];
    const aligned = alignByDate([own, bench.length ? bench : own]);
    const returns = simpleReturns(own.map((p) => p.price));
    return {
      key,
      from: own[0]?.date ?? null,
      to: own[own.length - 1]?.date ?? null,
      stats: securityRisk(symbol, own, bench.length ? bench : []),
      distribution: returnDistribution(returns),
      drawdown: own.length >= 2 ? maxDrawdownOfPrices(own) : null,
      alignedObservations: Math.max(aligned.dates.length - 1, 0),
    };
  });

  const thesis = getThesis(symbol);
  const evaluations = thesis ? evaluateRules(symbol, thesis.rules) : [];
  const dcfDefaults = security.securityType === "etf" ? null : defaultDcfInputs(symbol);
  const scenarios = listScenarios(symbol);

  const hrefFor = (key: string) => `/company/${symbol}${key === "overview" ? "" : `?tab=${key}`}`;

  return (
    <>
      <PageHeader
        eyebrow={
          <span className="flex flex-wrap items-center gap-2">
            <span className="num font-medium text-fg">{security.symbol}</span>
            <span>{security.exchange ?? "US"}</span>
            {security.securityType === "etf" ? <Badge tone="outline">ETF</Badge> : null}
            {security.sector ? (
              <span title={security.source === "demo" ? "Demo classification" : "Sector derived from the SIC code on SEC filings"}>
                {security.sector}
                {security.industry ? ` · ${security.industry}` : ""}
              </span>
            ) : (
              <span className="text-fg-muted">Sector unknown</span>
            )}
          </span>
        }
        title={security.name}
        description={
          <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            {quote ? (
              <>
                <span className="num text-xl font-medium text-fg">{formatMoney(quote.price)}</span>
                {quote.changePct !== null ? <Delta value={quote.changePct} kind="pct" digits={2} /> : null}
                {quote.change !== null ? <Delta value={quote.change} hideIcon className="text-xs" /> : null}
                <span className="text-xs text-fg-muted">
                  {quote.session === "eod" ? "Close" : quote.session} {formatDateTime(quote.asOf)} · {quote.source === "demo" ? "demo data" : quote.source}
                </span>
              </>
            ) : (
              <span className="text-fg-muted">No quote stored</span>
            )}
            {fin?.ttm || fin?.quarterly.length ? (
              <span className="text-xs text-fg-muted">
                Fundamentals through {fin.ttm?.periodEnd ?? fin.quarterly[fin.quarterly.length - 1].periodEnd}, filed {formatDate(fin.ttm?.filedAt ?? fin.quarterly[fin.quarterly.length - 1].filedAt)}
              </span>
            ) : null}
          </span>
        }
        actions={
          <>
            <WatchToggle symbol={symbol} watched={watched} />
            <NotesButton symbol={symbol} notes={notes} />
            <RefreshButton symbol={symbol} mode={mode} />
          </>
        }
      />
      {errors.length ? <p className="mb-4 text-xs text-warning">{errors.join(" ")}</p> : null}
      <div className="mb-5">
        <LinkTabs tabs={TABS} current={tab} hrefFor={hrefFor} label="Company sections" />
      </div>
      {tab === "overview" ? (
        <OverviewTab security={security} metrics={metrics} fin={fin} prices={prices} benchmark={benchmarkSeries?.points ?? null} benchmarkSymbol={benchmarkSymbol} adjustment={adjustment} filings={filings} nextEarnings={nextEarnings} since={since} retrievedAt={retrievedAt} mode={mode} />
      ) : null}
      {tab === "financials" ? <FinancialsTab symbol={symbol} fin={fin} profile={metrics.sectorProfile} retrievedAt={retrievedAt} /> : null}
      {tab === "valuation" ? <ValuationTab symbol={symbol} defaults={dcfDefaults} scenarios={scenarios} price={quote?.price ?? null} priceDate={quote?.date ?? null} sectorProfile={metrics.sectorProfile} isEtf={security.securityType === "etf"} /> : null}
      {tab === "risk" ? <RiskTab symbol={symbol} windows={riskWindows} benchmarkSymbol={benchmarkSymbol} adjustment={adjustment} /> : null}
      {tab === "thesis" ? <ThesisTab symbol={symbol} thesis={thesis} evaluations={evaluations} fin={fin} /> : null}
    </>
  );
}
