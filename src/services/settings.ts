import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { settings } from "@/db/schema";
import { todayISO } from "@/calc/dates";
import type { ISODate } from "@/calc/types";
import { connectedModeAvailable } from "@/providers/registry";
import { nowIso } from "@/lib/ids";

export type DataMode = "demo" | "connected";

export function getSetting(key: string): string | null {
  const row = getDb().select().from(settings).where(eq(settings.key, key)).get();
  return row?.value ?? null;
}

export function setSetting(key: string, value: string): void {
  const now = nowIso();
  getDb().insert(settings).values({ key, value, updatedAt: now }).onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: now } }).run();
}

export function getDataMode(): DataMode {
  const v = getSetting("data_mode");
  return v === "connected" ? "connected" : "demo";
}

export function setDataMode(mode: DataMode): { ok: boolean; message: string } {
  if (mode === "connected" && !connectedModeAvailable()) {
    return { ok: false, message: "Connected mode needs at least SEC_USER_AGENT or a market-data API key in the environment. See .env.example." };
  }
  setSetting("data_mode", mode);
  return { ok: true, message: mode === "demo" ? "Demo mode: fictional, deterministic sample data." : "Connected mode: configured providers will be used." };
}

/** The "today" used for valuations: the demo's fixed as-of date, or the real date. */
export function getAsOfDate(): ISODate {
  if (getDataMode() === "demo") return getSetting("demo_as_of") ?? todayISO();
  return todayISO();
}

export function getDefaultPortfolioId(): string | null {
  return getSetting("default_portfolio_id");
}
