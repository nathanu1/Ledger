/**
 * Connectivity and normalisation check against live SEC EDGAR data.
 * Usage: SEC_USER_AGENT="Ledger dev you@example.com" npx tsx scripts/check-sec.ts AAPL
 */
import { SecEdgarProvider, estimateNextEarningsFromFilings } from "../src/providers/sec-edgar";
import { normalizeFacts } from "../src/calc/fundamentals";

async function main() {
  const symbol = (process.argv[2] ?? "AAPL").toUpperCase();
  const ua = process.env.SEC_USER_AGENT ?? "Ledger local check dev@example.com";
  const sec = new SecEdgarProvider({ userAgent: ua });
  const t0 = Date.now();
  const hit = await sec.lookupCik(symbol);
  if (!hit) throw new Error(`No CIK for ${symbol}`);
  console.log(`CIK ${hit.cik} ${hit.name} (${hit.exchange}) in ${Date.now() - t0} ms`);
  const facts = await sec.getCompanyFacts(hit.cik);
  console.log(`facts: ${facts.facts.length} relevant facts for ${facts.entityName}`);
  const fin = normalizeFacts(facts.facts, { provider: "sec-edgar" });
  console.log(`annual periods: ${fin.annual.map((p) => p.label).join(", ")}`);
  console.log(`quarters: ${fin.quarterly.map((p) => p.label).join(", ")}`);
  console.log("warnings:", fin.warnings);
  const fmt = (v: number | null | undefined) => (v === null || v === undefined ? "n/a" : (v / 1e9).toFixed(2) + "B");
  for (const p of fin.annual.slice(-3)) {
    const m = p.metrics;
    console.log(`${p.label} end ${p.periodEnd} filed ${p.filedAt}: rev ${fmt(m.revenue?.value)} opInc ${fmt(m.operatingIncome?.value)} NI ${fmt(m.netIncome?.value)} OCF ${fmt(m.operatingCashFlow?.value)} capex ${fmt(m.capex?.value)} FCF ${fmt(m.freeCashFlow?.value)} debt ${fmt(m.totalDebt?.value)} cash ${fmt(m.cash?.value)} netDebt ${fmt(m.netDebt?.value)} EPS ${m.epsDiluted?.value} shares ${m.sharesDiluted?.value}`);
  }
  for (const p of fin.quarterly.slice(-6)) {
    const m = p.metrics;
    console.log(`${p.label} ${p.periodStart}..${p.periodEnd} filed ${p.filedAt}: rev ${fmt(m.revenue?.value)} [${m.revenue?.status}] OCF ${fmt(m.operatingCashFlow?.value)} [${m.operatingCashFlow?.status}] capex ${fmt(m.capex?.value)} [${m.capex?.status}] NI ${fmt(m.netIncome?.value)} EPS ${m.epsDiluted?.value} growth ${m.revenueGrowth?.value?.toFixed(3)} GM ${m.grossMargin?.value?.toFixed(3)}`);
  }
  if (fin.ttm) {
    const m = fin.ttm.metrics;
    console.log(`${fin.ttm.label}: rev ${fmt(m.revenue?.value)} NI ${fmt(m.netIncome?.value)} OCF ${fmt(m.operatingCashFlow?.value)} FCF ${fmt(m.freeCashFlow?.value)} EPS ${m.epsDiluted?.value?.toFixed(2)} EBITDA ${fmt(m.ebitda?.value)} debt ${fmt(m.totalDebt?.value)} cash ${fmt(m.cash?.value)} sharesOut ${m.sharesOutstanding?.value}`);
    console.log("TTM revenue derivation:", m.revenue?.source.derivation);
    console.log("Q derivation example:", fin.quarterly[fin.quarterly.length - 1].metrics.operatingCashFlow?.source.derivation);
  }
  const subs = await sec.getSubmissions(hit.cik);
  console.log("profile:", subs.profile);
  console.log("filings:", subs.filings.length, "first:", subs.filings[0]);
  console.log("next earnings estimate:", estimateNextEarningsFromFilings(subs.filings, "2026-10-14"));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
