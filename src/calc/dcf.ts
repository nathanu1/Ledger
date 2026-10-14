/**
 * Enterprise discounted cash flow on unlevered free cash flow.
 *
 *   FCFF_t = EBIT_t x (1 - tax) + D&A_t - capex_t - dNWC_t
 *   EV     = sum PV(FCFF_t) + PV(terminal value)
 *   TV     = FCFF_N x (1 + g) / (WACC - g)
 *   Equity = EV - debt + cash + other adjustments
 *
 * Operating cash flow minus capex is NOT used as FCFF. End-of-year discounting
 * unless `midYearConvention` is set. Terminal growth must be below WACC.
 * Every output is an assumption-dependent estimate, never a price target.
 */

export interface DcfInputs {
  /** Starting (usually trailing twelve month) revenue in currency units. */
  baseRevenue: number;
  /** Year-by-year revenue growth rates (e.g. 0.08 for 8%). Length sets the forecast horizon. */
  revenueGrowth: number[];
  /** EBIT margin per year, or a single margin applied to every year. */
  operatingMargin: number[] | number;
  taxRate: number;
  /** Depreciation and amortization as a share of revenue. */
  daPctRevenue: number;
  /** Capital expenditure as a share of revenue. */
  capexPctRevenue: number;
  /** Change in net working capital as a share of the change in revenue. */
  nwcPctRevenueChange: number;
  wacc: number;
  terminalGrowth: number;
  cash: number;
  debt: number;
  /** Other equity-bridge adjustments (positive adds to equity: investments; negative subtracts: minority interest, preferred). */
  otherAdjustments: number;
  dilutedShares: number;
  currentPrice?: number | null;
  midYearConvention?: boolean;
}

export interface DcfYear {
  year: number;
  revenue: number;
  growth: number;
  margin: number;
  ebit: number;
  nopat: number;
  da: number;
  capex: number;
  deltaNwc: number;
  fcff: number;
  discountFactor: number;
  presentValue: number;
}

export interface DcfError {
  field: keyof DcfInputs | "general";
  message: string;
}

export interface DcfSuccess {
  ok: true;
  years: DcfYear[];
  sumPvFcff: number;
  terminalValue: number;
  pvTerminalValue: number;
  enterpriseValue: number;
  equityValue: number;
  valuePerShare: number;
  /** PV of terminal value as a share of enterprise value. */
  terminalShareOfEv: number | null;
  impliedUpside: number | null;
  equityNegative: boolean;
  warnings: string[];
  assumptions: string[];
}

export interface DcfFailure {
  ok: false;
  errors: DcfError[];
}

export type DcfResult = DcfSuccess | DcfFailure;

function finite(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

export function validateDcfInputs(inputs: Partial<DcfInputs>): DcfError[] {
  const errors: DcfError[] = [];
  if (!finite(inputs.baseRevenue) || inputs.baseRevenue <= 0) errors.push({ field: "baseRevenue", message: "Starting revenue must be a positive number." });
  if (!Array.isArray(inputs.revenueGrowth) || inputs.revenueGrowth.length < 1 || inputs.revenueGrowth.length > 10 || !inputs.revenueGrowth.every(finite)) {
    errors.push({ field: "revenueGrowth", message: "Provide between 1 and 10 annual growth rates." });
  }
  const margins = Array.isArray(inputs.operatingMargin) ? inputs.operatingMargin : [inputs.operatingMargin];
  if (!margins.every(finite)) errors.push({ field: "operatingMargin", message: "Operating margin must be a number for every forecast year." });
  if (Array.isArray(inputs.operatingMargin) && Array.isArray(inputs.revenueGrowth) && inputs.operatingMargin.length !== inputs.revenueGrowth.length) {
    errors.push({ field: "operatingMargin", message: "Give one operating margin per forecast year, or a single margin." });
  }
  if (!finite(inputs.taxRate) || inputs.taxRate < 0 || inputs.taxRate >= 1) errors.push({ field: "taxRate", message: "Tax rate must be between 0% and 100%." });
  if (!finite(inputs.daPctRevenue) || inputs.daPctRevenue < 0) errors.push({ field: "daPctRevenue", message: "D&A must be zero or more as a share of revenue." });
  if (!finite(inputs.capexPctRevenue) || inputs.capexPctRevenue < 0) errors.push({ field: "capexPctRevenue", message: "Capex must be zero or more as a share of revenue." });
  if (!finite(inputs.nwcPctRevenueChange)) errors.push({ field: "nwcPctRevenueChange", message: "Working-capital intensity must be a number." });
  if (!finite(inputs.wacc) || inputs.wacc <= 0) errors.push({ field: "wacc", message: "WACC must be a positive rate." });
  if (!finite(inputs.terminalGrowth)) errors.push({ field: "terminalGrowth", message: "Terminal growth must be a number." });
  if (finite(inputs.wacc) && finite(inputs.terminalGrowth) && inputs.terminalGrowth >= inputs.wacc) {
    errors.push({ field: "terminalGrowth", message: "Terminal growth must be below WACC; otherwise the terminal value is infinite or negative." });
  }
  if (!finite(inputs.cash) || inputs.cash < 0) errors.push({ field: "cash", message: "Cash must be zero or more." });
  if (!finite(inputs.debt) || inputs.debt < 0) errors.push({ field: "debt", message: "Debt must be zero or more." });
  if (!finite(inputs.otherAdjustments)) errors.push({ field: "otherAdjustments", message: "Other adjustments must be a number." });
  if (!finite(inputs.dilutedShares) || inputs.dilutedShares <= 0) errors.push({ field: "dilutedShares", message: "Diluted shares must be a positive number." });
  return errors;
}

export function runDcf(inputs: DcfInputs): DcfResult {
  const errors = validateDcfInputs(inputs);
  if (errors.length) return { ok: false, errors };
  const n = inputs.revenueGrowth.length;
  const margins = Array.isArray(inputs.operatingMargin) ? inputs.operatingMargin : new Array<number>(n).fill(inputs.operatingMargin);
  const warnings: string[] = [];
  const years: DcfYear[] = [];
  let revenue = inputs.baseRevenue;
  let sumPv = 0;
  for (let i = 0; i < n; i += 1) {
    const prevRevenue = revenue;
    const growth = inputs.revenueGrowth[i];
    revenue = prevRevenue * (1 + growth);
    const margin = margins[i];
    const ebit = revenue * margin;
    const nopat = ebit * (1 - inputs.taxRate);
    const da = revenue * inputs.daPctRevenue;
    const capex = revenue * inputs.capexPctRevenue;
    const deltaNwc = (revenue - prevRevenue) * inputs.nwcPctRevenueChange;
    const fcff = nopat + da - capex - deltaNwc;
    const t = inputs.midYearConvention ? i + 0.5 : i + 1;
    const discountFactor = 1 / Math.pow(1 + inputs.wacc, t);
    const presentValue = fcff * discountFactor;
    sumPv += presentValue;
    years.push({ year: i + 1, revenue, growth, margin, ebit, nopat, da, capex, deltaNwc, fcff, discountFactor, presentValue });
  }
  const lastFcff = years[n - 1].fcff;
  const terminalValue = (lastFcff * (1 + inputs.terminalGrowth)) / (inputs.wacc - inputs.terminalGrowth);
  // Terminal value is discounted from the end of year N even under the mid-year convention.
  const pvTerminalValue = terminalValue / Math.pow(1 + inputs.wacc, n);
  const enterpriseValue = sumPv + pvTerminalValue;
  const equityValue = enterpriseValue - inputs.debt + inputs.cash + inputs.otherAdjustments;
  const valuePerShare = equityValue / inputs.dilutedShares;
  const terminalShareOfEv = enterpriseValue > 0 ? pvTerminalValue / enterpriseValue : null;
  if (lastFcff <= 0) warnings.push("Final-year free cash flow is not positive, so the terminal value is zero or negative; the result is dominated by this assumption.");
  if (terminalShareOfEv !== null && terminalShareOfEv > 0.75) warnings.push("More than 75% of enterprise value sits in the terminal value; the estimate is highly sensitive to WACC and terminal growth.");
  if (equityValue < 0) warnings.push("Debt and other claims exceed enterprise value under these assumptions, so the implied equity value is negative.");
  if (inputs.terminalGrowth > 0.04) warnings.push("Terminal growth above 4% exceeds most long-run nominal GDP estimates.");
  const impliedUpside = inputs.currentPrice && inputs.currentPrice > 0 ? valuePerShare / inputs.currentPrice - 1 : null;
  const assumptions = [
    `Forecast horizon: ${n} years; ${inputs.midYearConvention ? "mid-year" : "end-of-year"} discounting at a ${(inputs.wacc * 100).toFixed(2)}% WACC.`,
    `FCFF = EBIT x (1 - ${(inputs.taxRate * 100).toFixed(1)}% tax) + D&A (${(inputs.daPctRevenue * 100).toFixed(1)}% of revenue) - capex (${(inputs.capexPctRevenue * 100).toFixed(1)}% of revenue) - change in net working capital (${(inputs.nwcPctRevenueChange * 100).toFixed(1)}% of revenue change).`,
    `Terminal value = final FCFF x (1 + ${(inputs.terminalGrowth * 100).toFixed(2)}%) / (WACC - g), discounted from year ${n}.`,
    `Equity bridge: EV - debt (${formatCompact(inputs.debt)}) + cash (${formatCompact(inputs.cash)}) ${inputs.otherAdjustments >= 0 ? "+" : "-"} other adjustments (${formatCompact(Math.abs(inputs.otherAdjustments))}), divided by ${formatCompact(inputs.dilutedShares)} diluted shares.`,
  ];
  return {
    ok: true,
    years,
    sumPvFcff: sumPv,
    terminalValue,
    pvTerminalValue,
    enterpriseValue,
    equityValue,
    valuePerShare,
    terminalShareOfEv,
    impliedUpside,
    equityNegative: equityValue < 0,
    warnings,
    assumptions,
  };
}

function formatCompact(v: number): string {
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(v);
}

export interface SensitivityCell {
  wacc: number;
  terminalGrowth: number;
  valuePerShare: number | null;
  error: string | null;
}

export function sensitivityGrid(inputs: DcfInputs, waccs: readonly number[], growths: readonly number[]): SensitivityCell[][] {
  return waccs.map((wacc) =>
    growths.map((terminalGrowth) => {
      const result = runDcf({ ...inputs, wacc, terminalGrowth });
      if (result.ok) return { wacc, terminalGrowth, valuePerShare: result.valuePerShare, error: null };
      return { wacc, terminalGrowth, valuePerShare: null, error: result.errors.map((e) => e.message).join(" ") };
    }),
  );
}

export type ReverseDcfTarget = "revenueGrowth" | "operatingMargin" | "wacc" | "terminalGrowth";

export const REVERSE_DCF_TARGETS: Record<ReverseDcfTarget, { label: string; description: string }> = {
  revenueGrowth: { label: "Revenue growth", description: "A single annual growth rate applied to every forecast year, holding margins, reinvestment, WACC and terminal growth fixed." },
  operatingMargin: { label: "Operating margin", description: "A single operating margin applied to every forecast year, holding growth, reinvestment, WACC and terminal growth fixed." },
  wacc: { label: "WACC", description: "The discount rate that reproduces the price, holding cash-flow assumptions and terminal growth fixed." },
  terminalGrowth: { label: "Terminal growth", description: "The perpetual growth rate that reproduces the price, holding cash-flow assumptions and WACC fixed." },
};

export type ReverseDcfResult =
  | { ok: true; target: ReverseDcfTarget; value: number; iterations: number; result: DcfSuccess }
  | { ok: false; target: ReverseDcfTarget; reason: string };

function withTarget(inputs: DcfInputs, target: ReverseDcfTarget, x: number): DcfInputs {
  switch (target) {
    case "revenueGrowth":
      return { ...inputs, revenueGrowth: inputs.revenueGrowth.map(() => x) };
    case "operatingMargin":
      return { ...inputs, operatingMargin: x };
    case "wacc":
      return { ...inputs, wacc: x };
    case "terminalGrowth":
      return { ...inputs, terminalGrowth: x };
  }
}

/**
 * Solve for the one assumption that makes value per share equal the target
 * price, holding everything else fixed. Bisection on a bounded interval; the
 * value is monotone in each supported target, so a bracketed root is unique.
 */
export function reverseDcf(inputs: DcfInputs, target: ReverseDcfTarget, targetPrice: number): ReverseDcfResult {
  if (!finite(targetPrice) || targetPrice <= 0) return { ok: false, target, reason: "A positive target price is required." };
  const baseErrors = validateDcfInputs(inputs).filter((e) => e.field !== target);
  if (baseErrors.length) return { ok: false, target, reason: baseErrors.map((e) => e.message).join(" ") };
  let lo: number;
  let hi: number;
  switch (target) {
    case "revenueGrowth":
      lo = -0.5;
      hi = 1.5;
      break;
    case "operatingMargin":
      lo = -0.5;
      hi = 0.9;
      break;
    case "wacc":
      lo = inputs.terminalGrowth + 0.0005;
      hi = 0.6;
      break;
    case "terminalGrowth":
      lo = -0.2;
      hi = inputs.wacc - 0.0005;
      break;
  }
  const f = (x: number): number | null => {
    const r = runDcf(withTarget(inputs, target, x));
    return r.ok ? r.valuePerShare - targetPrice : null;
  };
  const fLo = f(lo);
  const fHi = f(hi);
  if (fLo === null || fHi === null) return { ok: false, target, reason: "The inputs are invalid at the search bounds." };
  if (Math.sign(fLo) === Math.sign(fHi)) {
    return {
      ok: false,
      target,
      reason: `No ${REVERSE_DCF_TARGETS[target].label.toLowerCase()} between ${(lo * 100).toFixed(1)}% and ${(hi * 100).toFixed(1)}% reproduces the price with the other assumptions held fixed.`,
    };
  }
  let a = lo;
  let b = hi;
  let fa = fLo;
  let iterations = 0;
  let mid = (a + b) / 2;
  for (; iterations < 200; iterations += 1) {
    mid = (a + b) / 2;
    const fm = f(mid);
    if (fm === null) return { ok: false, target, reason: "The solver hit invalid inputs." };
    if (Math.abs(fm) < 1e-6 || (b - a) / 2 < 1e-9) break;
    if (Math.sign(fm) === Math.sign(fa)) {
      a = mid;
      fa = fm;
    } else {
      b = mid;
    }
  }
  const result = runDcf(withTarget(inputs, target, mid));
  if (!result.ok) return { ok: false, target, reason: "The solver converged to invalid inputs." };
  return { ok: true, target, value: mid, iterations, result };
}

/** Default scenario multipliers used to seed bear / base / bull cases from a base case. */
export function deriveScenarios(base: DcfInputs): { bear: DcfInputs; base: DcfInputs; bull: DcfInputs } {
  const margins = Array.isArray(base.operatingMargin) ? base.operatingMargin : base.revenueGrowth.map(() => base.operatingMargin as number);
  return {
    bear: {
      ...base,
      revenueGrowth: base.revenueGrowth.map((g) => g - 0.04),
      operatingMargin: margins.map((m) => m - 0.03),
      wacc: base.wacc + 0.01,
      terminalGrowth: Math.min(base.terminalGrowth - 0.005, base.wacc + 0.01 - 0.005),
    },
    base,
    bull: {
      ...base,
      revenueGrowth: base.revenueGrowth.map((g) => g + 0.04),
      operatingMargin: margins.map((m) => m + 0.03),
      wacc: Math.max(base.wacc - 0.01, base.terminalGrowth + 0.005 + 0.01),
      terminalGrowth: base.terminalGrowth + 0.005,
    },
  };
}
