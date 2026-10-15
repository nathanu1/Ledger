import Link from "next/link";
import { Heatmap } from "@/components/charts/heatmap";
import { Histogram } from "@/components/charts/histogram";
import { ExposureList } from "@/components/portfolio/exposure";
import { StressTestTool } from "@/components/risk/stress-test";
import { PageHeader } from "@/components/shell/page-header";
import { StatTile } from "@/components/metrics/stat-tile";
import { EmptyState } from "@/components/ui/empty";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { Table, TableScroll, Td, Th, Tr } from "@/components/ui/table";
import { cn } from "@/lib/cn";
import { formatDate, formatNumber, formatPct } from "@/lib/format";
import { resolvePortfolioId } from "@/services/portfolio";
import { buildPortfolioRisk, type RiskWindow } from "@/services/risk";

export const metadata = { title: "Risk" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const WINDOWS: RiskWindow[] = ["6M", "1Y", "3Y", "ALL"];

export default async function RiskPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const windowKey = (WINDOWS as string[]).includes(first(sp.window) ?? "") ? (first(sp.window) as RiskWindow) : "1Y";
  const portfolioId = resolvePortfolioId(first(sp.portfolio));
  const risk = portfolioId ? buildPortfolioRisk(portfolioId, windowKey) : null;
  if (!risk) {
    return (
      <>
        <PageHeader title="Risk" />
        <EmptyState title="No portfolio" action={<Link href="/portfolio" className="text-accent hover:underline">Create one</Link>} />
      </>
    );
  }
  const { snapshot } = risk;
  const windowLabel = `${formatDate(risk.window.from)} to ${formatDate(risk.window.to)}`;
  const common = { period: windowLabel, status: "historical" as const, source: { provider: "Ledger engine from stored daily closes", derivation: `${risk.conventions.returnType}; ${risk.conventions.annualization}; ${risk.conventions.missingData}; minimum ${risk.conventions.minimumObservations} observations.` }, limitations: ["Historical estimate, not a forecast.", risk.portfolio.returnSource] };
  const corr = risk.correlation;
  return (
    <>
      <PageHeader
        eyebrow={`${snapshot.portfolio.name} · ${windowLabel} · ${risk.window.observations} daily observations`}
        title="Risk"
        description="Historical statistics from aligned adjusted prices, plus a hypothetical stress test. Conventions are listed at the bottom of the page."
        actions={
          <nav aria-label="Window" className="flex items-center gap-0.5 rounded-md border border-border p-0.5">
            {WINDOWS.map((w) => (
              <Link key={w} href={`/risk?portfolio=${snapshot.portfolio.id}&window=${w}`} aria-current={w === windowKey ? "page" : undefined} className={cn("num rounded-sm px-2.5 py-1 text-xs", w === windowKey ? "bg-panel-raised font-medium text-fg" : "text-fg-muted hover:text-fg")}>
                {w}
              </Link>
            ))}
          </nav>
        }
      />
      <div className="flex flex-col gap-5">
        <div className="tile-strip grid-cols-2 lg:grid-cols-6">
          <StatTile label="Annualised volatility" value={<span className="num-sans">{risk.portfolio.volatility.value === null ? <span className="text-base text-fg-muted">n/a</span> : formatPct(risk.portfolio.volatility.value)}</span>} sub={risk.portfolio.volatility.reason ?? `Benchmark ${risk.benchmark.volatility.value === null ? "n/a" : formatPct(risk.benchmark.volatility.value)}`} explain={{ ...common, title: "Portfolio volatility", value: risk.portfolio.volatility.value === null ? "n/a" : formatPct(risk.portfolio.volatility.value), definition: "Sample standard deviation of the portfolio's daily time-weighted returns, annualised by the square root of 252." }} />
          <StatTile label="Maximum drawdown" value={<span className="num-sans">{risk.portfolio.maxDrawdown === null ? <span className="text-base text-fg-muted">n/a</span> : formatPct(risk.portfolio.maxDrawdown)}</span>} sub={`Benchmark ${risk.benchmark.maxDrawdown === null ? "n/a" : formatPct(risk.benchmark.maxDrawdown)}`} explain={{ ...common, title: "Maximum drawdown", value: risk.portfolio.maxDrawdown === null ? "n/a" : formatPct(risk.portfolio.maxDrawdown), definition: "Deepest peak-to-trough decline of the time-weighted growth index inside the window, so deposits cannot hide losses." }} />
          <StatTile label={`Beta vs ${risk.benchmark.symbol}`} value={<span className="num-sans">{risk.portfolio.beta.value === null ? <span className="text-base text-fg-muted">n/a</span> : formatNumber(risk.portfolio.beta.value, 2)}</span>} sub={risk.portfolio.beta.reason ?? (risk.portfolio.beta.rSquared !== null ? `R² ${formatNumber(risk.portfolio.beta.rSquared, 2)} · ${risk.portfolio.beta.observations} aligned days` : undefined)} explain={{ ...common, title: "Portfolio beta", value: risk.portfolio.beta.value === null ? "n/a" : formatNumber(risk.portfolio.beta.value, 2), definition: `Covariance of portfolio and benchmark daily returns divided by the benchmark's variance, over dates both have data. Benchmark series is ${risk.benchmark.adjustment === "splits_dividends" ? "adjusted for splits and dividends" : risk.benchmark.adjustment === "splits" ? "split-adjusted" : "raw"}.` }} />
          <StatTile label="Largest position" value={<span className="num-sans">{snapshot.concentration.largest ? formatPct(snapshot.concentration.largest.weight) : "n/a"}</span>} sub={snapshot.concentration.largest ? `${snapshot.concentration.largest.symbol} · top 5 ${formatPct(snapshot.concentration.top5Weight)}` : undefined} explain={{ title: "Concentration", value: snapshot.concentration.largest ? formatPct(snapshot.concentration.largest.weight) : "n/a", definition: "Weight of the largest position in total portfolio value (cash included), and the combined weight of the five largest.", status: "calculated", source: { provider: "Ledger engine" } }} />
          <StatTile label="Effective positions" value={<span className="num-sans">{snapshot.concentration.effectivePositions === null ? "n/a" : formatNumber(snapshot.concentration.effectivePositions, 1)}</span>} sub={`${snapshot.concentration.positions} holdings`} explain={{ title: "Effective number of positions", value: snapshot.concentration.effectivePositions === null ? "n/a" : formatNumber(snapshot.concentration.effectivePositions, 1), definition: "One divided by the Herfindahl index of position weights (cash excluded): the number of equal-sized positions that would give the same concentration.", status: "calculated", source: { provider: "Ledger engine" } }} />
          <StatTile label="Cash" value={<span className="num-sans">{formatPct(snapshot.sectorExposure.cashWeight)}</span>} sub="of total value" />
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          <Panel>
            <PanelHeader title="Correlation of daily returns" description={corr.reason ?? `Pearson correlation over ${corr.observations} common trading days. Blue = moves together, orange = moves opposite.`} />
            <PanelBody>
              {corr.reason ? (
                <EmptyState title="Not enough common history" description={corr.reason} />
              ) : (
                <Heatmap rowHeader="Position" colHeader="Position" rowLabels={corr.labels} colLabels={corr.labels} center={0} maxAbs={1} caption={`Correlation matrix of daily returns for ${corr.labels.join(", ")}`} palette={{ above: "var(--series-1)", below: "var(--series-2)" }} cells={corr.matrix.map((row) => row.map((v) => ({ value: v, label: v === null ? "n/a" : v.toFixed(2) })))} />
              )}
              <p className="mt-2 text-[11px] text-fg-muted">Each cell prints the coefficient; colour is a guide only. Last row and column: the benchmark.</p>
            </PanelBody>
          </Panel>
          <Panel>
            <PanelHeader title="Sector exposure" description="Direct holdings by sector; funds contribute only when holdings data exists." />
            <PanelBody>
              <ExposureList exposure={snapshot.sectorExposure} />
              {snapshot.sectorExposure.unavailableLookThroughSymbols.length ? <p className="mt-3 text-xs text-warning">Look-through exposure unavailable for {snapshot.sectorExposure.unavailableLookThroughSymbols.join(", ")}: no holdings file. Shown as a separate bucket, not spread across sectors.</p> : null}
            </PanelBody>
          </Panel>
        </div>

        <Panel>
          <PanelHeader title="Per-position statistics" description={`Window ${windowLabel}; adjusted closes; beta against ${risk.benchmark.symbol}.`} />
          <PanelBody className="px-0 pb-0">
            <TableScroll label="Per-position risk">
              <Table>
                <thead>
                  <tr>
                    <Th>Position</Th>
                    <Th align="right">Weight</Th>
                    <Th align="right">Volatility</Th>
                    <Th align="right">Max drawdown</Th>
                    <Th align="right">Beta</Th>
                    <Th align="right">R²</Th>
                    <Th align="right">Days</Th>
                  </tr>
                </thead>
                <tbody>
                  {risk.positions.map((p) => {
                    const h = snapshot.holdings.find((x) => x.symbol === p.symbol);
                    return (
                      <Tr key={p.symbol}>
                        <Td>
                          <Link href={`/company/${p.symbol}?tab=risk`} className="num font-medium text-fg hover:text-accent">{p.symbol}</Link> <span className="text-xs text-fg-muted">{h?.name}</span>
                        </Td>
                        <Td align="right" numeric>{h?.weight === null || h?.weight === undefined ? "n/a" : formatPct(h.weight)}</Td>
                        <Td align="right" numeric title={p.volatility.reason}>{p.volatility.value === null ? <span className="text-fg-muted">n/a</span> : formatPct(p.volatility.value)}</Td>
                        <Td align="right" numeric>{p.maxDrawdown === null ? <span className="text-fg-muted">n/a</span> : formatPct(p.maxDrawdown)}</Td>
                        <Td align="right" numeric title={p.beta.reason}>{p.beta.value === null ? <span className="text-fg-muted">n/a</span> : formatNumber(p.beta.value, 2)}</Td>
                        <Td align="right" numeric>{p.beta.rSquared === null ? <span className="text-fg-muted">n/a</span> : formatNumber(p.beta.rSquared, 2)}</Td>
                        <Td align="right" numeric>{p.observations}</Td>
                      </Tr>
                    );
                  })}
                </tbody>
              </Table>
            </TableScroll>
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHeader title="Distribution of portfolio daily returns" description={`${risk.portfolio.distribution.observations} days · mean ${risk.portfolio.distribution.mean === null ? "n/a" : formatPct(risk.portfolio.distribution.mean, { digits: 2 })} · 5th/95th percentile ${risk.portfolio.distribution.p5 === null ? "n/a" : `${formatPct(risk.portfolio.distribution.p5)} / ${formatPct(risk.portfolio.distribution.p95)}`}`} />
          <PanelBody>{risk.portfolio.distribution.observations ? <Histogram bins={risk.portfolio.distribution.bins} observations={risk.portfolio.distribution.observations} height={200} /> : <EmptyState title="Not enough data" />}</PanelBody>
        </Panel>

        <Panel>
          <PanelHeader title="Stress test" description="Hypothetical scenario you define: shock positions or sectors and see the estimated impact on today's values. Not a historical estimate and not a forecast." />
          <PanelBody>
            <StressTestTool positions={snapshot.holdings.filter((h) => h.marketValue !== null).map((h) => ({ symbol: h.symbol, marketValue: Number(h.marketValue), sector: h.sector, securityType: h.securityType === "etf" ? "etf" : "stock" }))} cash={Number(snapshot.valuation.cash)} />
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHeader title="How these are measured" />
          <PanelBody>
            <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[200px_1fr]">
              <dt className="text-fg-muted">Observation window</dt>
              <dd className="text-fg-secondary">{windowLabel}; {risk.window.observations} portfolio daily returns</dd>
              <dt className="text-fg-muted">Portfolio returns</dt>
              <dd className="text-fg-secondary">{risk.portfolio.returnSource}</dd>
              <dt className="text-fg-muted">Position returns</dt>
              <dd className="text-fg-secondary">{risk.conventions.returnType}</dd>
              <dt className="text-fg-muted">Annualisation</dt>
              <dd className="text-fg-secondary">{risk.conventions.annualization}</dd>
              <dt className="text-fg-muted">Missing data</dt>
              <dd className="text-fg-secondary">{risk.conventions.missingData}</dd>
              <dt className="text-fg-muted">Minimum sample</dt>
              <dd className="text-fg-secondary">{risk.conventions.minimumObservations} observations, otherwise not available</dd>
              <dt className="text-fg-muted">Benchmark</dt>
              <dd className="text-fg-secondary">{risk.benchmark.symbol}, {risk.benchmark.adjustment === "splits_dividends" ? "total return (adjusted for splits and dividends)" : risk.benchmark.adjustment === "splits" ? "price return (split-adjusted)" : "raw closes"}</dd>
            </dl>
          </PanelBody>
        </Panel>
      </div>
    </>
  );
}
