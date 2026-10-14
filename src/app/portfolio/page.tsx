import Link from "next/link";
import { DownloadSimple, ListBullets, UploadSimple } from "@phosphor-icons/react/dist/ssr";
import { isPeriodKey, PERIOD_LABELS, type PeriodKey } from "@/calc/periods";
import { DrawdownChart } from "@/components/charts/drawdown-chart";
import { GrowthChart, type GrowthPoint } from "@/components/charts/growth-chart";
import { Contributors } from "@/components/overview/contributors";
import { PeriodSelector } from "@/components/overview/period-selector";
import { ExposureList } from "@/components/portfolio/exposure";
import { HoldingsTable } from "@/components/portfolio/holdings-table";
import { PerformanceTiles } from "@/components/portfolio/performance-tiles";
import { PortfolioEditor } from "@/components/portfolio/portfolio-editor";
import { PageHeader } from "@/components/shell/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { Delta } from "@/components/metrics/value";
import { formatDate, formatMoney, formatPct } from "@/lib/format";
import { buildPortfolioSnapshot, listPortfolios, resolvePortfolioId } from "@/services/portfolio";

export const metadata = { title: "Portfolio" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function PortfolioPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const period: PeriodKey = isPeriodKey(first(sp.period)) ? (first(sp.period) as PeriodKey) : "ALL";
  const portfolioId = resolvePortfolioId(first(sp.portfolio));
  const portfolios = listPortfolios();
  const snapshot = portfolioId ? buildPortfolioSnapshot(portfolioId, { period }) : null;

  if (!snapshot) {
    return (
      <>
        <PageHeader title="Portfolio" description="Record transactions or import a CSV; holdings, cash and returns are derived from the ledger." />
        <PortfolioEditor portfolios={[]} />
      </>
    );
  }

  const windowStart = snapshot.period.from;
  const growthRaw = snapshot.twr.growthIndex.filter((p) => p.date >= windowStart);
  const benchByDate = new Map(snapshot.benchmark.growth.map((g) => [g.date, g.value]));
  const firstPortfolio = growthRaw[0]?.value ?? 100;
  const firstBench = growthRaw.map((p) => benchByDate.get(p.date)).find((v): v is number => typeof v === "number") ?? null;
  const growthPoints: GrowthPoint[] = growthRaw.map((p) => {
    const b = benchByDate.get(p.date);
    return { date: p.date, portfolio: (p.value / firstPortfolio) * 100, benchmark: typeof b === "number" && firstBench ? (b / firstBench) * 100 : null };
  });
  const names = new Map(snapshot.holdings.map((h) => [h.symbol, h.name]));
  const errorIssues = snapshot.issues.filter((i) => i.severity === "error");
  const warningIssues = snapshot.issues.filter((i) => i.severity === "warning");
  const params = { portfolio: snapshot.portfolio.id };

  return (
    <>
      <PageHeader
        eyebrow={
          <span className="flex flex-wrap items-center gap-2">
            <span>Valued {formatDate(snapshot.asOf)}</span>
            <Badge tone="outline">FIFO cost basis</Badge>
            <Badge tone="outline">Benchmark {snapshot.benchmark.symbol}</Badge>
          </span>
        }
        title={snapshot.portfolio.name}
        description={snapshot.portfolio.description ?? "Holdings, cash and returns are derived from the transaction ledger. Realized gains are accounting estimates, not tax reporting."}
        actions={
          <>
            <Link href={`/portfolio/transactions?portfolio=${snapshot.portfolio.id}`} className={buttonClasses("secondary", "sm")}>
              <ListBullets size={15} aria-hidden /> Transactions
            </Link>
            <Link href={`/portfolio/import?portfolio=${snapshot.portfolio.id}`} className={buttonClasses("secondary", "sm")}>
              <UploadSimple size={15} aria-hidden /> Import CSV
            </Link>
            <a href={`/api/export/transactions?portfolio=${snapshot.portfolio.id}`} className={buttonClasses("secondary", "sm")} download>
              <DownloadSimple size={15} aria-hidden /> Export CSV
            </a>
            <PortfolioEditor portfolios={portfolios} current={snapshot.portfolio} />
          </>
        }
      />

      <div className="flex flex-col gap-5">
        {errorIssues.length ? (
          <EmptyState
            tone="negative"
            title={`${errorIssues.length} transaction${errorIssues.length > 1 ? "s" : ""} could not be applied`}
            description={
              <ul className="list-disc pl-4">
                {errorIssues.slice(0, 3).map((i) => (
                  <li key={i.transactionId}>{i.message}</li>
                ))}
              </ul>
            }
            action={<Link href={`/portfolio/transactions?portfolio=${snapshot.portfolio.id}`} className="text-accent hover:underline">Review transactions</Link>}
          />
        ) : null}
        {warningIssues.length ? <EmptyState tone="warning" title="Ledger warnings" description={warningIssues.map((i) => i.message).join(" ")} /> : null}
        {snapshot.missingPrices.length ? <EmptyState tone="warning" title={`No price data for ${snapshot.missingPrices.join(", ")}`} description="These positions are listed with their cost basis but excluded from totals and weights. Refresh market data in Settings (connected mode) or check the symbol." /> : null}

        <PerformanceTiles snapshot={snapshot} />

        <Panel>
          <PanelHeader title="Holdings" description={`${snapshot.holdings.length} open positions · prices as of their last available close · weights include cash`} />
          <PanelBody className="px-0 pb-0">
            {snapshot.holdings.length ? (
              <HoldingsTable rows={snapshot.holdings} asOf={snapshot.asOf} />
            ) : (
              <div className="px-4 pb-4">
                <EmptyState title="No open positions" description="Add a buy transaction or import a CSV to start tracking holdings." action={<Link href={`/portfolio/transactions?portfolio=${snapshot.portfolio.id}&new=1`} className={buttonClasses("primary", "sm")}>Add transaction</Link>} />
              </div>
            )}
            {snapshot.closedPositions.length ? (
              <details className="border-t border-border px-4 py-3 text-[13px]">
                <summary className="cursor-pointer text-fg-secondary hover:text-fg">Closed positions ({snapshot.closedPositions.length})</summary>
                <ul className="mt-2 divide-y divide-border/70">
                  {snapshot.closedPositions.map((c) => (
                    <li key={c.symbol} className="flex items-center justify-between gap-3 py-1.5">
                      <span>
                        <Link href={`/company/${c.symbol}`} className="num font-medium text-fg hover:text-accent">
                          {c.symbol}
                        </Link>{" "}
                        <span className="text-xs text-fg-muted">{c.name}</span>
                      </span>
                      <span className="num flex items-center gap-4">
                        <span className="text-fg-muted">Realized</span> <Delta value={c.realizedPnl} />
                        <span className="text-fg-muted">Dividends</span> {formatMoney(c.dividends)}
                      </span>
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
          </PanelBody>
        </Panel>

        <div className="grid gap-5 lg:grid-cols-3">
          <Panel className="lg:col-span-2">
            <PanelHeader
              title={`Growth of 100 · ${PERIOD_LABELS[period]}`}
              description={`Time-weighted portfolio versus ${snapshot.benchmark.name} (${snapshot.benchmark.returnType === "total" ? "total return" : snapshot.benchmark.returnType === "price" ? "price return" : "unavailable"}), re-indexed at ${formatDate(windowStart)}.`}
              actions={<PeriodSelector current={period} basePath="/portfolio" params={params} />}
            />
            <PanelBody className="flex flex-col gap-5">
              {growthPoints.length >= 2 ? <GrowthChart points={growthPoints} benchmarkLabel={snapshot.benchmark.symbol} height={260} /> : <EmptyState title="Not enough valuation days in this window" />}
              <DrawdownChart points={snapshot.drawdown.points.filter((p) => p.date >= windowStart)} maxDrawdown={snapshot.drawdown.maxDrawdown} height={160} footnote={snapshot.drawdown.maxDrawdown !== null ? `Deepest decline since inception ${formatPct(snapshot.drawdown.maxDrawdown)} from ${formatDate(snapshot.drawdown.peakDate)} to ${formatDate(snapshot.drawdown.troughDate)}${snapshot.drawdown.recoveryDate ? `, recovered ${formatDate(snapshot.drawdown.recoveryDate)}` : ", not yet recovered"}. Measured on the time-weighted index so deposits do not mask losses.` : undefined} />
            </PanelBody>
          </Panel>
          <div className="flex flex-col gap-5">
            <Panel>
              <PanelHeader title="Concentration" description={snapshot.concentration.largest ? `Largest ${snapshot.concentration.largest.symbol} ${formatPct(snapshot.concentration.largest.weight)} · top 5 ${formatPct(snapshot.concentration.top5Weight)}` : undefined} actions={<Link href={`/risk?portfolio=${snapshot.portfolio.id}`} className="text-xs text-accent hover:underline">Risk</Link>} />
              <PanelBody>
                <ExposureList exposure={snapshot.sectorExposure} />
              </PanelBody>
            </Panel>
            <Panel>
              <PanelHeader title={`Contributors · ${PERIOD_LABELS[period]}`} />
              <PanelBody>
                <Contributors attribution={snapshot.period.attribution} names={names} />
              </PanelBody>
            </Panel>
          </div>
        </div>
      </div>
    </>
  );
}
