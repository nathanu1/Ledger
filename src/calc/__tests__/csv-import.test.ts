import { describe, expect, it } from "vitest";
import { suggestMapping, parseDateValue, parseTypeValue, validateImportRows, transactionFingerprint, transactionsToCsv, parseSplitRatio } from "../csv-import";

describe("CSV mapping suggestions", () => {
  it("maps common broker headers", () => {
    const m = suggestMapping(["Trade Date", "Action", "Symbol", "Qty", "Price", "Commission", "Net Amount", "Notes"]);
    expect(m.date).toBe("Trade Date");
    expect(m.type).toBe("Action");
    expect(m.symbol).toBe("Symbol");
    expect(m.quantity).toBe("Qty");
    expect(m.price).toBe("Price");
    expect(m.fee).toBe("Commission");
    expect(m.amount).toBe("Net Amount");
    expect(m.note).toBe("Notes");
  });
});

describe("value parsing", () => {
  it("parses dates in several formats", () => {
    expect(parseDateValue("2024-03-05")).toBe("2024-03-05");
    expect(parseDateValue("03/05/2024")).toBe("2024-03-05");
    expect(parseDateValue("05/03/2024", "DMY")).toBe("2024-03-05");
    expect(parseDateValue("25/03/2024")).toBe("2024-03-25");
    expect(parseDateValue("20240305")).toBe("2024-03-05");
    expect(parseDateValue("5 Mar 2024")).toBe("2024-03-05");
    expect(parseDateValue("Mar 5, 2024")).toBe("2024-03-05");
    expect(parseDateValue("2024-02-30")).toBeNull();
    expect(parseDateValue("not a date")).toBeNull();
  });
  it("parses transaction types from broker vocabulary", () => {
    expect(parseTypeValue("Bought")).toBe("BUY");
    expect(parseTypeValue("SELL")).toBe("SELL");
    expect(parseTypeValue("Qualified Dividend")).toBe("DIVIDEND");
    expect(parseTypeValue("Cash In")).toBe("DEPOSIT");
    expect(parseTypeValue("Stock Split")).toBe("SPLIT");
    expect(parseTypeValue("mystery")).toBeNull();
  });
  it("parses split ratios", () => {
    expect(parseSplitRatio("4:1")).toEqual({ numerator: 4, denominator: 1 });
    expect(parseSplitRatio("1/10")).toEqual({ numerator: 1, denominator: 10 });
    expect(parseSplitRatio("3 for 2")).toEqual({ numerator: 3, denominator: 2 });
    expect(parseSplitRatio("abc")).toBeNull();
  });
});

describe("row validation and duplicate detection", () => {
  const mapping = { date: "Date", type: "Type", symbol: "Symbol", quantity: "Qty", price: "Price", amount: "Amount", fee: "Fee", note: null, splitRatio: "Ratio" };
  const rows = [
    { Date: "2024-01-02", Type: "Deposit", Symbol: "", Qty: "", Price: "", Amount: "$10,000.00", Fee: "", Ratio: "" },
    { Date: "2024-01-03", Type: "Buy", Symbol: "abc", Qty: "10", Price: "100.50", Amount: "", Fee: "1", Ratio: "" },
    { Date: "2024-01-03", Type: "Buy", Symbol: "abc", Qty: "10", Price: "100.50", Amount: "", Fee: "1", Ratio: "" }, // duplicate in file
    { Date: "2024-13-01", Type: "Buy", Symbol: "abc", Qty: "1", Price: "1", Amount: "", Fee: "", Ratio: "" }, // bad date
    { Date: "2024-02-01", Type: "Sell", Symbol: "", Qty: "5", Price: "120", Amount: "", Fee: "", Ratio: "" }, // missing symbol
    { Date: "2024-02-02", Type: "Dividend", Symbol: "ABC", Qty: "", Price: "", Amount: "(12.50)", Fee: "", Ratio: "" },
    { Date: "2024-03-01", Type: "Split", Symbol: "ABC", Qty: "", Price: "", Amount: "", Fee: "", Ratio: "4:1" },
    { Date: "2024-03-02", Type: "Buy", Symbol: "ABC", Qty: "2", Price: "", Amount: "210", Fee: "", Ratio: "" }, // price derived
    { Date: "", Type: "", Symbol: "", Qty: "", Price: "", Amount: "", Fee: "", Ratio: "" }, // empty
  ];

  it("validates rows and reports problems per row", () => {
    const v = validateImportRows(rows, { mapping });
    expect(v.rows[0].transaction?.type).toBe("DEPOSIT");
    expect(v.rows[0].transaction?.amount).toBe("10000");
    expect(v.rows[1].transaction?.symbol).toBe("ABC");
    expect(v.rows[1].transaction?.fee).toBe("1");
    expect(v.rows[2].duplicate).toBe("file");
    expect(v.rows[3].errors[0]).toMatch(/date/);
    expect(v.rows[4].errors[0]).toMatch(/symbol/);
    expect(v.rows[5].transaction?.amount).toBe("12.5");
    expect(v.rows[6].transaction?.splitNumerator).toBe(4);
    expect(v.rows[7].transaction?.price).toBe("105");
    expect(v.rows[7].warnings[0]).toMatch(/derived/);
    expect(v.rows[8].errors[0]).toMatch(/Empty/);
    expect(v.summary.total).toBe(9);
    expect(v.summary.valid).toBe(6);
    expect(v.summary.duplicatesInFile).toBe(1);
    expect(v.summary.importable).toBe(5);
  });

  it("detects duplicates of already-imported transactions by fingerprint", () => {
    const existing = new Set([
      transactionFingerprint({ type: "DEPOSIT", date: "2024-01-02", amount: "10000.00", symbol: null, quantity: null, price: null, fee: null }),
    ]);
    const v = validateImportRows(rows.slice(0, 2), { mapping, existingFingerprints: existing });
    expect(v.rows[0].duplicate).toBe("existing");
    expect(v.rows[1].duplicate).toBeNull();
    expect(v.summary.duplicatesOfExisting).toBe(1);
  });

  it("round-trips through export and import", () => {
    const csv = transactionsToCsv([
      { id: "x1", sequence: 1, type: "BUY", date: "2024-01-03", symbol: "ABC", quantity: "10", price: "100.5", fee: "1", note: 'has, "quotes"' },
      { id: "x2", sequence: 2, type: "SPLIT", date: "2024-03-01", symbol: "ABC", splitNumerator: 4, splitDenominator: 1 },
    ]);
    const lines = csv.trim().split("\n");
    expect(lines[0]).toBe("date,type,symbol,quantity,price,amount,fee,split_ratio,linked_transaction_id,note,id");
    expect(lines[1]).toContain('"has, ""quotes"""');
    expect(lines[2]).toContain("4:1");
  });
});
