import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { portfolios, securities, transactions, prices, theses, thesisRevisions, filings, settings } from "@/db/schema";
import { buildOverview } from "../overview";
import { GET } from "@/app/api/export/review/route";

const previousPath = process.env.LEDGER_DATABASE_PATH;
const now = "2026-10-01T00:00:00Z";
beforeAll(() => {
  process.env.LEDGER_DATABASE_PATH = ":memory:";
  const db = getDb();
  db.insert(settings).values([{ key: "data_mode", value: "demo", updatedAt: now }, { key: "demo_as_of", value: "2026-11-01", updatedAt: now }]).run();
  db.insert(portfolios).values({ id: "pf-review", name: "Research Portfolio", createdAt: now, updatedAt: now }).run();
  db.insert(securities).values({ symbol: "ABC", name: "Example", securityType: "stock", source: "test", retrievedAt: now }).run();
  db.insert(transactions).values([
    { id: "deposit", portfolioId: "pf-review", type: "DEPOSIT", date: "2026-10-01", amount: "1000", fingerprint: "deposit", createdAt: now, updatedAt: now },
    { id: "buy", portfolioId: "pf-review", type: "BUY", date: "2026-10-02", symbol: "ABC", quantity: "10", price: "50", fingerprint: "buy", createdAt: now, updatedAt: now },
  ]).run();
  db.insert(prices).values([{ symbol: "ABC", date: "2026-10-02", close: 50, source: "test", retrievedAt: now }, { symbol: "ABC", date: "2026-10-30", close: 60, source: "test", retrievedAt: now }]).run();
  db.insert(theses).values({ id: "th-review", symbol: "ABC", status: "active", createdAt: now, updatedAt: now }).run();
  db.insert(thesisRevisions).values({ id: "rev-review", thesisId: "th-review", createdAt: now, summary: "Original case" }).run();
  db.insert(filings).values({ symbol: "ABC", accession: "filing-review", form: "10-Q", filedAt: "2026-10-20", source: "test", retrievedAt: now }).run();
});
afterAll(() => {
  closeDb();
  if (previousPath === undefined) delete process.env.LEDGER_DATABASE_PATH;
  else process.env.LEDGER_DATABASE_PATH = previousPath;
});

describe("research monitoring integration", () => {
  it("surfaces filing evidence through the existing overview alerts", () => {
    const data = buildOverview({ portfolioId: "pf-review" });
    expect(data.alerts.find((a) => a.title.includes("new financial filings"))?.href).toBe("/company/ABC?tab=thesis");
  });
  it("exports sourced findings and coverage without mutating the ledger", async () => {
    const response = await GET(new Request("http://localhost/api/export/review?portfolio=pf-review"));
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Content-Disposition")).toContain("2026-11-01.json");
    const report = await response.json();
    expect(report.schemaVersion).toBe(1);
    expect(report.alerts.some((a: { title: string }) => a.title.includes("new financial filings"))).toBe(true);
    expect(report.coverage).toEqual({ heldSymbols: 1, unpricedSymbols: [], incompleteValuation: false });
    expect(report.findings.find((f: { id: string }) => f.id === "new-filings:ABC").evidence[0].date).toBe("2026-10-20");
    expect(getDb().select().from(transactions).all()).toHaveLength(2);
  });
  it("marks reports with unpriced holdings as incomplete", async () => {
    getDb().insert(transactions).values({ id: "unpriced-buy", portfolioId: "pf-review", type: "BUY", date: "2026-10-02", symbol: "UNPRICED", quantity: "1", price: "10", fingerprint: "unpriced", createdAt: now, updatedAt: now }).run();
    const response = await GET(new Request("http://localhost/api/export/review?portfolio=pf-review"));
    const report = await response.json();
    expect(report.coverage.incompleteValuation).toBe(true);
    expect(report.coverage.unpricedSymbols).toContain("UNPRICED");
    expect(report.alerts.some((a: { kind: string }) => a.kind === "data")).toBe(true);
  });
  it("requires an explicit valid portfolio for export", async () => {
    for (const query of ["", "?portfolio=missing"]) {
      expect((await GET(new Request(`http://localhost/api/export/review${query}`))).status).toBe(404);
    }
  });
});
