import { describe, expect, it } from "vitest";
import { activityStart, portfolioActivity } from "../activity";
import type { LedgerTransaction } from "../types";

const tx = (id: string, date: string, type: LedgerTransaction["type"], values: Partial<LedgerTransaction> = {}): LedgerTransaction => ({ id, date, type, sequence: 0, symbol: null, quantity: null, price: null, amount: null, fee: null, splitNumerator: null, splitDenominator: null, linkedTransactionId: null, note: null, ...values });
const rows = [
  tx("deposit", "2025-12-31", "DEPOSIT", { amount: "1000" }),
  tx("buy", "2025-12-31", "BUY", { symbol: "ABC", quantity: "10", price: "10", fee: "1", sequence: 1 }),
  tx("div", "2026-01-02", "DIVIDEND", { symbol: "ABC", amount: "20" }),
  tx("drip", "2026-01-02", "BUY", { symbol: "ABC", quantity: "1", price: "20", linkedTransactionId: "div", sequence: 1 }),
  tx("sell", "2026-02-01", "SELL", { symbol: "ABC", quantity: "5", price: "20", fee: "1" }),
  tx("invalid", "2026-02-02", "SELL", { symbol: "ABC", quantity: "100", price: "20", fee: "4" }),
  tx("fee", "2026-02-03", "FEE", { amount: "0.1" }),
  tx("interest", "2026-02-04", "INTEREST", { amount: "0.2" }),
  tx("future", "2027-01-01", "DIVIDEND", { symbol: "ABC", amount: "500" }),
];
describe("portfolio activity", () => {
  it("replays prior lots for accurate FIFO realized gains and excludes rejected and future transactions", () => {
    const a = portfolioActivity(rows, "2026-01-01", "2026-12-31");
    expect(a.totals).toMatchObject({ deposits: "0", dividends: "20", interest: "0.2", realizedPnl: "48.5", tradingFees: "1", standaloneFees: "0.1", totalFees: "1.1" });
    expect(a.applied).toBe(5); expect(a.rejected).toBe(1);
    expect(a.dividendsBySymbol).toEqual([{ symbol: "ABC", amount: "20" }]);
    expect(a.monthly.map(m => m.month)).toEqual(["2026-02", "2026-01"]);
    expect(a.monthly[0].totalFees).toBe("1.1");
  });
  it("includes transactions before the first price for all time and excludes the return boundary for YTD", () => {
    expect(activityStart("ALL", "2026-12-31", rows)).toBe("2025-12-31");
    expect(activityStart("YTD", "2026-12-31", rows)).toBe("2026-01-01");
    expect(portfolioActivity(rows, activityStart("ALL", "2026-12-31", rows), "2026-12-31").totals.deposits).toBe("1000");
  });
  it("handles empty and reversed dates without inventing income", () => {
    expect(portfolioActivity([], "2026-01-01", "2026-12-31").totals.dividends).toBe("0");
    expect(portfolioActivity(rows, "2027-01-01", "2026-12-31").applied).toBe(0);
  });
});
