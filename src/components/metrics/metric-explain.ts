import { METRIC_DEFINITIONS, type MetricValue } from "@/calc/fundamentals";
import { formatCompact, formatMoneyCompact, formatNumber, formatPct } from "@/lib/format";
import type { ExplainDetail } from "./explain-context";

export function formatMetricValue(mv: MetricValue | null | undefined): string {
  if (!mv || mv.value === null) return "n/a";
  switch (mv.unit) {
    case "USD":
      return formatMoneyCompact(mv.value);
    case "shares":
      return formatCompact(mv.value);
    case "USD/share":
      return formatNumber(mv.value, 2);
    case "ratio":
      return formatPct(mv.value);
  }
}

export function periodLabel(mv: MetricValue): string {
  const type = mv.periodType === "ttm" ? "Trailing twelve months" : mv.periodType === "annual" ? "Fiscal year" : mv.periodType === "quarter" ? "Fiscal quarter" : "Balance-sheet date";
  const fiscal = mv.fiscalPeriod && mv.fiscalYear ? ` ${mv.fiscalPeriod} FY${mv.fiscalYear}` : "";
  const range = mv.periodStart ? `${mv.periodStart} to ${mv.periodEnd}` : mv.periodEnd;
  return `${type}${fiscal}: ${range}`;
}

export function metricExplain(mv: MetricValue, options: { symbol?: string; retrievedAt?: string | null } = {}): ExplainDetail {
  const def = METRIC_DEFINITIONS[mv.metric];
  const limitations = [def.limitations].filter(Boolean);
  return {
    title: `${def.label}${options.symbol ? ` · ${options.symbol}` : ""}`,
    value: formatMetricValue(mv),
    definition: def.definition,
    period: periodLabel(mv),
    units: mv.unit === "USD" ? "US dollars, as reported (not inflation adjusted)" : mv.unit === "shares" ? "Shares" : mv.unit === "USD/share" ? "US dollars per share" : "Ratio (shown as a percentage)",
    status: mv.status,
    filedAt: mv.filedAt,
    source: {
      provider: mv.source.provider === "sec-edgar" ? "SEC EDGAR (XBRL company facts)" : mv.source.provider === "demo" ? "Demo dataset (fictional)" : mv.source.provider,
      reference: mv.source.concept ? `${mv.source.concept}${mv.source.accession ? ` · ${mv.source.accession}` : ""}` : mv.source.accession,
      form: mv.source.form,
      derivation: mv.source.derivation ?? null,
      retrievedAt: options.retrievedAt ?? null,
    },
    notes: mv.notes,
    limitations,
  };
}
