/**
 * The demo universe: fictional US-listed companies and funds with coherent
 * financial trajectories. Nothing here describes a real company.
 */
export interface DemoDividend {
  /** Annual dividend per share at the start of the series. */
  startAnnual: number;
  /** Annual growth in the dividend. */
  growth: number;
  /** Months (1-12) in which the dividend is paid on the 15th. */
  months: number[];
}

export interface DemoCompanyModel {
  /** Quarterly revenue (USD) in the first modelled quarter. */
  startRevenueQ: number;
  /** Annual revenue growth at the start and at the end of the modelled window (linear path). */
  growthStart: number;
  growthEnd: number;
  /** Seasonality multipliers for fiscal quarters 1-4 (average 1). */
  seasonality: [number, number, number, number];
  grossMarginStart: number;
  grossMarginEnd: number;
  opMarginStart: number;
  opMarginEnd: number;
  taxRate: number;
  daPct: number;
  capexPct: number;
  sbcPct: number;
  /** Starting diluted shares and annual change (negative = buybacks). */
  sharesStart: number;
  sharesChange: number;
  /** Starting cash and debt. */
  cashStart: number;
  debtStart: number;
  /** Annual change in debt (absolute). */
  debtChange: number;
  /** Share of debt that is current. */
  debtCurrentShare: number;
  interestRate: number;
  /** Working capital intensity as share of revenue. */
  nwcPct: number;
  /** Revenue noise (std dev as share of revenue). */
  noise: number;
  /** Starting price and annual drift / vol of the price path. */
  priceStart: number;
  drift: number;
  vol: number;
  /** Jump std dev on earnings release days. */
  earningsJump: number;
  dividend: DemoDividend | null;
  /** Optional 2:1 style split: { date, ratio }. */
  split: { date: string; numerator: number; denominator: number } | null;
  /** Fiscal year end month (1-12) and day. */
  fyeMonth: number;
  fyeDay: number;
  /** SEC-style fy label offset: 0 means FY label = calendar year of FYE; -1 for retailers with Jan FYE. */
  fyLabelOffset: 0 | -1;
  /** Restate one annual revenue figure slightly in the following 10-K to exercise restatement handling. */
  restateRevenueFy: number | null;
  /** Upcoming earnings event. */
  nextEarnings: { date: string; status: "confirmed" | "estimated"; timeOfDay: "pre-market" | "post-market" };
}

export interface DemoCompany {
  symbol: string;
  name: string;
  exchange: string;
  sector: string;
  industry: string;
  sic: string;
  cik: string;
  description: string;
  website: string;
  model: DemoCompanyModel;
}

export interface DemoFund {
  symbol: string;
  name: string;
  exchange: string;
  category: string;
  family: string;
  expenseRatio: number;
  benchmarkIndex: string;
  description: string;
  priceStart: number;
  drift: number;
  vol: number;
  dividend: DemoDividend | null;
  /** Correlation with the broad market path (0-1). */
  marketBeta: number;
  /** Holdings for look-through, or null when the demo deliberately lacks holdings data. */
  holdings: Array<{ symbol: string | null; name: string; sector: string; weight: number }> | null;
}

export const DEMO_AS_OF = "2026-10-13";
export const DEMO_PRICE_START = "2023-06-01";
export const DEMO_FIRST_FISCAL_YEAR = 2021;

const dec = (fyeMonth = 12, fyeDay = 31) => ({ fyeMonth, fyeDay });

export const DEMO_COMPANIES: DemoCompany[] = [
  {
    symbol: "HALC",
    name: "Halcyon Semiconductor",
    exchange: "Nasdaq",
    sector: "Technology",
    industry: "Semiconductors",
    sic: "3674",
    cik: "0001900001",
    description:
      "Halcyon designs power-efficient inference accelerators and networking silicon for data centres and edge devices. Revenue is weighted to hyperscale customers, with a growing automotive segment.",
    website: "https://example.com/halcyon",
    model: {
      startRevenueQ: 1.45e9,
      growthStart: 0.34,
      growthEnd: 0.18,
      seasonality: [0.95, 0.98, 1.02, 1.05],
      grossMarginStart: 0.58,
      grossMarginEnd: 0.63,
      opMarginStart: 0.27,
      opMarginEnd: 0.34,
      taxRate: 0.15,
      daPct: 0.05,
      capexPct: 0.11,
      sbcPct: 0.07,
      sharesStart: 1.02e9,
      sharesChange: -0.004,
      cashStart: 6.1e9,
      debtStart: 2.5e9,
      debtChange: 0,
      debtCurrentShare: 0.1,
      interestRate: 0.035,
      nwcPct: 0.12,
      noise: 0.015,
      priceStart: 118,
      drift: 0.3,
      vol: 0.38,
      earningsJump: 0.07,
      dividend: null,
      split: null,
      ...dec(),
      fyLabelOffset: 0,
      restateRevenueFy: null,
      nextEarnings: { date: "2026-10-28", status: "confirmed", timeOfDay: "post-market" },
    },
  },
  {
    symbol: "NRVA",
    name: "Norvane Health",
    exchange: "NYSE",
    sector: "Health Care",
    industry: "Medical Devices",
    sic: "3841",
    cik: "0001900002",
    description:
      "Norvane makes minimally invasive surgical systems and the consumables used with them. Recurring consumable revenue is roughly two thirds of sales. Fiscal year ends in September.",
    website: "https://example.com/norvane",
    model: {
      startRevenueQ: 1.9e9,
      growthStart: 0.12,
      growthEnd: 0.14,
      seasonality: [0.97, 0.99, 1.0, 1.04],
      grossMarginStart: 0.67,
      grossMarginEnd: 0.68,
      opMarginStart: 0.25,
      opMarginEnd: 0.27,
      taxRate: 0.21,
      daPct: 0.04,
      capexPct: 0.06,
      sbcPct: 0.05,
      sharesStart: 3.55e8,
      sharesChange: -0.002,
      cashStart: 4.2e9,
      debtStart: 0,
      debtChange: 0,
      debtCurrentShare: 0,
      interestRate: 0,
      nwcPct: 0.2,
      noise: 0.01,
      priceStart: 310,
      drift: 0.14,
      vol: 0.24,
      earningsJump: 0.045,
      dividend: null,
      split: null,
      ...dec(9, 30),
      fyLabelOffset: 0,
      restateRevenueFy: null,
      nextEarnings: { date: "2026-10-22", status: "confirmed", timeOfDay: "post-market" },
    },
  },
  {
    symbol: "BRKW",
    name: "Brookwater Foods",
    exchange: "NYSE",
    sector: "Consumer Staples",
    industry: "Packaged Foods",
    sic: "2000",
    cik: "0001900003",
    description:
      "Brookwater sells branded snacks, cereals and refrigerated foods through grocery and club channels in North America. Volume growth is low; pricing and mix drive revenue.",
    website: "https://example.com/brookwater",
    model: {
      startRevenueQ: 4.6e9,
      growthStart: 0.05,
      growthEnd: 0.02,
      seasonality: [1.0, 0.98, 0.99, 1.03],
      grossMarginStart: 0.35,
      grossMarginEnd: 0.345,
      opMarginStart: 0.165,
      opMarginEnd: 0.16,
      taxRate: 0.22,
      daPct: 0.035,
      capexPct: 0.04,
      sbcPct: 0.01,
      sharesStart: 6.1e8,
      sharesChange: -0.012,
      cashStart: 1.4e9,
      debtStart: 11.8e9,
      debtChange: 2e8,
      debtCurrentShare: 0.12,
      interestRate: 0.042,
      nwcPct: 0.05,
      noise: 0.008,
      priceStart: 64,
      drift: 0.03,
      vol: 0.16,
      earningsJump: 0.03,
      dividend: { startAnnual: 2.2, growth: 0.04, months: [3, 6, 9, 12] },
      split: null,
      ...dec(),
      fyLabelOffset: 0,
      restateRevenueFy: null,
      nextEarnings: { date: "2026-10-27", status: "estimated", timeOfDay: "pre-market" },
    },
  },
  {
    symbol: "QNTL",
    name: "Quantell Software",
    exchange: "Nasdaq",
    sector: "Technology",
    industry: "Application Software",
    sic: "7372",
    cik: "0001900004",
    description:
      "Quantell provides a subscription platform for industrial asset monitoring and predictive maintenance. The company reached GAAP operating profitability in 2025 while stock-based compensation remains a large share of revenue.",
    website: "https://example.com/quantell",
    model: {
      startRevenueQ: 2.6e8,
      growthStart: 0.42,
      growthEnd: 0.24,
      seasonality: [0.96, 0.99, 1.01, 1.04],
      grossMarginStart: 0.72,
      grossMarginEnd: 0.76,
      opMarginStart: -0.18,
      opMarginEnd: 0.09,
      taxRate: 0.1,
      daPct: 0.03,
      capexPct: 0.02,
      sbcPct: 0.19,
      sharesStart: 2.4e8,
      sharesChange: 0.035,
      cashStart: 1.9e9,
      debtStart: 5.75e8,
      debtChange: 0,
      debtCurrentShare: 0,
      interestRate: 0.0125,
      nwcPct: -0.08,
      noise: 0.02,
      priceStart: 48,
      drift: 0.22,
      vol: 0.52,
      earningsJump: 0.1,
      dividend: null,
      split: null,
      ...dec(),
      fyLabelOffset: 0,
      restateRevenueFy: null,
      nextEarnings: { date: "2026-11-05", status: "estimated", timeOfDay: "post-market" },
    },
  },
  {
    symbol: "ARDN",
    name: "Ardent Rail Logistics",
    exchange: "NYSE",
    sector: "Industrials",
    industry: "Railroads",
    sic: "4011",
    cik: "0001900005",
    description:
      "Ardent operates a freight rail network across the central United States with intermodal, agricultural and energy carloads. Capital intensity is high and volumes are cyclical.",
    website: "https://example.com/ardent",
    model: {
      startRevenueQ: 3.3e9,
      growthStart: -0.03,
      growthEnd: 0.05,
      seasonality: [0.97, 1.01, 1.02, 1.0],
      grossMarginStart: 0.45,
      grossMarginEnd: 0.47,
      opMarginStart: 0.37,
      opMarginEnd: 0.39,
      taxRate: 0.235,
      daPct: 0.12,
      capexPct: 0.17,
      sbcPct: 0.005,
      sharesStart: 6.4e8,
      sharesChange: -0.02,
      cashStart: 1.1e9,
      debtStart: 19.5e9,
      debtChange: 6e8,
      debtCurrentShare: 0.07,
      interestRate: 0.045,
      nwcPct: 0.02,
      noise: 0.012,
      priceStart: 205,
      drift: 0.06,
      vol: 0.2,
      earningsJump: 0.035,
      dividend: { startAnnual: 5.2, growth: 0.06, months: [3, 6, 9, 12] },
      split: null,
      ...dec(),
      fyLabelOffset: 0,
      restateRevenueFy: null,
      nextEarnings: { date: "2026-10-22", status: "confirmed", timeOfDay: "pre-market" },
    },
  },
  {
    symbol: "MERI",
    name: "Meridian Bancorp",
    exchange: "NYSE",
    sector: "Financials",
    industry: "Regional Banks",
    sic: "6022",
    cik: "0001900006",
    description:
      "Meridian is a regional bank holding company with commercial lending, mortgage and wealth management operations in the Mountain West. Reported revenue here is net revenue (net interest income plus fees).",
    website: "https://example.com/meridian",
    model: {
      startRevenueQ: 1.15e9,
      growthStart: 0.09,
      growthEnd: 0.04,
      seasonality: [1.0, 1.0, 1.0, 1.0],
      grossMarginStart: 1.0,
      grossMarginEnd: 1.0,
      opMarginStart: 0.38,
      opMarginEnd: 0.35,
      taxRate: 0.2,
      daPct: 0.02,
      capexPct: 0.015,
      sbcPct: 0.008,
      sharesStart: 2.9e8,
      sharesChange: -0.015,
      cashStart: 9.5e9,
      debtStart: 6.2e9,
      debtChange: -3e8,
      debtCurrentShare: 0.3,
      interestRate: 0.04,
      nwcPct: 0,
      noise: 0.01,
      priceStart: 52,
      drift: 0.05,
      vol: 0.26,
      earningsJump: 0.04,
      dividend: { startAnnual: 1.68, growth: 0.05, months: [2, 5, 8, 11] },
      split: null,
      ...dec(),
      fyLabelOffset: 0,
      restateRevenueFy: null,
      nextEarnings: { date: "2026-10-16", status: "confirmed", timeOfDay: "pre-market" },
    },
  },
  {
    symbol: "SLVN",
    name: "Solvane Energy",
    exchange: "NYSE",
    sector: "Energy",
    industry: "Oil & Gas Exploration",
    sic: "1311",
    cik: "0001900007",
    description:
      "Solvane explores for and produces oil and natural gas in the Permian and Williston basins. Results swing with commodity prices; the company returns most free cash flow through a variable dividend.",
    website: "https://example.com/solvane",
    model: {
      startRevenueQ: 2.9e9,
      growthStart: -0.12,
      growthEnd: 0.1,
      seasonality: [1.0, 1.02, 1.0, 0.98],
      grossMarginStart: 0.52,
      grossMarginEnd: 0.5,
      opMarginStart: 0.33,
      opMarginEnd: 0.29,
      taxRate: 0.22,
      daPct: 0.18,
      capexPct: 0.26,
      sbcPct: 0.006,
      sharesStart: 5.8e8,
      sharesChange: -0.03,
      cashStart: 1.3e9,
      debtStart: 5.6e9,
      debtChange: -4e8,
      debtCurrentShare: 0.08,
      interestRate: 0.055,
      nwcPct: 0.03,
      noise: 0.03,
      priceStart: 72,
      drift: 0.04,
      vol: 0.34,
      earningsJump: 0.045,
      dividend: { startAnnual: 2.6, growth: 0.0, months: [3, 6, 9, 12] },
      split: null,
      ...dec(),
      fyLabelOffset: 0,
      restateRevenueFy: null,
      nextEarnings: { date: "2026-11-03", status: "estimated", timeOfDay: "post-market" },
    },
  },
  {
    symbol: "CSTL",
    name: "Castellan Properties",
    exchange: "NYSE",
    sector: "Real Estate",
    industry: "Industrial REIT",
    sic: "6798",
    cik: "0001900008",
    description:
      "Castellan is a real estate investment trust owning logistics warehouses near major ports and population centres. Depreciation depresses GAAP earnings; the company reports funds from operations, which Ledger does not compute.",
    website: "https://example.com/castellan",
    model: {
      startRevenueQ: 7.8e8,
      growthStart: 0.1,
      growthEnd: 0.07,
      seasonality: [1.0, 1.0, 1.0, 1.0],
      grossMarginStart: 0.74,
      grossMarginEnd: 0.75,
      opMarginStart: 0.33,
      opMarginEnd: 0.34,
      taxRate: 0.01,
      daPct: 0.38,
      capexPct: 0.3,
      sbcPct: 0.01,
      sharesStart: 4.2e8,
      sharesChange: 0.03,
      cashStart: 4.5e8,
      debtStart: 12.5e9,
      debtChange: 9e8,
      debtCurrentShare: 0.05,
      interestRate: 0.038,
      nwcPct: 0,
      noise: 0.006,
      priceStart: 98,
      drift: 0.04,
      vol: 0.22,
      earningsJump: 0.025,
      dividend: { startAnnual: 3.6, growth: 0.07, months: [3, 6, 9, 12] },
      split: null,
      ...dec(),
      fyLabelOffset: 0,
      restateRevenueFy: null,
      nextEarnings: { date: "2026-10-21", status: "confirmed", timeOfDay: "post-market" },
    },
  },
  {
    symbol: "VLTR",
    name: "Voltair Utilities",
    exchange: "NYSE",
    sector: "Utilities",
    industry: "Electric Utilities",
    sic: "4911",
    cik: "0001900009",
    description:
      "Voltair is a regulated electric and gas utility serving the Southeast. Rate-base growth is funded with debt and equity; free cash flow is structurally negative while the grid is rebuilt.",
    website: "https://example.com/voltair",
    model: {
      startRevenueQ: 5.2e9,
      growthStart: 0.04,
      growthEnd: 0.06,
      seasonality: [1.03, 0.95, 1.08, 0.94],
      grossMarginStart: 0.42,
      grossMarginEnd: 0.43,
      opMarginStart: 0.23,
      opMarginEnd: 0.235,
      taxRate: 0.14,
      daPct: 0.14,
      capexPct: 0.45,
      sbcPct: 0.003,
      sharesStart: 1.05e9,
      sharesChange: 0.025,
      cashStart: 8e8,
      debtStart: 42e9,
      debtChange: 3.2e9,
      debtCurrentShare: 0.06,
      interestRate: 0.043,
      nwcPct: 0.01,
      noise: 0.012,
      priceStart: 78,
      drift: 0.05,
      vol: 0.17,
      earningsJump: 0.02,
      dividend: { startAnnual: 3.0, growth: 0.06, months: [3, 6, 9, 12] },
      split: null,
      ...dec(),
      fyLabelOffset: 0,
      restateRevenueFy: null,
      nextEarnings: { date: "2026-11-04", status: "estimated", timeOfDay: "pre-market" },
    },
  },
  {
    symbol: "PNTH",
    name: "Pinnoth Retail",
    exchange: "NYSE",
    sector: "Consumer Discretionary",
    industry: "Specialty Retail",
    sic: "5940",
    cik: "0001900010",
    description:
      "Pinnoth operates about 1,100 hobby and craft stores plus an e-commerce business. Comparable sales have declined for several quarters as the company closes under-performing stores. Fiscal year ends in January.",
    website: "https://example.com/pinnoth",
    model: {
      startRevenueQ: 2.05e9,
      growthStart: 0.03,
      growthEnd: -0.07,
      seasonality: [0.9, 0.92, 0.98, 1.2],
      grossMarginStart: 0.39,
      grossMarginEnd: 0.36,
      opMarginStart: 0.08,
      opMarginEnd: 0.025,
      taxRate: 0.24,
      daPct: 0.035,
      capexPct: 0.03,
      sbcPct: 0.006,
      sharesStart: 1.4e8,
      sharesChange: -0.01,
      cashStart: 6.5e8,
      debtStart: 2.9e9,
      debtChange: 1.5e8,
      debtCurrentShare: 0.1,
      interestRate: 0.065,
      nwcPct: 0.14,
      noise: 0.015,
      priceStart: 41,
      drift: -0.14,
      vol: 0.42,
      earningsJump: 0.08,
      dividend: null,
      split: null,
      fyeMonth: 1,
      fyeDay: 31,
      fyLabelOffset: -1,
      restateRevenueFy: 2024,
      nextEarnings: { date: "2026-11-19", status: "estimated", timeOfDay: "pre-market" },
    },
  },
  {
    symbol: "KSTR",
    name: "Kestrel Aerospace",
    exchange: "NYSE",
    sector: "Industrials",
    industry: "Aerospace & Defense",
    sic: "3721",
    cik: "0001900011",
    description:
      "Kestrel builds propulsion components, avionics and uncrewed systems for commercial and defence customers. A two-for-one stock split took effect in June 2025.",
    website: "https://example.com/kestrel",
    model: {
      startRevenueQ: 2.2e9,
      growthStart: 0.09,
      growthEnd: 0.12,
      seasonality: [0.96, 1.0, 1.0, 1.04],
      grossMarginStart: 0.29,
      grossMarginEnd: 0.31,
      opMarginStart: 0.13,
      opMarginEnd: 0.15,
      taxRate: 0.19,
      daPct: 0.04,
      capexPct: 0.045,
      sbcPct: 0.012,
      sharesStart: 1.62e8,
      sharesChange: -0.008,
      cashStart: 1.7e9,
      debtStart: 3.1e9,
      debtChange: -1e8,
      debtCurrentShare: 0.15,
      interestRate: 0.04,
      nwcPct: 0.18,
      noise: 0.012,
      priceStart: 262,
      drift: 0.16,
      vol: 0.27,
      earningsJump: 0.04,
      dividend: { startAnnual: 2.4, growth: 0.08, months: [3, 6, 9, 12] },
      split: { date: "2025-06-16", numerator: 2, denominator: 1 },
      ...dec(),
      fyLabelOffset: 0,
      restateRevenueFy: null,
      nextEarnings: { date: "2026-10-27", status: "confirmed", timeOfDay: "pre-market" },
    },
  },
  {
    symbol: "OBSD",
    name: "Obsidian Media",
    exchange: "Nasdaq",
    sector: "Communication Services",
    industry: "Interactive Media",
    sic: "7370",
    cik: "0001900012",
    description:
      "Obsidian runs a short-form video and creator commerce platform monetised through advertising. Margins have expanded as infrastructure costs fell relative to revenue.",
    website: "https://example.com/obsidian",
    model: {
      startRevenueQ: 1.1e9,
      growthStart: 0.2,
      growthEnd: 0.17,
      seasonality: [0.9, 0.98, 1.0, 1.12],
      grossMarginStart: 0.6,
      grossMarginEnd: 0.66,
      opMarginStart: 0.08,
      opMarginEnd: 0.21,
      taxRate: 0.17,
      daPct: 0.06,
      capexPct: 0.09,
      sbcPct: 0.11,
      sharesStart: 7.9e8,
      sharesChange: 0.005,
      cashStart: 3.3e9,
      debtStart: 0,
      debtChange: 0,
      debtCurrentShare: 0,
      interestRate: 0,
      nwcPct: 0.04,
      noise: 0.018,
      priceStart: 27,
      drift: 0.24,
      vol: 0.45,
      earningsJump: 0.09,
      dividend: null,
      split: null,
      ...dec(),
      fyLabelOffset: 0,
      restateRevenueFy: null,
      nextEarnings: { date: "2026-10-29", status: "confirmed", timeOfDay: "post-market" },
    },
  },
];

export const DEMO_BENCHMARK = "BMKT";

export const DEMO_FUNDS: DemoFund[] = [
  {
    symbol: "BMKT",
    name: "Broad Market Index ETF",
    exchange: "NYSE Arca",
    category: "US Large-Cap Blend",
    family: "Demo Index Funds",
    expenseRatio: 0.0003,
    benchmarkIndex: "Demo US Large-Cap 500 Index",
    description: "Tracks a capitalisation-weighted index of about 500 large US companies. Used as the default benchmark in the demo. Adjusted closes reinvest quarterly distributions (total return).",
    priceStart: 410,
    drift: 0.1,
    vol: 0.15,
    dividend: { startAnnual: 5.9, growth: 0.05, months: [3, 6, 9, 12] },
    marketBeta: 1,
    holdings: null,
  },
  {
    symbol: "TECX",
    name: "Technology Sector ETF",
    exchange: "NYSE Arca",
    category: "Technology Sector",
    family: "Demo Sector Funds",
    expenseRatio: 0.001,
    benchmarkIndex: "Demo Technology Select Index",
    description: "Holds US technology companies weighted by capitalisation. Holdings data is available for this fund, so sector look-through is possible.",
    priceStart: 165,
    drift: 0.18,
    vol: 0.26,
    dividend: { startAnnual: 1.1, growth: 0.03, months: [3, 6, 9, 12] },
    marketBeta: 1.2,
    holdings: [
      { symbol: "HALC", name: "Halcyon Semiconductor", sector: "Technology", weight: 0.14 },
      { symbol: null, name: "Other semiconductors (demo)", sector: "Technology", weight: 0.22 },
      { symbol: "QNTL", name: "Quantell Software", sector: "Technology", weight: 0.05 },
      { symbol: null, name: "Other software (demo)", sector: "Technology", weight: 0.31 },
      { symbol: "OBSD", name: "Obsidian Media", sector: "Communication Services", weight: 0.04 },
      { symbol: null, name: "IT services and hardware (demo)", sector: "Technology", weight: 0.24 },
    ],
  },
  {
    symbol: "DVGR",
    name: "Dividend Growth ETF",
    exchange: "Nasdaq",
    category: "US Dividend Growth",
    family: "Demo Income Funds",
    expenseRatio: 0.0006,
    benchmarkIndex: "Demo Dividend Achievers Index",
    description: "Holds US companies with at least ten consecutive years of dividend growth. No holdings file is included in the demo, so look-through exposure is unavailable for this fund.",
    priceStart: 72,
    drift: 0.08,
    vol: 0.14,
    dividend: { startAnnual: 1.5, growth: 0.07, months: [3, 6, 9, 12] },
    marketBeta: 0.8,
    holdings: null,
  },
];
