import { describe, expect, it } from "vitest";
import { normalizeFacts, classifyDuration, areConsecutiveQuarters, type RawFact } from "../fundamentals";
import { cagr, priceToEarnings, evToEbitda, enterpriseValue, sectorProfile, fcfYield } from "../ratios";

function fact(partial: Partial<RawFact> & Pick<RawFact, "concept" | "value" | "end">): RawFact {
  return {
    unit: "USD",
    start: null,
    fy: null,
    fp: null,
    form: "10-Q",
    filed: partial.end,
    accession: `acc-${partial.end}-${partial.form ?? "10-Q"}`,
    ...partial,
  };
}

/** A fiscal year with cumulative cash-flow facts in 10-Qs and standalone revenue quarters. */
function fiscalYearFacts(fy: number): RawFact[] {
  const start = `${fy}-01-01`;
  const q = [
    { fp: "Q1", end: `${fy}-03-31`, qStart: `${fy}-01-01`, form: "10-Q", filed: `${fy}-05-01` },
    { fp: "Q2", end: `${fy}-06-30`, qStart: `${fy}-04-01`, form: "10-Q", filed: `${fy}-08-01` },
    { fp: "Q3", end: `${fy}-09-30`, qStart: `${fy}-07-01`, form: "10-Q", filed: `${fy}-11-01` },
    { fp: "FY", end: `${fy}-12-31`, qStart: `${fy}-10-01`, form: "10-K", filed: `${fy + 1}-02-15` },
  ];
  const facts: RawFact[] = [];
  const quarterlyRevenue = [100, 110, 120, 130].map((v) => v * (1 + (fy - 2023) * 0.1));
  const quarterlyOcf = [20, 22, 24, 26].map((v) => v * (1 + (fy - 2023) * 0.1));
  let ytdRevenue = 0;
  let ytdOcf = 0;
  q.forEach((period, i) => {
    ytdRevenue += quarterlyRevenue[i];
    ytdOcf += quarterlyOcf[i];
    const common = { fy, fp: period.fp, form: period.form, filed: period.filed, accession: `${fy}-${period.fp}` };
    // Standalone quarterly revenue (3-month) is reported in 10-Qs and in the 10-K for Q4? Only Q1-Q3 here.
    if (period.fp !== "FY") {
      facts.push(fact({ concept: "us-gaap:Revenues", value: quarterlyRevenue[i], start: period.qStart, end: period.end, ...common }));
    }
    // Cumulative YTD facts (cash flow and revenue) share the fiscal-year start.
    facts.push(fact({ concept: "us-gaap:Revenues", value: ytdRevenue, start, end: period.end, ...common }));
    facts.push(fact({ concept: "NetCashProvidedByUsedInOperatingActivities", value: ytdOcf, start, end: period.end, ...common }));
    facts.push(fact({ concept: "PaymentsToAcquirePropertyPlantAndEquipment", value: ytdOcf / 4, start, end: period.end, ...common }));
    // Balance sheet instants.
    facts.push(fact({ concept: "CashAndCashEquivalentsAtCarryingValue", value: 500 + i, start: null, end: period.end, ...common }));
    facts.push(fact({ concept: "LongTermDebtNoncurrent", value: 300, start: null, end: period.end, ...common }));
    facts.push(fact({ concept: "LongTermDebtCurrent", value: 50, start: null, end: period.end, ...common }));
    facts.push(fact({ concept: "dei:EntityCommonStockSharesOutstanding", unit: "shares", value: 1000 - i, start: null, end: period.end, ...common }));
  });
  return facts;
}

describe("duration classification", () => {
  it("classifies quarters, halves, nine months and years", () => {
    expect(classifyDuration("2024-01-01", "2024-03-31")).toBe("quarter");
    expect(classifyDuration("2024-01-01", "2024-06-30")).toBe("half");
    expect(classifyDuration("2024-01-01", "2024-09-30")).toBe("nine");
    expect(classifyDuration("2024-01-01", "2024-12-31")).toBe("annual");
    expect(classifyDuration("2024-01-01", "2024-01-31")).toBe("other");
    expect(classifyDuration(null, "2024-01-31")).toBe("other");
  });
});

describe("normalizeFacts", () => {
  const facts = [...fiscalYearFacts(2023), ...fiscalYearFacts(2024)];
  const fin = normalizeFacts(facts, { provider: "test" });

  it("builds annual periods from 10-K facts with first-filing availability dates", () => {
    expect(fin.annual.map((p) => p.fiscalYear)).toEqual([2023, 2024]);
    const fy24 = fin.annual[1];
    expect(fy24.metrics.revenue?.value).toBeCloseTo((100 + 110 + 120 + 130) * 1.1, 8);
    expect(fy24.metrics.revenue?.filedAt).toBe("2025-02-15");
    expect(fy24.metrics.revenue?.status).toBe("reported");
  });

  it("derives standalone quarters for cumulative cash-flow facts, including Q4 from the 10-K", () => {
    const q = fin.quarterly.filter((p) => p.fiscalYear === 2024);
    expect(q.map((p) => p.fiscalPeriod)).toEqual(["Q1", "Q2", "Q3", "Q4"]);
    const ocf = q.map((p) => p.metrics.operatingCashFlow?.value);
    expect(ocf.map((v) => Number(v!.toFixed(6)))).toEqual([22, 24.2, 26.4, 28.6]);
    expect(q[0].metrics.operatingCashFlow?.status).toBe("reported");
    expect(q[1].metrics.operatingCashFlow?.status).toBe("calculated");
    expect(q[1].metrics.operatingCashFlow?.source.derivation).toMatch(/minus year-to-date/);
    // Q4 availability is the 10-K filing date.
    expect(q[3].metrics.operatingCashFlow?.filedAt).toBe("2025-02-15");
    // Revenue for Q1-Q3 is reported standalone; Q4 is derived.
    expect(q[2].metrics.revenue?.status).toBe("reported");
    expect(q[3].metrics.revenue?.status).toBe("calculated");
    expect(q[3].metrics.revenue?.value).toBeCloseTo(130 * 1.1, 8);
  });

  it("computes free cash flow and margins only when inputs exist", () => {
    const q4 = fin.quarterly.find((p) => p.fiscalYear === 2024 && p.fiscalPeriod === "Q4")!;
    const fcf = q4.metrics.freeCashFlow!;
    expect(fcf.status).toBe("calculated");
    expect(fcf.value).toBeCloseTo(28.6 - 28.6 / 4, 8);
    expect(q4.metrics.fcfMargin?.value).toBeCloseTo((28.6 - 7.15) / 143, 8);
    expect(q4.metrics.grossMargin).toBeUndefined();
  });

  it("assembles total debt from components and net debt from cash", () => {
    const fy24 = fin.annual[1];
    expect(fy24.metrics.totalDebt?.value).toBe(350);
    expect(fy24.metrics.totalDebt?.status).toBe("calculated");
    expect(fy24.metrics.netDebt?.value).toBe(350 - 503);
  });

  it("builds TTM from four consecutive quarters and growth versus comparable periods", () => {
    expect(fin.ttm).not.toBeNull();
    expect(fin.ttm!.metrics.revenue?.value).toBeCloseTo(460 * 1.1, 8);
    expect(fin.ttm!.metrics.operatingCashFlow?.value).toBeCloseTo(92 * 1.1, 8);
    const q3 = fin.quarterly.find((p) => p.fiscalYear === 2024 && p.fiscalPeriod === "Q3")!;
    expect(q3.metrics.revenueGrowth?.value).toBeCloseTo(0.1, 8);
    expect(fin.annual[1].metrics.revenueGrowth?.value).toBeCloseTo(0.1, 8);
    expect(fin.annual[0].metrics.revenueGrowth?.value).toBeNull();
  });

  it("does not build TTM when quarters are not consecutive", () => {
    const sparse = facts.filter((f) => !(f.fy === 2024 && f.fp === "Q2"));
    const fin2 = normalizeFacts(sparse, { provider: "test" });
    // Q2 FY2024 cannot be derived without the 6M fact, and Q3 (9M - 6M) also fails -> gap.
    expect(fin2.quarterly.filter((p) => p.fiscalYear === 2024).map((p) => p.fiscalPeriod)).not.toContain("Q2");
    expect(fin2.ttm === null || fin2.warnings.length > 0).toBe(true);
  });

  it("keeps the latest restated value but records the first availability date", () => {
    const restated: RawFact[] = [
      fact({ concept: "Revenues", value: 1000, start: "2023-01-01", end: "2023-12-31", fy: 2023, fp: "FY", form: "10-K", filed: "2024-02-15", accession: "a1" }),
      fact({ concept: "Revenues", value: 1010, start: "2023-01-01", end: "2023-12-31", fy: 2024, fp: "FY", form: "10-K", filed: "2025-02-15", accession: "a2" }),
    ];
    const fin3 = normalizeFacts(restated, { provider: "test" });
    const rev = fin3.annual[0].metrics.revenue!;
    expect(rev.value).toBe(1010);
    expect(rev.filedAt).toBe("2024-02-15");
    expect(rev.latestFiledAt).toBe("2025-02-15");
    expect(rev.restated).toBe(true);
    expect(fin3.annual[0].fiscalYear).toBe(2023);
  });

  it("never turns a missing value into zero", () => {
    const only: RawFact[] = [
      fact({ concept: "Revenues", value: 100, start: "2024-01-01", end: "2024-12-31", fy: 2024, fp: "FY", form: "10-K", filed: "2025-02-01" }),
    ];
    const fin4 = normalizeFacts(only, { provider: "test" });
    const fy = fin4.annual[0];
    expect(fy.metrics.operatingCashFlow).toBeUndefined();
    expect(fy.metrics.freeCashFlow).toBeUndefined();
    expect(fy.metrics.netDebt).toBeUndefined();
  });
});

describe("consecutive quarter check", () => {
  it("accepts 52/53-week style gaps up to a week and rejects larger gaps", () => {
    const mk = (start: string, end: string) => ({ periodType: "quarter" as const, fiscalYear: 2024, fiscalPeriod: "Q1" as const, periodStart: start, periodEnd: end, filedAt: null, label: "", metrics: {} });
    expect(areConsecutiveQuarters([mk("2024-01-01", "2024-03-30"), mk("2024-03-31", "2024-06-29")])).toBe(true);
    expect(areConsecutiveQuarters([mk("2024-01-01", "2024-03-30"), mk("2024-07-01", "2024-09-29")])).toBe(false);
  });
});

describe("ratios", () => {
  it("marks P/E as not meaningful with negative earnings", () => {
    expect(priceToEarnings(50, -2).kind).toBe("not_meaningful");
    expect(priceToEarnings(50, 2)).toEqual({ kind: "value", value: 25 });
    expect(priceToEarnings(null, 2).kind).toBe("unavailable");
  });
  it("computes EV and EV/EBITDA, refusing when inputs are missing", () => {
    const ev = enterpriseValue({ marketCap: 1000, totalDebt: 300, cash: 100, shortTermInvestments: 50 });
    expect(ev.value).toBe(1150);
    expect(enterpriseValue({ marketCap: 1000, totalDebt: null, cash: 100, shortTermInvestments: null }).value).toBeNull();
    expect(evToEbitda(1150, 0).kind).toBe("not_meaningful");
    expect(evToEbitda(1150, 100)).toEqual({ kind: "value", value: 11.5 });
  });
  it("allows negative FCF yield but not a missing market cap", () => {
    expect(fcfYield(-10, 1000)).toEqual({ kind: "value", value: -0.01 });
    expect(fcfYield(10, null).kind).toBe("unavailable");
  });
  it("only computes CAGR when interpretable", () => {
    expect(cagr(100, 121, 2)).toEqual({ kind: "value", value: expect.closeTo(0.1, 10) });
    expect(cagr(-100, 121, 2).kind).toBe("not_meaningful");
    expect(cagr(100, 121, 0.5).kind).toBe("not_meaningful");
    expect(cagr(null, 121, 2).kind).toBe("unavailable");
  });
  it("labels sector-specific limitations", () => {
    expect(sectorProfile("Financials", "Banks").family).toBe("bank");
    expect(sectorProfile("Financials", "Banks").dcfSupported).toBe(false);
    expect(sectorProfile("Real Estate", "REIT - Retail").family).toBe("reit");
    expect(sectorProfile("Technology", "Software").family).toBe("general");
  });
});
