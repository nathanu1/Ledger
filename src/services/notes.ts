import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { notes, researchVisits, type NoteRow } from "@/db/schema";
import { newId, nowIso } from "@/lib/ids";

export type NoteEntityType = "company" | "portfolio" | "position" | "metric" | "page";

export function listNotes(entityType: NoteEntityType, entityId: string): NoteRow[] {
  return getDb().select().from(notes).where(and(eq(notes.entityType, entityType), eq(notes.entityId, entityId))).orderBy(desc(notes.updatedAt)).all();
}

export function addNote(entityType: NoteEntityType, entityId: string, body: string): NoteRow {
  const now = nowIso();
  const id = newId("note");
  getDb().insert(notes).values({ id, entityType, entityId, body: body.trim(), createdAt: now, updatedAt: now }).run();
  return getDb().select().from(notes).where(eq(notes.id, id)).get()!;
}

export function updateNote(id: string, body: string): void {
  getDb().update(notes).set({ body: body.trim(), updatedAt: nowIso() }).where(eq(notes.id, id)).run();
}

export function deleteNote(id: string): void {
  getDb().delete(notes).where(eq(notes.id, id)).run();
}

/** Record a company page visit; returns the previous visit so the page can show what changed since. */
export function recordVisit(symbol: string): { previousVisitAt: string | null } {
  const db = getDb();
  const upper = symbol.toUpperCase();
  const existing = db.select().from(researchVisits).where(eq(researchVisits.symbol, upper)).get();
  const now = nowIso();
  if (!existing) {
    db.insert(researchVisits).values({ symbol: upper, lastVisitedAt: now, previousVisitAt: null }).run();
    return { previousVisitAt: null };
  }
  // Only roll the visit forward when the last visit is more than an hour old, so reloads do not erase "since last visit".
  if (Date.now() - Date.parse(existing.lastVisitedAt) > 3_600_000) {
    db.update(researchVisits).set({ previousVisitAt: existing.lastVisitedAt, lastVisitedAt: now }).where(eq(researchVisits.symbol, upper)).run();
    return { previousVisitAt: existing.lastVisitedAt };
  }
  return { previousVisitAt: existing.previousVisitAt };
}
