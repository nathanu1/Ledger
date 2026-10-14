/**
 * Valuation multiples and growth helpers. Every ratio returns a tagged value so
 * the interface can show "Not meaningful" or "Unavailable" with a reason instead
 * of a misleading number.
 */
import type { MetricKey } from "./fundamentals";

export type RatioValue =
  | { kind: "value"; value: number }
  | { kind: "not_meaningful"; reason: string }
  | { kind: "unavailable"; reason: string };

export function ratioValue(v: RatioValue): number | null {
  return v.kind === "value" ? v.value : null;
}

export function priceToEarnings(price: number | null, ttmEps: number | null): RatioValue {
  if (price === null || ttmEps === null) return { kind: "unavailable", reason: price === null ? "No price." : "No trailing diluted EPS." };
  if (ttmEps <= 0) return { kind: "not_meaningful", reason: "Trailing earnings are zero or negative." };
  return { kind: "value", value: price / ttmEps };
}

export function priceToSales(marketCap: number | null, ttmRevenue: number | null): RatioValue {
  if (marketCap === null || ttmRevenue === null) return { kind: "unavailable", reason: marketCap === null ? "No market capitalisation." : "No trailing revenue." };
  if (ttmRevenue <= 0) return { kind: "not_meaningful", reason: "Trailing revenue is zero or negative." };
  return { kind: "value", value: marketCap / ttmRevenue };
}

export interface EnterpriseValue {
  value: number | null;
  marketCap: number | null;
  totalDebt: number | null;
  cash: number | null;
  shortTermInvestments: number | null;
  reason?: string;
}

export function enterpriseValue(params: {
  marketCap: number | null;
  totalDebt: number | null;
  cash: number | null;
  shortTermInvestments: number | null;
}): EnterpriseValue {
  const { marketCap, totalDebt, cash, shortTermInvestments } = params;
  if (marketCap === null) return { ...params, value: null, reason: "No market capitalisation." };
  if (totalDebt === null) return { ...params, value: null, reason: "Total debt is not available, so enterprise value cannot be computed." };
  if (cash === null) return { ...params, value: null, reason: "Cash is not available, so enterprise value cannot be computed." };
  return { ...params, value: marketCap + totalDebt - cash - (shortTermInvestments ?? 0) };
}

export function evToEbitda(ev: number | null, ttmEbitda: number | null): RatioValue {
  if (ev === null || ttmEbitda === null) return { kind: "unavailable", reason: ev === null ? "Enterprise value is not available." : "Trailing EBITDA is not available." };
  if (ttmEbitda <= 0) return { kind: "not_meaningful", reason: "Trailing EBITDA is zero or negative." };
  return { kind: "value", value: ev / ttmEbitda };
}

/** Free cash flow yield can be negative; that is meaningful and shown as such. */
export function fcfYield(ttmFcf: number | null, marketCap: number | null): RatioValue {
  if (ttmFcf === null || marketCap === null) return { kind: "unavailable", reason: ttmFcf === null ? "Trailing free cash flow is not available." : "No market capitalisation." };
  if (marketCap <= 0) return { kind: "not_meaningful", reason: "Market capitalisation is not positive." };
  return { kind: "value", value: ttmFcf / marketCap };
}

export function marketCap(price: number | null, shares: number | null): number | null {
  if (price === null || shares === null || shares <= 0) return null;
  return price * shares;
}

/**
 * Compound annual growth rate. Only meaningful when both endpoints are positive
 * and the span is at least one year; a sign change or a zero start makes the
 * figure uninterpretable.
 */
export function cagr(startValue: number | null, endValue: number | null, years: number): RatioValue {
  if (startValue === null || endValue === null) return { kind: "unavailable", reason: "Start or end value is missing." };
  if (years < 1) return { kind: "not_meaningful", reason: "The span is shorter than one year." };
  if (startValue <= 0 || endValue <= 0) return { kind: "not_meaningful", reason: "CAGR needs positive start and end values." };
  return { kind: "value", value: Math.pow(endValue / startValue, 1 / years) - 1 };
}

export type SectorFamily = "bank" | "insurer" | "reit" | "utility" | "general";

export interface SectorProfile {
  family: SectorFamily;
  label: string;
  notes: string[];
  /** Metrics whose standard interpretation does not apply. */
  limitedMetrics: MetricKey[];
  /** Ratios that should be labelled as not comparable. */
  limitedRatios: Array<"pe" | "ps" | "evEbitda" | "fcfYield">;
  dcfSupported: boolean;
}

export function sectorProfile(sector: string | null | undefined, industry?: string | null): SectorProfile {
  const s = `${sector ?? ""} ${industry ?? ""}`.toLowerCase();
  if (/\bbank|banking|thrift|savings institution|credit/.test(s)) {
    return {
      family: "bank",
      label: "Bank",
      notes: [
        "Banks report net interest income rather than revenue and cost of goods; gross margin, EBITDA, EV/EBITDA and free cash flow are not comparable to industrial companies.",
        "Debt is part of a bank's operations, so net debt and enterprise value are not meaningful.",
        "Ledger does not compute bank-specific measures such as net interest margin or CET1; treat them as unsupported.",
      ],
      limitedMetrics: ["grossProfit", "grossMargin", "ebitda", "freeCashFlow", "fcfMargin", "netDebt", "totalDebt", "capex"],
      limitedRatios: ["evEbitda", "fcfYield", "ps"],
      dcfSupported: false,
    };
  }
  if (/insur|reinsur|assurance/.test(s)) {
    return {
      family: "insurer",
      label: "Insurer",
      notes: [
        "Insurers earn premiums and investment income; margins, EBITDA and free cash flow follow different conventions and are not comparable.",
        "Combined ratio, reserves and float are not computed by Ledger; treat them as unsupported.",
      ],
      limitedMetrics: ["grossProfit", "grossMargin", "ebitda", "freeCashFlow", "fcfMargin", "netDebt", "capex"],
      limitedRatios: ["evEbitda", "fcfYield"],
      dcfSupported: false,
    };
  }
  if (/\breit\b|real estate investment trust/.test(s)) {
    return {
      family: "reit",
      label: "REIT",
      notes: [
        "REITs are usually valued on funds from operations (FFO) and net asset value, which Ledger does not compute; P/E and free cash flow understate distributable cash because of depreciation.",
      ],
      limitedMetrics: ["netIncome", "epsDiluted", "netMargin", "freeCashFlow", "fcfMargin"],
      limitedRatios: ["pe", "fcfYield"],
      dcfSupported: false,
    };
  }
  if (/utilit|electric|gas distribution|water/.test(s)) {
    return {
      family: "utility",
      label: "Utility",
      notes: ["Regulated utilities carry structural debt and heavy capex; free cash flow is often negative by design and net debt should be read against the rate base."],
      limitedMetrics: ["freeCashFlow", "fcfMargin"],
      limitedRatios: ["fcfYield"],
      dcfSupported: true,
    };
  }
  return { family: "general", label: "Operating company", notes: [], limitedMetrics: [], limitedRatios: [], dcfSupported: true };
}
