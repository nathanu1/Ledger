import { describe, expect, it } from "vitest";
import { timeWeightedReturn, xirr, moneyWeightedReturn, investmentGain, periodReturn, benchmarkReturn, benchmarkGrowth } from "../returns";
import { drawdownFromIndex } from "../drawdown";
import type { DailyPoint } from "../types";

function pt(date: string, value: number, externalFlow = 0): DailyPoint {
  return { date, value, cash: 0, externalFlow, missingPriceSymbols: [] };
}

describe("time-weighted return", () => {
  it("is unaffected by a deposit made before a flat day", () => {
    const points = [pt("2024-01-01", 1000, 1000), pt("2024-01-02", 1100), pt("2024-01-03", 2100, 1000), pt("2024-01-04", 2100)];
    const twr = timeWeightedReturn(points);
    // Day 2: +10%. Day 3: deposit 1000, value 2100 -> (2100)/(1100+1000) - 1 = 0. Day 4: 0.
    expect(twr.totalReturn).toBeCloseTo(0.1, 12);
    expect(twr.growthIndex[twr.growthIndex.length - 1].value).toBeCloseTo(110, 10);
    expect(twr.flaggedDays).toBe(0);
  });

  it("separates returns from contributions and withdrawals", () => {
    const points = [pt("2024-01-01", 1000, 1000), pt("2024-01-02", 1200), pt("2024-01-03", 900, -300), pt("2024-01-04", 990)];
    const twr = timeWeightedReturn(points);
    // Day 2: +20%, day 3: 900/(1200-300) - 1 = 0, day 4: +10% -> total 1.2*1.1 - 1 = 32%
    expect(twr.totalReturn).toBeCloseTo(0.32, 12);
    const gain = investmentGain(points)!;
    expect(gain.deposits).toBe(1000);
    expect(gain.withdrawals).toBe(300);
    expect(gain.investmentGain).toBeCloseTo(990 - 0 - 700, 10);
  });

  it("flags days with a non-positive base instead of dividing by zero", () => {
    const points = [pt("2024-01-01", 0), pt("2024-01-02", 500)];
    const twr = timeWeightedReturn(points);
    expect(twr.flaggedDays).toBe(1);
    expect(twr.totalReturn).toBe(0);
  });

  it("computes a sub-period return snapping to available dates", () => {
    const points = [pt("2024-01-01", 100, 100), pt("2024-01-02", 110), pt("2024-01-03", 121), pt("2024-01-04", 133.1)];
    const twr = timeWeightedReturn(points);
    const pr = periodReturn(twr, "2024-01-02", "2024-01-04")!;
    expect(pr.totalReturn).toBeCloseTo(0.21, 10);
    expect(pr.from).toBe("2024-01-02");
  });
});

describe("money-weighted return (XIRR)", () => {
  it("matches a simple one-year doubling", () => {
    const r = xirr([
      { date: "2023-01-01", amount: -1000 },
      { date: "2024-01-01", amount: 2000 },
    ]);
    expect(r.status).toBe("ok");
    if (r.status === "ok") expect(r.rate).toBeCloseTo(1, 6);
  });

  it("handles deposits and withdrawals over time", () => {
    const r = xirr([
      { date: "2023-01-01", amount: -1000 },
      { date: "2023-07-01", amount: -1000 },
      { date: "2024-01-01", amount: 300 },
      { date: "2024-07-01", amount: 1900 },
    ]);
    expect(r.status).toBe("ok");
    if (r.status === "ok") {
      // Verify NPV at the solved rate is ~0.
      const npv = [
        [-1000, 0],
        [-1000, 181 / 365],
        [300, 365 / 365],
        [1900, 547 / 365],
      ].reduce((acc, [a, t]) => acc + a * Math.pow(1 + r.rate, -t), 0);
      expect(Math.abs(npv)).toBeLessThan(1e-6);
    }
  });

  it("reports no solution when all flows have the same sign", () => {
    const r = xirr([
      { date: "2023-01-01", amount: -1000 },
      { date: "2024-01-01", amount: -1000 },
    ]);
    expect(r.status).toBe("insufficient_data");
  });

  it("reports when the NPV never crosses zero in range", () => {
    // Tiny return on a huge outflow far in the future cannot be matched by any rate in range.
    const r = xirr([
      { date: "2023-01-01", amount: -1000 },
      { date: "2023-01-02", amount: 1 },
      { date: "2023-01-03", amount: -1 },
    ]);
    expect(["no_solution", "insufficient_data"]).toContain(r.status);
  });

  it("detects non-unique solutions for alternating flows", () => {
    // Classic multiple-IRR pattern: -100, +230, -132 has roots at 10% and 20%.
    const r = xirr([
      { date: "2020-01-01", amount: -100 },
      { date: "2021-01-01", amount: 230 },
      { date: "2022-01-01", amount: -132 },
    ]);
    expect(r.status).toBe("not_unique");
    if (r.status === "not_unique") {
      expect(r.candidates.some((c) => Math.abs(c - 0.1) < 0.01)).toBe(true);
      expect(r.candidates.some((c) => Math.abs(c - 0.2) < 0.01)).toBe(true);
    }
  });

  it("builds flows from a valuation series", () => {
    const points = [pt("2023-01-01", 1000, 1000), pt("2023-07-02", 1600, 500), pt("2024-01-01", 1800)];
    const mwr = moneyWeightedReturn(points);
    expect(mwr.flows).toEqual([
      { date: "2023-01-01", amount: -1000 },
      { date: "2023-07-02", amount: -500 },
      { date: "2024-01-01", amount: 1800 },
    ]);
    expect(mwr.result.status).toBe("ok");
  });
});

describe("drawdown", () => {
  it("finds the deepest peak-to-trough decline and recovery", () => {
    const index = [
      { date: "2024-01-01", value: 100 },
      { date: "2024-01-02", value: 120 },
      { date: "2024-01-03", value: 90 },
      { date: "2024-01-04", value: 100 },
      { date: "2024-01-05", value: 125 },
      { date: "2024-01-06", value: 110 },
    ];
    const dd = drawdownFromIndex(index);
    expect(dd.maxDrawdown).toBeCloseTo(90 / 120 - 1, 12);
    expect(dd.peakDate).toBe("2024-01-02");
    expect(dd.troughDate).toBe("2024-01-03");
    expect(dd.recoveryDate).toBe("2024-01-05");
    expect(dd.points[5].drawdown).toBeCloseTo(110 / 125 - 1, 12);
  });

  it("returns nulls for fewer than two points", () => {
    expect(drawdownFromIndex([{ date: "2024-01-01", value: 100 }]).maxDrawdown).toBeNull();
  });
});

describe("benchmark alignment", () => {
  const spy = [
    { date: "2024-01-02", price: 100 },
    { date: "2024-01-03", price: 102 },
    { date: "2024-01-05", price: 104 },
  ];
  it("compares over matching dates using the last close on or before each date", () => {
    const r = benchmarkReturn(spy, "2024-01-02", "2024-01-04")!;
    expect(r.priceDateTo).toBe("2024-01-03");
    expect(r.totalReturn).toBeCloseTo(0.02, 12);
  });
  it("returns null when the window has no benchmark data", () => {
    expect(benchmarkReturn(spy, "2023-12-01", "2023-12-31")).toBeNull();
  });
  it("indexes growth to 100 and leaves pre-data dates null", () => {
    const g = benchmarkGrowth(spy, ["2024-01-01", "2024-01-02", "2024-01-05"]);
    expect(g[0].value).toBeNull();
    expect(g[1].value).toBe(100);
    expect(g[2].value).toBeCloseTo(104, 12);
  });
});
