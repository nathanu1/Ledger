/**
 * Provider registry: resolves configured providers from environment variables.
 * Keys never leave the server; the settings page only learns whether a key is present.
 */
import { AlphaVantageProvider } from "./alphavantage";
import { MassiveProvider } from "./massive";
import { SecEdgarProvider } from "./sec-edgar";
import type { EarningsProvider, FundamentalsProvider, MarketDataProvider, ProviderId } from "./types";

export interface ProviderStatus {
  id: ProviderId;
  name: string;
  role: string;
  configured: boolean;
  requirement: string;
  docsUrl: string;
  notes: string[];
}

function env(name: string): string | null {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : null;
}

export function secUserAgent(): string | null {
  return env("SEC_USER_AGENT");
}

let secInstance: SecEdgarProvider | null = null;
export function getFundamentalsProvider(): FundamentalsProvider | null {
  const ua = secUserAgent();
  if (!ua || !/@/.test(ua)) return null;
  if (!secInstance) secInstance = new SecEdgarProvider({ userAgent: ua });
  return secInstance;
}

let marketInstance: MarketDataProvider | null | undefined;
export function getMarketDataProvider(): MarketDataProvider | null {
  if (marketInstance !== undefined) return marketInstance;
  const massiveKey = env("MASSIVE_API_KEY") ?? env("POLYGON_API_KEY");
  const avKey = env("ALPHAVANTAGE_API_KEY");
  const preferred = env("MARKET_DATA_PROVIDER");
  if ((preferred === "alphavantage" || !massiveKey) && avKey) {
    marketInstance = new AlphaVantageProvider(avKey, env("ALPHAVANTAGE_PREMIUM") === "true");
  } else if (massiveKey) {
    marketInstance = new MassiveProvider(massiveKey, env("MASSIVE_BASE_URL") ?? "https://api.massive.com");
  } else {
    marketInstance = null;
  }
  return marketInstance;
}

export function getEarningsProvider(): EarningsProvider | null {
  const avKey = env("ALPHAVANTAGE_API_KEY");
  if (!avKey) return null;
  const market = getMarketDataProvider();
  if (market instanceof AlphaVantageProvider) return market;
  return new AlphaVantageProvider(avKey, env("ALPHAVANTAGE_PREMIUM") === "true");
}

/** Which providers are configured. Values of keys are never exposed. */
export function providerStatuses(): ProviderStatus[] {
  const ua = secUserAgent();
  const massiveKey = env("MASSIVE_API_KEY") ?? env("POLYGON_API_KEY");
  const avKey = env("ALPHAVANTAGE_API_KEY");
  const market = getMarketDataProvider();
  return [
    {
      id: "sec-edgar",
      name: "SEC EDGAR",
      role: "Filings and XBRL fundamentals",
      configured: !!ua && /@/.test(ua),
      requirement: "SEC_USER_AGENT with an app name and contact email (no key needed).",
      docsUrl: "https://www.sec.gov/search-filings/edgar-application-programming-interfaces",
      notes: ["Free. Fair-access policy: identify yourself and stay under 10 requests per second."],
    },
    {
      id: "massive",
      name: "Massive (formerly Polygon.io)",
      role: "Daily price history and previous close",
      configured: !!massiveKey,
      requirement: "MASSIVE_API_KEY (free Basic plan).",
      docsUrl: "https://massive.com/docs/rest/quickstart",
      notes: ["Basic plan: 5 requests per minute, 2 years of end-of-day history, split-adjusted only.", market?.id === "massive" ? "Active market-data provider." : ""].filter(Boolean),
    },
    {
      id: "alphavantage",
      name: "Alpha Vantage",
      role: "Quotes, company overview, earnings calendar, symbol search",
      configured: !!avKey,
      requirement: "ALPHAVANTAGE_API_KEY (free tier).",
      docsUrl: "https://www.alphavantage.co/documentation/",
      notes: ["Free tier: 25 requests per day; daily history limited to 100 unadjusted sessions.", market?.id === "alphavantage" ? "Active market-data provider." : ""].filter(Boolean),
    },
  ];
}

/** True when enough providers exist to run connected mode usefully. */
export function connectedModeAvailable(): boolean {
  return getFundamentalsProvider() !== null || getMarketDataProvider() !== null;
}
