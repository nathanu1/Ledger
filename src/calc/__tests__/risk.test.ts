import { describe, expect, it } from "vitest";
import { annualizedVolatility, beta, correlationMatrix, concentration, sectorExposure, stressTest, returnDistribution } from "../risk";
import { alignByDate, simpleReturns } from "../series";

function series(start: string, values: number[]) {
  const d = new Date(start + "T00:00:00Z");
  return values.map((v, i) => {
    const date = new Date(d.getTime() + i * 86_400_000).toISOString().slice(0, 10);
    return { date, price: v };
  });
}

describe("series alignment", () => {
  it("inner-joins on common dates without interpolation", () => {
    const a = [
      { date: "2024-01-01", price: 1 },
      { date: "2024-01-02", price: 2 },
      { date: "2024-01-04", price: 4 },
    ];
    const b = [
      { date: "2024-01-01", price: 10 },
      { date: "2024-01-03", price: 30 },
      { date: "2024-01-04", price: 40 },
    ];
    const aligned = alignByDate([a, b]);
    expect(aligned.dates).toEqual(["2024-01-01", "2024-01-04"]);
    expect(aligned.columns).toEqual([
      [1, 4],
      [10, 40],
    ]);
  });
});

describe("volatility and beta", () => {
  it("requires a minimum sample", () => {
    const v = annualizedVolatility([0.01, -0.01, 0.02]);
    expect(v.value).toBeNull();
    expect(v.reason).toMatch(/at least 60/);
  });

  it("annualises by sqrt(252)", () => {
    const returns = Array.from({ length: 252 }, (_, i) => (i % 2 === 0 ? 0.01 : -0.01));
    const v = annualizedVolatility(returns);
    // Sample stdev of alternating +/-1%: sqrt(252/251 * 0.0001) ~ 0.01002
    expect(v.value).toBeCloseTo(Math.sqrt((252 / 251) * 0.0001) * Math.sqrt(252), 10);
  });

  it("computes beta of a leveraged copy of the benchmark as the leverage factor", () => {
    const bench = Array.from({ length: 100 }, (_, i) => Math.sin(i) * 0.01);
    const asset = bench.map((r) => 1.5 * r);
    const b = beta(asset, bench);
    expect(b.value).toBeCloseTo(1.5, 10);
    expect(b.rSquared).toBeCloseTo(1, 10);
  });
});

describe("correlation matrix", () => {
  it("computes pairwise correlations over common dates", () => {
    const n = 80;
    const base = Array.from({ length: n }, (_, i) => 100 + Math.sin(i / 3) * 5 + i * 0.1);
    const a = series("2024-01-01", base);
    const b = series("2024-01-01", base.map((v) => v * 2)); // perfectly correlated
    const c = series("2024-01-01", base.map((v, i) => 200 - v + (i % 2) * 0.01)); // nearly inverse
    const m = correlationMatrix(["A", "B", "C"], [a, b, c]);
    expect(m.observations).toBe(n - 1);
    expect(m.matrix[0][0]).toBe(1);
    expect(m.matrix[0][1]).toBeCloseTo(1, 10);
    expect(m.matrix[0][2]).toBeLessThan(-0.9);
  });

  it("refuses to compute with too few common observations", () => {
    const a = series("2024-01-01", [1, 2, 3]);
    const b = series("2024-01-01", [3, 2, 1]);
    const m = correlationMatrix(["A", "B"], [a, b]);
    expect(m.matrix[0][1]).toBeNull();
    expect(m.reason).toMatch(/at least 60/);
  });

  it("handles mismatched date ranges by using only the overlap", () => {
    const a = series("2024-01-01", Array.from({ length: 120 }, (_, i) => 100 + i));
    const b = series("2024-02-15", Array.from({ length: 120 }, (_, i) => 50 + i));
    const m = correlationMatrix(["A", "B"], [a, b]);
    // Overlap: 2024-02-15 .. 2024-04-29 = 75 days -> 74 returns
    expect(m.observations).toBe(74);
    expect(m.matrix[0][1]).not.toBeNull();
  });
});

describe("concentration and exposure", () => {
  it("reports largest, top-5 and effective positions", () => {
    const c = concentration([
      { symbol: "A", weight: 0.4 },
      { symbol: "B", weight: 0.3 },
      { symbol: "C", weight: 0.2 },
      { symbol: "D", weight: null },
    ]);
    expect(c.largest).toEqual({ symbol: "A", weight: 0.4 });
    expect(c.top5Weight).toBeCloseTo(0.9, 12);
    expect(c.positions).toBe(3);
    expect(c.effectivePositions).toBeGreaterThan(2);
  });

  it("labels ETF look-through as unavailable without holdings data", () => {
    const e = sectorExposure(
      [
        { symbol: "A", weight: 0.5, sector: "Technology", securityType: "stock" },
        { symbol: "FUND", weight: 0.3, sector: null, securityType: "etf", lookThrough: null },
        { symbol: "FUND2", weight: 0.1, sector: null, securityType: "etf", lookThrough: [{ sector: "Energy", weight: 1 }] },
      ],
      0.1,
    );
    expect(e.unavailableLookThroughWeight).toBeCloseTo(0.3, 12);
    expect(e.unavailableLookThroughSymbols).toEqual(["FUND"]);
    expect(e.sectors.find((s) => s.sector === "Energy")?.weight).toBeCloseTo(0.1, 12);
    expect(e.sectors.find((s) => s.sector === "Energy")?.source).toBe("mixed");
  });
});

describe("stress test", () => {
  it("applies symbol shocks over sector shocks and leaves cash untouched", () => {
    const r = stressTest(
      [
        { symbol: "A", marketValue: 1000, sector: "Tech", securityType: "stock" },
        { symbol: "B", marketValue: 500, sector: "Tech", securityType: "stock" },
        { symbol: "C", marketValue: 500, sector: "Energy", securityType: "stock" },
      ],
      1000,
      { bySymbol: { A: -0.5 }, bySector: { Tech: -0.2 } },
    );
    expect(r.totalImpact).toBeCloseTo(-500 - 100, 12);
    expect(r.impactPct).toBeCloseTo(-600 / 3000, 12);
    expect(r.impacts.find((i) => i.symbol === "A")?.source).toBe("symbol");
    expect(r.impacts.find((i) => i.symbol === "C")?.source).toBe("none");
  });
});

describe("return distribution", () => {
  it("bins returns and computes percentiles", () => {
    const returns = simpleReturns(Array.from({ length: 101 }, (_, i) => 100 * Math.pow(1.001, i)));
    const d = returnDistribution(returns, 10);
    expect(d.observations).toBe(100);
    expect(d.bins.reduce((a, b) => a + b.count, 0)).toBe(100);
    expect(d.p50).toBeCloseTo(0.001, 10);
  });
});
