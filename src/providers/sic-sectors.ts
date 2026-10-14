/**
 * Coarse mapping from SEC SIC codes to sector labels. SEC filings carry SIC
 * codes, not GICS sectors, so every classification derived here is labelled
 * "derived from SIC" in the interface.
 */
export interface SicClassification {
  sector: string;
  industry: string | null;
}

const RANGES: Array<[number, number, string]> = [
  [100, 999, "Agriculture"],
  [1000, 1499, "Energy & Mining"],
  [1500, 1799, "Industrials"],
  [2000, 2199, "Consumer Staples"],
  [2200, 2399, "Consumer Discretionary"],
  [2400, 2799, "Materials"],
  [2800, 2829, "Materials"],
  [2830, 2836, "Health Care"],
  [2840, 2899, "Consumer Staples"],
  [2900, 2999, "Energy & Mining"],
  [3000, 3569, "Industrials"],
  [3570, 3579, "Technology"],
  [3580, 3599, "Industrials"],
  [3600, 3699, "Technology"],
  [3700, 3799, "Industrials"],
  [3800, 3839, "Technology"],
  [3840, 3851, "Health Care"],
  [3852, 3999, "Industrials"],
  [4000, 4799, "Transportation"],
  [4800, 4899, "Communication Services"],
  [4900, 4999, "Utilities"],
  [5000, 5199, "Consumer Discretionary"],
  [5200, 5399, "Consumer Discretionary"],
  [5400, 5499, "Consumer Staples"],
  [5500, 5999, "Consumer Discretionary"],
  [6000, 6199, "Financials"],
  [6200, 6299, "Financials"],
  [6300, 6499, "Financials"],
  [6500, 6553, "Real Estate"],
  [6770, 6799, "Financials"],
  [7000, 7369, "Consumer Discretionary"],
  [7370, 7379, "Technology"],
  [7380, 7999, "Consumer Discretionary"],
  [8000, 8099, "Health Care"],
  [8100, 8999, "Industrials"],
  [9000, 9999, "Other"],
];

const OVERRIDES: Record<number, string> = {
  3711: "Consumer Discretionary",
  3714: "Consumer Discretionary",
  3716: "Consumer Discretionary",
  2834: "Health Care",
  2836: "Health Care",
  6798: "Real Estate",
  7812: "Communication Services",
  7819: "Communication Services",
  7822: "Communication Services",
  7841: "Communication Services",
  4813: "Communication Services",
  4841: "Communication Services",
  4899: "Communication Services",
  5961: "Consumer Discretionary",
  5411: "Consumer Staples",
  5912: "Consumer Staples",
  2111: "Consumer Staples",
  7389: "Industrials",
  7372: "Technology",
  7373: "Technology",
  7374: "Technology",
  3674: "Technology",
  3663: "Technology",
  3571: "Technology",
  3572: "Technology",
  3576: "Technology",
  3577: "Technology",
  6022: "Financials",
  6021: "Financials",
  6189: "Financials",
  6211: "Financials",
  6282: "Financials",
  6311: "Financials",
  6331: "Financials",
  6770: "Financials",
};

export function classifySic(sic: string | number | null | undefined, sicDescription?: string | null): SicClassification | null {
  if (sic === null || sic === undefined || sic === "") return null;
  const code = Number(sic);
  if (!Number.isFinite(code)) return null;
  const sector = OVERRIDES[code] ?? RANGES.find(([lo, hi]) => code >= lo && code <= hi)?.[2] ?? null;
  if (!sector) return null;
  return { sector, industry: sicDescription ? titleCase(sicDescription) : null };
}

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/\b([a-z])/g, (m) => m.toUpperCase())
    .replace(/\b(And|Of|The|For|In|On|To|By|Or)\b/g, (m) => m.toLowerCase())
    .replace(/^([a-z])/, (m) => m.toUpperCase())
    .replace(/\s*\(no\s*/i, " (No ");
}
