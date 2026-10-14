"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowsClockwise, Notebook, Star } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/field";
import { formatDateTime } from "@/lib/format";
import type { NoteRow } from "@/db/schema";
import { addNoteAction, deleteNoteAction, refreshSymbolAction, toggleWatchlistAction, updateNoteAction } from "@/app/actions/research";

export function WatchToggle({ symbol, watched }: { symbol: string; watched: boolean }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  return (
    <Button
      variant={watched ? "primary" : "secondary"}
      size="sm"
      aria-pressed={watched}
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await toggleWatchlistAction(symbol);
          toast[res.ok ? "success" : "error"](res.message);
          router.refresh();
        })
      }
    >
      <Star size={15} weight={watched ? "fill" : "regular"} aria-hidden /> {watched ? "Watching" : "Watch"}
    </Button>
  );
}

export function RefreshButton({ symbol, mode }: { symbol: string; mode: "demo" | "connected" }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  if (mode === "demo") return null;
  return (
    <Button
      variant="secondary"
      size="sm"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await refreshSymbolAction(symbol, true);
          toast[res.ok ? "success" : "error"](res.message, { duration: 8000 });
          router.refresh();
        })
      }
    >
      <ArrowsClockwise size={15} aria-hidden className={pending ? "animate-spin" : ""} /> {pending ? "Refreshing…" : "Refresh data"}
    </Button>
  );
}

export function NotesButton({ symbol, notes }: { symbol: string; notes: NoteRow[] }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState("");
  const [editing, setEditing] = React.useState<{ id: string; body: string } | null>(null);
  const [pending, start] = React.useTransition();
  const path = `/company/${symbol}`;
  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        <Notebook size={15} aria-hidden /> Notes{notes.length ? ` (${notes.length})` : ""}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent side="right" title={`Notes · ${symbol}`} description="Your own research notes. Stored locally with timestamps.">
          <form
            className="flex flex-col gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              start(async () => {
                const res = editing ? await updateNoteAction(editing.id, draft, path) : await addNoteAction("company", symbol, draft, path);
                toast[res.ok ? "success" : "error"](res.message);
                if (res.ok) {
                  setDraft("");
                  setEditing(null);
                  router.refresh();
                }
              });
            }}
          >
            <label htmlFor="note-body" className="text-xs font-medium text-fg-secondary">
              {editing ? "Edit note" : "New note"}
            </label>
            <Textarea id="note-body" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="What did you learn? Link the filing or page you read." maxLength={4000} />
            <div className="flex justify-end gap-2">
              {editing ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setEditing(null);
                    setDraft("");
                  }}
                >
                  Cancel
                </Button>
              ) : null}
              <Button type="submit" variant="primary" size="sm" disabled={pending || !draft.trim()}>
                {editing ? "Save" : "Add note"}
              </Button>
            </div>
          </form>
          <ul className="mt-5 divide-y divide-border/70">
            {notes.length === 0 ? <li className="py-3 text-sm text-fg-muted">No notes yet.</li> : null}
            {notes.map((n) => (
              <li key={n.id} className="py-3 text-sm">
                <p className="whitespace-pre-wrap text-fg">{n.body}</p>
                <div className="mt-1 flex items-center gap-3 text-xs text-fg-muted">
                  <span>{formatDateTime(n.updatedAt)}</span>
                  <button
                    type="button"
                    className="hover:text-fg"
                    onClick={() => {
                      setEditing({ id: n.id, body: n.body });
                      setDraft(n.body);
                    }}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="hover:text-negative"
                    onClick={() =>
                      start(async () => {
                        const res = await deleteNoteAction(n.id, path);
                        toast[res.ok ? "success" : "error"](res.message);
                        router.refresh();
                      })
                    }
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
    </>
  );
}
