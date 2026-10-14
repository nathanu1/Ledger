"use server";

import { revalidatePath } from "next/cache";
import { deleteView, saveView, type ViewConfig } from "@/services/watchlist";
import type { ActionResult } from "./portfolio";

export async function saveViewAction(scope: "watchlist" | "screener", name: string, config: ViewConfig, id?: string): Promise<ActionResult<{ id: string }>> {
  if (!name.trim()) return { ok: false, message: "Give the view a name." };
  const row = saveView(scope, name, config, id);
  revalidatePath(`/${scope}`);
  return { ok: true, message: "View saved.", data: { id: row.id } };
}

export async function deleteViewAction(scope: "watchlist" | "screener", id: string): Promise<ActionResult> {
  deleteView(id);
  revalidatePath(`/${scope}`);
  return { ok: true, message: "View deleted." };
}
