/**
 * Fundamentals normalization.
 *
 * Takes raw XBRL-style facts (as published in SEC companyfacts, or produced by
 * the demo generator in the same shape) and builds annual, quarterly and
 * trailing-twelve-month statements with provenance on every value.
 *
 * Handles: concept fallbacks across taxonomy changes, duplicate facts across
 * filings, restatements (latest value displayed, first availability date kept),
 * cumulative year-to-date cash-flow reporting in 10-Qs (standalone quarters are
 * derived only from facts that share the same fiscal-year start), and TTM
 * construction only from four consecutive non-overlapping quarters.
 *
 * Missing values are null. They are never zero.
 */
import { daysBetween, addDays } from "./dates";
import type { ISODate } from "./types";

export type ReportedMetricKey =
  | "revenue"
  | "costOfRevenue"
  | "grossProfit"
  | "operatingIncome"
  | "netIncome"
  | "epsDiluted"
  | "operatingCashFlow"
  | "capex"
  | "depreciationAmortization"
  | "stockBasedCompensation"
  | "cash"
  | "shortTermInvestments"
  | "sharesDiluted"
  | "sharesOutstanding"
  | "incomeTaxExpense"
  | "pretaxIncome"
  | "interestExpense"
  | "currentAssets"
  | "currentLiabilities"
  | "totalAssets"
  | "totalEquity";

export type CalculatedMetricKey =
  | "totalDebt"
  | "freeCashFlow"
  | "grossMargin"
  | "operatingMargin"
  | "netMargin"
  | "fcfMargin"
  | "ebitda"
  | "netDebt"
  | "revenueGrowth"
  | "sharesDilutedGrowth"
  | "effectiveTaxRate"
  | "netWorkingCapital";

export type MetricKey = ReportedMetricKey | CalculatedMetricKey;

export type MetricUnit = "USD" | "shares" | "USD/share" | "ratio";

export type FiscalPeriod = "FY" | "Q1" | "Q2" | "Q3" | "Q4";

export interface RawFact {
  /** XBRL concept, with or without taxonomy prefix (e.g. "us-gaap:Revenues"). */
  concept: string;
  unit: string;
  value: number;
  /** null for instant (balance-sheet) facts. */
  start: ISODate | null;
  end: ISODate;
  fy: number | null;
  fp: string | null;
  form: string;
  filed: ISODate;
  accession: string;
}

export interface MetricSource {
  provider: string;
  concept: string | null;
  accession: string | null;
  form: string | null;
  /** Human-readable derivation for calculated values. */
  derivation?: string;
}

export interface MetricValue {
  metric: MetricKey;
  value: number | null;
  unit: MetricUnit;
  status: "reported" | "calculated" | "unavailable";
  periodType: "annual" | "quarter" | "ttm" | "instant";
  periodStart: ISODate | null;
  periodEnd: ISODate;
  fiscalYear: number | null;
  fiscalPeriod: FiscalPeriod | null;
  /** Date the value first became publicly available (earliest filing containing it). */
  filedAt: ISODate | null;
  /** Filing date of the displayed (latest) value when it differs from filedAt. */
  latestFiledAt: ISODate | null;
  restated: boolean;
  source: MetricSource;
  notes: string[];
}

export interface StatementPeriod {
  periodType: "annual" | "quarter" | "ttm";
  fiscalYear: number | null;
  fiscalPeriod: FiscalPeriod | null;
  periodStart: ISODate | null;
  periodEnd: ISODate;
  /** Availability of the period as a whole (latest first-filing date among its values). */
  filedAt: ISODate | null;
  label: string;
  metrics: Partial<Record<MetricKey, MetricValue>>;
}

export interface NormalizedFinancials {
  provider: string;
  annual: StatementPeriod[];
  quarterly: StatementPeriod[];
  ttm: StatementPeriod | null;
  warnings: string[];
}

export const METRIC_DEFINITIONS: Record<
  MetricKey,
  { label: string; unit: MetricUnit; kind: "flow" | "instant" | "ratio"; definition: string; limitations: string }
> = {
  revenue: {
    label: "Revenue",
    unit: "USD",
    kind: "flow",
    definition: "Total revenue as reported (Revenues, or revenue from contracts with customers).",
    limitations: "Concept names changed in 2018 (ASC 606); comparability across that boundary depends on the filer.",
  },
  costOfRevenue: {
    label: "Cost of revenue",
    unit: "USD",
    kind: "flow",
    definition: "Cost of goods and services sold as reported.",
    limitations: "Some filers include depreciation in cost of revenue, others do not.",
  },
  grossProfit: {
    label: "Gross profit",
    unit: "USD",
    kind: "flow",
    definition: "Reported gross profit, or revenue minus cost of revenue when not reported.",
    limitations: "Not meaningful for banks and insurers, which do not report cost of revenue.",
  },
  operatingIncome: {
    label: "Operating income",
    unit: "USD",
    kind: "flow",
    definition: "Operating income (loss) as reported.",
    limitations: "Includes one-off items the filer classifies as operating.",
  },
  netIncome: {
    label: "Net income",
    unit: "USD",
    kind: "flow",
    definition: "Net income (loss) attributable to the parent.",
    limitations: "Affected by tax items, discontinued operations and other non-recurring effects.",
  },
  epsDiluted: {
    label: "Diluted EPS",
    unit: "USD/share",
    kind: "flow",
    definition: "Diluted earnings per share as reported.",
    limitations: "Quarterly EPS values do not sum exactly to annual EPS because share counts change.",
  },
  operatingCashFlow: {
    label: "Operating cash flow",
    unit: "USD",
    kind: "flow",
    definition: "Net cash provided by (used in) operating activities.",
    limitations: "10-Q cash-flow statements are cumulative; standalone quarters are derived by differencing.",
  },
  capex: {
    label: "Capital expenditure",
    unit: "USD",
    kind: "flow",
    definition: "Payments to acquire property, plant and equipment. Shown as a positive outflow.",
    limitations: "Excludes capitalised software and acquisitions unless the filer includes them.",
  },
  depreciationAmortization: {
    label: "Depreciation and amortization",
    unit: "USD",
    kind: "flow",
    definition: "Depreciation, depletion and amortization from the cash-flow statement.",
    limitations: "Concept coverage varies; some filers report only depreciation.",
  },
  stockBasedCompensation: {
    label: "Stock-based compensation",
    unit: "USD",
    kind: "flow",
    definition: "Share-based compensation expense (non-cash) from the cash-flow statement.",
    limitations: "Not reported by every filer.",
  },
  cash: {
    label: "Cash and equivalents",
    unit: "USD",
    kind: "instant",
    definition: "Cash and cash equivalents at period end.",
    limitations: "Excludes marketable securities unless the filer combines them.",
  },
  shortTermInvestments: {
    label: "Short-term investments",
    unit: "USD",
    kind: "instant",
    definition: "Current marketable securities at period end.",
    limitations: "Not every filer reports this line.",
  },
  totalDebt: {
    label: "Total debt",
    unit: "USD",
    kind: "instant",
    definition: "Sum of reported debt components (long-term debt, current maturities, commercial paper, short-term borrowings).",
    limitations: "Calculated from available components; excludes lease liabilities. Component coverage varies by filer.",
  },
  sharesDiluted: {
    label: "Diluted shares (weighted)",
    unit: "shares",
    kind: "flow",
    definition: "Weighted-average diluted shares outstanding for the period.",
    limitations: "A period average, not the point-in-time count.",
  },
  sharesOutstanding: {
    label: "Shares outstanding",
    unit: "shares",
    kind: "instant",
    definition: "Common shares outstanding as of the cover-page date of the filing.",
    limitations: "Cover-page date differs from the balance-sheet date.",
  },
  incomeTaxExpense: {
    label: "Income tax expense",
    unit: "USD",
    kind: "flow",
    definition: "Income tax expense (benefit).",
    limitations: "Includes deferred taxes and one-off items.",
  },
  pretaxIncome: {
    label: "Pre-tax income",
    unit: "USD",
    kind: "flow",
    definition: "Income from continuing operations before income taxes.",
    limitations: "Concept coverage varies.",
  },
  interestExpense: {
    label: "Interest expense",
    unit: "USD",
    kind: "flow",
    definition: "Interest expense as reported.",
    limitations: "For banks this is an operating cost, not a financing cost.",
  },
  currentAssets: {
    label: "Current assets",
    unit: "USD",
    kind: "instant",
    definition: "Total current assets at period end.",
    limitations: "Not reported by filers using unclassified balance sheets (banks, insurers).",
  },
  currentLiabilities: {
    label: "Current liabilities",
    unit: "USD",
    kind: "instant",
    definition: "Total current liabilities at period end.",
    limitations: "Not reported by filers using unclassified balance sheets.",
  },
  totalAssets: {
    label: "Total assets",
    unit: "USD",
    kind: "instant",
    definition: "Total assets at period end.",
    limitations: "",
  },
  totalEquity: {
    label: "Shareholders' equity",
    unit: "USD",
    kind: "instant",
    definition: "Total stockholders' equity at period end.",
    limitations: "Can be negative after large buybacks; book value is then not meaningful.",
  },
  freeCashFlow: {
    label: "Free cash flow",
    unit: "USD",
    kind: "flow",
    definition: "Operating cash flow minus capital expenditure (capex normalised to a positive outflow).",
    limitations: "Levered, simple definition. Not the unlevered FCFF used in the DCF.",
  },
  grossMargin: {
    label: "Gross margin",
    unit: "ratio",
    kind: "ratio",
    definition: "Gross profit divided by revenue.",
    limitations: "Not meaningful for banks and insurers.",
  },
  operatingMargin: {
    label: "Operating margin",
    unit: "ratio",
    kind: "ratio",
    definition: "Operating income divided by revenue.",
    limitations: "Requires positive revenue.",
  },
  netMargin: {
    label: "Net margin",
    unit: "ratio",
    kind: "ratio",
    definition: "Net income divided by revenue.",
    limitations: "Requires positive revenue.",
  },
  fcfMargin: {
    label: "Free cash flow margin",
    unit: "ratio",
    kind: "ratio",
    definition: "Free cash flow divided by revenue.",
    limitations: "Requires positive revenue.",
  },
  ebitda: {
    label: "EBITDA",
    unit: "USD",
    kind: "flow",
    definition: "Operating income plus depreciation and amortization.",
    limitations: "Simplified: does not add back other non-cash items.",
  },
  netDebt: {
    label: "Net debt",
    unit: "USD",
    kind: "instant",
    definition: "Total debt minus cash and short-term investments.",
    limitations: "Negative net debt means a net cash position. Excludes leases.",
  },
  revenueGrowth: {
    label: "Revenue growth",
    unit: "ratio",
    kind: "ratio",
    definition: "Change versus the same period a year earlier.",
    limitations: "Requires a positive comparable period; affected by acquisitions and divestitures.",
  },
  sharesDilutedGrowth: {
    label: "Diluted share change",
    unit: "ratio",
    kind: "ratio",
    definition: "Change in weighted diluted shares versus the same period a year earlier. Positive means dilution.",
    limitations: "Weighted averages lag buybacks and issuance.",
  },
  effectiveTaxRate: {
    label: "Effective tax rate",
    unit: "ratio",
    kind: "ratio",
    definition: "Income tax expense divided by pre-tax income.",
    limitations: "Requires positive pre-tax income; distorted by one-off tax items.",
  },
  netWorkingCapital: {
    label: "Net working capital",
    unit: "USD",
    kind: "instant",
    definition: "Current assets minus current liabilities (includes cash and short-term debt).",
    limitations: "A simple definition; the DCF uses the change in this figure as a cash-flow adjustment input.",
  },
};

/** Concept fallbacks, in priority order. Unit tells which XBRL unit applies. */
const CONCEPTS: Record<ReportedMetricKey, { unit: MetricUnit; xbrlUnits: string[]; concepts: string[] }> = {
  revenue: {
    unit: "USD",
    xbrlUnits: ["USD"],
    concepts: [
      "Revenues",
      "RevenueFromContractWithCustomerExcludingAssessedTax",
      "RevenueFromContractWithCustomerIncludingAssessedTax",
      "SalesRevenueNet",
      "SalesRevenueGoodsNet",
      "SalesRevenueServicesNet",
      "RevenuesNetOfInterestExpense",
    ],
  },
  costOfRevenue: {
    unit: "USD",
    xbrlUnits: ["USD"],
    concepts: [
      "CostOfRevenue",
      "CostOfGoodsAndServicesSold",
      "CostOfGoodsSold",
      "CostOfServices",
      "CostOfGoodsAndServiceExcludingDepreciationDepletionAndAmortization",
    ],
  },
  grossProfit: { unit: "USD", xbrlUnits: ["USD"], concepts: ["GrossProfit"] },
  operatingIncome: { unit: "USD", xbrlUnits: ["USD"], concepts: ["OperatingIncomeLoss"] },
  netIncome: {
    unit: "USD",
    xbrlUnits: ["USD"],
    concepts: ["NetIncomeLoss", "ProfitLoss", "NetIncomeLossAvailableToCommonStockholdersBasic", "IncomeLossFromContinuingOperations"],
  },
  epsDiluted: { unit: "USD/share", xbrlUnits: ["USD/shares"], concepts: ["EarningsPerShareDiluted", "EarningsPerShareBasicAndDiluted"] },
  operatingCashFlow: {
    unit: "USD",
    xbrlUnits: ["USD"],
    concepts: ["NetCashProvidedByUsedInOperatingActivities", "NetCashProvidedByUsedInOperatingActivitiesContinuingOperations"],
  },
  capex: {
    unit: "USD",
    xbrlUnits: ["USD"],
    concepts: [
      "PaymentsToAcquirePropertyPlantAndEquipment",
      "PaymentsToAcquireProductiveAssets",
      "PaymentsForCapitalImprovements",
      "PaymentsToAcquireOtherPropertyPlantAndEquipment",
    ],
  },
  depreciationAmortization: {
    unit: "USD",
    xbrlUnits: ["USD"],
    concepts: [
      "DepreciationDepletionAndAmortization",
      "DepreciationAndAmortization",
      "DepreciationAmortizationAndAccretionNet",
      "DepreciationAmortizationAndOther",
      "Depreciation",
    ],
  },
  stockBasedCompensation: {
    unit: "USD",
    xbrlUnits: ["USD"],
    concepts: ["ShareBasedCompensation", "AllocatedShareBasedCompensationExpense", "StockOptionPlanExpense"],
  },
  cash: {
    unit: "USD",
    xbrlUnits: ["USD"],
    concepts: [
      "CashAndCashEquivalentsAtCarryingValue",
      "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents",
      "Cash",
      "CashAndDueFromBanks",
    ],
  },
  shortTermInvestments: {
    unit: "USD",
    xbrlUnits: ["USD"],
    concepts: ["MarketableSecuritiesCurrent", "ShortTermInvestments", "AvailableForSaleSecuritiesDebtSecuritiesCurrent", "AvailableForSaleSecuritiesCurrent"],
  },
  sharesDiluted: {
    unit: "shares",
    xbrlUnits: ["shares"],
    concepts: ["WeightedAverageNumberOfDilutedSharesOutstanding", "WeightedAverageNumberOfShareOutstandingBasicAndDiluted"],
  },
  sharesOutstanding: { unit: "shares", xbrlUnits: ["shares"], concepts: ["EntityCommonStockSharesOutstanding", "CommonStockSharesOutstanding"] },
  incomeTaxExpense: { unit: "USD", xbrlUnits: ["USD"], concepts: ["IncomeTaxExpenseBenefit"] },
  pretaxIncome: {
    unit: "USD",
    xbrlUnits: ["USD"],
    concepts: [
      "IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest",
      "IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments",
      "IncomeLossFromContinuingOperationsBeforeIncomeTaxesDomestic",
    ],
  },
  interestExpense: { unit: "USD", xbrlUnits: ["USD"], concepts: ["InterestExpense", "InterestExpenseNonoperating", "InterestExpenseDebt"] },
  currentAssets: { unit: "USD", xbrlUnits: ["USD"], concepts: ["AssetsCurrent"] },
  currentLiabilities: { unit: "USD", xbrlUnits: ["USD"], concepts: ["LiabilitiesCurrent"] },
  totalAssets: { unit: "USD", xbrlUnits: ["USD"], concepts: ["Assets"] },
  totalEquity: {
    unit: "USD",
    xbrlUnits: ["USD"],
    concepts: ["StockholdersEquity", "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest"],
  },
};

/** Debt is assembled from mutually exclusive component sets, first complete set wins. */
const DEBT_COMPONENT_SETS: string[][] = [
  ["LongTermDebtNoncurrent", "LongTermDebtCurrent", "CommercialPaper", "ShortTermBorrowings"],
  ["LongTermDebt", "CommercialPaper", "ShortTermBorrowings"],
  ["LongTermDebtNoncurrent", "DebtCurrent"],
  ["LongTermDebtAndCapitalLeaseObligations", "LongTermDebtAndCapitalLeaseObligationsCurrent"],
  ["LongTermDebtNoncurrent"],
  ["LongTermDebt"],
];
/** Components that must exist for a set to count (the rest are optional add-ons). */
const DEBT_REQUIRED: Record<string, boolean> = {
  LongTermDebtNoncurrent: true,
  LongTermDebt: true,
  LongTermDebtAndCapitalLeaseObligations: true,
};

const ANNUAL_FORMS = new Set(["10-K", "10-K/A", "10-KT", "20-F", "40-F"]);
const QUARTERLY_FORMS = new Set(["10-Q", "10-Q/A", "10-QT"]);

/** Every XBRL concept the normaliser can use; providers may filter facts to this set. */
export function relevantConcepts(): string[] {
  const set = new Set<string>();
  for (const spec of Object.values(CONCEPTS)) for (const c of spec.concepts) set.add(c);
  for (const group of DEBT_COMPONENT_SETS) for (const c of group) set.add(c);
  return [...set];
}

export function stripTaxonomy(concept: string): string {
  const idx = concept.indexOf(":");
  return idx >= 0 ? concept.slice(idx + 1) : concept;
}

type DurationClass = "quarter" | "half" | "nine" | "annual" | "other";

export function classifyDuration(start: ISODate | null, end: ISODate): DurationClass {
  if (!start) return "other";
  const days = daysBetween(start, end) + 1;
  if (days >= 75 && days <= 100) return "quarter";
  if (days >= 170 && days <= 195) return "half";
  if (days >= 260 && days <= 290) return "nine";
  if (days >= 350 && days <= 380) return "annual";
  return "other";
}

interface FactGroup {
  concept: string;
  start: ISODate | null;
  end: ISODate;
  /** Fact providing the displayed value (latest filed). */
  latest: RawFact;
  /** Earliest filing containing this period's value. */
  first: RawFact;
  restated: boolean;
}

function groupFacts(facts: RawFact[]): FactGroup[] {
  const map = new Map<string, FactGroup>();
  for (const f of facts) {
    const key = `${f.concept}|${f.start ?? ""}|${f.end}`;
    const g = map.get(key);
    if (!g) {
      map.set(key, { concept: f.concept, start: f.start, end: f.end, latest: f, first: f, restated: false });
      continue;
    }
    if (f.filed > g.latest.filed || (f.filed === g.latest.filed && f.accession > g.latest.accession)) g.latest = f;
    if (f.filed < g.first.filed || (f.filed === g.first.filed && f.accession < g.first.accession)) g.first = f;
  }
  for (const g of map.values()) {
    const tolerance = Math.max(Math.abs(g.latest.value) * 1e-6, 1e-6);
    g.restated = Math.abs(g.latest.value - g.first.value) > tolerance;
  }
  return [...map.values()];
}

interface MetricPick {
  group: FactGroup;
  concept: string;
  /** Earliest filing in which this period's value appeared under any candidate concept. */
  earliestFiled: ISODate;
}

function pickMetricGroups(byConcept: Map<string, FactGroup[]>, metric: ReportedMetricKey, predicate: (g: FactGroup) => boolean): Map<string, MetricPick> {
  // Per period, the highest-priority concept that has a fact wins; availability is the
  // earliest filing under any candidate concept (taxonomy renames must not hide history).
  const out = new Map<string, MetricPick>();
  const spec = CONCEPTS[metric];
  for (const concept of spec.concepts) {
    const groups = byConcept.get(concept);
    if (!groups) continue;
    for (const g of groups) {
      if (!spec.xbrlUnits.includes(g.latest.unit)) continue;
      if (!predicate(g)) continue;
      const key = `${g.start ?? ""}|${g.end}`;
      const existing = out.get(key);
      if (!existing) out.set(key, { group: g, concept, earliestFiled: g.first.filed });
      else if (g.first.filed < existing.earliestFiled) existing.earliestFiled = g.first.filed;
    }
  }
  return out;
}

/** Fiscal year / period labels per (start,end) period from the earliest filing that reported it, across all concepts. */
function buildPeriodLabels(groups: readonly FactGroup[]): Map<string, { fy: number | null; fp: string | null; filed: ISODate; form: string }> {
  const map = new Map<string, { fy: number | null; fp: string | null; filed: ISODate; form: string }>();
  for (const g of groups) {
    const key = `${g.start ?? ""}|${g.end}`;
    const cur = map.get(key);
    if (!cur || g.first.filed < cur.filed) map.set(key, { fy: g.first.fy, fp: g.first.fp, filed: g.first.filed, form: g.first.form });
  }
  return map;
}

function metricFromGroup(
  metric: MetricKey,
  unit: MetricUnit,
  g: FactGroup,
  concept: string,
  periodType: MetricValue["periodType"],
  fiscal: { fiscalYear: number | null; fiscalPeriod: FiscalPeriod | null },
  provider: string,
  notes: string[] = [],
  earliestFiled: ISODate = g.first.filed,
): MetricValue {
  const allNotes = [...notes];
  if (earliestFiled < g.first.filed) {
    allNotes.push(`First reported on ${earliestFiled} under an earlier concept name; the value shown uses ${concept}.`);
  }
  if (g.restated) {
    allNotes.push(
      `Restated: first reported as ${formatNumber(g.first.value)} on ${g.first.filed}; the value shown comes from the filing of ${g.latest.filed}.`,
    );
  }
  return {
    metric,
    value: g.latest.value,
    unit,
    status: "reported",
    periodType,
    periodStart: g.start,
    periodEnd: g.end,
    fiscalYear: fiscal.fiscalYear,
    fiscalPeriod: fiscal.fiscalPeriod,
    filedAt: earliestFiled,
    latestFiledAt: g.latest.filed !== earliestFiled ? g.latest.filed : null,
    restated: g.restated,
    source: { provider, concept, accession: g.latest.accession, form: g.latest.form },
    notes: allNotes,
  };
}

function calculated(
  metric: MetricKey,
  unit: MetricUnit,
  value: number | null,
  periodType: MetricValue["periodType"],
  period: { periodStart: ISODate | null; periodEnd: ISODate; fiscalYear: number | null; fiscalPeriod: FiscalPeriod | null; filedAt: ISODate | null },
  provider: string,
  derivation: string,
  notes: string[] = [],
): MetricValue {
  return {
    metric,
    value,
    unit,
    status: value === null ? "unavailable" : "calculated",
    periodType,
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
    fiscalYear: period.fiscalYear,
    fiscalPeriod: period.fiscalPeriod,
    filedAt: period.filedAt,
    latestFiledAt: null,
    restated: false,
    source: { provider, concept: null, accession: null, form: null, derivation },
    notes,
  };
}

function formatNumber(v: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(v);
}

function fiscalPeriodOf(fp: string | null): FiscalPeriod | null {
  if (!fp) return null;
  const u = fp.toUpperCase();
  if (u === "FY" || u === "Q1" || u === "Q2" || u === "Q3" || u === "Q4") return u;
  return null;
}

function laterDate(a: ISODate | null, b: ISODate | null): ISODate | null {
  if (!a) return b;
  if (!b) return a;
  return a > b ? a : b;
}

const FLOW_METRICS: ReportedMetricKey[] = [
  "revenue",
  "costOfRevenue",
  "grossProfit",
  "operatingIncome",
  "netIncome",
  "epsDiluted",
  "operatingCashFlow",
  "capex",
  "depreciationAmortization",
  "stockBasedCompensation",
  "sharesDiluted",
  "incomeTaxExpense",
  "pretaxIncome",
  "interestExpense",
];

/** Flow metrics that can be derived by differencing cumulative periods. */
const DIFFERENCEABLE = new Set<ReportedMetricKey>([
  "revenue",
  "costOfRevenue",
  "grossProfit",
  "operatingIncome",
  "netIncome",
  "operatingCashFlow",
  "capex",
  "depreciationAmortization",
  "stockBasedCompensation",
  "incomeTaxExpense",
  "pretaxIncome",
  "interestExpense",
]);

const INSTANT_METRICS: ReportedMetricKey[] = [
  "cash",
  "shortTermInvestments",
  "sharesOutstanding",
  "currentAssets",
  "currentLiabilities",
  "totalAssets",
  "totalEquity",
];

export interface NormalizeOptions {
  provider: string;
  /** Limit output to the most recent N annual periods (default 10) and N quarters (default 16). */
  maxAnnual?: number;
  maxQuarters?: number;
}

export function normalizeFacts(rawFacts: readonly RawFact[], options: NormalizeOptions): NormalizedFinancials {
  const provider = options.provider;
  const warnings: string[] = [];
  const facts = rawFacts
    .filter((f) => Number.isFinite(f.value))
    .map((f) => ({ ...f, concept: stripTaxonomy(f.concept) }));
  const groups = groupFacts(facts);
  const byConcept = new Map<string, FactGroup[]>();
  for (const g of groups) {
    const list = byConcept.get(g.concept) ?? [];
    list.push(g);
    byConcept.set(g.concept, list);
  }
  const periodLabels = buildPeriodLabels(groups);
  const labelOf = (start: ISODate | null, end: ISODate) => periodLabels.get(`${start ?? ""}|${end}`) ?? null;

  // ---------- Annual periods ----------
  const annualPeriods = new Map<ISODate, StatementPeriod>();
  const annualAccessionByEnd = new Map<string, ISODate>();
  for (const metric of FLOW_METRICS) {
    const picks = pickMetricGroups(
      byConcept,
      metric,
      (g) => classifyDuration(g.start, g.end) === "annual" && ANNUAL_FORMS.has(g.first.form),
    );
    for (const { group, concept, earliestFiled } of picks.values()) {
      const label = labelOf(group.start, group.end);
      const fy = label?.fy ?? group.first.fy;
      let period = annualPeriods.get(group.end);
      if (!period) {
        period = {
          periodType: "annual",
          fiscalYear: fy,
          fiscalPeriod: "FY",
          periodStart: group.start,
          periodEnd: group.end,
          filedAt: null,
          label: fy ? `FY${fy}` : `FY ending ${group.end}`,
          metrics: {},
        };
        annualPeriods.set(group.end, period);
      }
      annualAccessionByEnd.set(group.first.accession, group.end);
      period.metrics[metric] = metricFromGroup(metric, CONCEPTS[metric].unit, group, concept, "annual", { fiscalYear: period.fiscalYear, fiscalPeriod: "FY" }, provider, [], earliestFiled);
      period.filedAt = laterDate(period.filedAt, earliestFiled);
    }
  }

  // ---------- Quarterly periods (standalone) ----------
  // Group duration facts by fiscal-year start so cumulative values can be differenced safely.
  const quarterPeriods = new Map<ISODate, StatementPeriod>(); // keyed by quarter end

  const ensureQuarter = (start: ISODate | null, end: ISODate, fiscalYear: number | null, fiscalPeriod: FiscalPeriod | null): StatementPeriod => {
    let p = quarterPeriods.get(end);
    if (!p) {
      p = {
        periodType: "quarter",
        fiscalYear,
        fiscalPeriod,
        periodStart: start,
        periodEnd: end,
        filedAt: null,
        label: fiscalYear && fiscalPeriod ? `${fiscalPeriod} FY${fiscalYear}` : `Quarter ending ${end}`,
        metrics: {},
      };
      quarterPeriods.set(end, p);
    } else {
      if (!p.fiscalYear && fiscalYear) p.fiscalYear = fiscalYear;
      if (!p.fiscalPeriod && fiscalPeriod) p.fiscalPeriod = fiscalPeriod;
      if (!p.periodStart && start) p.periodStart = start;
      if (p.fiscalYear && p.fiscalPeriod) p.label = `${p.fiscalPeriod} FY${p.fiscalYear}`;
    }
    return p;
  };

  for (const metric of FLOW_METRICS) {
    const spec = CONCEPTS[metric];
    const durationPicks = pickMetricGroups(byConcept, metric, (g) => {
      const cls = classifyDuration(g.start, g.end);
      return cls !== "other" && (QUARTERLY_FORMS.has(g.first.form) || ANNUAL_FORMS.has(g.first.form));
    });
    // Index by fiscal-year start.
    const byStart = new Map<ISODate, Array<MetricPick & { cls: DurationClass }>>();
    for (const pick of durationPicks.values()) {
      const cls = classifyDuration(pick.group.start, pick.group.end);
      const key = pick.group.start as ISODate;
      const list = byStart.get(key) ?? [];
      list.push({ ...pick, cls });
      byStart.set(key, list);
    }
    // Reported standalone quarters first (3-month facts from 10-Qs or 10-Ks).
    for (const pick of durationPicks.values()) {
      const cls = classifyDuration(pick.group.start, pick.group.end);
      if (cls !== "quarter") continue;
      const label = labelOf(pick.group.start, pick.group.end);
      const fp = fiscalPeriodOf(label?.fp ?? pick.group.first.fp);
      const form = label?.form ?? pick.group.first.form;
      // A 3-month fact in a 10-K is the fourth quarter.
      const fiscalPeriod: FiscalPeriod | null = ANNUAL_FORMS.has(form) ? "Q4" : fp === "FY" ? null : fp;
      const period = ensureQuarter(pick.group.start, pick.group.end, label?.fy ?? pick.group.first.fy, fiscalPeriod);
      period.metrics[metric] = metricFromGroup(metric, spec.unit, pick.group, pick.concept, "quarter", { fiscalYear: period.fiscalYear, fiscalPeriod: period.fiscalPeriod }, provider, [], pick.earliestFiled);
      period.filedAt = laterDate(period.filedAt, pick.earliestFiled);
    }
    // Derived quarters from cumulative facts sharing the same fiscal-year start.
    if (!DIFFERENCEABLE.has(metric)) continue;
    for (const [, list] of byStart) {
      const cumulative = list
        .filter((x) => x.cls !== "other")
        .sort((a, b) => (a.group.end < b.group.end ? -1 : 1));
      const order: DurationClass[] = ["quarter", "half", "nine", "annual"];
      const byClass = new Map<DurationClass, MetricPick>();
      for (const x of cumulative) if (!byClass.has(x.cls)) byClass.set(x.cls, x);
      for (let i = 1; i < order.length; i += 1) {
        const cur = byClass.get(order[i]);
        const prev = byClass.get(order[i - 1]);
        if (!cur || !prev) continue;
        const qStart = addDays(prev.group.end, 1);
        const qEnd = cur.group.end;
        if (classifyDuration(qStart, qEnd) !== "quarter") continue;
        const existing = quarterPeriods.get(qEnd);
        if (existing?.metrics[metric]?.status === "reported") continue;
        const fiscalPeriod: FiscalPeriod = (["Q2", "Q3", "Q4"] as FiscalPeriod[])[i - 1];
        const fy = labelOf(cur.group.start, cur.group.end)?.fy ?? cur.group.first.fy ?? prev.group.first.fy;
        const period = ensureQuarter(qStart, qEnd, fy, fiscalPeriod);
        const value = cur.group.latest.value - prev.group.latest.value;
        const filedAt = laterDate(cur.earliestFiled, prev.earliestFiled);
        period.metrics[metric] = calculated(
          metric,
          spec.unit,
          value,
          "quarter",
          { periodStart: qStart, periodEnd: qEnd, fiscalYear: period.fiscalYear, fiscalPeriod, filedAt },
          provider,
          `${order[i] === "annual" ? "Fiscal year" : "Year-to-date"} value (${cur.group.end}, ${cur.concept}, ${cur.group.latest.form} ${cur.group.latest.accession}) minus year-to-date value through ${prev.group.end} (${prev.group.latest.form} ${prev.group.latest.accession}). Both facts start on ${cur.group.start}.`,
          cur.group.restated || prev.group.restated ? ["One of the underlying facts was restated; the latest filed values were used."] : [],
        );
        period.filedAt = laterDate(period.filedAt, filedAt);
      }
    }
  }

  // ---------- Fourth-quarter EPS and share-count proxies ----------
  // Companies rarely report Q4 EPS or Q4 weighted shares standalone. Use the fiscal-year
  // weighted diluted share count as a proxy so Q4 EPS can be shown, clearly labelled.
  for (const q of quarterPeriods.values()) {
    if (q.fiscalPeriod !== "Q4") continue;
    const fy = [...annualPeriods.values()].find((a) => a.periodEnd === q.periodEnd);
    const fyShares = fy?.metrics.sharesDiluted;
    const ni = q.metrics.netIncome;
    if (fyShares?.value && !q.metrics.sharesDiluted) {
      q.metrics.sharesDiluted = {
        ...fyShares,
        periodType: "quarter",
        periodStart: q.periodStart,
        periodEnd: q.periodEnd,
        fiscalPeriod: "Q4",
        status: "calculated",
        source: { ...fyShares.source, derivation: "Fiscal-year weighted diluted shares used as a proxy; the fourth-quarter average is not reported standalone." },
        notes: [...fyShares.notes, "Proxy: fiscal-year weighted diluted shares."],
      };
    }
    if (ni?.value !== null && ni?.value !== undefined && fyShares?.value && !q.metrics.epsDiluted) {
      q.metrics.epsDiluted = calculated(
        "epsDiluted",
        "USD/share",
        ni.value / fyShares.value,
        "quarter",
        { periodStart: q.periodStart, periodEnd: q.periodEnd, fiscalYear: q.fiscalYear, fiscalPeriod: "Q4", filedAt: laterDate(ni.filedAt, fyShares.filedAt) },
        provider,
        `Fourth-quarter net income (${formatNumber(ni.value)}) divided by fiscal-year weighted diluted shares (${formatNumber(fyShares.value)}).`,
        ["Approximation: the fourth-quarter share count is not reported standalone."],
      );
    }
  }

  // ---------- Instants (balance sheet) ----------
  const attachInstant = (period: StatementPeriod, periodType: "annual" | "quarter") => {
    for (const metric of INSTANT_METRICS) {
      if (period.metrics[metric]) continue;
      const spec = CONCEPTS[metric];
      const picks = pickMetricGroups(byConcept, metric, (g) => g.start === null && g.end === period.periodEnd);
      let chosen = [...picks.values()][0];
      if (!chosen && metric === "sharesOutstanding") {
        // Cover-page share count: match by the filing that reported this period.
        const accessions = new Set<string>();
        for (const m of Object.values(period.metrics)) if (m?.source.accession) accessions.add(m.source.accession);
        const alt = pickMetricGroups(byConcept, metric, (g) => g.start === null && accessions.has(g.first.accession));
        chosen = [...alt.values()].sort((a, b) => (a.group.end > b.group.end ? -1 : 1))[0];
      }
      if (!chosen) continue;
      period.metrics[metric] = metricFromGroup(
        metric,
        spec.unit,
        chosen.group,
        chosen.concept,
        "instant",
        { fiscalYear: period.fiscalYear, fiscalPeriod: period.fiscalPeriod },
        provider,
        metric === "sharesOutstanding" && chosen.group.end !== period.periodEnd
          ? [`Cover-page count as of ${chosen.group.end}, not the balance-sheet date.`]
          : [],
      );
    }
    // Total debt from components.
    const debt = assembleDebt(byConcept, period.periodEnd, provider, period, periodType);
    if (debt) period.metrics.totalDebt = debt;
  };
  for (const p of annualPeriods.values()) attachInstant(p, "annual");
  for (const p of quarterPeriods.values()) attachInstant(p, "quarter");

  // ---------- Order, trim ----------
  const annual = [...annualPeriods.values()].sort((a, b) => (a.periodEnd < b.periodEnd ? -1 : 1));
  const quarterly = [...quarterPeriods.values()]
    .filter((q) => Object.keys(q.metrics).length > 0)
    .sort((a, b) => (a.periodEnd < b.periodEnd ? -1 : 1));
  const maxAnnual = options.maxAnnual ?? 10;
  const maxQuarters = options.maxQuarters ?? 16;
  const annualTrimmed = annual.slice(-maxAnnual);
  const quarterlyTrimmed = quarterly.slice(-maxQuarters);

  // ---------- Derived metrics ----------
  for (const p of annualTrimmed) addDerivedMetrics(p, provider);
  for (const p of quarterlyTrimmed) addDerivedMetrics(p, provider);

  // Growth versus the comparable period a year earlier.
  for (let i = 0; i < annualTrimmed.length; i += 1) {
    const cur = annualTrimmed[i];
    const prev = annual.find((p) => p.fiscalYear !== null && cur.fiscalYear !== null && p.fiscalYear === cur.fiscalYear - 1);
    addGrowthMetrics(cur, prev ?? null, provider, "the prior fiscal year");
  }
  for (const cur of quarterlyTrimmed) {
    const prev = quarterly.find(
      (p) => p.fiscalYear !== null && cur.fiscalYear !== null && p.fiscalYear === cur.fiscalYear - 1 && p.fiscalPeriod === cur.fiscalPeriod,
    );
    addGrowthMetrics(cur, prev ?? null, provider, "the same fiscal quarter a year earlier");
  }

  // ---------- TTM ----------
  const ttm = buildTtm(quarterly, provider, warnings);
  if (ttm) {
    addDerivedMetrics(ttm, provider);
    const priorTtm = buildTtm(quarterly.filter((q) => q.periodEnd <= addDays(ttm.periodEnd, -300)), provider, []);
    addGrowthMetrics(ttm, priorTtm, provider, "the trailing twelve months a year earlier");
  }

  if (annual.length === 0) warnings.push("No annual periods could be built from the available facts.");
  if (quarterly.length === 0) warnings.push("No quarterly periods could be built from the available facts.");

  return { provider, annual: annualTrimmed, quarterly: quarterlyTrimmed, ttm, warnings };
}

function assembleDebt(
  byConcept: Map<string, FactGroup[]>,
  end: ISODate,
  provider: string,
  period: StatementPeriod,
  periodType: "annual" | "quarter",
): MetricValue | null {
  for (const set of DEBT_COMPONENT_SETS) {
    const found: Array<{ concept: string; group: FactGroup }> = [];
    let requiredMissing = false;
    for (const concept of set) {
      const g = (byConcept.get(concept) ?? []).find((x) => x.start === null && x.end === end && x.latest.unit === "USD");
      if (g) found.push({ concept, group: g });
      else if (DEBT_REQUIRED[concept]) requiredMissing = true;
    }
    if (requiredMissing || found.length === 0) continue;
    const value = found.reduce((acc, x) => acc + x.group.latest.value, 0);
    const filedAt = found.reduce<ISODate | null>((acc, x) => laterDate(acc, x.group.first.filed), null);
    return {
      metric: "totalDebt",
      value,
      unit: "USD",
      status: "calculated",
      periodType: "instant",
      periodStart: null,
      periodEnd: end,
      fiscalYear: period.fiscalYear,
      fiscalPeriod: period.fiscalPeriod,
      filedAt,
      latestFiledAt: null,
      restated: found.some((x) => x.group.restated),
      source: {
        provider,
        concept: null,
        accession: found[0].group.latest.accession,
        form: found[0].group.latest.form,
        derivation: `Sum of ${found.map((x) => `${x.concept} (${formatNumber(x.group.latest.value)})`).join(" + ")} at ${end} (${periodType} balance sheet). Lease liabilities excluded.`,
      },
      notes: [],
    };
  }
  return null;
}

function addDerivedMetrics(p: StatementPeriod, provider: string): void {
  const m = p.metrics;
  const base = {
    periodStart: p.periodStart,
    periodEnd: p.periodEnd,
    fiscalYear: p.fiscalYear,
    fiscalPeriod: p.fiscalPeriod,
    filedAt: p.filedAt,
  };
  const pt = p.periodType;
  const v = (k: MetricKey): number | null => m[k]?.value ?? null;

  if (!m.grossProfit && v("revenue") !== null && v("costOfRevenue") !== null) {
    m.grossProfit = calculated("grossProfit", "USD", v("revenue")! - v("costOfRevenue")!, pt, base, provider, "Revenue minus cost of revenue (gross profit was not reported as a separate line).");
  }
  const revenue = v("revenue");
  const margin = (key: CalculatedMetricKey, num: number | null, label: string) => {
    if (num === null) return;
    if (revenue === null || revenue <= 0) {
      m[key] = calculated(key, "ratio", null, pt, base, provider, `${label} divided by revenue.`, [
        revenue === null ? "Revenue is not available for this period." : "Revenue is not positive, so the margin is not meaningful.",
      ]);
      return;
    }
    m[key] = calculated(key, "ratio", num / revenue, pt, base, provider, `${label} divided by revenue (${formatNumber(num)} / ${formatNumber(revenue)}).`);
  };
  margin("grossMargin", v("grossProfit"), "Gross profit");
  margin("operatingMargin", v("operatingIncome"), "Operating income");
  margin("netMargin", v("netIncome"), "Net income");

  const ocf = v("operatingCashFlow");
  const capex = v("capex");
  if (ocf !== null && capex !== null) {
    const capexOutflow = Math.abs(capex);
    const notes = capex < 0 ? ["Capital expenditure was reported as a negative number and normalised to a positive outflow."] : [];
    m.freeCashFlow = calculated("freeCashFlow", "USD", ocf - capexOutflow, pt, base, provider, `Operating cash flow (${formatNumber(ocf)}) minus capital expenditure (${formatNumber(capexOutflow)}).`, notes);
    margin("fcfMargin", ocf - capexOutflow, "Free cash flow");
  } else if (ocf !== null || capex !== null) {
    m.freeCashFlow = calculated("freeCashFlow", "USD", null, pt, base, provider, "Operating cash flow minus capital expenditure.", [
      ocf === null ? "Operating cash flow is not available for this period." : "Capital expenditure is not available for this period.",
    ]);
  }

  const opInc = v("operatingIncome");
  const da = v("depreciationAmortization");
  if (opInc !== null && da !== null) {
    m.ebitda = calculated("ebitda", "USD", opInc + Math.abs(da), pt, base, provider, `Operating income (${formatNumber(opInc)}) plus depreciation and amortization (${formatNumber(Math.abs(da))}).`);
  }

  const debt = v("totalDebt");
  const cash = v("cash");
  if (debt !== null && cash !== null) {
    const sti = v("shortTermInvestments") ?? 0;
    m.netDebt = calculated(
      "netDebt",
      "USD",
      debt - cash - sti,
      "instant",
      base,
      provider,
      `Total debt (${formatNumber(debt)}) minus cash (${formatNumber(cash)})${v("shortTermInvestments") !== null ? ` minus short-term investments (${formatNumber(sti)})` : ""}.`,
      v("shortTermInvestments") === null ? ["Short-term investments were not reported and are treated as not available (not subtracted)."] : [],
    );
  }

  const tax = v("incomeTaxExpense");
  const pretax = v("pretaxIncome");
  if (tax !== null && pretax !== null) {
    m.effectiveTaxRate = calculated(
      "effectiveTaxRate",
      "ratio",
      pretax > 0 ? tax / pretax : null,
      pt,
      base,
      provider,
      `Income tax expense (${formatNumber(tax)}) divided by pre-tax income (${formatNumber(pretax)}).`,
      pretax > 0 ? [] : ["Pre-tax income is not positive, so the rate is not meaningful."],
    );
  }

  const ca = v("currentAssets");
  const cl = v("currentLiabilities");
  if (ca !== null && cl !== null) {
    m.netWorkingCapital = calculated("netWorkingCapital", "USD", ca - cl, "instant", base, provider, `Current assets (${formatNumber(ca)}) minus current liabilities (${formatNumber(cl)}).`);
  }
}

function addGrowthMetrics(cur: StatementPeriod, prev: StatementPeriod | null, provider: string, comparableLabel: string): void {
  const base = {
    periodStart: cur.periodStart,
    periodEnd: cur.periodEnd,
    fiscalYear: cur.fiscalYear,
    fiscalPeriod: cur.fiscalPeriod,
    filedAt: cur.filedAt,
  };
  const growth = (key: CalculatedMetricKey, metric: ReportedMetricKey, label: string) => {
    const curV = cur.metrics[metric]?.value ?? null;
    if (curV === null) return;
    const prevV = prev?.metrics[metric]?.value ?? null;
    if (prevV === null || prevV <= 0) {
      cur.metrics[key] = calculated(key, "ratio", null, cur.periodType, base, provider, `${label} versus ${comparableLabel}.`, [
        prevV === null ? "No comparable prior period is available." : "The prior-period value is not positive, so growth is not meaningful.",
      ]);
      return;
    }
    cur.metrics[key] = calculated(
      key,
      "ratio",
      curV / prevV - 1,
      cur.periodType,
      base,
      provider,
      `${label} ${formatNumber(curV)} versus ${formatNumber(prevV)} in ${prev!.label} (${comparableLabel}).`,
    );
  };
  growth("revenueGrowth", "revenue", "Revenue");
  growth("sharesDilutedGrowth", "sharesDiluted", "Weighted diluted shares");
}

/** Quarters are consecutive when each starts within a week after the previous one ends. */
export function areConsecutiveQuarters(quarters: readonly StatementPeriod[]): boolean {
  for (let i = 1; i < quarters.length; i += 1) {
    const prev = quarters[i - 1];
    const cur = quarters[i];
    if (!cur.periodStart) return false;
    const gap = daysBetween(prev.periodEnd, cur.periodStart);
    if (gap < 1 || gap > 7) return false;
  }
  return true;
}

function buildTtm(quarterly: readonly StatementPeriod[], provider: string, warnings: string[]): StatementPeriod | null {
  if (quarterly.length < 4) {
    warnings.push("Fewer than four standalone quarters are available, so no trailing-twelve-month figures were built.");
    return null;
  }
  const last4 = quarterly.slice(-4);
  if (!areConsecutiveQuarters(last4)) {
    warnings.push("The last four quarters are not consecutive, so trailing-twelve-month figures were not built.");
    return null;
  }
  const latest = last4[3];
  const ttm: StatementPeriod = {
    periodType: "ttm",
    fiscalYear: latest.fiscalYear,
    fiscalPeriod: latest.fiscalPeriod,
    periodStart: last4[0].periodStart,
    periodEnd: latest.periodEnd,
    filedAt: last4.reduce<ISODate | null>((acc, q) => laterDate(acc, q.filedAt), null),
    label: `TTM to ${latest.periodEnd}`,
    metrics: {},
  };
  const base = { periodStart: ttm.periodStart, periodEnd: ttm.periodEnd, fiscalYear: ttm.fiscalYear, fiscalPeriod: ttm.fiscalPeriod, filedAt: ttm.filedAt };
  for (const metric of FLOW_METRICS) {
    if (metric === "sharesDiluted") continue;
    const values = last4.map((q) => q.metrics[metric]?.value ?? null);
    if (values.some((x) => x === null)) continue;
    const total = values.reduce<number>((acc, x) => acc + (x as number), 0);
    const notes = metric === "epsDiluted" ? ["Sum of four quarterly diluted EPS figures; an approximation because share counts change between quarters."] : [];
    ttm.metrics[metric] = calculated(
      metric,
      CONCEPTS[metric].unit,
      total,
      "ttm",
      base,
      provider,
      `Sum of ${last4.map((q) => `${q.label} (${formatNumber(q.metrics[metric]!.value!)})`).join(" + ")}.`,
      notes,
    );
  }
  // Instants and share counts come from the latest quarter.
  for (const metric of [...INSTANT_METRICS, "totalDebt", "sharesDiluted"] as MetricKey[]) {
    const mv = latest.metrics[metric];
    if (!mv) continue;
    ttm.metrics[metric] = { ...mv, notes: [...mv.notes, `Taken from ${latest.label}, the latest quarter in the trailing window.`] };
  }
  const ttmNi = ttm.metrics.netIncome?.value ?? null;
  const shares = ttm.metrics.sharesDiluted?.value ?? null;
  if (ttmNi !== null && shares && shares > 0) {
    const sumOfQuarters = ttm.metrics.epsDiluted;
    ttm.metrics.epsDiluted = calculated(
      "epsDiluted",
      "USD/share",
      ttmNi / shares,
      "ttm",
      base,
      provider,
      `Trailing net income (${formatNumber(ttmNi)}) divided by the latest weighted diluted share count (${formatNumber(shares)}).`,
      sumOfQuarters?.value !== null && sumOfQuarters?.value !== undefined
        ? [`The sum of the four quarterly EPS figures is ${sumOfQuarters.value.toFixed(2)}; the per-share figure here uses the latest share count instead.`]
        : ["Trailing EPS is calculated because at least one quarter's diluted EPS is not reported standalone."],
    );
  }
  return ttm;
}

/** Fiscal periods available for a company, newest first, for selectors. */
export function latestPeriod(fin: NormalizedFinancials): StatementPeriod | null {
  if (fin.ttm) return fin.ttm;
  if (fin.quarterly.length) return fin.quarterly[fin.quarterly.length - 1];
  if (fin.annual.length) return fin.annual[fin.annual.length - 1];
  return null;
}
