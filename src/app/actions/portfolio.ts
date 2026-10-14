"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { TRANSACTION_TYPES, validateImportRows, type ImportColumnMapping, type ImportValidation, type NewTransaction } from "@/calc";
import { isISODate } from "@/calc/dates";
import { isDecimalString } from "@/calc/money";
import { addTransaction, createPortfolio, deletePortfolio, deleteTransaction, existingFingerprints, getPortfolio, recordImportBatch, updatePortfolio, updateTransaction } from "@/services/portfolio";
import { setSetting } from "@/services/settings";

export interface ActionResult<T = undefined> {
  ok: boolean;
  message: string;
  data?: T;
  fieldErrors?: Record<string, string>;
}

const decimalField = z.string().trim().refine((v) => v === "" || isDecimalString(v), "Enter a number");

const transactionSchema = z.object({
  type: z.enum(TRANSACTION_TYPES as unknown as [string, ...string[]]),
  date: z.string().refine(isISODate, "Enter a date as YYYY-MM-DD"),
  symbol: z.string().trim().toUpperCase().max(12).optional().default(""),
  quantity: decimalField.optional().default(""),
  price: decimalField.optional().default(""),
  amount: decimalField.optional().default(""),
  fee: decimalField.optional().default(""),
  splitNumerator: z.string().trim().optional().default(""),
  splitDenominator: z.string().trim().optional().default(""),
  linkedTransactionId: z.string().trim().optional().default(""),
  note: z.string().trim().max(500).optional().default(""),
});

export type TransactionFormInput = z.input<typeof transactionSchema>;

function toTransactionInput(v: z.output<typeof transactionSchema>): { input: NewTransaction; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const type = v.type as NewTransaction["type"];
  const needsSymbol = type === "BUY" || type === "SELL" || type === "DIVIDEND" || type === "SPLIT";
  if (needsSymbol && !v.symbol) errors.symbol = "A symbol is required for this type.";
  if ((type === "BUY" || type === "SELL") && (!v.quantity || Number(v.quantity) <= 0)) errors.quantity = "Enter a positive quantity.";
  if ((type === "BUY" || type === "SELL") && (v.price === "" || Number(v.price) < 0)) errors.price = "Enter a price of zero or more.";
  if (["DEPOSIT", "WITHDRAWAL", "DIVIDEND", "INTEREST", "FEE"].includes(type) && (!v.amount || Number(v.amount) <= 0)) errors.amount = "Enter a positive amount.";
  if (type === "SPLIT" && (!(Number(v.splitNumerator) > 0) || !(Number(v.splitDenominator) > 0))) errors.splitNumerator = "Enter the split as new shares per old shares, e.g. 4 and 1.";
  return {
    input: {
      type,
      date: v.date,
      symbol: needsSymbol ? v.symbol : null,
      quantity: type === "BUY" || type === "SELL" ? v.quantity : null,
      price: type === "BUY" || type === "SELL" ? v.price : null,
      amount: ["DEPOSIT", "WITHDRAWAL", "DIVIDEND", "INTEREST", "FEE"].includes(type) ? v.amount : null,
      fee: (type === "BUY" || type === "SELL") && v.fee ? v.fee : null,
      splitNumerator: type === "SPLIT" ? Number(v.splitNumerator) : null,
      splitDenominator: type === "SPLIT" ? Number(v.splitDenominator) : null,
      linkedTransactionId: v.linkedTransactionId || null,
      note: v.note || null,
    },
    errors,
  };
}

function revalidatePortfolioPages() {
  revalidatePath("/", "layout");
}

export async function saveTransactionAction(portfolioId: string, raw: TransactionFormInput, id?: string | null): Promise<ActionResult<{ id: string }>> {
  if (!getPortfolio(portfolioId)) return { ok: false, message: "Portfolio not found." };
  const parsed = transactionSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0] ?? "form")] = issue.message;
    return { ok: false, message: "Check the highlighted fields.", fieldErrors };
  }
  const { input, errors } = toTransactionInput(parsed.data);
  if (Object.keys(errors).length) return { ok: false, message: "Check the highlighted fields.", fieldErrors: errors };
  const row = id ? updateTransaction(id, input) : addTransaction(portfolioId, input);
  if (!row) return { ok: false, message: "Transaction not found." };
  revalidatePortfolioPages();
  return { ok: true, message: id ? "Transaction updated." : "Transaction added.", data: { id: row.id } };
}

export async function deleteTransactionAction(id: string): Promise<ActionResult> {
  deleteTransaction(id);
  revalidatePortfolioPages();
  return { ok: true, message: "Transaction deleted." };
}

const portfolioSchema = z.object({ name: z.string().trim().min(1, "Name is required").max(80), benchmarkSymbol: z.string().trim().toUpperCase().min(1, "Benchmark symbol is required").max(12), description: z.string().trim().max(300).optional().default("") });

export async function savePortfolioAction(raw: z.input<typeof portfolioSchema>, id?: string | null): Promise<ActionResult<{ id: string }>> {
  const parsed = portfolioSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0] ?? "form")] = issue.message;
    return { ok: false, message: "Check the highlighted fields.", fieldErrors };
  }
  const p = id ? updatePortfolio(id, { ...parsed.data, description: parsed.data.description || null }) : createPortfolio({ ...parsed.data, description: parsed.data.description || null });
  if (!p) return { ok: false, message: "Portfolio not found." };
  if (!id) setSetting("default_portfolio_id", p.id);
  revalidatePortfolioPages();
  return { ok: true, message: id ? "Portfolio updated." : "Portfolio created.", data: { id: p.id } };
}

export async function deletePortfolioAction(id: string): Promise<ActionResult> {
  deletePortfolio(id);
  revalidatePortfolioPages();
  return { ok: true, message: "Portfolio deleted." };
}

const MAX_IMPORT_ROWS = 5000;

export async function previewImportAction(input: { portfolioId: string; rows: Record<string, string>[]; mapping: ImportColumnMapping; dateFormat?: "auto" | "YMD" | "MDY" | "DMY" }): Promise<ActionResult<ImportValidation>> {
  if (!getPortfolio(input.portfolioId)) return { ok: false, message: "Portfolio not found." };
  if (input.rows.length > MAX_IMPORT_ROWS) return { ok: false, message: `Imports are limited to ${MAX_IMPORT_ROWS} rows at a time.` };
  const validation = validateImportRows(input.rows, { mapping: input.mapping, dateFormat: input.dateFormat ?? "auto", existingFingerprints: existingFingerprints(input.portfolioId) });
  return { ok: true, message: "Preview ready.", data: validation };
}

export async function commitImportAction(input: { portfolioId: string; fileName: string; rows: Record<string, string>[]; mapping: ImportColumnMapping; dateFormat?: "auto" | "YMD" | "MDY" | "DMY"; includeDuplicates?: boolean }): Promise<ActionResult<{ imported: number; skipped: number }>> {
  if (!getPortfolio(input.portfolioId)) return { ok: false, message: "Portfolio not found." };
  if (input.rows.length > MAX_IMPORT_ROWS) return { ok: false, message: `Imports are limited to ${MAX_IMPORT_ROWS} rows at a time.` };
  const validation = validateImportRows(input.rows, { mapping: input.mapping, dateFormat: input.dateFormat ?? "auto", existingFingerprints: existingFingerprints(input.portfolioId) });
  const importable = validation.rows.filter((r) => r.transaction && (input.includeDuplicates || r.duplicate === null));
  const batchId = recordImportBatch({ portfolioId: input.portfolioId, fileName: input.fileName, mapping: input.mapping, rowCount: validation.rows.length, importedCount: importable.length, skippedCount: validation.rows.length - importable.length });
  for (const r of importable) addTransaction(input.portfolioId, { ...r.transaction!, importBatchId: batchId });
  revalidatePortfolioPages();
  return { ok: true, message: `Imported ${importable.length} transactions; skipped ${validation.rows.length - importable.length}.`, data: { imported: importable.length, skipped: validation.rows.length - importable.length } };
}
