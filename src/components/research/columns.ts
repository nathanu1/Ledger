import type { CompanyMetrics } from "@/services/metrics";
import { formatDate, formatMoney, formatMoneyCompact, formatMultiple, formatPct } from "@/lib/format";

export interface ColumnDefn {
  key: string;
  label: string;
  numeric: boolean;
  /** Raw value used for sorting and filtering. */
  get: (m: CompanyMetrics) => number | string | null;
  /** Display text; the reason is shown when the value is missing. */
  format: (m: CompanyMetrics) => { text: string; reason?: string; negative?: boolean; positive?: boolean };
  group: "price" | "fundamentals" | "valuation" | "research";
}

const ratioCol = (key: "pe" | "ps" | "evEbitda" | "fcfYield", label: string, pct = false): ColumnDefn => ({
  key,
  label,
  numeric: true,
  group: "valuation",
  get: (m) => (m.ratios[key].kind === "value" ? m.ratios[key].value : null),
  format: (m) => {
    const r = m.ratios[key];
    if (r.kind === "value") return { text: pct ? formatPct(r.value) : formatMultiple(r.value), negative: r.value < 0 };
    return { text: r.kind === "not_meaningful" ? "NM" : "n/a", reason: r.reason };
  },
});

const metricCol = (key: keyof CompanyMetrics["values"], label: string, kind: "money" | "pct", group: ColumnDefn["group"] = "fundamentals"): ColumnDefn => ({
  key,
  label,
  numeric: true,
  group,
  get: (m) => m.values[key]?.value ?? null,
  format: (m) => {
    const mv = m.values[key];
    if (!mv || mv.value === null) return { text: "n/a", reason: mv?.notes[0] ?? "Not available" };
    return { text: kind === "money" ? formatMoneyCompact(mv.value) : formatPct(mv.value), negative: mv.value < 0 };
  },
});

export const COLUMNS: ColumnDefn[] = [
  { key: "price", label: "Price", numeric: true, group: "price", get: (m) => m.price?.price ?? null, format: (m) => (m.price ? { text: formatMoney(m.price.price) } : { text: "n/a", reason: "No price stored" }) },
  { key: "changePct", label: "Day", numeric: true, group: "price", get: (m) => m.price?.changePct ?? null, format: (m) => (m.price?.changePct === null || m.price?.changePct === undefined ? { text: "n/a" } : { text: formatPct(m.price.changePct, { signed: true, digits: 2 }), negative: m.price.changePct < 0, positive: m.price.changePct > 0 }) },
  { key: "marketCap", label: "Market cap", numeric: true, group: "price", get: (m) => m.marketCap, format: (m) => (m.marketCap === null ? { text: "n/a", reason: "Needs a price and a share count" } : { text: formatMoneyCompact(m.marketCap) }) },
  metricCol("revenue", "Revenue (TTM)", "money"),
  metricCol("revenueGrowth", "Rev growth", "pct"),
  metricCol("grossMargin", "Gross margin", "pct"),
  metricCol("operatingMargin", "Op margin", "pct"),
  metricCol("fcfMargin", "FCF margin", "pct"),
  metricCol("freeCashFlow", "FCF (TTM)", "money"),
  ratioCol("fcfYield", "FCF yield", true),
  ratioCol("pe", "P/E"),
  ratioCol("ps", "P/S"),
  ratioCol("evEbitda", "EV/EBITDA"),
  metricCol("netDebt", "Net debt", "money"),
  metricCol("totalDebt", "Total debt", "money"),
  metricCol("sharesDilutedGrowth", "Dilution", "pct"),
  { key: "nextEarnings", label: "Next earnings", numeric: false, group: "research", get: (m) => m.nextEarnings?.date ?? null, format: (m) => (m.nextEarnings ? { text: `${formatDate(m.nextEarnings.date)} (${m.nextEarnings.status === "confirmed" ? "confirmed" : "est."})` } : { text: "n/a" }) },
  { key: "thesisStatus", label: "Thesis", numeric: false, group: "research", get: (m) => m.thesisStatus, format: (m) => ({ text: m.thesisStatus ? m.thesisStatus.charAt(0).toUpperCase() + m.thesisStatus.slice(1) : "none" }) },
  { key: "sector", label: "Sector", numeric: false, group: "research", get: (m) => m.sector, format: (m) => ({ text: m.sector ?? "n/a" }) },
  { key: "dataDate", label: "Fundamentals through", numeric: false, group: "research", get: (m) => m.dataDates.fundamentalsPeriodEnd, format: (m) => (m.dataDates.fundamentalsPeriodEnd ? { text: `${m.basisLabel ?? ""}` } : { text: "none" }) },
];

export const DEFAULT_COLUMNS = ["price", "changePct", "marketCap", "revenueGrowth", "grossMargin", "operatingMargin", "fcfYield", "pe", "netDebt", "nextEarnings", "thesisStatus"];

export const COLUMN_MAP = new Map(COLUMNS.map((c) => [c.key, c]));
