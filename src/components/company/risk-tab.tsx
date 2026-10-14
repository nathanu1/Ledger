"use client";

import * as React from "react";
import type { DrawdownResult } from "@/calc/drawdown";
import { RISK_CONVENTIONS, type ReturnDistribution, type SecurityRisk } from "@/calc/risk";
import { Histogram } from "@/components/charts/histogram";
import { StatTile } from "@/components/metrics/stat-tile";
import { EmptyState } from "@/components/ui/empty";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { cn } from "@/lib/cn";
import { formatDate, formatNumber, formatPct } from "@/lib/format";

export interface RiskWindowData {
  key: "6M" | "1Y" | "3Y" | "ALL";
  from: string | null;
  to: string | null;
  stats: SecurityRisk;
  distribution: ReturnDistribution;
  drawdown: DrawdownResult | null;
  alignedObservations: number;
}

export function RiskTab({ symbol, windows, benchmarkSymbol, adjustment }: { symbol: string; windows: RiskWindowData[]; benchmarkSymbol: string | null; adjustment: string | null }) {
  const [key, setKey] = React.useState<RiskWindowData["key"]>("1Y");
  const w = windows.find((x) => x.key === key) ?? windows[0];
  if (!w || !w.from) return <EmptyState title="No price history" description="Risk statistics need daily prices." />;
  const windowLabel = `${formatDate(w.from)} to ${formatDate(w.to)}`;
  const common = {
    period: windowLabel,
    status: "historical" as const,
    source: { provider: "Ledger engine from stored daily closes", derivation: `${RISK_CONVENTIONS.returnType}; ${RISK_CONVENTIONS.annualization}; ${RISK_CONVENTIONS.missingData}; minimum ${RISK_CONVENTIONS.minimumObservations} observations.` },
    limitations: ["Historical estimate. Past volatility, drawdowns and beta do not predict future ones.", adjustment ? `Prices adjusted for ${adjustment === "splits_dividends" ? "splits and dividends" : "splits"}.` : "Raw closes (no adjusted series stored); dividends and splits can distort returns."],
  };
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div role="group" aria-label="Window" className="flex items-center gap-0.5 rounded-md border border-border p-0.5">
          {windows.map((x) => (
            <button key={x.key} type="button" aria-pressed={x.key === key} onClick={() => setKey(x.key)} className={cn("num rounded-sm px-2.5 py-1 text-xs", x.key === key ? "bg-panel-raised font-medium text-fg" : "text-fg-muted hover:text-fg")}>
              {x.key}
            </button>
          ))}
        </div>
        <p className="text-xs text-fg-muted">
          Historical estimates · {windowLabel} · {w.stats.observations} daily observations{benchmarkSymbol ? ` · beta versus ${benchmarkSymbol} on ${w.alignedObservations} aligned days` : ""}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Annualised volatility" value={<span className="num-sans">{w.stats.volatility.value === null ? <span className="text-base text-fg-muted">n/a</span> : formatPct(w.stats.volatility.value)}</span>} sub={w.stats.volatility.reason ?? `Std dev of ${w.stats.volatility.observations} daily returns x sqrt(252)`} explain={{ ...common, title: `Annualised volatility · ${symbol}`, value: w.stats.volatility.value === null ? "n/a" : formatPct(w.stats.volatility.value), definition: "Sample standard deviation of daily simple returns, multiplied by the square root of 252 trading days." }} />
        <StatTile label="Maximum drawdown" value={<span className="num-sans">{w.drawdown?.maxDrawdown === null || w.drawdown === null ? <span className="text-base text-fg-muted">n/a</span> : formatPct(w.drawdown.maxDrawdown)}</span>} sub={w.drawdown?.peakDate && w.drawdown.troughDate ? `${formatDate(w.drawdown.peakDate)} to ${formatDate(w.drawdown.troughDate)}${w.drawdown.recoveryDate ? `, recovered ${formatDate(w.drawdown.recoveryDate)}` : ", not recovered"}` : undefined} explain={{ ...common, title: `Maximum drawdown · ${symbol}`, value: w.drawdown?.maxDrawdown === null || w.drawdown === null ? "n/a" : formatPct(w.drawdown.maxDrawdown), definition: "Largest peak-to-trough decline in the adjusted close within the window." }} />
        <StatTile label={`Beta vs ${benchmarkSymbol ?? "benchmark"}`} value={<span className="num-sans">{w.stats.beta.value === null ? <span className="text-base text-fg-muted">n/a</span> : formatNumber(w.stats.beta.value, 2)}</span>} sub={w.stats.beta.reason ?? (w.stats.beta.rSquared !== null ? `R² ${formatNumber(w.stats.beta.rSquared, 2)} over ${w.stats.beta.observations} days` : undefined)} explain={{ ...common, title: `Beta · ${symbol}`, value: w.stats.beta.value === null ? "n/a" : formatNumber(w.stats.beta.value, 2), definition: `Covariance of the stock's daily returns with the benchmark's, divided by the benchmark's variance, over the dates both have prices. R² shows how much of the stock's variance the benchmark explains.` }} />
        <StatTile label="Daily return range" value={<span className="num-sans text-base">{w.distribution.p5 === null ? "n/a" : `${formatPct(w.distribution.p5)} to ${formatPct(w.distribution.p95)}`}</span>} sub={w.distribution.positiveShare === null ? undefined : `5th to 95th percentile · ${formatPct(w.distribution.positiveShare, { digits: 0 })} of days positive`} explain={{ ...common, title: `Daily return percentiles · ${symbol}`, value: w.distribution.p5 === null ? "n/a" : `${formatPct(w.distribution.p5)} / ${formatPct(w.distribution.p95)}`, definition: "The 5th and 95th percentiles of daily simple returns in the window; one day in twenty fell below the first and one in twenty rose above the second." }} />
      </div>
      <Panel>
        <PanelHeader title="Distribution of daily returns" description={`${w.distribution.observations} daily returns · mean ${w.distribution.mean === null ? "n/a" : formatPct(w.distribution.mean, { digits: 2 })} · std dev ${w.distribution.stdev === null ? "n/a" : formatPct(w.distribution.stdev, { digits: 2 })}`} />
        <PanelBody>{w.distribution.observations ? <Histogram bins={w.distribution.bins} observations={w.distribution.observations} height={220} footnote="Negative-return bins are drawn in the loss colour; the printed counts carry the values." /> : <EmptyState title="Not enough data" />}</PanelBody>
      </Panel>
      <Panel>
        <PanelHeader title="How these are measured" />
        <PanelBody>
          <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[180px_1fr]">
            <dt className="text-fg-muted">Observation window</dt>
            <dd className="text-fg-secondary">{windowLabel} ({w.stats.observations} daily returns)</dd>
            <dt className="text-fg-muted">Return type</dt>
            <dd className="text-fg-secondary">{RISK_CONVENTIONS.returnType}{adjustment ? ` (adjusted for ${adjustment === "splits_dividends" ? "splits and dividends" : "splits"})` : " (raw closes)"}</dd>
            <dt className="text-fg-muted">Annualisation</dt>
            <dd className="text-fg-secondary">{RISK_CONVENTIONS.annualization}; {RISK_CONVENTIONS.tradingDaysPerYear} trading days per year</dd>
            <dt className="text-fg-muted">Missing data</dt>
            <dd className="text-fg-secondary">{RISK_CONVENTIONS.missingData}</dd>
            <dt className="text-fg-muted">Minimum sample</dt>
            <dd className="text-fg-secondary">{RISK_CONVENTIONS.minimumObservations} observations; smaller samples are reported as not available</dd>
          </dl>
        </PanelBody>
      </Panel>
    </div>
  );
}
