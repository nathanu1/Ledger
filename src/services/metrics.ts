/**
 * Company metrics shared by the watchlist, screener, compare view and company
 * overview. Every figure carries the period and data dates it came from.
 */
import type { MetricValue, NormalizedFinancials, StatementPeriod } from "@/calc/fundamentals";
import { enterpriseValue, evToEbitda, fcfYield, marketCap, priceToEarnings, priceToSales, sectorProfile, type EnterpriseValue, type RatioValue, type SectorProfile } from "@/calc/ratios";
import type { ISODate } from "@/calc/types";
import type { Security } from "@/db/schema";
import { getFinancials, getNextEarnings } from "./fundamentals";
import { getLatestPrices, type LatestPrice } from "./market-data";
import { getSecurities } from "./securities";
import { getAsOfDate } from "./settings";
import { getThesisStatuses } from "./thesis";

export interface CompanyMetrics {
  symbol: string;
  name: string;
  securityType: "stock" | "etf";
  sector: string | null;
  industry: string | null;
  price: LatestPrice | null;
  marketCap: number | null;
  sharesOutstanding: MetricValue | null;
  /** Trailing twelve months when available, otherwise the latest annual period. */
  basis: StatementPeriod | null;
  basisLabel: string | null;
  values: {
    revenue: MetricValue | null;
    revenueGrowth: MetricValue | null;
    grossMargin: MetricValue | null;
    operatingMargin: MetricValue | null;
    netMargin: MetricValue | null;
    freeCashFlow: MetricValue | null;
    fcfMargin: MetricValue | null;
    ebitda: MetricValue | null;
    netDebt: MetricValue | null;
    totalDebt: MetricValue | null;
    cash: MetricValue | null;
    epsDiluted: MetricValue | null;
    sharesDilutedGrowth: MetricValue | null;
    stockBasedCompensation: MetricValue | null;
  };
  ratios: { pe: RatioValue; ps: RatioValue; evEbitda: RatioValue; fcfYield: RatioValue };
  enterpriseValue: EnterpriseValue | null;
  nextEarnings: { date: ISODate; status: string; basis: string } | null;
  thesisStatus: string | null;
  sectorProfile: SectorProfile;
  dataDates: { price: ISODate | null; fundamentalsPeriodEnd: ISODate | null; fundamentalsFiledAt: ISODate | null; fundamentalsSource: string | null };
}

export function basisPeriod(fin: NormalizedFinancials | null): StatementPeriod | null {
  if (!fin) return null;
  return fin.ttm ?? fin.annual[fin.annual.length - 1] ?? fin.quarterly[fin.quarterly.length - 1] ?? null;
}

export function buildCompanyMetrics(symbol: string, preloaded?: { security?: Security | null; price?: LatestPrice | null; thesisStatus?: string | null }): CompanyMetrics {
  const sec = preloaded?.security ?? getSecurities([symbol]).get(symbol) ?? null;
  const price = preloaded?.price !== undefined ? preloaded.price : getLatestPrices([symbol]).get(symbol) ?? null;
  const fin = sec?.securityType === "etf" ? null : getFinancials(symbol);
  const basis = basisPeriod(fin);
  const m = basis?.metrics ?? {};
  const shares = m.sharesOutstanding ?? m.sharesDiluted ?? null;
  const cap = marketCap(price?.price ?? null, shares?.value ?? null);
  const ev = fin ? enterpriseValue({ marketCap: cap, totalDebt: m.totalDebt?.value ?? null, cash: m.cash?.value ?? null, shortTermInvestments: m.shortTermInvestments?.value ?? null }) : null;
  const profile = sectorProfile(sec?.sector, sec?.industry);
  const limited = (ratio: "pe" | "ps" | "evEbitda" | "fcfYield", value: RatioValue): RatioValue =>
    profile.limitedRatios.includes(ratio) && value.kind === "value" ? { kind: "not_meaningful", reason: `Not comparable for ${profile.label.toLowerCase()}s.` } : value;
  const next = getNextEarnings(symbol, getAsOfDate());
  const thesisStatus = preloaded?.thesisStatus !== undefined ? preloaded.thesisStatus : getThesisStatuses([symbol]).get(symbol) ?? null;
  return {
    symbol,
    name: sec?.name ?? symbol,
    securityType: (sec?.securityType as "stock" | "etf") ?? "stock",
    sector: sec?.sector ?? null,
    industry: sec?.industry ?? null,
    price,
    marketCap: cap,
    sharesOutstanding: shares,
    basis,
    basisLabel: basis?.label ?? null,
    values: {
      revenue: m.revenue ?? null,
      revenueGrowth: m.revenueGrowth ?? null,
      grossMargin: m.grossMargin ?? null,
      operatingMargin: m.operatingMargin ?? null,
      netMargin: m.netMargin ?? null,
      freeCashFlow: m.freeCashFlow ?? null,
      fcfMargin: m.fcfMargin ?? null,
      ebitda: m.ebitda ?? null,
      netDebt: m.netDebt ?? null,
      totalDebt: m.totalDebt ?? null,
      cash: m.cash ?? null,
      epsDiluted: m.epsDiluted ?? null,
      sharesDilutedGrowth: m.sharesDilutedGrowth ?? null,
      stockBasedCompensation: m.stockBasedCompensation ?? null,
    },
    ratios: {
      pe: limited("pe", priceToEarnings(price?.price ?? null, m.epsDiluted?.value ?? null)),
      ps: limited("ps", priceToSales(cap, m.revenue?.value ?? null)),
      evEbitda: limited("evEbitda", evToEbitda(ev?.value ?? null, m.ebitda?.value ?? null)),
      fcfYield: limited("fcfYield", fcfYield(m.freeCashFlow?.value ?? null, cap)),
    },
    enterpriseValue: ev,
    nextEarnings: next ? { date: next.date, status: next.status, basis: next.basis } : null,
    thesisStatus,
    sectorProfile: profile,
    dataDates: {
      price: price?.date ?? null,
      fundamentalsPeriodEnd: basis?.periodEnd ?? null,
      fundamentalsFiledAt: basis?.filedAt ?? null,
      fundamentalsSource: fin?.provider ?? null,
    },
  };
}

export function buildMetricsForSymbols(symbols: string[]): CompanyMetrics[] {
  const securities = getSecurities(symbols);
  const prices = getLatestPrices(symbols);
  const statuses = getThesisStatuses(symbols);
  return symbols.map((s) => buildCompanyMetrics(s, { security: securities.get(s) ?? null, price: prices.get(s) ?? null, thesisStatus: statuses.get(s) ?? null }));
}
