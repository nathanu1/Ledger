import type { MetricKey } from "@/calc/fundamentals";

/** Metrics that thesis review rules can watch. Shared by server code and client forms. */
export const RULE_METRICS: Array<{ key: MetricKey; label: string; unit: "ratio" | "USD" }> = [
  { key: "revenueGrowth", label: "Revenue growth (year over year)", unit: "ratio" },
  { key: "operatingMargin", label: "Operating margin", unit: "ratio" },
  { key: "grossMargin", label: "Gross margin", unit: "ratio" },
  { key: "fcfMargin", label: "Free cash flow margin", unit: "ratio" },
  { key: "netMargin", label: "Net margin", unit: "ratio" },
  { key: "sharesDilutedGrowth", label: "Diluted share count change (year over year)", unit: "ratio" },
  { key: "totalDebt", label: "Total debt", unit: "USD" },
  { key: "netDebt", label: "Net debt", unit: "USD" },
];
