"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { DcfInputs } from "@/calc/dcf";
import type { MetricKey } from "@/calc/fundamentals";
import { isISODate } from "@/calc/dates";
import { confirmEarningsDate, refreshFundamentals } from "@/services/fundamentals";
import { refreshMarketData } from "@/services/market-data";
import { addNote, deleteNote, updateNote, type NoteEntityType } from "@/services/notes";
import { deleteScenario, saveScenario } from "@/services/dcf";
import { getDataMode } from "@/services/settings";
import { addRule, deleteRule, saveThesisRevision, setThesisStatus, toggleRule, type ThesisStatus } from "@/services/thesis";
import { addWatchlistItem, ensureDefaultWatchlist, isWatched, removeWatchlistItem, updateWatchlistItem, getWatchlistRows } from "@/services/watchlist";
import type { ActionResult } from "./portfolio";

function revalidateCompany(symbol: string) {
  revalidatePath(`/company/${symbol}`);
  revalidatePath("/watchlist");
  revalidatePath("/");
}

export async function toggleWatchlistAction(symbol: string): Promise<ActionResult<{ watched: boolean }>> {
  const upper = symbol.toUpperCase();
  const wl = ensureDefaultWatchlist();
  if (isWatched(upper)) {
    const row = getWatchlistRows(wl.id).find((r) => r.item.symbol === upper);
    if (row) removeWatchlistItem(row.item.id);
    revalidateCompany(upper);
    return { ok: true, message: `${upper} removed from the watchlist.`, data: { watched: false } };
  }
  addWatchlistItem(wl.id, upper);
  revalidateCompany(upper);
  return { ok: true, message: `${upper} added to the watchlist.`, data: { watched: true } };
}

export async function updateWatchlistItemAction(id: string, input: { tags?: string[]; note?: string | null }): Promise<ActionResult> {
  updateWatchlistItem(id, input);
  revalidatePath("/watchlist");
  return { ok: true, message: "Saved." };
}

export async function removeWatchlistItemAction(id: string): Promise<ActionResult> {
  removeWatchlistItem(id);
  revalidatePath("/watchlist");
  revalidatePath("/");
  return { ok: true, message: "Removed from the watchlist." };
}

const thesisSchema = z.object({
  summary: z.string().trim().min(1, "Write the thesis in a sentence or two.").max(4000),
  drivers: z.string().trim().max(4000).default(""),
  risks: z.string().trim().max(4000).default(""),
  invalidation: z.string().trim().max(4000).default(""),
  valuationAssumptions: z.string().trim().max(4000).default(""),
  reviewDate: z.string().trim().refine((v) => v === "" || isISODate(v), "Enter a date as YYYY-MM-DD").default(""),
  links: z.array(z.object({ label: z.string().trim().max(120), url: z.string().trim().max(500) })).max(20).default([]),
  changeNote: z.string().trim().max(500).default(""),
  status: z.enum(["draft", "active", "review", "closed"]).optional(),
});

export async function saveThesisAction(symbol: string, raw: z.input<typeof thesisSchema>): Promise<ActionResult> {
  const parsed = thesisSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0] ?? "form")] = issue.message;
    return { ok: false, message: "Check the highlighted fields.", fieldErrors };
  }
  const d = parsed.data;
  saveThesisRevision(symbol, { summary: d.summary, drivers: d.drivers, risks: d.risks, invalidation: d.invalidation, valuationAssumptions: d.valuationAssumptions, reviewDate: d.reviewDate || null, links: d.links, changeNote: d.changeNote || null }, d.status as ThesisStatus | undefined);
  revalidateCompany(symbol.toUpperCase());
  revalidatePath("/theses");
  return { ok: true, message: "Thesis revision saved." };
}

export async function setThesisStatusAction(symbol: string, status: ThesisStatus): Promise<ActionResult> {
  setThesisStatus(symbol, status);
  revalidateCompany(symbol.toUpperCase());
  revalidatePath("/theses");
  return { ok: true, message: `Status set to ${status}.` };
}

export async function addRuleAction(symbol: string, input: { metric: MetricKey; operator: "lt" | "gt"; threshold: number; periodType: "quarter" | "annual" | "ttm" }): Promise<ActionResult> {
  if (!Number.isFinite(input.threshold)) return { ok: false, message: "Enter a numeric threshold." };
  const r = addRule(symbol, input);
  if (!r) return { ok: false, message: "Save a thesis before adding review rules." };
  revalidateCompany(symbol.toUpperCase());
  revalidatePath("/theses");
  return { ok: true, message: "Review rule added." };
}

export async function toggleRuleAction(symbol: string, ruleId: string, enabled: boolean): Promise<ActionResult> {
  toggleRule(ruleId, enabled);
  revalidateCompany(symbol.toUpperCase());
  revalidatePath("/theses");
  return { ok: true, message: enabled ? "Rule enabled." : "Rule paused." };
}

export async function deleteRuleAction(symbol: string, ruleId: string): Promise<ActionResult> {
  deleteRule(ruleId);
  revalidateCompany(symbol.toUpperCase());
  revalidatePath("/theses");
  return { ok: true, message: "Rule deleted." };
}

export async function saveScenarioAction(symbol: string, name: string, kind: string, inputs: DcfInputs, id?: string): Promise<ActionResult<{ id: string }>> {
  if (!name.trim()) return { ok: false, message: "Give the scenario a name." };
  const row = saveScenario(symbol, name, kind, inputs, id);
  revalidateCompany(symbol.toUpperCase());
  return { ok: true, message: "Scenario saved.", data: { id: row.id } };
}

export async function deleteScenarioAction(symbol: string, id: string): Promise<ActionResult> {
  deleteScenario(id);
  revalidateCompany(symbol.toUpperCase());
  return { ok: true, message: "Scenario deleted." };
}

export async function addNoteAction(entityType: NoteEntityType, entityId: string, body: string, path: string): Promise<ActionResult> {
  if (!body.trim()) return { ok: false, message: "Write something first." };
  addNote(entityType, entityId, body.slice(0, 4000));
  revalidatePath(path);
  return { ok: true, message: "Note added." };
}

export async function updateNoteAction(id: string, body: string, path: string): Promise<ActionResult> {
  updateNote(id, body.slice(0, 4000));
  revalidatePath(path);
  return { ok: true, message: "Note updated." };
}

export async function deleteNoteAction(id: string, path: string): Promise<ActionResult> {
  deleteNote(id);
  revalidatePath(path);
  return { ok: true, message: "Note deleted." };
}

export async function refreshSymbolAction(symbol: string, force = false): Promise<ActionResult<{ market: string; fundamentals: string }>> {
  if (getDataMode() === "demo") return { ok: false, message: "Demo mode uses the built-in dataset. Switch to connected mode in Settings to fetch live data." };
  const [market, fundamentals] = await Promise.all([refreshMarketData(symbol, { force }), refreshFundamentals(symbol, { force })]);
  revalidateCompany(symbol.toUpperCase());
  const ok = market.ok || fundamentals.ok;
  return { ok, message: `${market.message} ${fundamentals.message}`, data: { market: market.message, fundamentals: fundamentals.message } };
}

export async function confirmEarningsAction(symbol: string, date: string, sourceUrl: string): Promise<ActionResult> {
  if (!isISODate(date)) return { ok: false, message: "Enter the date as YYYY-MM-DD." };
  confirmEarningsDate(symbol, date, sourceUrl.trim() || null);
  revalidateCompany(symbol.toUpperCase());
  return { ok: true, message: "Earnings date marked as confirmed." };
}
