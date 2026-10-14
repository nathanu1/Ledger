/**
 * Number and date formatting. Locale is fixed to en-US so server and client
 * render identically (hydration-safe) and because Ledger starts with USD portfolios.
 */
const LOCALE = "en-US";

const moneyFmt = new Intl.NumberFormat(LOCALE, { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const moneyWholeFmt = new Intl.NumberFormat(LOCALE, { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 });
/**
 * Compact figures are formatted by hand: Intl's compact notation renders trailing
 * zeros differently across ICU versions (server "70.80B" vs browser "70.8B"),
 * which would break hydration.
 */
function compactParts(n: number): { value: string; suffix: string } {
  const abs = Math.abs(n);
  const [divisor, suffix] = abs >= 1e12 ? [1e12, "T"] : abs >= 1e9 ? [1e9, "B"] : abs >= 1e6 ? [1e6, "M"] : abs >= 1e4 ? [1e3, "K"] : [1, ""];
  const scaled = abs / divisor;
  const digits = suffix === "" ? (abs >= 1000 ? 0 : 2) : scaled >= 100 ? 0 : scaled >= 10 ? 1 : 2;
  const value = new Intl.NumberFormat(LOCALE, { minimumFractionDigits: 0, maximumFractionDigits: digits }).format(scaled);
  return { value, suffix };
}
const intFmt = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 });
const dateFmt = new Intl.DateTimeFormat(LOCALE, { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
const dateTimeFmt = new Intl.DateTimeFormat(LOCALE, { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "UTC", timeZoneName: "short" });

export type Numeric = number | string | null | undefined;

function toNum(v: Numeric): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

export const MISSING = "—"; // used only as a glyph in tables, with an accessible label

/** $1,234.56 */
export function formatMoney(v: Numeric, options: { whole?: boolean; signed?: boolean } = {}): string {
  const n = toNum(v);
  if (n === null) return MISSING;
  const s = (options.whole ? moneyWholeFmt : moneyFmt).format(Math.abs(n));
  if (n < 0) return `-${s}`;
  return options.signed && n > 0 ? `+${s}` : s;
}

/** $4.2B */
export function formatMoneyCompact(v: Numeric, options: { signed?: boolean } = {}): string {
  const n = toNum(v);
  if (n === null) return MISSING;
  if (Math.abs(n) < 10_000) return formatMoney(n, { signed: options.signed, whole: Math.abs(n) >= 1000 });
  const { value, suffix } = compactParts(n);
  const s = `$${value}${suffix}`;
  if (n < 0) return `-${s}`;
  return options.signed && n > 0 ? `+${s}` : s;
}

/** 12.3% from 0.123 */
export function formatPct(v: Numeric, options: { digits?: number; signed?: boolean } = {}): string {
  const n = toNum(v);
  if (n === null) return MISSING;
  const digits = options.digits ?? 1;
  const s = `${(Math.abs(n) * 100).toFixed(digits)}%`;
  if (n < 0) return `-${s}`;
  return options.signed && n > 0 ? `+${s}` : s;
}

/** 12.3 from 12.345 */
export function formatNumber(v: Numeric, digits = 2): string {
  const n = toNum(v);
  if (n === null) return MISSING;
  return new Intl.NumberFormat(LOCALE, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n);
}

export function formatInt(v: Numeric): string {
  const n = toNum(v);
  if (n === null) return MISSING;
  return intFmt.format(n);
}

/** 1.2B / 345.6M */
export function formatCompact(v: Numeric): string {
  const n = toNum(v);
  if (n === null) return MISSING;
  const { value, suffix } = compactParts(n);
  return `${n < 0 ? "-" : ""}${value}${suffix}`;
}

/** Share quantities: up to 4 decimals, trailing zeros trimmed. */
export function formatShares(v: Numeric): string {
  const n = toNum(v);
  if (n === null) return MISSING;
  return new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 4 }).format(n);
}

/** 12.5x */
export function formatMultiple(v: Numeric): string {
  const n = toNum(v);
  if (n === null) return MISSING;
  return `${n.toFixed(1)}x`;
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return MISSING;
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
  if (Number.isNaN(d.getTime())) return iso;
  return dateFmt.format(d);
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return MISSING;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return dateTimeFmt.format(d);
}

/** "3 days ago" style relative time for freshness badges. */
export function formatRelative(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return "never";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return iso;
  const diff = Math.max(0, now.getTime() - t);
  const minutes = Math.round(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} d ago`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months} mo ago`;
  return `${Math.round(months / 12)} y ago`;
}

/** Sign glyph for screen readers and colour-independent meaning. */
export function signLabel(v: Numeric): "positive" | "negative" | "flat" | "unknown" {
  const n = toNum(v);
  if (n === null) return "unknown";
  if (n > 0) return "positive";
  if (n < 0) return "negative";
  return "flat";
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max);
}
