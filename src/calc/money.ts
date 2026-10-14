import Decimal from "decimal.js";
import type { DecimalString } from "./types";

// A single, explicit configuration for all monetary arithmetic.
Decimal.set({ precision: 34, rounding: Decimal.ROUND_HALF_EVEN, toExpNeg: -15, toExpPos: 30 });

export { Decimal };

/**
 * Parse a decimal value. Throws on null, undefined, empty or non-numeric input.
 * Missing values must stay missing: callers decide explicitly how to treat them.
 */
export function dec(value: Decimal.Value | null | undefined): Decimal {
  if (value === null || value === undefined) {
    throw new Error("dec(): value is missing");
  }
  if (typeof value === "string") {
    const trimmed = value.trim().replace(/,/g, "");
    if (trimmed === "") throw new Error("dec(): empty string");
    const d = new Decimal(trimmed);
    if (!d.isFinite()) throw new Error(`dec(): not finite: ${value}`);
    return d;
  }
  const d = new Decimal(value);
  if (!d.isFinite()) throw new Error(`dec(): not finite: ${String(value)}`);
  return d;
}

/** Parse a decimal, returning null for missing or invalid input instead of throwing. */
export function decOrNull(value: Decimal.Value | null | undefined): Decimal | null {
  if (value === null || value === undefined) return null;
  try {
    return dec(value);
  } catch {
    return null;
  }
}

export const ZERO = new Decimal(0);
export const ONE = new Decimal(1);

export function sum(values: Iterable<Decimal>): Decimal {
  let total = ZERO;
  for (const v of values) total = total.plus(v);
  return total;
}

/** Exact string form, suitable for storage and JSON transport. */
export function toDecimalString(d: Decimal): DecimalString {
  return d.toString();
}

/** Round half-even to a number of decimal places and return a string. */
export function toFixed(d: Decimal, places: number): DecimalString {
  return d.toDecimalPlaces(places, Decimal.ROUND_HALF_EVEN).toFixed(places);
}

/** Convert to a JS number for charting. Never used for accounting. */
export function toNumber(d: Decimal): number {
  return d.toNumber();
}

export function isDecimalString(value: string): boolean {
  return decOrNull(value) !== null;
}

/** Returns true when `value` is a positive decimal. */
export function isPositive(d: Decimal): boolean {
  return d.isFinite() && d.gt(0);
}
