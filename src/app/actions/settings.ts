"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/db/client";
import { seedDemo } from "@/demo/seed";
import { clearProviderCache } from "@/services/cache-store";
import { refreshEarningsCalendar, refreshFundamentals } from "@/services/fundamentals";
import { refreshMarketData } from "@/services/market-data";
import { buildPortfolioSnapshot, listPortfolios } from "@/services/portfolio";
import { getSecurity } from "@/services/securities";
import { getDataMode, setDataMode, type DataMode } from "@/services/settings";
import { watchedSymbols } from "@/services/watchlist";
import type { ActionResult } from "./portfolio";

export async function setDataModeAction(mode: DataMode): Promise<ActionResult> {
  const res = setDataMode(mode);
  revalidatePath("/", "layout");
  return res;
}

export async function clearCacheAction(): Promise<ActionResult> {
  const n = clearProviderCache();
  revalidatePath("/settings");
  return { ok: true, message: `Cleared ${n} cached provider responses.` };
}

export async function refreshAllAction(): Promise<ActionResult<{ lines: string[] }>> {
  if (getDataMode() === "demo") return { ok: false, message: "Demo mode uses the built-in dataset." };
  const symbols = new Set<string>();
  for (const p of listPortfolios()) {
    const snap = buildPortfolioSnapshot(p.id, { period: "1M" });
    for (const h of snap?.holdings ?? []) symbols.add(h.symbol);
    symbols.add(p.benchmarkSymbol);
  }
  for (const s of watchedSymbols()) symbols.add(s);
  const lines: string[] = [];
  let stop = false;
  for (const s of symbols) {
    if (stop) break;
    const m = await refreshMarketData(s);
    lines.push(`${s}: ${m.message}`);
    if (!m.ok && (m.kind === "quota" || m.kind === "auth" || m.kind === "not_configured")) {
      stop = true;
      break;
    }
    if (getSecurity(s)?.securityType !== "etf") {
      const f = await refreshFundamentals(s);
      lines.push(`${s}: ${f.message}`);
      if (!f.ok && (f.kind === "quota" || f.kind === "auth")) stop = true;
    }
  }
  const earnings = await refreshEarningsCalendar([...symbols]);
  lines.push(`Earnings calendar: ${earnings.message}`);
  revalidatePath("/", "layout");
  return { ok: !stop, message: stop ? "Stopped early because a provider refused further requests. See details." : `Refreshed ${symbols.size} symbols.`, data: { lines } };
}

export async function resetDemoAction(): Promise<ActionResult> {
  seedDemo(getDb(), { reset: true });
  revalidatePath("/", "layout");
  return { ok: true, message: "Demo dataset reloaded. All user data was replaced." };
}
