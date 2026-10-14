import Link from "next/link";
import { isPeriodKey, PERIOD_LABELS, type PeriodKey } from "@/calc/periods";
import { GrowthChart, type GrowthPoint } from "@/components/charts/growth-chart";
import { WeightBars } from "@/components/charts/weight-bars";
import { Contributors } from "@/components/overview/contributors";
import { AlertsList, EarningsList, WatchlistChanges } from "@/components/overview/lists";
import { PeriodSelector } from "@/components/overview/period-selector";
import { SummaryTiles } from "@/components/overview/summary-tiles";
import { PageHeader } from "@/components/shell/page-header";
import { EmptyState } from "@/components/ui/empty";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { buttonClasses } from "@/components/ui/button";
import { formatDate, formatPct } from "@/lib/format";
import { buildOverview } from "@/services/overview";

export const metadata = { title: "Overview" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function OverviewPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const periodParam = first(sp.period);
  const period: PeriodKey = isPeriodKey(periodParam) ? periodParam : "1M";
  const data = buildOverview({ portfolioId: first(sp.portfolio), period });
  const snapshot = data.snapshot;

  if (!snapshot) {
    return (
      <>
        <PageHeader title="What changed?" description="Create a portfolio to see value, returns, contributions and alerts here." />
        <EmptyState title="No portfolio yet" description="Add a portfolio and record transactions, or import a CSV from your broker." action={<Link href="/portfolio" className={buttonClasses("primary", "md")}>Set up a portfolio</Link>} />
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
  for (const c of snapshot.closedPositions) names.set(c.symbol, c.name);
  const largest = snapshot.holdings.slice(0, 6).map((h) => ({ symbol: h.symbol, name: h.name, weight: h.weight, href: `/company/${h.symbol}` }));

  return (
    <>
      <PageHeader
        eyebrow={`${snapshot.portfolio.name} · valued ${formatDate(snapshot.asOf)}`}
        title="What changed?"
        description="Value, returns and contributions are derived from your transaction ledger and stored prices. Each figure explains its calculation."
        actions={<PeriodSelector current={period} basePath="/" params={{ portfolio: snapshot.portfolio.id }} />}
      />

      <div className="flex flex-col gap-5">
        <SummaryTiles snapshot={snapshot} />

        <div className="grid gap-5 lg:grid-cols-3">
          <Panel className="lg:col-span-2">
            <PanelHeader
              title={`Growth of 100 · ${PERIOD_LABELS[period]}`}
              description={`Portfolio (time-weighted) versus ${snapshot.benchmark.name} (${snapshot.benchmark.returnType === "total" ? "total return" : snapshot.benchmark.returnType === "price" ? "price return, dividends not reinvested" : "unavailable"}), both re-indexed to 100 at ${formatDate(windowStart)}.`}
            />
            <PanelBody>
              {growthPoints.length >= 2 ? (
                <GrowthChart points={growthPoints} benchmarkLabel={snapshot.benchmark.symbol} height={280} />
              ) : (
                <EmptyState title="Not enough valuation days in this window" description="Pick a longer period or add earlier transactions." />
              )}
            </PanelBody>
          </Panel>
          <Panel>
            <PanelHeader title="Largest positions" description={snapshot.concentration.largest ? `Top 5 hold ${formatPct(snapshot.concentration.top5Weight)} of value` : undefined} actions={<Link href={`/risk?portfolio=${snapshot.portfolio.id}`} className="text-xs text-accent hover:underline">Concentration</Link>} />
            <PanelBody>{largest.length ? <WeightBars items={largest} /> : <EmptyState title="No open positions" />}</PanelBody>
          </Panel>
        </div>

        <div className="grid gap-5 lg:grid-cols-3">
          <Panel className="lg:col-span-2">
            <PanelHeader title={`Biggest contributors · ${PERIOD_LABELS[period]}`} description="Dollar profit or loss per position: change in value, minus net money invested, plus dividends. Not a claim about why prices moved." />
            <PanelBody>
              <Contributors attribution={snapshot.period.attribution} names={names} />
            </PanelBody>
          </Panel>
          <Panel>
            <PanelHeader title="Needs review" description="Thesis rules, review dates, concentration and data coverage." />
            <PanelBody>
              <AlertsList alerts={data.alerts} />
            </PanelBody>
          </Panel>
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          <Panel>
            <PanelHeader title="Upcoming earnings" description="Holdings and watchlist, next 60 days. Confirmed dates come from the company; estimates from provider calendars or filing cadence." />
            <PanelBody>
              <EarningsList events={data.upcomingEarnings} />
            </PanelBody>
          </Panel>
          <Panel>
            <PanelHeader title="Watchlist changes" description="Latest move and filings in the last 14 days." actions={<Link href="/watchlist" className="text-xs text-accent hover:underline">Open watchlist</Link>} />
            <PanelBody>
              <WatchlistChanges changes={data.watchlistChanges} />
            </PanelBody>
          </Panel>
        </div>
      </div>
    </>
  );
}
