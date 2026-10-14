import { describe, expect, it } from "vitest";
import { replayLedger, valuePortfolio, makePriceLookup, buildValuationSeries } from "../ledger";
import type { LedgerTransaction } from "../types";

let seq = 0;
function tx(partial: Partial<LedgerTransaction> & Pick<LedgerTransaction, "type" | "date">): LedgerTransaction {
  seq += 1;
  return { id: `t${seq}`, sequence: seq, ...partial };
}

describe("ledger replay (FIFO)", () => {
  it("derives cash and lots from buys and deposits", () => {
    const state = replayLedger([
      tx({ type: "DEPOSIT", date: "2024-01-02", amount: "10000" }),
      tx({ type: "BUY", date: "2024-01-03", symbol: "abc", quantity: "10", price: "100", fee: "1" }),
    ]);
    expect(state.cash).toBe("8999");
    expect(state.positions.ABC.quantity).toBe("10");
    expect(state.positions.ABC.costBasis).toBe("1001");
    expect(state.positions.ABC.averageCost).toBe("100.1");
    expect(state.totals.tradingFees).toBe("1");
  });

  it("computes FIFO cost basis after a partial sale across two lots", () => {
    const state = replayLedger([
      tx({ type: "DEPOSIT", date: "2024-01-02", amount: "10000" }),
      tx({ type: "BUY", date: "2024-01-03", symbol: "ABC", quantity: "10", price: "100" }),
      tx({ type: "BUY", date: "2024-02-03", symbol: "ABC", quantity: "10", price: "120" }),
      tx({ type: "SELL", date: "2024-03-03", symbol: "ABC", quantity: "15", price: "130", fee: "2" }),
    ]);
    const p = state.positions.ABC;
    // Sold 10 @100 + 5 @120 = 1600 cost; proceeds 15*130 - 2 = 1948; realized 348.
    expect(p.realizedPnl).toBe("348");
    expect(p.quantity).toBe("5");
    expect(p.costBasis).toBe("600");
    expect(p.averageCost).toBe("120");
    expect(p.lots).toHaveLength(1);
    expect(state.cash).toBe("10000" === state.cash ? "x" : (10000 - 1000 - 1200 + 1948).toString());
  });

  it("rejects sells that exceed holdings and keeps the ledger consistent", () => {
    const state = replayLedger([
      tx({ type: "BUY", date: "2024-01-03", symbol: "ABC", quantity: "5", price: "10" }),
      tx({ type: "SELL", date: "2024-01-04", symbol: "ABC", quantity: "6", price: "12" }),
    ]);
    expect(state.positions.ABC.quantity).toBe("5");
    expect(state.issues.some((i) => i.code === "SELL_EXCEEDS_HOLDINGS" && i.severity === "error")).toBe(true);
    expect(state.appliedCount).toBe(1);
  });

  it("applies a 4:1 split to lot quantities while preserving cost basis", () => {
    const state = replayLedger([
      tx({ type: "BUY", date: "2024-01-03", symbol: "ABC", quantity: "10", price: "400" }),
      tx({ type: "SPLIT", date: "2024-06-01", symbol: "ABC", splitNumerator: 4, splitDenominator: 1 }),
      tx({ type: "SELL", date: "2024-07-01", symbol: "ABC", quantity: "20", price: "110" }),
    ]);
    const p = state.positions.ABC;
    expect(p.quantity).toBe("20");
    expect(p.costBasis).toBe("2000");
    expect(p.averageCost).toBe("100");
    // Sold 20 post-split shares costing 2000; proceeds 2200 -> realized 200.
    expect(p.realizedPnl).toBe("200");
  });

  it("handles a reverse split with fractional shares and an exact cost basis", () => {
    const state = replayLedger([
      tx({ type: "BUY", date: "2024-01-03", symbol: "XYZ", quantity: "10", price: "3" }),
      tx({ type: "SPLIT", date: "2024-02-01", symbol: "XYZ", splitNumerator: 1, splitDenominator: 3 }),
    ]);
    const p = state.positions.XYZ;
    expect(Number(p.quantity)).toBeCloseTo(10 / 3, 12);
    expect(p.costBasis).toBe("30");
  });

  it("records dividend reinvestment as income once plus an ordinary purchase", () => {
    const state = replayLedger([
      tx({ type: "DEPOSIT", date: "2024-01-02", amount: "1000" }),
      tx({ type: "BUY", date: "2024-01-03", symbol: "DIV", quantity: "10", price: "50" }),
      tx({ id: "div1", type: "DIVIDEND", date: "2024-03-15", symbol: "DIV", amount: "12.5" }),
      tx({ type: "BUY", date: "2024-03-15", symbol: "DIV", quantity: "0.25", price: "50", linkedTransactionId: "div1" }),
    ]);
    expect(state.totals.dividends).toBe("12.5");
    expect(state.totals.deposits).toBe("1000");
    expect(state.positions.DIV.quantity).toBe("10.25");
    expect(state.positions.DIV.dividends).toBe("12.5");
    // Cash: 1000 - 500 + 12.5 - 12.5 = 500
    expect(state.cash).toBe("500");
  });

  it("tracks standalone fees, interest and withdrawals in cash and totals", () => {
    const state = replayLedger([
      tx({ type: "DEPOSIT", date: "2024-01-02", amount: "1000" }),
      tx({ type: "FEE", date: "2024-01-05", amount: "4.95" }),
      tx({ type: "INTEREST", date: "2024-01-31", amount: "1.2" }),
      tx({ type: "WITHDRAWAL", date: "2024-02-01", amount: "200" }),
    ]);
    expect(state.cash).toBe("796.25");
    expect(state.totals.standaloneFees).toBe("4.95");
    expect(state.totals.interest).toBe("1.2");
    expect(state.totals.withdrawals).toBe("200");
  });

  it("flags negative cash as a warning rather than silently accepting it", () => {
    const state = replayLedger([tx({ type: "BUY", date: "2024-01-03", symbol: "ABC", quantity: "1", price: "10" })]);
    expect(state.cash).toBe("-10");
    expect(state.issues.some((i) => i.code === "NEGATIVE_CASH")).toBe(true);
  });

  it("respects the asOf cut-off", () => {
    const txs = [
      tx({ type: "DEPOSIT", date: "2024-01-02", amount: "1000" }),
      tx({ type: "BUY", date: "2024-03-01", symbol: "ABC", quantity: "1", price: "10" }),
    ];
    expect(replayLedger(txs, { asOf: "2024-02-01" }).positions.ABC).toBeUndefined();
    expect(replayLedger(txs).positions.ABC.quantity).toBe("1");
  });
});

describe("valuation", () => {
  const prices = {
    ABC: [
      { date: "2024-01-03", price: 100 },
      { date: "2024-01-04", price: 110 },
    ],
  };
  it("values positions with the last known price and excludes unpriced ones from totals", () => {
    const state = replayLedger([
      tx({ type: "DEPOSIT", date: "2024-01-02", amount: "1000" }),
      tx({ type: "BUY", date: "2024-01-03", symbol: "ABC", quantity: "2", price: "100" }),
      tx({ type: "BUY", date: "2024-01-03", symbol: "NOPRICE", quantity: "1", price: "50" }),
    ]);
    const v = valuePortfolio(state, makePriceLookup(prices), "2024-01-10");
    const abc = v.positions.find((p) => p.symbol === "ABC")!;
    expect(abc.marketValue).toBe("220");
    expect(abc.unrealizedPnl).toBe("20");
    expect(abc.priceDate).toBe("2024-01-04");
    const missing = v.positions.find((p) => p.symbol === "NOPRICE")!;
    expect(missing.marketValue).toBeNull();
    expect(missing.weight).toBeNull();
    expect(v.missingPrices).toEqual(["NOPRICE"]);
    // Cash 1000 - 200 - 50 = 750; total 750 + 220 = 970 (NOPRICE excluded, not zeroed).
    expect(v.totalValue).toBe("970");
    expect(abc.weight).toBeCloseTo(220 / 970, 10);
  });

  it("builds a daily valuation series with flows attributed to the right day", () => {
    const txs = [
      tx({ type: "DEPOSIT", date: "2024-01-02", amount: "1000" }),
      tx({ type: "BUY", date: "2024-01-03", symbol: "ABC", quantity: "5", price: "100" }),
      tx({ type: "DEPOSIT", date: "2024-01-06", amount: "500" }), // Saturday -> applied Monday 01-08
    ];
    const calendar = ["2024-01-02", "2024-01-03", "2024-01-04", "2024-01-05", "2024-01-08"];
    const series = {
      ABC: [
        { date: "2024-01-03", price: 100 },
        { date: "2024-01-04", price: 110 },
        { date: "2024-01-05", price: 105 },
        { date: "2024-01-08", price: 120 },
      ],
    };
    const { points } = buildValuationSeries(txs, series, calendar);
    expect(points.map((p) => p.value)).toEqual([1000, 1000, 1050, 1025, 1600]);
    expect(points[4].externalFlow).toBe(500);
    expect(points[0].externalFlow).toBe(1000);
  });
});
