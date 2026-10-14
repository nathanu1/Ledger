import { addDays, addMonths, startOfYear } from "./dates";
import type { ISODate } from "./types";

export type PeriodKey = "1D" | "1W" | "1M" | "3M" | "6M" | "YTD" | "1Y" | "3Y" | "ALL";

export const PERIOD_KEYS: readonly PeriodKey[] = ["1D", "1W", "1M", "3M", "6M", "YTD", "1Y", "3Y", "ALL"];

export const PERIOD_LABELS: Record<PeriodKey, string> = {
  "1D": "1 day",
  "1W": "1 week",
  "1M": "1 month",
  "3M": "3 months",
  "6M": "6 months",
  YTD: "Year to date",
  "1Y": "1 year",
  "3Y": "3 years",
  ALL: "Since inception",
};

export function isPeriodKey(value: string | null | undefined): value is PeriodKey {
  return !!value && (PERIOD_KEYS as readonly string[]).includes(value);
}

/** Start date for a period ending on `end`. Returns null for ALL (use inception). */
export function periodStart(period: PeriodKey, end: ISODate): ISODate | null {
  switch (period) {
    case "1D":
      return addDays(end, -1);
    case "1W":
      return addDays(end, -7);
    case "1M":
      return addMonths(end, -1);
    case "3M":
      return addMonths(end, -3);
    case "6M":
      return addMonths(end, -6);
    case "YTD":
      return addDays(startOfYear(end), -1);
    case "1Y":
      return addMonths(end, -12);
    case "3Y":
      return addMonths(end, -36);
    case "ALL":
      return null;
  }
}
