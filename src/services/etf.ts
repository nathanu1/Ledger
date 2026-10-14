import { inArray } from "drizzle-orm";
import { getDb } from "@/db/client";
import { etfHoldings } from "@/db/schema";

export function getEtfHoldings(symbols: string[]): Map<string, Array<{ holdingSymbol: string | null; holdingName: string; sector: string | null; weight: number; asOf: string; source: string }>> {
  const out = new Map<string, Array<{ holdingSymbol: string | null; holdingName: string; sector: string | null; weight: number; asOf: string; source: string }>>();
  if (symbols.length === 0) return out;
  const rows = getDb().select().from(etfHoldings).where(inArray(etfHoldings.symbol, symbols)).all();
  for (const r of rows) {
    const list = out.get(r.symbol) ?? [];
    list.push({ holdingSymbol: r.holdingSymbol, holdingName: r.holdingName, sector: r.sector, weight: r.weight, asOf: r.asOf, source: r.source });
    out.set(r.symbol, list);
  }
  return out;
}
