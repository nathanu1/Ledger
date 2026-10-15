import Link from "next/link";
import { ArrowSquareOut, CalendarBlank, CalendarCheck } from "@phosphor-icons/react/dist/ssr";
import { PriceChart, type PricePointInput } from "@/components/charts/price-chart";
import { MetricTile, RatioTile } from "@/components/company/metric-tiles";
import { StatTile } from "@/components/metrics/stat-tile";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { Delta } from "@/components/metrics/value";
import type { EarningsEventRow, FilingRow, Security } from "@/db/schema";
import { formatDate, formatDateTime, formatMoney, formatMoneyCompact, formatPct } from "@/lib/format";
import type { CompanyMetrics } from "@/services/metrics";
import type { NormalizedFinancials } from "@/calc/fundamentals";

export interface SinceVisit {
  previousVisitAt: string | null;
  priceThen: { date: string; price: number } | null;
  newFilings: FilingRow[];
  newPeriods: string[];
}

export function OverviewTab({ security, metrics, fin, prices, benchmark, benchmarkSymbol, adjustment, filings, nextEarnings, since, retrievedAt, mode }: { security: Security; metrics: CompanyMetrics; fin: NormalizedFinancials | null; prices: PricePointInput[]; benchmark: Array<{ date: string; price: number }> | null; benchmarkSymbol: string | null; adjustment: string | null; filings: FilingRow[]; nextEarnings: EarningsEventRow | null; since: SinceVisit; retrievedAt: string | null; mode: "demo" | "connected" }) {
  const v = metrics.values;
  const isEtf = security.securityType === "etf";
  const priceNow = metrics.price?.price ?? null;
  const sinceChange = since.priceThen && priceNow ? priceNow / since.priceThen.price - 1 : null;
  return (
    <div className="flex flex-col gap-5">
      {isEtf ? (
        <Panel>
          <PanelHeader title="Fund information" description="Funds are shown at fund level. Underlying exposure appears only when holdings data exists." />
          <PanelBody className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile label="Category" value={<span className="text-base">{security.fundCategory ?? "n/a"}</span>} />
            <StatTile label="Expense ratio" value={<span className="num-sans">{security.expenseRatio === null ? "n/a" : formatPct(security.expenseRatio, { digits: 2 })}</span>} sub={security.fundFamily ?? undefined} />
            <StatTile label="Tracks" value={<span className="text-base">{security.benchmarkIndex ?? "n/a"}</span>} />
            <StatTile label="Holdings data" value={<span className="text-base">{security.holdingsAvailable ? "Available" : "Unavailable"}</span>} sub={security.holdingsAvailable ? "Sector look-through is possible" : "Look-through exposure unavailable"} tone={security.holdingsAvailable ? "default" : "muted"} />
          </PanelBody>
        </Panel>
      ) : (
        <div className="tile-strip grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
          <StatTile
            label="Market cap"
            value={<span className="num-sans">{metrics.marketCap === null ? <span className="text-fg-muted">n/a</span> : formatMoneyCompact(metrics.marketCap)}</span>}
            sub={metrics.sharesOutstanding ? `${metrics.sharesOutstanding.status === "reported" ? "Shares as of " : ""}${metrics.sharesOutstanding.periodEnd}` : "No share count"}
            explain={{
              title: `Market capitalisation · ${security.symbol}`,
              value: formatMoneyCompact(metrics.marketCap),
              definition: "Latest price multiplied by the most recent reported share count.",
              period: metrics.sharesOutstanding ? `Shares as of ${metrics.sharesOutstanding.periodEnd}; price as of ${metrics.dataDates.price ?? "n/a"}` : null,
              units: "US dollars",
              status: "calculated",
              source: { provider: metrics.dataDates.fundamentalsSource ?? "n/a", derivation: `${formatMoney(priceNow)} x ${metrics.sharesOutstanding?.value?.toLocaleString("en-US") ?? "n/a"} shares.`, reference: metrics.sharesOutstanding?.source.concept ?? null },
              limitations: ["Share counts are reported on the cover page of each filing and lag buybacks and issuance."],
            }}
          />
          <MetricTile label="Revenue (TTM)" mv={v.revenue} symbol={security.symbol} retrievedAt={retrievedAt} />
          <MetricTile label="Revenue growth" mv={v.revenueGrowth} symbol={security.symbol} retrievedAt={retrievedAt} />
          <MetricTile label="Operating margin" mv={v.operatingMargin} symbol={security.symbol} retrievedAt={retrievedAt} />
          <MetricTile label="Free cash flow (TTM)" mv={v.freeCashFlow} symbol={security.symbol} retrievedAt={retrievedAt} />
          <MetricTile label="Net debt" mv={v.netDebt} symbol={security.symbol} retrievedAt={retrievedAt} />
          <RatioTile kind="pe" value={metrics.ratios.pe} metrics={metrics} />
          <RatioTile kind="ps" value={metrics.ratios.ps} metrics={metrics} />
          <RatioTile kind="evEbitda" value={metrics.ratios.evEbitda} metrics={metrics} />
          <RatioTile kind="fcfYield" value={metrics.ratios.fcfYield} metrics={metrics} />
          <MetricTile label="Gross margin" mv={v.grossMargin} symbol={security.symbol} retrievedAt={retrievedAt} />
          <MetricTile label="Diluted share change" mv={v.sharesDilutedGrowth} symbol={security.symbol} retrievedAt={retrievedAt} />
        </div>
      )}

      <Panel>
        <PanelHeader title="Price history" description={prices.length ? `${prices.length} daily closes from ${formatDate(prices[0].date)} to ${formatDate(prices[prices.length - 1].date)} · ${mode === "demo" ? "demo dataset" : "stored from the market-data provider"}` : "No price history stored"} />
        <PanelBody>
          {prices.length >= 2 ? <PriceChart symbol={security.symbol} points={prices} benchmark={benchmark} benchmarkSymbol={benchmarkSymbol} adjustment={adjustment} /> : <EmptyState title="No price history" description={mode === "demo" ? "This symbol has no demo prices." : "Use Refresh data to fetch history from the configured provider."} />}
        </PanelBody>
      </Panel>

      <div className="grid gap-5 lg:grid-cols-3">
        <Panel>
          <PanelHeader title="Since your last visit" description={since.previousVisitAt ? `Changes since ${formatDateTime(since.previousVisitAt)}` : "First visit recorded. Changes will be tracked from now on."} />
          <PanelBody>
            {since.previousVisitAt ? (
              <ul className="space-y-2 text-[13px]">
                <li className="flex items-center justify-between gap-2">
                  <span className="text-fg-secondary">Price since then</span>
                  {sinceChange === null ? <span className="text-fg-muted">n/a</span> : <Delta value={sinceChange} kind="pct" />}
                </li>
                <li className="flex items-center justify-between gap-2">
                  <span className="text-fg-secondary">New filings</span>
                  <span className="num">{since.newFilings.length}</span>
                </li>
                <li className="flex items-center justify-between gap-2">
                  <span className="text-fg-secondary">New reported periods</span>
                  <span className="num">{since.newPeriods.length ? since.newPeriods.join(", ") : "none"}</span>
                </li>
                {since.newFilings.slice(0, 4).map((f) => (
                  <li key={f.accession} className="text-xs text-fg-muted">
                    {formatDate(f.filedAt)} · {f.form} · {f.description ?? ""}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-fg-muted">Come back later to see new filings, reported periods and the price change since this visit.</p>
            )}
          </PanelBody>
        </Panel>
        <Panel>
          <PanelHeader title="Next earnings" />
          <PanelBody>
            {nextEarnings ? (
              <div className="flex items-start gap-3 text-[13px]">
                {nextEarnings.status === "confirmed" ? <CalendarCheck size={20} className="text-positive" aria-hidden /> : <CalendarBlank size={20} className="text-fg-muted" aria-hidden />}
                <div>
                  <div className="num text-base font-medium text-fg">{formatDate(nextEarnings.date)}</div>
                  <div className="text-fg-secondary">
                    <Badge tone={nextEarnings.status === "confirmed" ? "positive" : "warning"}>{nextEarnings.status === "confirmed" ? "Confirmed" : "Estimated"}</Badge>
                    {nextEarnings.timeOfDay ? ` ${nextEarnings.timeOfDay}` : ""}
                  </div>
                  <p className="mt-1 text-xs text-fg-muted">{nextEarnings.basis}</p>
                  {nextEarnings.sourceUrl ? (
                    <a href={nextEarnings.sourceUrl} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs text-accent hover:underline">
                      Source <ArrowSquareOut size={12} aria-hidden />
                    </a>
                  ) : null}
                </div>
              </div>
            ) : (
              <p className="text-sm text-fg-muted">No upcoming date is known. In connected mode, dates come from the provider calendar or are estimated from prior 8-K filings.</p>
            )}
            {fin?.quarterly.length ? (
              <p className="mt-3 text-xs text-fg-muted">
                Latest reported quarter: {fin.quarterly[fin.quarterly.length - 1].label}, filed {formatDate(fin.quarterly[fin.quarterly.length - 1].filedAt)}.
              </p>
            ) : null}
          </PanelBody>
        </Panel>
        <Panel>
          <PanelHeader title="Recent filings" description={mode === "demo" ? "Demo filings have no documents." : "Links open the primary document on sec.gov."} />
          <PanelBody>
            {filings.length === 0 ? (
              <p className="text-sm text-fg-muted">No filings stored.</p>
            ) : (
              <ul className="divide-y divide-border/70 text-[13px]">
                {filings.slice(0, 8).map((f) => (
                  <li key={f.accession} className="flex items-center justify-between gap-2 py-1.5">
                    <div className="flex min-w-0 items-baseline gap-2">
                      <span className="num shrink-0 whitespace-nowrap font-medium text-fg">{f.form}</span>
                      <span className="min-w-0 truncate text-xs text-fg-muted" title={f.description ?? undefined}>{f.description ?? ""}</span>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="num text-xs text-fg-secondary">{formatDate(f.filedAt)}</span>
                      {f.url ? (
                        <a href={f.url} target="_blank" rel="noreferrer" aria-label={`Open ${f.form} filed ${f.filedAt} on sec.gov`} className="text-accent hover:text-accent-strong">
                          <ArrowSquareOut size={14} aria-hidden />
                        </a>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </PanelBody>
        </Panel>
      </div>
      {security.description ? (
        <Panel>
          <PanelHeader title="Business" description={security.website ? <Link href={security.website} className="text-accent hover:underline">{security.website}</Link> : undefined} />
          <PanelBody>
            <p className="max-w-[80ch] text-sm leading-6 text-fg-secondary">{security.description}</p>
          </PanelBody>
        </Panel>
      ) : null}
    </div>
  );
}
