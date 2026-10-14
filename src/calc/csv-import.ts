/**
 * CSV import: header mapping suggestions, row validation, and duplicate
 * detection. Parsing the file itself is done by the caller (papaparse);
 * this module works on already-parsed rows so it stays dependency-free and
 * testable.
 */
import { decOrNull, toDecimalString } from "./money";
import { isISODate } from "./dates";
import type { ISODate, LedgerTransaction, TransactionType } from "./types";

export interface ImportColumnMapping {
  date: string | null;
  type: string | null;
  symbol: string | null;
  quantity: string | null;
  price: string | null;
  amount: string | null;
  fee: string | null;
  note: string | null;
  /** Column holding a split ratio such as "4:1" or "4/1". */
  splitRatio: string | null;
}

export const MAPPING_FIELDS: Array<{ key: keyof ImportColumnMapping; label: string; required: boolean; hint: string }> = [
  { key: "date", label: "Date", required: true, hint: "YYYY-MM-DD, MM/DD/YYYY or DD/MM/YYYY" },
  { key: "type", label: "Type", required: true, hint: "buy, sell, deposit, withdrawal, dividend, interest, fee, split" },
  { key: "symbol", label: "Symbol", required: false, hint: "Ticker for trades, dividends and splits" },
  { key: "quantity", label: "Quantity", required: false, hint: "Shares for buys and sells" },
  { key: "price", label: "Price", required: false, hint: "Per-share price for buys and sells" },
  { key: "amount", label: "Amount", required: false, hint: "Cash amount for deposits, withdrawals, dividends, interest, fees" },
  { key: "fee", label: "Fee", required: false, hint: "Commission on a trade" },
  { key: "note", label: "Note", required: false, hint: "Free text" },
  { key: "splitRatio", label: "Split ratio", required: false, hint: "e.g. 4:1" },
];

export type DateFormat = "auto" | "YMD" | "MDY" | "DMY";

const HEADER_ALIASES: Record<keyof ImportColumnMapping, string[]> = {
  date: ["date", "trade date", "tradedate", "transaction date", "run date", "settlement date", "activity date", "datetime"],
  type: ["type", "action", "transaction type", "activity", "transaction", "side", "description", "trans type"],
  symbol: ["symbol", "ticker", "security", "stock", "instrument"],
  quantity: ["quantity", "qty", "shares", "units", "amount of shares", "no. of shares"],
  price: ["price", "unit price", "price per share", "share price", "fill price", "trade price"],
  amount: ["amount", "net amount", "total", "cash amount", "value", "net cash", "proceeds", "total amount"],
  fee: ["fee", "fees", "commission", "commissions", "charges"],
  note: ["note", "notes", "memo", "comment", "comments", "remarks"],
  splitRatio: ["split ratio", "ratio", "split"],
};

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/[_\-]+/g, " ").replace(/\s+/g, " ");
}

/** Suggest a column mapping from CSV headers. Exact alias matches win; then prefix matches. */
export function suggestMapping(headers: readonly string[]): ImportColumnMapping {
  const mapping: ImportColumnMapping = { date: null, type: null, symbol: null, quantity: null, price: null, amount: null, fee: null, note: null, splitRatio: null };
  const normalized = headers.map((h) => ({ raw: h, norm: normalizeHeader(h) }));
  const used = new Set<string>();
  for (const key of Object.keys(HEADER_ALIASES) as Array<keyof ImportColumnMapping>) {
    const aliases = HEADER_ALIASES[key];
    const exact = normalized.find((h) => !used.has(h.raw) && aliases.includes(h.norm));
    const match = exact ?? normalized.find((h) => !used.has(h.raw) && aliases.some((a) => h.norm.startsWith(a) || h.norm.endsWith(a)));
    if (match) {
      mapping[key] = match.raw;
      used.add(match.raw);
    }
  }
  return mapping;
}

const TYPE_ALIASES: Array<[TransactionType, RegExp]> = [
  ["BUY", /^(buy|bought|purchase|purchased|b|bto|buy to open|reinvest(ment)?|drip)$/],
  ["SELL", /^(sell|sold|s|stc|sell to close|sale)$/],
  ["DEPOSIT", /^(deposit|contribution|cash in|transfer in|funding|fund|wire in|credit)$/],
  ["WITHDRAWAL", /^(withdrawal|withdraw|cash out|transfer out|distribution|wire out|debit)$/],
  ["DIVIDEND", /^(dividend|div|cash dividend|qualified dividend|ordinary dividend|dividends)$/],
  ["INTEREST", /^(interest|int|interest income|credit interest)$/],
  ["FEE", /^(fee|fees|commission|charge|adr fee|service fee)$/],
  ["SPLIT", /^(split|stock split|forward split|reverse split)$/],
];

export function parseTypeValue(raw: string | null | undefined): TransactionType | null {
  if (!raw) return null;
  const v = raw.trim().toLowerCase().replace(/[_\-]+/g, " ").replace(/\s+/g, " ");
  if (!v) return null;
  for (const [type, re] of TYPE_ALIASES) if (re.test(v)) return type;
  if (v.startsWith("buy")) return "BUY";
  if (v.startsWith("sell") || v.startsWith("sold")) return "SELL";
  if (v.includes("dividend")) return "DIVIDEND";
  if (v.includes("deposit")) return "DEPOSIT";
  if (v.includes("withdraw")) return "WITHDRAWAL";
  if (v.includes("split")) return "SPLIT";
  if (v.includes("interest")) return "INTEREST";
  if (v.includes("fee") || v.includes("commission")) return "FEE";
  return null;
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** Parse common date formats to ISO. Ambiguous numeric dates follow `format`; `auto` prefers ISO, then unambiguous day > 12 detection, then MDY. */
export function parseDateValue(raw: string | null | undefined, format: DateFormat = "auto"): ISODate | null {
  if (!raw) return null;
  const v = raw.trim();
  if (!v) return null;
  const iso = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/);
  if (iso) {
    const d = `${iso[1]}-${pad(Number(iso[2]))}-${pad(Number(iso[3]))}`;
    return isISODate(d) ? d : null;
  }
  const slash = v.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})$/);
  if (slash) {
    const a = Number(slash[1]);
    const b = Number(slash[2]);
    let y = Number(slash[3]);
    if (slash[3].length === 2) y += y < 70 ? 2000 : 1900;
    let month: number;
    let day: number;
    if (format === "DMY") {
      day = a;
      month = b;
    } else if (format === "MDY") {
      month = a;
      day = b;
    } else {
      if (a > 12 && b <= 12) {
        day = a;
        month = b;
      } else {
        month = a;
        day = b;
      }
    }
    const d = `${y}-${pad(month)}-${pad(day)}`;
    return isISODate(d) ? d : null;
  }
  const ymdCompact = v.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (ymdCompact) {
    const d = `${ymdCompact[1]}-${ymdCompact[2]}-${ymdCompact[3]}`;
    return isISODate(d) ? d : null;
  }
  const monthName = v.match(/^(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})$/) ?? v.match(/^([A-Za-z]{3,})\s+(\d{1,2}),?\s+(\d{4})$/);
  if (monthName) {
    const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
    const [p1, p2, p3] = [monthName[1], monthName[2], monthName[3]];
    const monthIdx = months.indexOf((/^[A-Za-z]/.test(p1) ? p1 : p2).slice(0, 3).toLowerCase());
    const day = Number(/^[A-Za-z]/.test(p1) ? p2 : p1);
    if (monthIdx >= 0) {
      const d = `${p3}-${pad(monthIdx + 1)}-${pad(day)}`;
      return isISODate(d) ? d : null;
    }
  }
  return null;
}

function cleanNumber(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  let v = raw.trim();
  if (!v) return null;
  let negative = false;
  if (/^\(.*\)$/.test(v)) {
    negative = true;
    v = v.slice(1, -1);
  }
  v = v.replace(/[$€£,\s]/g, "");
  if (v.startsWith("-")) {
    negative = !negative;
    v = v.slice(1);
  }
  if (v.startsWith("+")) v = v.slice(1);
  const d = decOrNull(v);
  if (!d) return null;
  return toDecimalString(negative ? d.neg() : d);
}

export function parseSplitRatio(raw: string | null | undefined): { numerator: number; denominator: number } | null {
  if (!raw) return null;
  const m = raw.trim().match(/^(\d+(?:\.\d+)?)\s*[:\/]\s*(\d+(?:\.\d+)?)$/) ?? raw.trim().match(/^(\d+(?:\.\d+)?)\s*(?:for|-for-)\s*(\d+(?:\.\d+)?)$/i);
  if (!m) {
    const single = raw.trim().match(/^(\d+(?:\.\d+)?)$/);
    if (single) return { numerator: Number(single[1]), denominator: 1 };
    return null;
  }
  return { numerator: Number(m[1]), denominator: Number(m[2]) };
}

export type NewTransaction = Omit<LedgerTransaction, "id" | "sequence">;

export interface ImportRowResult {
  rowNumber: number;
  raw: Record<string, string>;
  transaction: NewTransaction | null;
  errors: string[];
  warnings: string[];
  /** Set when the row matches an existing transaction or an earlier row in the file. */
  duplicate: "existing" | "file" | null;
  fingerprint: string | null;
}

export interface ImportValidation {
  rows: ImportRowResult[];
  summary: { total: number; valid: number; invalid: number; duplicatesOfExisting: number; duplicatesInFile: number; importable: number };
}

/**
 * Stable fingerprint of a transaction's economic content, used to detect
 * duplicates across re-imports (date, type, symbol, quantity, price, amount, fee).
 */
export function transactionFingerprint(t: NewTransaction): string {
  const num = (v: string | null | undefined) => {
    const d = decOrNull(v);
    return d ? d.toDecimalPlaces(8).toString() : "";
  };
  return [
    t.date,
    t.type,
    (t.symbol ?? "").toUpperCase(),
    num(t.quantity),
    num(t.price),
    num(t.amount),
    num(t.fee),
    t.type === "SPLIT" ? `${t.splitNumerator ?? ""}:${t.splitDenominator ?? ""}` : "",
  ].join("|");
}

export interface ValidateOptions {
  mapping: ImportColumnMapping;
  dateFormat?: DateFormat;
  existingFingerprints?: ReadonlySet<string>;
}

export function validateImportRows(rows: ReadonlyArray<Record<string, string>>, options: ValidateOptions): ImportValidation {
  const { mapping } = options;
  const dateFormat = options.dateFormat ?? "auto";
  const existing = options.existingFingerprints ?? new Set<string>();
  const seenInFile = new Set<string>();
  const results: ImportRowResult[] = [];
  const get = (row: Record<string, string>, col: string | null): string | null => (col && col in row ? row[col] : null);

  rows.forEach((raw, index) => {
    const rowNumber = index + 1;
    const errors: string[] = [];
    const warnings: string[] = [];
    const allEmpty = Object.values(raw).every((v) => !v || !String(v).trim());
    if (allEmpty) {
      results.push({ rowNumber, raw, transaction: null, errors: ["Empty row."], warnings, duplicate: null, fingerprint: null });
      return;
    }
    const date = parseDateValue(get(raw, mapping.date), dateFormat);
    if (!date) errors.push(`Unrecognised date "${get(raw, mapping.date) ?? ""}".`);
    const type = parseTypeValue(get(raw, mapping.type));
    if (!type) errors.push(`Unrecognised transaction type "${get(raw, mapping.type) ?? ""}".`);
    const symbol = (get(raw, mapping.symbol) ?? "").trim().toUpperCase() || null;
    const quantity = cleanNumber(get(raw, mapping.quantity));
    const price = cleanNumber(get(raw, mapping.price));
    let amount = cleanNumber(get(raw, mapping.amount));
    const fee = cleanNumber(get(raw, mapping.fee));
    const note = (get(raw, mapping.note) ?? "").trim() || null;

    let tx: NewTransaction | null = null;
    if (date && type) {
      const abs = (v: string | null) => (v && v.startsWith("-") ? v.slice(1) : v);
      switch (type) {
        case "BUY":
        case "SELL": {
          if (!symbol) errors.push("Trades need a symbol.");
          const q = abs(quantity);
          let p = abs(price);
          if (!q || decOrNull(q)!.lte(0)) errors.push("Trades need a positive quantity.");
          if (!p && q && amount) {
            // Derive price from the total when only a total is given.
            const qd = decOrNull(q)!;
            const ad = decOrNull(abs(amount))!;
            if (qd.gt(0)) {
              p = toDecimalString(ad.div(qd));
              warnings.push("Price derived from amount / quantity.");
            }
          }
          if (!p) errors.push("Trades need a price (or an amount to derive it from).");
          const f = fee ? abs(fee) : null;
          tx = { type, date, symbol, quantity: q, price: p, amount: null, fee: f, splitNumerator: null, splitDenominator: null, linkedTransactionId: null, note };
          break;
        }
        case "DEPOSIT":
        case "WITHDRAWAL":
        case "INTEREST":
        case "FEE":
        case "DIVIDEND": {
          if (!amount) {
            if (quantity && price) {
              amount = toDecimalString(decOrNull(quantity)!.times(decOrNull(price)!));
              warnings.push("Amount derived from quantity x price.");
            }
          }
          const a = abs(amount);
          if (!a || decOrNull(a)!.lte(0)) errors.push(`${type.charAt(0) + type.slice(1).toLowerCase()} rows need a positive amount.`);
          if (type === "DIVIDEND" && !symbol) errors.push("Dividends need a symbol.");
          if (amount && amount.startsWith("-") && (type === "DEPOSIT" || type === "DIVIDEND" || type === "INTEREST")) {
            warnings.push("Negative amount treated as positive for this transaction type.");
          }
          tx = { type, date, symbol: type === "DIVIDEND" ? symbol : symbol, quantity: null, price: null, amount: a, fee: null, splitNumerator: null, splitDenominator: null, linkedTransactionId: null, note };
          break;
        }
        case "SPLIT": {
          if (!symbol) errors.push("Splits need a symbol.");
          const ratioRaw = get(raw, mapping.splitRatio) ?? get(raw, mapping.quantity) ?? get(raw, mapping.note);
          const ratio = parseSplitRatio(ratioRaw);
          if (!ratio) errors.push(`Splits need a ratio such as "4:1" (got "${ratioRaw ?? ""}").`);
          tx = {
            type,
            date,
            symbol,
            quantity: null,
            price: null,
            amount: null,
            fee: null,
            splitNumerator: ratio?.numerator ?? null,
            splitDenominator: ratio?.denominator ?? null,
            linkedTransactionId: null,
            note,
          };
          break;
        }
      }
    }
    let fingerprint: string | null = null;
    let duplicate: ImportRowResult["duplicate"] = null;
    if (tx && errors.length === 0) {
      fingerprint = transactionFingerprint(tx);
      if (existing.has(fingerprint)) duplicate = "existing";
      else if (seenInFile.has(fingerprint)) duplicate = "file";
      seenInFile.add(fingerprint);
    }
    results.push({ rowNumber, raw, transaction: errors.length ? null : tx, errors, warnings, duplicate, fingerprint });
  });

  const valid = results.filter((r) => r.transaction !== null);
  const duplicatesOfExisting = valid.filter((r) => r.duplicate === "existing").length;
  const duplicatesInFile = valid.filter((r) => r.duplicate === "file").length;
  return {
    rows: results,
    summary: {
      total: results.length,
      valid: valid.length,
      invalid: results.length - valid.length,
      duplicatesOfExisting,
      duplicatesInFile,
      importable: valid.length - duplicatesOfExisting - duplicatesInFile,
    },
  };
}

export const EXPORT_COLUMNS = ["date", "type", "symbol", "quantity", "price", "amount", "fee", "split_ratio", "linked_transaction_id", "note", "id"] as const;

function csvEscape(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Export transactions in the same shape the importer accepts. */
export function transactionsToCsv(transactions: readonly LedgerTransaction[]): string {
  const lines = [EXPORT_COLUMNS.join(",")];
  for (const t of transactions) {
    lines.push(
      [
        t.date,
        t.type,
        t.symbol ?? "",
        t.quantity ?? "",
        t.price ?? "",
        t.amount ?? "",
        t.fee ?? "",
        t.type === "SPLIT" && t.splitNumerator && t.splitDenominator ? `${t.splitNumerator}:${t.splitDenominator}` : "",
        t.linkedTransactionId ?? "",
        t.note ?? "",
        t.id,
      ]
        .map(csvEscape)
        .join(","),
    );
  }
  return lines.join("\n") + "\n";
}
