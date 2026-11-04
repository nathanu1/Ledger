import { addDays, daysBetween } from "./dates";
import type { ISODate } from "./types";

/** Deterministic research monitoring; reads stored evidence and never recommends trades. */
export const REVIEW_POLICY = {
  materialWeight: 0.05,
  stalePriceDays: 7,
  staleResearchDays: 180,
  earningsWindowDays: 7,
  earningsWeight: 0.25,
} as const;

export interface ReviewPosition {
  symbol: string;
  securityType: string;
  weight: number | null;
  priceDate: ISODate | null;
}
export interface ReviewThesis {
  symbol: string;
  status: string;
  revisedAt: string | null;
}
export interface ReviewFiling {
  symbol: string;
  form: string;
  filedAt: ISODate;
  accession: string;
  url: string | null;
}
export interface ReviewEarnings {
  symbol: string;
  date: ISODate;
  status: string;
  basis: string;
  sourceUrl: string | null;
}
export interface ReviewFinding {
  id: string;
  kind: "thesis" | "data" | "concentration";
  priority: "high" | "medium";
  symbol: string | null;
  title: string;
  detail: string;
  href: string;
  evidence: Array<{ label: string; date: ISODate | null; url: string | null }>;
}

export function reviewPortfolio(input: {
  asOf: ISODate;
  portfolioId: string;
  positions: ReviewPosition[];
  theses: ReviewThesis[];
  filings: ReviewFiling[];
  earnings: ReviewEarnings[];
}): ReviewFinding[] {
  const findings: ReviewFinding[] = [];
  const theses = new Map(input.theses.map((t) => [t.symbol, t]));
  const companyHref = (symbol: string) => `/company/${encodeURIComponent(symbol)}?tab=thesis`;
  const pct = (weight: number) => `${(weight * 100).toFixed(1)}%`;
  const positions = [...new Map(input.positions.map((p) => [p.symbol, p])).values()];
  for (const p of positions) {
    if (p.priceDate && daysBetween(p.priceDate, input.asOf) > REVIEW_POLICY.stalePriceDays) {
      findings.push({ id: `stale-price:${p.symbol}`, kind: "data", priority: "high", symbol: p.symbol,
        title: `${p.symbol}: valuation uses an old price`,
        detail: `Stored valuation close is from ${p.priceDate}, more than ${REVIEW_POLICY.stalePriceDays} calendar days before ${input.asOf}. Refresh prices before relying on portfolio totals.`,
        href: `/company/${encodeURIComponent(p.symbol)}`,
        evidence: [{ label: "Valuation close", date: p.priceDate, url: null }] });
    }
    if (p.securityType !== "stock" || p.weight === null || p.weight < REVIEW_POLICY.materialWeight) continue;
    const t = theses.get(p.symbol);
    if (!t || t.status === "closed" || !t.revisedAt) {
      findings.push({ id: `research-gap:${p.symbol}`, kind: "thesis", priority: "medium", symbol: p.symbol,
        title: `${p.symbol}: material holding needs a research thesis`,
        detail: `${pct(p.weight)} of portfolio value has no current non-closed thesis revision. Record the investment case, risks and invalidation evidence.`,
        href: companyHref(p.symbol), evidence: [] });
      continue;
    }
    const revised = t.revisedAt.slice(0, 10);
    // Same-day filings cannot be ordered against a revision without filing timestamps.
    const filings = [...new Map(input.filings.filter((f) => f.symbol === p.symbol && f.filedAt > revised && f.filedAt <= input.asOf && /^(10-[KQ]|20-F|40-F)(\/A)?$/.test(f.form)).map((f) => [f.accession, f])).values()]
      .sort((a, b) => b.filedAt.localeCompare(a.filedAt) || a.accession.localeCompare(b.accession));
    if (filings.length) {
      findings.push({ id: `new-filings:${p.symbol}`, kind: "thesis", priority: "high", symbol: p.symbol,
        title: `${p.symbol}: new financial filings since thesis revision`,
        detail: `${filings.length} annual or quarterly filing${filings.length === 1 ? "" : "s"} after the ${revised} revision; ${pct(p.weight)} portfolio weight. Review the new evidence against the thesis.`,
        href: companyHref(p.symbol), evidence: filings.map((f) => ({ label: `${f.form} · ${f.accession}`, date: f.filedAt, url: f.url })) });
    } else if (daysBetween(revised, input.asOf) > REVIEW_POLICY.staleResearchDays) {
      findings.push({ id: `stale-research:${p.symbol}`, kind: "thesis", priority: "medium", symbol: p.symbol,
        title: `${p.symbol}: research has not been revised in ${REVIEW_POLICY.staleResearchDays} days`,
        detail: `Latest revision: ${revised}; ${pct(p.weight)} portfolio weight. No newer financial filings are stored; this does not establish that none exist.`,
        href: companyHref(p.symbol), evidence: [{ label: "Latest thesis revision", date: revised, url: null }] });
    }
  }
  const weights = new Map(positions.map((p) => [p.symbol, p.weight]));
  const upcoming = new Map<string, ReviewEarnings>();
  const until = addDays(input.asOf, REVIEW_POLICY.earningsWindowDays);
  for (const e of [...input.earnings].sort((a, b) => a.date.localeCompare(b.date) || Number(b.status === "confirmed") - Number(a.status === "confirmed") || a.symbol.localeCompare(b.symbol))) {
    if (e.date < input.asOf || e.date > until || !(weights.get(e.symbol)! > 0) || upcoming.has(e.symbol)) continue;
    upcoming.set(e.symbol, e);
  }
  const weight = [...upcoming.keys()].reduce((sum, s) => sum + (weights.get(s) ?? 0), 0);
  if (weight >= REVIEW_POLICY.earningsWeight) {
    findings.push({ id: "earnings-cluster", kind: "concentration", priority: "medium", symbol: null,
      title: `${pct(weight)} of portfolio value has earnings in the next ${REVIEW_POLICY.earningsWindowDays} days`,
      detail: `${[...upcoming.keys()].sort().join(", ")}. Direct holdings only; estimates may move. Exposure is based on stored valuations and is not a predicted loss.`,
      href: `/risk?portfolio=${encodeURIComponent(input.portfolioId)}`,
      evidence: [...upcoming.values()].map((e) => ({ label: `${e.symbol} · ${e.status}: ${e.basis}`, date: e.date, url: e.sourceUrl })) });
  }
  return findings.sort((a, b) => (a.priority === b.priority ? a.id.localeCompare(b.id) : a.priority === "high" ? -1 : 1));
}
