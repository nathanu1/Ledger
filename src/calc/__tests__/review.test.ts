import { describe, expect, it } from "vitest";
import { reviewPortfolio, type ReviewEarnings, type ReviewFiling, type ReviewPosition } from "../review";

const position: ReviewPosition = { symbol: "ABC", securityType: "stock", weight: 0.3, priceDate: "2026-10-29" };
const thesis = { symbol: "ABC", status: "active", revisedAt: "2026-10-01T12:00:00Z" };
const filing: ReviewFiling = { symbol: "ABC", form: "10-Q", filedAt: "2026-10-15", accession: "001", url: "https://www.sec.gov/filing" };
const earnings: ReviewEarnings = { symbol: "ABC", date: "2026-11-03", status: "estimated", basis: "Provider calendar", sourceUrl: null };
function run(overrides: Partial<Parameters<typeof reviewPortfolio>[0]> = {}) {
  return reviewPortfolio({ asOf: "2026-11-01", portfolioId: "pf1", positions: [position], theses: [thesis], filings: [], earnings: [], ...overrides });
}

describe("evidence-based portfolio review", () => {
  it("leaves a covered, fresh portfolio quiet", () => expect(run()).toEqual([]));
  it("groups amendments and filings since revision with source evidence", () => {
    const findings = run({ filings: [filing, filing, { ...filing, form: "10-Q/A", accession: "002" }] });
    expect(findings).toHaveLength(1);
    expect(findings[0].evidence).toHaveLength(2);
    expect(findings[0].evidence[0].url).toBe(filing.url);
    expect(findings[0].priority).toBe("high");
  });
  it("excludes future, same-day and non-financial filings", () => {
    expect(run({ filings: [ { ...filing, filedAt: "2026-12-01" }, { ...filing, filedAt: "2026-10-01" }, { ...filing, form: "8-K" }, { ...filing, symbol: "OTHER" } ] })).toEqual([]);
  });
  it("a new revision clears a filing alert", () => {
    expect(run({ filings: [filing], theses: [{ ...thesis, revisedAt: "2026-10-16T00:00:00Z" }] })).toEqual([]);
  });
  it("flags absent, closed and revisionless theses on material stocks", () => {
    for (const theses of [[], [{ ...thesis, status: "closed" }], [{ ...thesis, revisedAt: null }]]) {
      expect(run({ theses })[0].id).toBe("research-gap:ABC");
    }
  });
  it("does not demand stock theses for funds or small and unpriced holdings", () => {
    for (const p of [{ ...position, securityType: "etf" }, { ...position, weight: 0.049 }, { ...position, weight: null }]) {
      expect(run({ positions: [p], theses: [] })).toEqual([]);
    }
    expect(run({ positions: [{ ...position, weight: 0.05 }], theses: [] })).toHaveLength(1);
  });
  it("flags aged research without claiming unobserved filings do not exist", () => {
    const findings = run({ theses: [{ ...thesis, revisedAt: "2025-01-01T12:00:00Z" }] });
    expect(findings[0].id).toBe("stale-research:ABC");
    expect(findings[0].detail).toContain("does not establish");
  });
  it("uses actual valuation close dates and tolerates weekends", () => {
    expect(run({ positions: [{ ...position, priceDate: "2026-10-25" }] })).toEqual([]);
    expect(run({ positions: [{ ...position, priceDate: "2026-10-24" }] })[0].id).toBe("stale-price:ABC");
    expect(run({ positions: [{ ...position, priceDate: null }] })).toEqual([]);
  });
  it("deduplicates earnings per holding and preserves estimated status", () => {
    const findings = run({ earnings: [earnings, earnings] });
    expect(findings[0].title).toContain("30.0%");
    expect(findings[0].evidence).toHaveLength(1);
    expect(findings[0].evidence[0].label).toContain("estimated");
  });
  it("prefers confirmed evidence on the same date, but retains an earlier estimate", () => {
    const confirmed = { ...earnings, status: "confirmed", basis: "Company announcement" };
    expect(run({ earnings: [earnings, confirmed] })[0].evidence[0].label).toContain("confirmed");
    expect(run({ earnings: [confirmed, { ...earnings, date: "2026-11-02" }] })[0].evidence[0].label).toContain("estimated");
  });
  it("counts only held symbols inside the inclusive seven-day window", () => {
    expect(run({ earnings: [{ ...earnings, date: "2026-10-31" }, { ...earnings, date: "2026-11-09" }, { ...earnings, symbol: "WATCHED" }] })).toEqual([]);
    expect(run({ earnings: [{ ...earnings, date: "2026-11-08" }] })).toHaveLength(1);
  });
  it("aggregates earnings exposure across positions without double counting positions", () => {
    const p = { ...position, weight: 0.125 };
    const findings = run({ positions: [p, p, { ...p, symbol: "DEF" }], theses: [thesis, { ...thesis, symbol: "DEF" }], earnings: [earnings, { ...earnings, symbol: "DEF" }] });
    expect(findings[0].title).toContain("25.0%");
    expect(run({ positions: [{ ...position, weight: 0.24 }], earnings: [earnings] })).toEqual([]);
  });
  it("orders high-priority evidence before research gaps deterministically", () => {
    const findings = run({ positions: [{ ...position, symbol: "DEF" }, { ...position, priceDate: "2026-09-01" }], theses: [] });
    expect(findings[0].id).toBe("stale-price:ABC");
    expect(findings.slice(1).map((f) => f.id)).toEqual(["research-gap:ABC", "research-gap:DEF"]);
  });
});
