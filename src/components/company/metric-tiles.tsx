import type { MetricValue } from "@/calc/fundamentals";
import type { RatioValue } from "@/calc/ratios";
import { formatMetricValue, metricExplain } from "@/components/metrics/metric-explain";
import { StatTile } from "@/components/metrics/stat-tile";
import { formatMoneyCompact, formatMultiple, formatPct } from "@/lib/format";
import type { CompanyMetrics } from "@/services/metrics";

export function MetricTile({ label, mv, symbol, retrievedAt }: { label: string; mv: MetricValue | null | undefined; symbol: string; retrievedAt?: string | null }) {
  if (!mv) return <StatTile label={label} value={<span className="text-fg-muted">n/a</span>} sub="Not available" tone="muted" />;
  return <StatTile label={label} value={<span className={mv.value === null ? "text-fg-muted" : "num-sans"}>{formatMetricValue(mv)}</span>} sub={mv.value === null ? (mv.notes[0] ?? "Not available") : `${mv.status === "calculated" ? "Calculated · " : ""}${mv.fiscalPeriod && mv.fiscalYear ? (mv.periodType === "ttm" ? "TTM to " : "") + (mv.periodType === "ttm" ? mv.periodEnd : `${mv.fiscalPeriod} FY${mv.fiscalYear}`) : mv.periodEnd}`} explain={metricExplain(mv, { symbol, retrievedAt })} />;
}

const RATIO_DEFS: Record<"pe" | "ps" | "evEbitda" | "fcfYield", { label: string; definition: string; limitations: string[] }> = {
  pe: { label: "Price / earnings", definition: "Latest price divided by trailing-twelve-month diluted earnings per share (trailing net income over the latest diluted share count).", limitations: ["Not meaningful when trailing earnings are zero or negative.", "Uses the latest stored price, which may lag the market."] },
  ps: { label: "Price / sales", definition: "Market capitalisation divided by trailing-twelve-month revenue.", limitations: ["Ignores margins; compare only within similar business models."] },
  evEbitda: { label: "EV / EBITDA", definition: "Enterprise value (market cap + total debt - cash - short-term investments) divided by trailing EBITDA (operating income + depreciation and amortization).", limitations: ["Not meaningful when EBITDA is zero or negative.", "Debt excludes lease liabilities; EBITDA is simplified."] },
  fcfYield: { label: "Free cash flow yield", definition: "Trailing-twelve-month free cash flow (operating cash flow - capex) divided by market capitalisation.", limitations: ["Levered free cash flow; a negative yield is shown as negative."] },
};

export function RatioTile({ kind, value, metrics }: { kind: keyof typeof RATIO_DEFS; value: RatioValue; metrics: CompanyMetrics }) {
  const def = RATIO_DEFS[kind];
  const text = value.kind === "value" ? (kind === "fcfYield" ? formatPct(value.value) : formatMultiple(value.value)) : value.kind === "not_meaningful" ? "Not meaningful" : "n/a";
  return (
    <StatTile
      label={def.label}
      value={<span className={value.kind === "value" ? "num-sans" : "text-[15px] text-fg-muted"}>{text}</span>}
      sub={value.kind === "value" ? `${metrics.basisLabel ?? ""} · price ${metrics.dataDates.price ?? ""}` : value.reason}
      tone={value.kind === "value" ? "default" : "muted"}
      explain={{
        title: `${def.label} · ${metrics.symbol}`,
        value: text,
        definition: def.definition,
        period: metrics.basisLabel ? `Fundamentals: ${metrics.basisLabel}; price as of ${metrics.dataDates.price ?? "n/a"}` : null,
        units: kind === "fcfYield" ? "Percentage" : "Multiple (times)",
        status: "calculated",
        source: { provider: metrics.dataDates.fundamentalsSource === "sec-edgar" ? "SEC EDGAR fundamentals + stored price" : "Demo dataset + stored price", derivation: value.kind !== "value" ? value.reason : ratioDerivation(kind, metrics) },
        limitations: [...def.limitations, ...metrics.sectorProfile.notes.slice(0, 1)],
      }}
    />
  );
}

function ratioDerivation(kind: keyof typeof RATIO_DEFS, m: CompanyMetrics): string {
  const price = m.price?.price ?? null;
  switch (kind) {
    case "pe":
      return `Price ${price === null ? "n/a" : price.toFixed(2)} / trailing diluted EPS ${m.values.epsDiluted?.value?.toFixed(2) ?? "n/a"}.`;
    case "ps":
      return `Market cap ${formatMoneyCompact(m.marketCap)} / trailing revenue ${formatMoneyCompact(m.values.revenue?.value ?? null)}.`;
    case "evEbitda":
      return `EV ${formatMoneyCompact(m.enterpriseValue?.value ?? null)} (market cap ${formatMoneyCompact(m.marketCap)} + debt ${formatMoneyCompact(m.values.totalDebt?.value ?? null)} - cash ${formatMoneyCompact(m.values.cash?.value ?? null)}) / trailing EBITDA ${formatMoneyCompact(m.values.ebitda?.value ?? null)}.`;
    case "fcfYield":
      return `Trailing free cash flow ${formatMoneyCompact(m.values.freeCashFlow?.value ?? null)} / market cap ${formatMoneyCompact(m.marketCap)}.`;
  }
}
