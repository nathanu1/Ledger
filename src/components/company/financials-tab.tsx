"use client";

import * as React from "react";
import { METRIC_DEFINITIONS, type MetricKey, type NormalizedFinancials, type StatementPeriod } from "@/calc/fundamentals";
import type { SectorProfile } from "@/calc/ratios";
import { BarsChart } from "@/components/charts/bars-chart";
import { useExplain } from "@/components/metrics/explain-context";
import { formatMetricValue, metricExplain } from "@/components/metrics/metric-explain";
import { EmptyState } from "@/components/ui/empty";
import { Select } from "@/components/ui/field";
import { Table, TableScroll, Td, Th } from "@/components/ui/table";
import { cn } from "@/lib/cn";
import { formatCompact, formatDate, formatMoneyCompact, formatNumber, formatPct } from "@/lib/format";

const ROWS: Array<{ key: MetricKey; indent?: boolean }> = [
  { key: "revenue" },
  { key: "revenueGrowth", indent: true },
  { key: "grossProfit" },
  { key: "grossMargin", indent: true },
  { key: "operatingIncome" },
  { key: "operatingMargin", indent: true },
  { key: "netIncome" },
  { key: "netMargin", indent: true },
  { key: "epsDiluted" },
  { key: "operatingCashFlow" },
  { key: "capex" },
  { key: "freeCashFlow" },
  { key: "fcfMargin", indent: true },
  { key: "stockBasedCompensation" },
  { key: "cash" },
  { key: "shortTermInvestments" },
  { key: "totalDebt" },
  { key: "netDebt", indent: true },
  { key: "sharesDiluted" },
  { key: "sharesDilutedGrowth", indent: true },
  { key: "sharesOutstanding" },
];

const CHARTABLE: MetricKey[] = ["revenue", "revenueGrowth", "grossProfit", "grossMargin", "operatingIncome", "operatingMargin", "netIncome", "netMargin", "epsDiluted", "operatingCashFlow", "capex", "freeCashFlow", "fcfMargin", "stockBasedCompensation", "cash", "totalDebt", "netDebt", "sharesDiluted", "sharesOutstanding"];

function formatFor(key: MetricKey): (v: number) => string {
  const unit = METRIC_DEFINITIONS[key].unit;
  if (unit === "ratio") return (v) => formatPct(v, { digits: 1 });
  if (unit === "USD/share") return (v) => formatNumber(v, 2);
  if (unit === "shares") return (v) => formatCompact(v);
  return (v) => formatMoneyCompact(v);
}

export function FinancialsTab({ symbol, fin, profile, retrievedAt }: { symbol: string; fin: NormalizedFinancials | null; profile: SectorProfile; retrievedAt: string | null }) {
  const [periodType, setPeriodType] = React.useState<"annual" | "quarterly">("annual");
  const [view, setView] = React.useState<"table" | "chart">("table");
  const [metric, setMetric] = React.useState<MetricKey>("revenue");
  const { open } = useExplain();

  if (!fin || (fin.annual.length === 0 && fin.quarterly.length === 0)) {
    return <EmptyState title="No financial statements available" description="Fundamentals come from SEC XBRL company facts (connected mode) or the demo dataset. ETFs and foreign private issuers without XBRL filings are not covered." />;
  }
  const periods: StatementPeriod[] = periodType === "annual" ? fin.annual : [...fin.quarterly, ...(fin.ttm ? [fin.ttm] : [])];
  const limited = new Set(profile.limitedMetrics);
  const chartPeriods = periodType === "annual" ? fin.annual : fin.quarterly;

  return (
    <div className="flex flex-col gap-4">
      {profile.notes.length ? (
        <EmptyState tone="warning" title={`${profile.label}: some standard metrics do not apply`} description={<ul className="list-disc space-y-1 pl-4">{profile.notes.map((n) => <li key={n}>{n}</li>)}</ul>} />
      ) : null}
      {fin.warnings.length ? <p className="text-xs text-warning">{fin.warnings.join(" ")}</p> : null}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label="Period type" className="flex items-center gap-0.5 rounded-md border border-border p-0.5 text-xs">
            {(["annual", "quarterly"] as const).map((p) => (
              <button key={p} type="button" aria-pressed={periodType === p} onClick={() => setPeriodType(p)} className={cn("rounded-sm px-2.5 py-1 capitalize", periodType === p ? "bg-panel-raised font-medium text-fg" : "text-fg-muted hover:text-fg")}>
                {p}
              </button>
            ))}
          </div>
          <div role="group" aria-label="View" className="flex items-center gap-0.5 rounded-md border border-border p-0.5 text-xs">
            {(["table", "chart"] as const).map((v) => (
              <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)} className={cn("rounded-sm px-2.5 py-1 capitalize", view === v ? "bg-panel-raised font-medium text-fg" : "text-fg-muted hover:text-fg")}>
                {v}
              </button>
            ))}
          </div>
          {view === "chart" ? (
            <label className="flex items-center gap-2 text-xs text-fg-muted">
              Metric
              <Select value={metric} onChange={(e) => setMetric(e.target.value as MetricKey)} className="h-8 w-[220px] text-[13px]" aria-label="Metric to chart">
                {CHARTABLE.map((k) => (
                  <option key={k} value={k}>
                    {METRIC_DEFINITIONS[k].label}
                  </option>
                ))}
              </Select>
            </label>
          ) : null}
        </div>
        <p className="text-xs text-fg-muted">
          Upright = reported in the filing · <em>Italic</em> = calculated by Ledger · † = not comparable for this sector · Click a value for its source.
        </p>
      </div>

      {view === "table" ? (
        <TableScroll label={`${symbol} ${periodType} financial statements`} className="rounded-md border border-border">
          <Table>
            <thead>
              <tr>
                <Th className="sticky left-0 z-[2] min-w-[200px] bg-panel">Metric</Th>
                {periods.map((p) => (
                  <Th key={p.label} align="right" className="min-w-[112px]">
                    <div>{p.label}</div>
                    <div className="font-normal normal-case tracking-normal text-fg-muted">{p.periodType === "ttm" ? "trailing" : `ends ${formatDate(p.periodEnd)}`}</div>
                    <div className="font-normal normal-case tracking-normal text-fg-muted">filed {p.filedAt ? formatDate(p.filedAt) : "n/a"}</div>
                  </Th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row) => {
                const def = METRIC_DEFINITIONS[row.key];
                const anyValue = periods.some((p) => p.metrics[row.key]);
                if (!anyValue) return null;
                return (
                  <tr key={row.key} className="hover:bg-panel-raised/60">
                    <th scope="row" className={cn("sticky left-0 z-[1] whitespace-nowrap border-b border-border/70 bg-panel px-3 py-1.5 text-left text-[13px] font-normal text-fg", row.indent && "pl-6 text-fg-secondary")}>
                      {def.label}
                      {limited.has(row.key) ? <span title="Not comparable for this sector"> †</span> : null}
                    </th>
                    {periods.map((p) => {
                      const mv = p.metrics[row.key];
                      return (
                        <Td key={p.label} align="right" numeric className="p-0">
                          {mv ? (
                            <button
                              type="button"
                              onClick={() => open(metricExplain(mv, { symbol, retrievedAt }))}
                              className={cn("block w-full px-3 py-1.5 text-right hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus", mv.status === "calculated" && "italic text-fg-secondary", mv.value === null && "text-fg-muted", mv.value !== null && mv.value < 0 && def.unit !== "ratio" && "text-negative", def.unit === "ratio" && mv.value !== null && mv.value < 0 && "text-negative")}
                              aria-label={`${def.label} ${p.label}: ${formatMetricValue(mv)}. Show definition and source.`}
                            >
                              {formatMetricValue(mv)}
                            </button>
                          ) : (
                            <span className="block px-3 py-1.5 text-fg-muted" aria-label="Not available">
                              n/a
                            </span>
                          )}
                        </Td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </TableScroll>
      ) : (
        <div className="panel p-4">
          <BarsChart
            title={`${METRIC_DEFINITIONS[metric].label} · ${periodType}`}
            seriesLabel={METRIC_DEFINITIONS[metric].label}
            points={chartPeriods.map((p) => ({ label: p.label, value: p.metrics[metric]?.value ?? null, calculated: p.metrics[metric]?.status === "calculated" }))}
            format={formatFor(metric)}
            signColor
            height={280}
            footnote={`${METRIC_DEFINITIONS[metric].definition} ${METRIC_DEFINITIONS[metric].limitations} Lighter bars are calculated from reported figures.`}
          />
        </div>
      )}
    </div>
  );
}
