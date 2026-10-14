/**
 * Deterministic demo dataset. Every number is generated from fixed seeds so
 * the demo is identical on every machine and every run. All securities are
 * fictional; the data illustrates Ledger's workflows and is not market data.
 */
import { addDays, addMonths, daysBetween } from "@/calc/dates";
import type { ISODate } from "@/calc/types";
import type * as schema from "@/db/schema";
import { tradingDays, nextTradingDay, isTradingDay } from "./calendar";
import { Prng } from "./prng";
import { DEMO_AS_OF, DEMO_BENCHMARK, DEMO_COMPANIES, DEMO_FIRST_FISCAL_YEAR, DEMO_FUNDS, DEMO_PRICE_START, type DemoCompany, type DemoDividend } from "./universe";

type Insert<T extends { $inferInsert: unknown }> = T["$inferInsert"];

export interface DemoDataset {
  asOf: ISODate;
  generatedAt: string;
  securities: Insert<typeof schema.securities>[];
  prices: Insert<typeof schema.prices>[];
  quotes: Insert<typeof schema.quotes>[];
  facts: Insert<typeof schema.financialFacts>[];
  filings: Insert<typeof schema.filings>[];
  earnings: Insert<typeof schema.earningsEvents>[];
  etfHoldings: Insert<typeof schema.etfHoldings>[];
  portfolios: Insert<typeof schema.portfolios>[];
  transactions: Insert<typeof schema.transactions>[];
  watchlists: Insert<typeof schema.watchlists>[];
  watchlistItems: Insert<typeof schema.watchlistItems>[];
  savedViews: Insert<typeof schema.savedViews>[];
  theses: Insert<typeof schema.theses>[];
  thesisRevisions: Insert<typeof schema.thesisRevisions>[];
  thesisRules: Insert<typeof schema.thesisRules>[];
  dcfScenarios: Insert<typeof schema.dcfScenarios>[];
  notes: Insert<typeof schema.notes>[];
}

const SOURCE = "demo";
const CENTS = (v: number) => Math.round(v * 100) / 100;
const money = (v: number) => v.toFixed(2);

// ------------------------------------------------------------------ prices

interface PricePath {
  dates: ISODate[];
  close: number[];
  adjClose: number[];
  open: number[];
  high: number[];
  low: number[];
  volume: number[];
  /** Dividend per share on ex-dates. */
  dividends: Map<ISODate, number>;
  split: { date: ISODate; ratio: number } | null;
}

function dividendDates(div: DemoDividend, from: ISODate, to: ISODate): Array<{ exDate: ISODate; amount: number }> {
  const out: Array<{ exDate: ISODate; amount: number }> = [];
  const startYear = Number(from.slice(0, 4));
  for (let year = startYear; year <= Number(to.slice(0, 4)); year += 1) {
    for (const month of div.months) {
      const raw = `${year}-${String(month).padStart(2, "0")}-15`;
      const exDate = nextTradingDay(raw);
      if (exDate < from || exDate > to) continue;
      const yearsElapsed = year - startYear;
      out.push({ exDate, amount: CENTS((div.startAnnual / div.months.length) * Math.pow(1 + div.growth, yearsElapsed)) });
    }
  }
  return out;
}

function generatePath(
  symbol: string,
  params: { priceStart: number; drift: number; vol: number; marketBeta: number; earningsDates: ISODate[]; earningsJump: number; dividend: DemoDividend | null; split: { date: ISODate; numerator: number; denominator: number } | null },
  dates: ISODate[],
  marketShocks: number[],
): PricePath {
  const rng = new Prng(`price:${symbol}`);
  const n = dates.length;
  const dailyDrift = params.drift / 252;
  const dailyVol = params.vol / Math.sqrt(252);
  const marketVol = 0.15 / Math.sqrt(252);
  const betaPart = params.marketBeta * marketVol;
  const idioVol = Math.sqrt(Math.max(dailyVol * dailyVol - betaPart * betaPart, (0.3 * dailyVol) ** 2));
  const earnings = new Set(params.earningsDates);
  const divs = params.dividend ? dividendDates(params.dividend, dates[0], dates[n - 1]) : [];
  const divMap = new Map<ISODate, number>();
  const splitRatio = params.split ? params.split.numerator / params.split.denominator : 1;
  const splitDate = params.split ? nextTradingDay(params.split.date) : null;
  for (const d of divs) {
    // Per-share dividend halves after a 2:1 split (same total payout).
    const amount = splitDate && d.exDate >= splitDate ? CENTS(d.amount / splitRatio) : d.amount;
    divMap.set(d.exDate, amount);
  }
  const close: number[] = new Array(n);
  const open: number[] = new Array(n);
  const high: number[] = new Array(n);
  const low: number[] = new Array(n);
  const volume: number[] = new Array(n);
  let price = params.priceStart;
  for (let i = 0; i < n; i += 1) {
    const date = dates[i];
    let r = dailyDrift - 0.5 * dailyVol * dailyVol + params.marketBeta * marketShocks[i] * marketVol + idioVol * rng.gaussian();
    if (earnings.has(date)) r += params.earningsJump * rng.gaussian();
    const prev = price;
    price = prev * Math.exp(r);
    const div = divMap.get(date);
    if (div) price = Math.max(price - div, 0.01);
    if (splitDate && date === splitDate) price = price / splitRatio;
    const o = i === 0 ? price : (splitDate && date === splitDate ? prev / splitRatio : prev) * Math.exp(idioVol * 0.3 * rng.gaussian());
    const hi = Math.max(o, price) * (1 + Math.abs(rng.gaussian()) * idioVol * 0.6);
    const lo = Math.min(o, price) * (1 - Math.abs(rng.gaussian()) * idioVol * 0.6);
    close[i] = CENTS(price);
    open[i] = CENTS(o);
    high[i] = CENTS(hi);
    low[i] = CENTS(lo);
    volume[i] = Math.round((2e6 + 6e6 * rng.next()) * (earnings.has(date) ? 2.5 : 1));
  }
  // Adjusted close (splits and dividends), anchored so the last adjusted close equals the last raw close.
  const adjClose: number[] = new Array(n);
  let factor = 1;
  adjClose[n - 1] = close[n - 1];
  for (let i = n - 1; i >= 1; i -= 1) {
    const date = dates[i];
    if (splitDate && date === splitDate) factor /= splitRatio;
    const div = divMap.get(date);
    if (div) factor *= (close[i - 1] - div) / close[i - 1];
    adjClose[i - 1] = Math.round(close[i - 1] * factor * 10000) / 10000;
  }
  return { dates, close, adjClose, open, high, low, volume, dividends: divMap, split: splitDate ? { date: splitDate, ratio: splitRatio } : null };
}

// ------------------------------------------------------------- fundamentals

interface FiscalQuarter {
  fy: number;
  fp: 1 | 2 | 3 | 4;
  fyStart: ISODate;
  start: ISODate;
  end: ISODate;
  filed: ISODate;
  form: "10-Q" | "10-K";
  accession: string;
  earningsDate: ISODate;
}

function endOfMonth(date: ISODate): ISODate {
  const [y, m] = date.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${y}-${String(m).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
}

function fiscalQuarters(c: DemoCompany, asOf: ISODate): FiscalQuarter[] {
  const m = c.model;
  const out: FiscalQuarter[] = [];
  let seq = 1;
  for (let fy = DEMO_FIRST_FISCAL_YEAR; fy <= 2027; fy += 1) {
    const fyeYear = fy + (m.fyLabelOffset === -1 ? 1 : 0);
    const fye = endOfMonth(`${fyeYear}-${String(m.fyeMonth).padStart(2, "0")}-01`);
    const fyStart = addDays(endOfMonth(addMonths(fye, -12)), 1);
    for (let fp = 1 as 1 | 2 | 3 | 4; fp <= 4; fp = (fp + 1) as 1 | 2 | 3 | 4) {
      const end = endOfMonth(addMonths(fye, -3 * (4 - fp)));
      const start = fp === 1 ? fyStart : addDays(endOfMonth(addMonths(fye, -3 * (5 - fp))), 1);
      const form = fp === 4 ? "10-K" : "10-Q";
      const filed = nextTradingDay(addDays(end, fp === 4 ? 55 : 40));
      const earningsDate = nextTradingDay(addDays(end, 24 + (seq % 5)));
      if (filed > asOf) continue;
      const yy = filed.slice(2, 4);
      out.push({ fy, fp, fyStart, start, end, filed, form, accession: `${c.cik}-${yy}-${String(seq).padStart(6, "0")}`, earningsDate });
      seq += 1;
    }
  }
  return out;
}

interface QuarterModel {
  q: FiscalQuarter;
  revenue: number;
  cogs: number | null;
  grossProfit: number | null;
  opInc: number;
  interest: number;
  pretax: number;
  tax: number;
  netIncome: number;
  shares: number;
  eps: number;
  da: number;
  sbc: number;
  capex: number;
  ocf: number;
  cash: number;
  sti: number | null;
  debtNoncurrent: number;
  debtCurrent: number;
  currentAssets: number | null;
  currentLiabilities: number | null;
  totalAssets: number;
  equity: number;
  sharesOutstanding: number;
}

function modelCompany(c: DemoCompany, quarters: FiscalQuarter[]): QuarterModel[] {
  const m = c.model;
  const rng = new Prng(`fin:${c.symbol}`);
  const isBank = c.sector === "Financials";
  const totalYears = Math.max(quarters.length / 4, 1);
  const out: QuarterModel[] = [];
  let revPrev = m.startRevenueQ;
  let cash = m.cashStart;
  let shares = m.sharesStart;
  const lerp = (a: number, b: number, t: number) => a + (b - a) * Math.min(Math.max(t, 0), 1);
  for (let i = 0; i < quarters.length; i += 1) {
    const q = quarters[i];
    const years = i / 4;
    const t = years / totalYears;
    const g = lerp(m.growthStart, m.growthEnd, t);
    const base = i === 0 ? m.startRevenueQ : revPrev / (m.seasonality[quarters[i - 1].fp - 1] || 1);
    const deseasonalised = base * Math.pow(1 + g, 0.25);
    const revenue = Math.round(deseasonalised * m.seasonality[q.fp - 1] * (1 + m.noise * rng.gaussian()));
    const gm = lerp(m.grossMarginStart, m.grossMarginEnd, t);
    const om = lerp(m.opMarginStart, m.opMarginEnd, t) + 0.004 * rng.gaussian();
    const cogs = isBank ? null : Math.round(revenue * (1 - gm));
    const grossProfit = isBank ? null : revenue - (cogs as number);
    const opInc = Math.round(revenue * om);
    const debtTotal = Math.max(0, m.debtStart + m.debtChange * years);
    const interest = Math.round((debtTotal * m.interestRate) / 4);
    const pretax = opInc - interest;
    const tax = Math.round(pretax > 0 ? pretax * m.taxRate : 0);
    const netIncome = pretax - tax;
    shares = Math.round(m.sharesStart * Math.pow(1 + m.sharesChange, years));
    const eps = Math.round((netIncome / shares) * 100) / 100;
    const da = Math.round(revenue * m.daPct);
    const sbc = Math.round(revenue * m.sbcPct);
    const capex = Math.round(revenue * m.capexPct);
    const deltaNwc = Math.round(m.nwcPct * (revenue - revPrev));
    const ocf = netIncome + da + sbc - deltaNwc;
    const fcf = ocf - capex;
    const dps = m.dividend ? (m.dividend.startAnnual / 4) * Math.pow(1 + m.dividend.growth, years) : 0;
    const dividendsPaid = Math.round(dps * shares);
    const buybacks = m.sharesChange < 0 ? Math.max(0, Math.round((fcf - dividendsPaid) * 0.55)) : 0;
    cash = cash + fcf - dividendsPaid - buybacks + (m.debtChange / 4);
    const floor = revenue * 0.35;
    if (cash < floor) cash = floor + Math.abs(rng.gaussian()) * revenue * 0.05;
    cash = Math.round(cash);
    const annualRevenue = revenue * 4;
    const sti = ["HALC", "NRVA", "QNTL", "OBSD"].includes(c.symbol) ? Math.round(cash * 0.8) : null;
    const debtCurrent = Math.round(debtTotal * m.debtCurrentShare);
    const debtNoncurrent = Math.round(debtTotal - debtCurrent);
    const currentAssets = isBank ? null : Math.round(cash + (sti ?? 0) + annualRevenue * 0.22);
    const currentLiabilities = isBank ? null : Math.round(annualRevenue * 0.18 + debtCurrent);
    const assetMultiple = isBank ? 11 : m.capexPct > 0.2 ? 3.2 : 1.6;
    const totalAssets = Math.round(cash + (sti ?? 0) + annualRevenue * assetMultiple);
    const liabilities = Math.round((currentLiabilities ?? annualRevenue * (isBank ? 9.5 : 0.3)) + debtNoncurrent + annualRevenue * 0.25);
    const equity = totalAssets - liabilities;
    out.push({
      q,
      revenue,
      cogs,
      grossProfit,
      opInc,
      interest,
      pretax,
      tax,
      netIncome,
      shares,
      eps,
      da,
      sbc,
      capex,
      ocf,
      cash,
      sti,
      debtNoncurrent,
      debtCurrent,
      currentAssets,
      currentLiabilities,
      totalAssets,
      equity,
      sharesOutstanding: Math.round(shares * 0.985),
    });
    revPrev = revenue;
  }
  return out;
}

type FactInsert = Insert<typeof schema.financialFacts>;

function emitFacts(c: DemoCompany, models: QuarterModel[], retrievedAt: string): FactInsert[] {
  const facts: FactInsert[] = [];
  const isBank = c.sector === "Financials";
  const hasDebt = c.model.debtStart > 0 || c.model.debtChange > 0;
  const push = (f: Omit<FactInsert, "symbol" | "cik" | "source" | "retrievedAt">) => facts.push({ ...f, symbol: c.symbol, cik: c.cik, source: SOURCE, retrievedAt });

  const byFy = new Map<number, QuarterModel[]>();
  for (const qm of models) {
    const list = byFy.get(qm.q.fy) ?? [];
    list.push(qm);
    byFy.set(qm.q.fy, list);
  }

  const durationFacts = (qm: QuarterModel, filing: FiscalQuarter, ytd: QuarterModel[], includeStandalone: boolean, restateRevenue: number | null) => {
    const { q } = qm;
    const sum = (f: (x: QuarterModel) => number | null) => {
      let total = 0;
      for (const x of ytd) {
        const v = f(x);
        if (v === null) return null;
        total += v;
      }
      return total;
    };
    const meta = { fy: filing.fy, fp: filing.fp === 4 ? "FY" : `Q${filing.fp}`, form: filing.form, filed: filing.filed, accession: filing.accession };
    const lines: Array<[string, string, (x: QuarterModel) => number | null, boolean]> = [
      ["us-gaap:Revenues", "USD", (x) => x.revenue, true],
      ["us-gaap:CostOfRevenue", "USD", (x) => x.cogs, true],
      ["us-gaap:GrossProfit", "USD", (x) => x.grossProfit, true],
      ["us-gaap:OperatingIncomeLoss", "USD", (x) => x.opInc, true],
      ["us-gaap:InterestExpense", "USD", (x) => (hasDebt ? x.interest : null), true],
      ["us-gaap:IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest", "USD", (x) => x.pretax, true],
      ["us-gaap:IncomeTaxExpenseBenefit", "USD", (x) => x.tax, true],
      ["us-gaap:NetIncomeLoss", "USD", (x) => x.netIncome, true],
      // Cash-flow statement lines are cumulative only (no standalone quarter), as in real 10-Qs.
      ["us-gaap:NetCashProvidedByUsedInOperatingActivities", "USD", (x) => x.ocf, false],
      ["us-gaap:PaymentsToAcquirePropertyPlantAndEquipment", "USD", (x) => x.capex, false],
      ["us-gaap:DepreciationDepletionAndAmortization", "USD", (x) => x.da, false],
      ["us-gaap:ShareBasedCompensation", "USD", (x) => x.sbc, false],
    ];
    for (const [concept, unit, getter, standalone] of lines) {
      if (isBank && (concept.includes("CostOfRevenue") || concept.includes("GrossProfit"))) continue;
      const ytdValue = sum(getter);
      if (ytdValue === null) continue;
      const adjust = (v: number) => (restateRevenue !== null && concept === "us-gaap:Revenues" ? Math.round(v * restateRevenue) : v);
      // Year-to-date (cumulative) fact. For Q1 the YTD fact is the quarter itself.
      push({ concept, unit, value: adjust(ytdValue), start: q.fyStart, end: q.end, ...meta });
      if (standalone && includeStandalone && q.fp !== 1) {
        const v = getter(qm);
        if (v !== null) push({ concept, unit, value: adjust(v), start: q.start, end: q.end, ...meta });
      }
    }
    // Per-share and share-count figures: quarterly standalone plus year-to-date.
    if (includeStandalone && q.fp !== 1) {
      push({ concept: "us-gaap:EarningsPerShareDiluted", unit: "USD/shares", value: qm.eps, start: q.start, end: q.end, ...meta });
      push({ concept: "us-gaap:WeightedAverageNumberOfDilutedSharesOutstanding", unit: "shares", value: qm.shares, start: q.start, end: q.end, ...meta });
    }
    const ytdNi = sum((x) => x.netIncome) as number;
    const avgShares = Math.round(ytd.reduce((a, x) => a + x.shares, 0) / ytd.length);
    push({ concept: "us-gaap:EarningsPerShareDiluted", unit: "USD/shares", value: Math.round((ytdNi / avgShares) * 100) / 100, start: q.fyStart, end: q.end, ...meta });
    push({ concept: "us-gaap:WeightedAverageNumberOfDilutedSharesOutstanding", unit: "shares", value: avgShares, start: q.fyStart, end: q.end, ...meta });
  };

  const instantFacts = (qm: QuarterModel, filing: FiscalQuarter) => {
    const meta = { fy: filing.fy, fp: filing.fp === 4 ? "FY" : `Q${filing.fp}`, form: filing.form, filed: filing.filed, accession: filing.accession };
    const end = qm.q.end;
    push({ concept: "us-gaap:CashAndCashEquivalentsAtCarryingValue", unit: "USD", value: qm.cash, start: null, end, ...meta });
    if (qm.sti !== null) push({ concept: "us-gaap:MarketableSecuritiesCurrent", unit: "USD", value: qm.sti, start: null, end, ...meta });
    if (hasDebt) {
      if (isBank) {
        push({ concept: "us-gaap:LongTermDebt", unit: "USD", value: qm.debtNoncurrent, start: null, end, ...meta });
        push({ concept: "us-gaap:ShortTermBorrowings", unit: "USD", value: qm.debtCurrent, start: null, end, ...meta });
      } else {
        push({ concept: "us-gaap:LongTermDebtNoncurrent", unit: "USD", value: qm.debtNoncurrent, start: null, end, ...meta });
        if (qm.debtCurrent > 0) push({ concept: "us-gaap:LongTermDebtCurrent", unit: "USD", value: qm.debtCurrent, start: null, end, ...meta });
      }
    }
    if (qm.currentAssets !== null) push({ concept: "us-gaap:AssetsCurrent", unit: "USD", value: qm.currentAssets, start: null, end, ...meta });
    if (qm.currentLiabilities !== null) push({ concept: "us-gaap:LiabilitiesCurrent", unit: "USD", value: qm.currentLiabilities, start: null, end, ...meta });
    push({ concept: "us-gaap:Assets", unit: "USD", value: qm.totalAssets, start: null, end, ...meta });
    push({ concept: "us-gaap:StockholdersEquity", unit: "USD", value: qm.equity, start: null, end, ...meta });
  };

  for (const qm of models) {
    const filing = qm.q;
    const ytd = (byFy.get(filing.fy) ?? []).filter((x) => x.q.fp <= filing.fp);
    durationFacts(qm, filing, ytd, true, null);
    instantFacts(qm, filing);
    // Cover-page share count dated shortly before the filing.
    push({
      concept: "dei:EntityCommonStockSharesOutstanding",
      unit: "shares",
      value: qm.sharesOutstanding,
      start: null,
      end: addDays(filing.filed, -12),
      fy: filing.fy,
      fp: filing.fp === 4 ? "FY" : `Q${filing.fp}`,
      form: filing.form,
      filed: filing.filed,
      accession: filing.accession,
    });
    // Prior-year comparatives re-reported in this filing (duplicates the normaliser must collapse).
    const prior = (byFy.get(filing.fy - 1) ?? []).find((x) => x.q.fp === filing.fp);
    if (prior) {
      const priorYtd = (byFy.get(filing.fy - 1) ?? []).filter((x) => x.q.fp <= filing.fp);
      const restate = c.model.restateRevenueFy === prior.q.fy && filing.fp === 4 ? 0.994 : null;
      durationFacts(prior, filing, priorYtd, true, restate);
      instantFacts(prior, filing);
    }
  }
  return facts;
}

// ------------------------------------------------------------------ dataset

export function generateDemoDataset(asOf: ISODate = DEMO_AS_OF): DemoDataset {
  const retrievedAt = `${asOf}T22:00:00.000Z`;
  const dates = tradingDays(DEMO_PRICE_START, asOf);
  const marketRng = new Prng("market");
  const marketShocks = dates.map(() => marketRng.gaussian());

  const securities: DemoDataset["securities"] = [];
  const prices: DemoDataset["prices"] = [];
  const quotes: DemoDataset["quotes"] = [];
  const facts: DemoDataset["facts"] = [];
  const filings: DemoDataset["filings"] = [];
  const earnings: DemoDataset["earnings"] = [];
  const etfHoldings: DemoDataset["etfHoldings"] = [];
  const paths = new Map<string, PricePath>();

  const pushPrices = (symbol: string, path: PricePath, adjustment: "splits_dividends") => {
    for (let i = 0; i < path.dates.length; i += 1) {
      prices.push({
        symbol,
        date: path.dates[i],
        open: path.open[i],
        high: path.high[i],
        low: path.low[i],
        close: path.close[i],
        adjClose: path.adjClose[i],
        adjustment,
        volume: path.volume[i],
        source: SOURCE,
        retrievedAt,
      });
    }
    const n = path.dates.length;
    const last = path.close[n - 1];
    const prev = path.close[n - 2];
    quotes.push({
      symbol,
      price: last,
      change: CENTS(last - prev),
      changePct: last / prev - 1,
      previousClose: prev,
      asOf: `${path.dates[n - 1]}T20:00:00.000Z`,
      session: "eod",
      currency: "USD",
      source: SOURCE,
      retrievedAt,
    });
  };

  for (const c of DEMO_COMPANIES) {
    const quarters = fiscalQuarters(c, asOf);
    const models = modelCompany(c, quarters);
    const earningsDates = quarters.map((q) => q.earningsDate);
    const path = generatePath(
      c.symbol,
      { priceStart: c.model.priceStart, drift: c.model.drift, vol: c.model.vol, marketBeta: 0.55 + c.model.vol, earningsDates, earningsJump: c.model.earningsJump, dividend: c.model.dividend, split: c.model.split },
      dates,
      marketShocks,
    );
    paths.set(c.symbol, path);
    pushPrices(c.symbol, path, "splits_dividends");
    securities.push({
      symbol: c.symbol,
      name: c.name,
      exchange: c.exchange,
      securityType: "stock",
      sector: c.sector,
      industry: c.industry,
      cik: c.cik,
      sic: c.sic,
      description: c.description,
      website: c.website,
      currency: "USD",
      fiscalYearEnd: `${String(c.model.fyeMonth).padStart(2, "0")}${String(c.model.fyeDay).padStart(2, "0")}`,
      holdingsAvailable: false,
      source: SOURCE,
      retrievedAt,
    });
    facts.push(...emitFacts(c, models, retrievedAt));
    for (const q of quarters) {
      filings.push({
        accession: q.accession,
        symbol: c.symbol,
        cik: c.cik,
        form: q.form,
        filedAt: q.filed,
        reportDate: q.end,
        primaryDocument: null,
        description: q.form === "10-K" ? `Annual report for fiscal year ${q.fy}` : `Quarterly report for Q${q.fp} fiscal ${q.fy}`,
        url: null,
        source: SOURCE,
        retrievedAt,
      });
      filings.push({
        accession: `${q.accession}-8K`,
        symbol: c.symbol,
        cik: c.cik,
        form: "8-K",
        filedAt: q.earningsDate,
        reportDate: q.earningsDate,
        primaryDocument: null,
        description: `Item 2.02 Results of Operations and Financial Condition (Q${q.fp} fiscal ${q.fy})`,
        url: null,
        source: SOURCE,
        retrievedAt,
      });
      if (q.fp === 4) {
        filings.push({
          accession: `${q.accession}-DEF14A`,
          symbol: c.symbol,
          cik: c.cik,
          form: "DEF 14A",
          filedAt: nextTradingDay(addDays(q.end, 100)),
          reportDate: null,
          primaryDocument: null,
          description: "Definitive proxy statement",
          url: null,
          source: SOURCE,
          retrievedAt,
        });
      }
    }
    const ne = c.model.nextEarnings;
    earnings.push({
      id: `earn-${c.symbol}-${ne.date}`,
      symbol: c.symbol,
      date: ne.date,
      status: ne.status,
      timeOfDay: ne.timeOfDay,
      fiscalPeriodEnd: quarters.length ? endOfMonth(addMonths(quarters[quarters.length - 1].end, 3)) : null,
      epsEstimate: null,
      basis: ne.status === "confirmed" ? "Company announced the date (demo data)." : "Estimated from the cadence of prior releases (demo data).",
      sourceUrl: null,
      source: SOURCE,
      retrievedAt,
    });
  }

  for (const f of DEMO_FUNDS) {
    const path = generatePath(f.symbol, { priceStart: f.priceStart, drift: f.drift, vol: f.vol, marketBeta: f.marketBeta, earningsDates: [], earningsJump: 0, dividend: f.dividend, split: null }, dates, marketShocks);
    paths.set(f.symbol, path);
    pushPrices(f.symbol, path, "splits_dividends");
    securities.push({
      symbol: f.symbol,
      name: f.name,
      exchange: f.exchange,
      securityType: "etf",
      sector: null,
      industry: null,
      cik: null,
      sic: null,
      description: f.description,
      website: null,
      currency: "USD",
      fiscalYearEnd: null,
      fundFamily: f.family,
      fundCategory: f.category,
      expenseRatio: f.expenseRatio,
      benchmarkIndex: f.benchmarkIndex,
      holdingsAvailable: f.holdings !== null,
      source: SOURCE,
      retrievedAt,
    });
    if (f.holdings) {
      for (const h of f.holdings) {
        etfHoldings.push({ symbol: f.symbol, holdingSymbol: h.symbol, holdingName: h.name, sector: h.sector, weight: h.weight, asOf: addDays(asOf, -20), source: SOURCE, retrievedAt });
      }
    }
  }

  // ------------------------------------------------------------ portfolios
  const closeOn = (symbol: string, date: ISODate): number => {
    const path = paths.get(symbol)!;
    let idx = path.dates.length - 1;
    while (idx > 0 && path.dates[idx] > date) idx -= 1;
    return path.close[idx];
  };

  const portfolios: DemoDataset["portfolios"] = [
    {
      id: "pf-core",
      name: "Core Portfolio",
      baseCurrency: "USD",
      benchmarkSymbol: DEMO_BENCHMARK,
      costBasisMethod: "FIFO",
      description: "Long-term holdings funded with monthly contributions. Demo data.",
      createdAt: "2023-11-01T15:00:00.000Z",
      updatedAt: retrievedAt,
    },
    {
      id: "pf-income",
      name: "Dividend Income",
      baseCurrency: "USD",
      benchmarkSymbol: DEMO_BENCHMARK,
      costBasisMethod: "FIFO",
      description: "Income-oriented holdings with dividends taken as cash. Demo data.",
      createdAt: "2024-06-03T15:00:00.000Z",
      updatedAt: retrievedAt,
    },
  ];

  const transactions: DemoDataset["transactions"] = [];
  const buildPortfolio = (portfolioId: string, events: Array<{ date: ISODate; type: string; symbol?: string; quantity?: number; amount?: number; fee?: number; note?: string; drip?: boolean }>, dripSymbols: Set<string>) => {
    const rng = new Prng(`pf:${portfolioId}`);
    const holdings = new Map<string, number>();
    let cash = 0;
    let seq = 0;
    const sorted = [...events].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    // Expand dividend and interest events along the way.
    const timeline: Array<{ date: ISODate; type: string; symbol?: string; quantity?: number; amount?: number; fee?: number; note?: string; drip?: boolean; auto?: boolean }> = [...sorted];
    const allDates = dates.filter((d) => d >= sorted[0].date);
    const dividendSymbols = [...DEMO_COMPANIES.filter((c) => c.model.dividend).map((c) => c.symbol), ...DEMO_FUNDS.filter((f) => f.dividend).map((f) => f.symbol)];
    for (const d of allDates) {
      for (const sym of dividendSymbols) {
        const div = paths.get(sym)!.dividends.get(d);
        if (div) timeline.push({ date: d, type: "DIVIDEND", symbol: sym, amount: div, auto: true, drip: dripSymbols.has(sym) });
      }
      // Quarter-end interest on cash.
      if (/-(03-31|06-30|09-30|12-31)$/.test(d) || (!isTradingDay(d) && false)) timeline.push({ date: d, type: "INTEREST", auto: true });
    }
    // Quarter ends that fall on non-trading days still accrue interest on the previous trading day.
    for (const qe of ["2023-12-31", "2024-03-31", "2024-06-30", "2024-09-30", "2024-12-31", "2025-03-31", "2025-06-30", "2025-09-30", "2025-12-31", "2026-03-31", "2026-06-30", "2026-09-30"]) {
      if (qe < sorted[0].date) continue;
      if (!timeline.some((t) => t.type === "INTEREST" && t.date === qe)) timeline.push({ date: qe, type: "INTEREST", auto: true });
    }
    timeline.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (a.auto ? 1 : 0) - (b.auto ? 1 : 0)));
    const add = (t: Omit<Insert<typeof schema.transactions>, "portfolioId" | "sequence" | "fingerprint" | "createdAt" | "updatedAt" | "id"> & { id?: string }) => {
      seq += 1;
      const id = t.id ?? `tx-${portfolioId}-${String(seq).padStart(4, "0")}`;
      transactions.push({
        ...t,
        id,
        portfolioId,
        sequence: seq,
        fingerprint: [t.date, t.type, t.symbol ?? "", t.quantity ?? "", t.price ?? "", t.amount ?? "", t.fee ?? "", t.type === "SPLIT" ? `${t.splitNumerator}:${t.splitDenominator}` : ""].join("|"),
        createdAt: `${t.date}T16:00:00.000Z`,
        updatedAt: `${t.date}T16:00:00.000Z`,
      });
      return id;
    };
    for (const e of timeline) {
      const tradeDate = nextTradingDay(e.date);
      switch (e.type) {
        case "DEPOSIT": {
          cash += e.amount!;
          add({ type: "DEPOSIT", date: e.date, amount: money(e.amount!), note: e.note ?? null });
          break;
        }
        case "WITHDRAWAL": {
          cash -= e.amount!;
          add({ type: "WITHDRAWAL", date: e.date, amount: money(e.amount!), note: e.note ?? null });
          break;
        }
        case "FEE": {
          cash -= e.amount!;
          add({ type: "FEE", date: e.date, amount: money(e.amount!), note: e.note ?? "Account fee" });
          break;
        }
        case "BUY": {
          const price = CENTS(closeOn(e.symbol!, tradeDate) * (1 + rng.range(-0.003, 0.003)));
          const fee = e.fee ?? 0;
          cash -= e.quantity! * price + fee;
          holdings.set(e.symbol!, (holdings.get(e.symbol!) ?? 0) + e.quantity!);
          add({ type: "BUY", date: tradeDate, symbol: e.symbol!, quantity: String(e.quantity), price: money(price), fee: fee ? money(fee) : null, note: e.note ?? null });
          break;
        }
        case "SELL": {
          const price = CENTS(closeOn(e.symbol!, tradeDate) * (1 + rng.range(-0.003, 0.003)));
          const fee = e.fee ?? 0;
          cash += e.quantity! * price - fee;
          holdings.set(e.symbol!, (holdings.get(e.symbol!) ?? 0) - e.quantity!);
          add({ type: "SELL", date: tradeDate, symbol: e.symbol!, quantity: String(e.quantity), price: money(price), fee: fee ? money(fee) : null, note: e.note ?? null });
          break;
        }
        case "SPLIT": {
          const held = holdings.get(e.symbol!) ?? 0;
          holdings.set(e.symbol!, held * (e.quantity ?? 2));
          add({ type: "SPLIT", date: e.date, symbol: e.symbol!, splitNumerator: e.quantity ?? 2, splitDenominator: 1, note: e.note ?? "Stock split" });
          break;
        }
        case "DIVIDEND": {
          const held = holdings.get(e.symbol!) ?? 0;
          if (held <= 0) break;
          const amount = CENTS(held * e.amount!);
          if (amount < 0.01) break;
          cash += amount;
          const divId = add({ type: "DIVIDEND", date: e.date, symbol: e.symbol!, amount: money(amount), note: `Cash dividend ${e.amount!.toFixed(2)} per share` });
          if (e.drip) {
            const price = closeOn(e.symbol!, e.date);
            const shares = Math.floor((amount / price) * 10000) / 10000;
            if (shares > 0) {
              cash -= shares * price;
              holdings.set(e.symbol!, held + shares);
              add({ type: "BUY", date: e.date, symbol: e.symbol!, quantity: String(shares), price: money(price), linkedTransactionId: divId, note: "Dividend reinvestment" });
            }
          }
          break;
        }
        case "INTEREST": {
          if (cash <= 0) break;
          const amount = CENTS((cash * 0.042) / 4);
          if (amount < 0.01) break;
          cash += amount;
          add({ type: "INTEREST", date: e.date, amount: money(amount), note: "Interest on cash balance" });
          break;
        }
      }
    }
  };

  const monthlyDeposits: Array<{ date: ISODate; type: string; amount: number; note?: string }> = [];
  for (let d = "2023-12-01"; d <= "2025-12-01"; d = addMonths(d, 1)) monthlyDeposits.push({ date: nextTradingDay(d), type: "DEPOSIT", amount: 1000, note: "Monthly contribution" });

  buildPortfolio(
    "pf-core",
    [
      { date: "2023-11-01", type: "DEPOSIT", amount: 50000, note: "Opening deposit" },
      { date: "2023-11-02", type: "BUY", symbol: "HALC", quantity: 60, fee: 4.95 },
      { date: "2023-11-02", type: "BUY", symbol: "NRVA", quantity: 25, fee: 4.95 },
      { date: "2023-11-02", type: "BUY", symbol: "BRKW", quantity: 120 },
      { date: "2023-11-02", type: "BUY", symbol: "BMKT", quantity: 30 },
      { date: "2023-11-15", type: "BUY", symbol: "KSTR", quantity: 20 },
      ...monthlyDeposits,
      { date: "2024-02-05", type: "BUY", symbol: "QNTL", quantity: 100 },
      { date: "2024-03-04", type: "BUY", symbol: "OBSD", quantity: 120 },
      { date: "2024-05-06", type: "BUY", symbol: "PNTH", quantity: 150 },
      { date: "2024-06-03", type: "FEE", amount: 4.95 },
      { date: "2024-08-05", type: "BUY", symbol: "ARDN", quantity: 15 },
      { date: "2024-11-04", type: "BUY", symbol: "SLVN", quantity: 50 },
      { date: "2025-01-21", type: "SELL", symbol: "HALC", quantity: 20, note: "Trimmed after the position exceeded 20% of the portfolio" },
      { date: "2025-03-03", type: "WITHDRAWAL", amount: 5000, note: "Tax payment" },
      { date: "2025-06-02", type: "FEE", amount: 4.95 },
      { date: "2025-06-16", type: "SPLIT", symbol: "KSTR", quantity: 2, note: "2-for-1 stock split" },
      { date: "2025-08-04", type: "SELL", symbol: "PNTH", quantity: 100, note: "Reduced after the thesis review flagged falling revenue" },
      { date: "2025-10-06", type: "BUY", symbol: "TECX", quantity: 30 },
      { date: "2026-02-02", type: "BUY", symbol: "HALC", quantity: 15, note: "Added on weakness" },
    ],
    new Set(["BRKW"]),
  );

  buildPortfolio(
    "pf-income",
    [
      { date: "2024-06-03", type: "DEPOSIT", amount: 25000, note: "Opening deposit" },
      { date: "2024-06-04", type: "BUY", symbol: "BRKW", quantity: 100 },
      { date: "2024-06-04", type: "BUY", symbol: "VLTR", quantity: 80 },
      { date: "2024-06-04", type: "BUY", symbol: "DVGR", quantity: 100 },
      { date: "2024-06-04", type: "BUY", symbol: "MERI", quantity: 120 },
      { date: "2024-06-04", type: "BUY", symbol: "CSTL", quantity: 40 },
      { date: "2025-01-06", type: "DEPOSIT", amount: 5000 },
      { date: "2025-01-07", type: "BUY", symbol: "ARDN", quantity: 10 },
    ],
    new Set(),
  );

  // ------------------------------------------------------------- research
  const watchlists: DemoDataset["watchlists"] = [{ id: "wl-research", name: "Research", createdAt: "2024-01-08T15:00:00.000Z" }];
  const watchlistItems: DemoDataset["watchlistItems"] = [
    { id: "wli-1", watchlistId: "wl-research", symbol: "QNTL", tags: JSON.stringify(["software", "growth", "owned"]), note: "Watching the path to GAAP profitability. SBC still 19% of revenue.", addedAt: "2024-01-08T15:00:00.000Z" },
    { id: "wli-2", watchlistId: "wl-research", symbol: "OBSD", tags: JSON.stringify(["ads", "margin expansion", "owned"]), note: "Operating margin has more than doubled since 2023. Check whether ad load is sustainable.", addedAt: "2024-01-08T15:00:00.000Z" },
    { id: "wli-3", watchlistId: "wl-research", symbol: "SLVN", tags: JSON.stringify(["energy", "variable dividend"]), note: "Payout tracks free cash flow; model at $65 oil.", addedAt: "2024-05-13T15:00:00.000Z" },
    { id: "wli-4", watchlistId: "wl-research", symbol: "NRVA", tags: JSON.stringify(["devices", "recurring revenue"]), note: "Consumables are two thirds of revenue. Fiscal year ends in September.", addedAt: "2024-05-13T15:00:00.000Z" },
    { id: "wli-5", watchlistId: "wl-research", symbol: "TECX", tags: JSON.stringify(["etf"]), note: null, addedAt: "2025-09-15T15:00:00.000Z" },
    { id: "wli-6", watchlistId: "wl-research", symbol: "MERI", tags: JSON.stringify(["bank", "dividend"]), note: "Bank metrics are not comparable to industrials; use net revenue.", addedAt: "2025-09-15T15:00:00.000Z" },
    { id: "wli-7", watchlistId: "wl-research", symbol: "KSTR", tags: JSON.stringify(["defense", "owned"]), note: null, addedAt: "2025-09-15T15:00:00.000Z" },
  ];
  const savedViews: DemoDataset["savedViews"] = [
    {
      id: "view-growth",
      scope: "screener",
      name: "Growth above 15%",
      config: JSON.stringify({ columns: ["price", "changePct", "marketCap", "revenueGrowth", "grossMargin", "operatingMargin", "fcfYield", "pe"], sort: { column: "revenueGrowth", direction: "desc" }, filters: [{ column: "revenueGrowth", operator: "gt", value: 0.15 }] }),
      createdAt: "2025-02-03T15:00:00.000Z",
      updatedAt: "2025-02-03T15:00:00.000Z",
    },
    {
      id: "view-income",
      scope: "screener",
      name: "Cash generators",
      config: JSON.stringify({ columns: ["price", "marketCap", "fcfYield", "operatingMargin", "netDebt", "pe", "nextEarnings"], sort: { column: "fcfYield", direction: "desc" }, filters: [{ column: "fcfYield", operator: "gt", value: 0.04 }] }),
      createdAt: "2025-02-03T15:00:00.000Z",
      updatedAt: "2025-02-03T15:00:00.000Z",
    },
  ];

  const theses: DemoDataset["theses"] = [
    { id: "th-halc", symbol: "HALC", status: "active", createdAt: "2024-01-10T15:00:00.000Z", updatedAt: "2026-03-02T15:00:00.000Z" },
    { id: "th-pnth", symbol: "PNTH", status: "review", createdAt: "2024-05-06T15:00:00.000Z", updatedAt: "2025-08-04T15:00:00.000Z" },
    { id: "th-brkw", symbol: "BRKW", status: "active", createdAt: "2023-11-02T15:00:00.000Z", updatedAt: "2025-04-14T15:00:00.000Z" },
    { id: "th-qntl", symbol: "QNTL", status: "draft", createdAt: "2024-02-05T15:00:00.000Z", updatedAt: "2024-02-05T15:00:00.000Z" },
  ];
  const thesisRevisions: DemoDataset["thesisRevisions"] = [
    {
      id: "thr-halc-1",
      thesisId: "th-halc",
      createdAt: "2024-01-10T15:00:00.000Z",
      summary: "Halcyon can compound revenue above 25% for three more years as inference workloads move to purpose-built accelerators, while gross margin holds above 58%.",
      drivers: "Hyperscaler capex cycle; automotive design wins ramping in 2025; software attach raising mix.",
      risks: "Customer concentration (two customers above 10% of revenue); export restrictions; inventory digestion after a build-out.",
      invalidation: "Two consecutive quarters of revenue growth below 10%, or gross margin below 55%, would mean competition is eroding pricing power.",
      valuationAssumptions: "Base case: 25% growth fading to 12%, 34% operating margin, 9% WACC, 3% terminal growth.",
      reviewDate: "2025-01-31",
      links: JSON.stringify([{ label: "FY2023 10-K (demo)", url: "" }]),
      changeNote: "Initial thesis.",
    },
    {
      id: "thr-halc-2",
      thesisId: "th-halc",
      createdAt: "2025-02-14T15:00:00.000Z",
      summary: "Growth is decelerating as expected but margins are expanding faster than modelled. Thesis intact; position trimmed on concentration grounds, not on fundamentals.",
      drivers: "Operating margin above 30%; automotive now 9% of revenue.",
      risks: "Customer concentration unchanged; valuation now assumes margins stay above 32%.",
      invalidation: "Revenue growth below 10% for two quarters, or operating margin below 25%.",
      valuationAssumptions: "Base case updated: 20% growth fading to 12%, 34% operating margin, 9% WACC, 3% terminal growth.",
      reviewDate: "2026-01-31",
      links: JSON.stringify([{ label: "FY2024 10-K (demo)", url: "" }]),
      changeNote: "Annual review after fiscal 2024 results. Lowered growth path, raised margin assumption.",
    },
    {
      id: "thr-halc-3",
      thesisId: "th-halc",
      createdAt: "2026-03-02T15:00:00.000Z",
      summary: "Added to the position after a 15% drawdown. The investment case now rests more on margin durability than on growth.",
      drivers: "Networking silicon share gains; buybacks offset dilution.",
      risks: "If hyperscaler capex plateaus in 2027 the growth premium disappears quickly.",
      invalidation: "Revenue growth below 10% for two quarters, or operating margin below 25%, or diluted shares rising more than 2% in a year.",
      valuationAssumptions: "18% growth fading to 10%, 34% operating margin, 9% WACC, 3% terminal growth.",
      reviewDate: "2027-01-31",
      links: JSON.stringify([{ label: "FY2025 10-K (demo)", url: "" }]),
      changeNote: "Added shares; tightened the dilution rule.",
    },
    {
      id: "thr-pnth-1",
      thesisId: "th-pnth",
      createdAt: "2024-05-06T15:00:00.000Z",
      summary: "Pinnoth is a turnaround: store closures and an e-commerce relaunch should restore flat revenue and 8% operating margins by fiscal 2026.",
      drivers: "Closure of 120 under-performing stores; private-label mix; lower freight costs.",
      risks: "Continued traffic declines; debt refinancing at higher rates in 2026.",
      invalidation: "Revenue declining year over year for two quarters after the closures are complete would mean the core business is shrinking, not just the footprint.",
      valuationAssumptions: "Flat revenue, 8% operating margin, 11% WACC, 1% terminal growth.",
      reviewDate: "2025-07-31",
      links: JSON.stringify([]),
      changeNote: "Initial thesis.",
    },
    {
      id: "thr-pnth-2",
      thesisId: "th-pnth",
      createdAt: "2025-08-04T15:00:00.000Z",
      summary: "Revenue keeps falling even in stores that stayed open. The turnaround thesis is weakening; halved the position and set a hard review rule.",
      drivers: "Only the private-label margin driver is working.",
      risks: "Debt refinancing in 2026 now looks expensive; operating margin near 3%.",
      invalidation: "Any further year-over-year revenue decline, or operating margin below 3%, means the thesis has failed.",
      valuationAssumptions: "Revenue -3% a year, 4% operating margin, 12% WACC, 0% terminal growth.",
      reviewDate: "2026-09-30",
      links: JSON.stringify([]),
      changeNote: "Sold 100 shares; status moved to review.",
    },
    {
      id: "thr-brkw-1",
      thesisId: "th-brkw",
      createdAt: "2023-11-02T15:00:00.000Z",
      summary: "Brookwater is a low-growth cash compounder: 16% operating margins, a 3.5% dividend yield and buybacks of about 1% a year, bought at 15x earnings.",
      drivers: "Pricing power in snacks; cost programme; steady buybacks.",
      risks: "Private-label share gains; leverage above 3x EBITDA if margins slip.",
      invalidation: "Total debt above $13 billion or operating margin below 14% would mean the dividend is being funded by borrowing.",
      valuationAssumptions: "2% growth, 16% operating margin, 7.5% WACC, 2% terminal growth.",
      reviewDate: "2025-04-30",
      links: JSON.stringify([]),
      changeNote: "Initial thesis.",
    },
    {
      id: "thr-brkw-2",
      thesisId: "th-brkw",
      createdAt: "2025-04-14T15:00:00.000Z",
      summary: "Still on track. Margins slipped half a point; debt is drifting up but remains below the review threshold.",
      drivers: "Pricing has slowed; mix is doing the work.",
      risks: "Leverage creeping up as debt funds buybacks.",
      invalidation: "Total debt above $13 billion or operating margin below 14%.",
      valuationAssumptions: "2% growth, 15.5% operating margin, 7.5% WACC, 2% terminal growth.",
      reviewDate: "2026-11-30",
      links: JSON.stringify([]),
      changeNote: "Annual review. No change to rules.",
    },
    {
      id: "thr-qntl-1",
      thesisId: "th-qntl",
      createdAt: "2024-02-05T15:00:00.000Z",
      summary: "Draft: Quantell's platform is becoming the system of record for industrial maintenance. The question is whether free cash flow can exceed stock-based compensation.",
      drivers: "Net revenue retention above 120%; gross margin expansion.",
      risks: "Dilution from SBC; competition from incumbents' bundles.",
      invalidation: "Free cash flow margin below 5% on a trailing basis once growth slows under 25%.",
      valuationAssumptions: "Not yet modelled.",
      reviewDate: null,
      links: JSON.stringify([]),
      changeNote: "Draft.",
    },
  ];
  const thesisRules: DemoDataset["thesisRules"] = [
    { id: "rule-halc-1", thesisId: "th-halc", metric: "revenueGrowth", operator: "lt", threshold: 0.1, periodType: "quarter", enabled: true, createdAt: "2024-01-10T15:00:00.000Z" },
    { id: "rule-halc-2", thesisId: "th-halc", metric: "operatingMargin", operator: "lt", threshold: 0.25, periodType: "quarter", enabled: true, createdAt: "2025-02-14T15:00:00.000Z" },
    { id: "rule-halc-3", thesisId: "th-halc", metric: "sharesDilutedGrowth", operator: "gt", threshold: 0.02, periodType: "annual", enabled: true, createdAt: "2026-03-02T15:00:00.000Z" },
    { id: "rule-pnth-1", thesisId: "th-pnth", metric: "revenueGrowth", operator: "lt", threshold: 0, periodType: "quarter", enabled: true, createdAt: "2025-08-04T15:00:00.000Z" },
    { id: "rule-pnth-2", thesisId: "th-pnth", metric: "operatingMargin", operator: "lt", threshold: 0.03, periodType: "quarter", enabled: true, createdAt: "2025-08-04T15:00:00.000Z" },
    { id: "rule-brkw-1", thesisId: "th-brkw", metric: "totalDebt", operator: "gt", threshold: 13e9, periodType: "quarter", enabled: true, createdAt: "2023-11-02T15:00:00.000Z" },
    { id: "rule-brkw-2", thesisId: "th-brkw", metric: "operatingMargin", operator: "lt", threshold: 0.14, periodType: "annual", enabled: true, createdAt: "2023-11-02T15:00:00.000Z" },
    { id: "rule-qntl-1", thesisId: "th-qntl", metric: "fcfMargin", operator: "lt", threshold: 0.05, periodType: "ttm", enabled: true, createdAt: "2024-02-05T15:00:00.000Z" },
  ];

  const dcfScenarios: DemoDataset["dcfScenarios"] = [
    {
      id: "dcf-halc-base",
      symbol: "HALC",
      name: "Base case (March 2026 review)",
      kind: "base",
      inputs: JSON.stringify({ revenueGrowth: [0.18, 0.16, 0.14, 0.12, 0.1], operatingMargin: 0.34, taxRate: 0.15, daPctRevenue: 0.05, capexPctRevenue: 0.11, nwcPctRevenueChange: 0.12, wacc: 0.09, terminalGrowth: 0.03, otherAdjustments: 0, midYearConvention: false }),
      createdAt: "2026-03-02T15:00:00.000Z",
      updatedAt: "2026-03-02T15:00:00.000Z",
    },
    {
      id: "dcf-brkw-base",
      symbol: "BRKW",
      name: "Steady state",
      kind: "base",
      inputs: JSON.stringify({ revenueGrowth: [0.02, 0.02, 0.02, 0.02, 0.02], operatingMargin: 0.155, taxRate: 0.22, daPctRevenue: 0.035, capexPctRevenue: 0.04, nwcPctRevenueChange: 0.05, wacc: 0.075, terminalGrowth: 0.02, otherAdjustments: 0, midYearConvention: false }),
      createdAt: "2025-04-14T15:00:00.000Z",
      updatedAt: "2025-04-14T15:00:00.000Z",
    },
  ];

  const notes: DemoDataset["notes"] = [
    { id: "note-1", entityType: "company", entityId: "HALC", body: "Management guided to 'mid-teens' growth for 2027 on the Q2 call. Compare with the base-case path.", createdAt: "2026-08-03T15:00:00.000Z", updatedAt: "2026-08-03T15:00:00.000Z" },
    { id: "note-2", entityType: "portfolio", entityId: "pf-core", body: "Benchmark is the broad-market ETF on a total-return basis (distributions reinvested).", createdAt: "2024-01-08T15:00:00.000Z", updatedAt: "2024-01-08T15:00:00.000Z" },
  ];

  return {
    asOf,
    generatedAt: retrievedAt,
    securities,
    prices,
    quotes,
    facts,
    filings,
    earnings,
    etfHoldings,
    portfolios,
    transactions,
    watchlists,
    watchlistItems,
    savedViews,
    theses,
    thesisRevisions,
    thesisRules,
    dcfScenarios,
    notes,
  };
}

export function demoWindowDays(): number {
  return daysBetween(DEMO_PRICE_START, DEMO_AS_OF);
}
