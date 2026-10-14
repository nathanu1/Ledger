import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { dcfScenarios, type DcfScenarioRow } from "@/db/schema";
import type { DcfInputs } from "@/calc/dcf";
import { sectorProfile } from "@/calc/ratios";
import { newId, nowIso } from "@/lib/ids";
import { getFinancials } from "./fundamentals";
import { basisPeriod } from "./metrics";
import { getLatestPrices } from "./market-data";
import { getSecurity } from "./securities";

export interface DcfDefaults {
  inputs: DcfInputs | null;
  /** Which inputs came from reported data and which are placeholders the user must confirm. */
  provenance: Record<string, { source: "reported" | "calculated" | "assumption" | "missing"; detail: string }>;
  missing: string[];
  supported: boolean;
  supportNote: string | null;
  basisLabel: string | null;
}

/** Seed DCF inputs from reported fundamentals. Missing figures are reported, never invented. */
export function defaultDcfInputs(symbol: string): DcfDefaults {
  const sec = getSecurity(symbol);
  const profile = sectorProfile(sec?.sector, sec?.industry);
  const fin = sec?.securityType === "etf" ? null : getFinancials(symbol);
  const basis = basisPeriod(fin);
  const m = basis?.metrics ?? {};
  const price = getLatestPrices([symbol]).get(symbol) ?? null;
  const provenance: DcfDefaults["provenance"] = {};
  const missing: string[] = [];
  const note = (key: string, source: DcfDefaults["provenance"][string]["source"], detail: string) => {
    provenance[key] = { source, detail };
  };
  const revenue = m.revenue?.value ?? null;
  if (revenue === null) missing.push("baseRevenue");
  else note("baseRevenue", m.revenue!.status === "reported" ? "reported" : "calculated", `${basis!.label} revenue (${m.revenue!.source.concept ?? m.revenue!.source.derivation ?? ""}).`);
  const opMargin = m.operatingMargin?.value ?? null;
  if (opMargin === null) missing.push("operatingMargin");
  else note("operatingMargin", "calculated", `${basis!.label} operating margin.`);
  const daPct = m.depreciationAmortization?.value !== null && m.depreciationAmortization?.value !== undefined && revenue ? Math.abs(m.depreciationAmortization.value) / revenue : null;
  if (daPct === null) missing.push("daPctRevenue");
  else note("daPctRevenue", "calculated", `${basis!.label} depreciation and amortization divided by revenue.`);
  const capexPct = m.capex?.value !== null && m.capex?.value !== undefined && revenue ? Math.abs(m.capex.value) / revenue : null;
  if (capexPct === null) missing.push("capexPctRevenue");
  else note("capexPctRevenue", "calculated", `${basis!.label} capital expenditure divided by revenue.`);
  const taxRate = m.effectiveTaxRate?.value ?? null;
  const taxDefault = taxRate !== null ? Math.min(Math.max(taxRate, 0), 0.35) : 0.21;
  note("taxRate", taxRate !== null ? "calculated" : "assumption", taxRate !== null ? `${basis!.label} effective tax rate, clamped to 0-35%.` : "Placeholder of 21% (US statutory rate); no reported effective tax rate was available.");
  const cash = (m.cash?.value ?? null) !== null ? (m.cash!.value as number) + (m.shortTermInvestments?.value ?? 0) : null;
  if (cash === null) missing.push("cash");
  else note("cash", "reported", `Cash${m.shortTermInvestments ? " plus short-term investments" : ""} at ${m.cash!.periodEnd}.`);
  const debt = m.totalDebt?.value ?? null;
  if (debt === null) missing.push("debt");
  else note("debt", "calculated", m.totalDebt!.source.derivation ?? "Total debt.");
  const shares = m.sharesOutstanding?.value ?? m.sharesDiluted?.value ?? null;
  if (shares === null) missing.push("dilutedShares");
  else note("dilutedShares", "reported", m.sharesOutstanding ? `Shares outstanding as of ${m.sharesOutstanding.periodEnd}.` : `Weighted diluted shares for ${basis!.label}.`);
  const growth = m.revenueGrowth?.value ?? null;
  const g0 = growth !== null ? Math.min(Math.max(growth, -0.2), 0.4) : 0.05;
  note("revenueGrowth", growth !== null ? "assumption" : "assumption", growth !== null ? `Starts at the latest year-over-year growth (${(growth * 100).toFixed(1)}%, clamped) and fades linearly toward terminal growth. An assumption, not a forecast.` : "Placeholder path of 5% fading to terminal growth; no growth history was available.");
  const waccDefault = profile.family === "utility" ? 0.065 : 0.09;
  note("wacc", "assumption", `Placeholder ${(waccDefault * 100).toFixed(1)}% discount rate; set it to your own estimate.`);
  note("terminalGrowth", "assumption", "Placeholder 2.5% perpetual growth, below long-run nominal GDP.");
  note("nwcPctRevenueChange", "assumption", "Placeholder 10% of each year's revenue change is tied up in working capital.");
  note("otherAdjustments", "assumption", "Zero by default: minority interests, preferred stock or non-operating assets are not read from filings.");
  const supported = profile.dcfSupported && sec?.securityType !== "etf";
  const supportNote = sec?.securityType === "etf" ? "Funds hold other securities; an enterprise DCF does not apply." : !profile.dcfSupported ? profile.notes[0] : null;
  const inputs: DcfInputs | null =
    revenue !== null && opMargin !== null && shares !== null
      ? {
          baseRevenue: revenue,
          revenueGrowth: [0, 1, 2, 3, 4].map((i) => g0 + ((0.025 - g0) * i) / 5),
          operatingMargin: opMargin,
          taxRate: taxDefault,
          daPctRevenue: daPct ?? 0,
          capexPctRevenue: capexPct ?? 0,
          nwcPctRevenueChange: 0.1,
          wacc: waccDefault,
          terminalGrowth: 0.025,
          cash: cash ?? 0,
          debt: debt ?? 0,
          otherAdjustments: 0,
          dilutedShares: shares,
          currentPrice: price?.price ?? null,
          midYearConvention: false,
        }
      : null;
  return { inputs, provenance, missing, supported, supportNote, basisLabel: basis?.label ?? null };
}

export function listScenarios(symbol: string): DcfScenarioRow[] {
  return getDb().select().from(dcfScenarios).where(eq(dcfScenarios.symbol, symbol.toUpperCase())).orderBy(desc(dcfScenarios.updatedAt)).all();
}

export function saveScenario(symbol: string, name: string, kind: string, inputs: unknown, id?: string): DcfScenarioRow {
  const now = nowIso();
  if (id) {
    getDb().update(dcfScenarios).set({ name: name.trim(), kind, inputs: JSON.stringify(inputs), updatedAt: now }).where(eq(dcfScenarios.id, id)).run();
    return getDb().select().from(dcfScenarios).where(eq(dcfScenarios.id, id)).get()!;
  }
  const newIdValue = newId("dcf");
  getDb().insert(dcfScenarios).values({ id: newIdValue, symbol: symbol.toUpperCase(), name: name.trim(), kind, inputs: JSON.stringify(inputs), createdAt: now, updatedAt: now }).run();
  return getDb().select().from(dcfScenarios).where(eq(dcfScenarios.id, newIdValue)).get()!;
}

export function deleteScenario(id: string): void {
  getDb().delete(dcfScenarios).where(eq(dcfScenarios.id, id)).run();
}
