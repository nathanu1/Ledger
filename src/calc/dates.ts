import type { ISODate } from "./types";

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isISODate(value: string): value is ISODate {
  const m = ISO_DATE.exec(value);
  if (!m) return false;
  const [, y, mo, d] = m;
  const date = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)));
  return (
    date.getUTCFullYear() === Number(y) &&
    date.getUTCMonth() === Number(mo) - 1 &&
    date.getUTCDate() === Number(d)
  );
}

export function toUTCDate(date: ISODate): Date {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function fromUTCDate(date: Date): ISODate {
  return date.toISOString().slice(0, 10);
}

export function todayISO(now: Date = new Date()): ISODate {
  return fromUTCDate(now);
}

export function addDays(date: ISODate, days: number): ISODate {
  const d = toUTCDate(date);
  d.setUTCDate(d.getUTCDate() + days);
  return fromUTCDate(d);
}

export function addMonths(date: ISODate, months: number): ISODate {
  const d = toUTCDate(date);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return fromUTCDate(d);
}

/** Whole days from `a` to `b` (positive when b is later). */
export function daysBetween(a: ISODate, b: ISODate): number {
  const ms = toUTCDate(b).getTime() - toUTCDate(a).getTime();
  return Math.round(ms / 86_400_000);
}

/** Year fraction on an ACT/365 basis, used by the money-weighted return. */
export function yearFraction(a: ISODate, b: ISODate): number {
  return daysBetween(a, b) / 365;
}

export function compareDates(a: ISODate, b: ISODate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function maxDate(a: ISODate, b: ISODate): ISODate {
  return a >= b ? a : b;
}

export function minDate(a: ISODate, b: ISODate): ISODate {
  return a <= b ? a : b;
}

export function isWeekend(date: ISODate): boolean {
  const day = toUTCDate(date).getUTCDay();
  return day === 0 || day === 6;
}

/** Start of the calendar year for a date. */
export function startOfYear(date: ISODate): ISODate {
  return `${date.slice(0, 4)}-01-01`;
}

/**
 * Build a sorted, de-duplicated trading calendar from one or more date lists
 * (typically the dates on which prices exist). Using observed price dates as the
 * calendar avoids exchange-holiday logic and keeps valuation aligned with data.
 */
export function unionCalendar(...dateLists: Iterable<ISODate>[]): ISODate[] {
  const set = new Set<ISODate>();
  for (const list of dateLists) for (const d of list) set.add(d);
  return [...set].sort();
}

/**
 * Binary search: index of the last element <= target, or -1 when none.
 * `dates` must be sorted ascending.
 */
export function lastIndexOnOrBefore(dates: readonly ISODate[], target: ISODate): number {
  let lo = 0;
  let hi = dates.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (dates[mid] <= target) {
      ans = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return ans;
}

/** Index of the first element >= target, or dates.length when none. */
export function firstIndexOnOrAfter(dates: readonly ISODate[], target: ISODate): number {
  let lo = 0;
  let hi = dates.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (dates[mid] < target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
