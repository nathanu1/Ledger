import { describe, expect, it } from "vitest";
import { runDcf, reverseDcf, sensitivityGrid, validateDcfInputs, type DcfInputs } from "../dcf";

const base: DcfInputs = {
  baseRevenue: 1000,
  revenueGrowth: [0.1, 0.1, 0.1, 0.1, 0.1],
  operatingMargin: 0.2,
  taxRate: 0.25,
  daPctRevenue: 0.05,
  capexPctRevenue: 0.06,
  nwcPctRevenueChange: 0.1,
  wacc: 0.09,
  terminalGrowth: 0.025,
  cash: 200,
  debt: 300,
  otherAdjustments: 0,
  dilutedShares: 100,
  currentPrice: 30,
};

describe("DCF", () => {
  it("discounts FCFF and converts enterprise value to equity per share", () => {
    const r = runDcf(base);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // Year 1 by hand: revenue 1100, EBIT 220, NOPAT 165, D&A 55, capex 66, dNWC 10 -> FCFF 144; PV 144/1.09.
    expect(r.years[0].revenue).toBeCloseTo(1100, 10);
    expect(r.years[0].fcff).toBeCloseTo(144, 10);
    expect(r.years[0].presentValue).toBeCloseTo(144 / 1.09, 10);
    // Terminal value from year-5 FCFF.
    const f5 = r.years[4].fcff;
    expect(r.terminalValue).toBeCloseTo((f5 * 1.025) / (0.09 - 0.025), 8);
    expect(r.pvTerminalValue).toBeCloseTo(r.terminalValue / Math.pow(1.09, 5), 8);
    expect(r.enterpriseValue).toBeCloseTo(r.sumPvFcff + r.pvTerminalValue, 8);
    expect(r.equityValue).toBeCloseTo(r.enterpriseValue - 300 + 200, 8);
    expect(r.valuePerShare).toBeCloseTo(r.equityValue / 100, 8);
    expect(r.terminalShareOfEv).toBeGreaterThan(0.5);
    expect(r.impliedUpside).toBeCloseTo(r.valuePerShare / 30 - 1, 10);
  });

  it("rejects terminal growth at or above WACC", () => {
    const r = runDcf({ ...base, terminalGrowth: 0.09 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.some((e) => e.field === "terminalGrowth")).toBe(true);
  });

  it("rejects missing or invalid inputs explicitly", () => {
    const errors = validateDcfInputs({ ...base, baseRevenue: Number.NaN, dilutedShares: 0, taxRate: 1.2 });
    expect(errors.map((e) => e.field).sort()).toEqual(["baseRevenue", "dilutedShares", "taxRate"]);
  });

  it("surfaces negative equity instead of hiding it", () => {
    const r = runDcf({ ...base, debt: 100000 });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.equityNegative).toBe(true);
      expect(r.valuePerShare).toBeLessThan(0);
      expect(r.warnings.some((w) => w.includes("negative"))).toBe(true);
    }
  });

  it("uses the mid-year convention when asked", () => {
    const end = runDcf(base);
    const mid = runDcf({ ...base, midYearConvention: true });
    if (end.ok && mid.ok) {
      expect(mid.years[0].discountFactor).toBeCloseTo(1 / Math.pow(1.09, 0.5), 12);
      expect(mid.enterpriseValue).toBeGreaterThan(end.enterpriseValue);
    }
  });

  it("builds a sensitivity grid with invalid cells marked", () => {
    const grid = sensitivityGrid(base, [0.08, 0.09], [0.02, 0.09]);
    expect(grid).toHaveLength(2);
    expect(grid[0][0].valuePerShare).not.toBeNull();
    expect(grid[1][1].valuePerShare).toBeNull();
    expect(grid[1][1].error).toMatch(/Terminal growth/);
  });

  it("reverse-solves growth that reproduces the current price", () => {
    const r = reverseDcf(base, "revenueGrowth", 30);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.result.valuePerShare).toBeCloseTo(30, 4);
      const check = runDcf({ ...base, revenueGrowth: base.revenueGrowth.map(() => r.value) });
      if (check.ok) expect(check.valuePerShare).toBeCloseTo(30, 4);
    }
  });

  it("reverse-solves WACC and terminal growth", () => {
    const w = reverseDcf(base, "wacc", 30);
    expect(w.ok).toBe(true);
    if (w.ok) expect(w.result.valuePerShare).toBeCloseTo(30, 4);
    const g = reverseDcf(base, "terminalGrowth", 30);
    expect(g.ok).toBe(true);
    if (g.ok) expect(g.result.valuePerShare).toBeCloseTo(30, 4);
  });

  it("reports when no assumption in range reproduces the price", () => {
    const r = reverseDcf(base, "operatingMargin", 1_000_000);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/reproduces the price/);
  });
});
