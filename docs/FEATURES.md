# Features, provider dependencies and limitations

## Implemented and working in demo mode (no network, no keys)

**Overview ("What changed?")**
- Portfolio value and cash, daily move net of flows, selected-period time-weighted return with benchmark comparison, contributions and withdrawals shown separately from investment gain, money-weighted return (annualised or over the window with explicit status when no unique solution exists).
- Largest position weights, biggest positive and negative contributors with an exact per-position P/L derivation.
- Upcoming earnings with confirmed versus estimated status and the basis of every date.
- Watchlist moves and new filings; thesis rule alerts, overdue review dates, concentration and data-coverage alerts.
- Every figure opens an explanation drawer with definition, period, units, source, derivation and limitations.

**Portfolio tracker**
- Multiple portfolios with their own benchmark; active portfolio selectable from the top bar.
- Transaction ledger as the source of truth: buys, sells, deposits, withdrawals, cash dividends, dividend reinvestment (linked dividend + buy), interest, standalone fees, splits. Add, edit and delete with validation; rejected transactions (for example a sell exceeding holdings) are shown, not silently applied. Running cash balance per row.
- CSV import with preview, column mapping suggestions, date-format control, per-row validation, duplicate detection against the ledger and within the file, and CSV export in the same format.
- Holdings table (sortable): shares, average cost, cost basis, price with staleness marker, market value, weight, day change, unrealized and realized P/L, dividends, total gain. Closed positions kept with their realized P/L.
- Performance: time-weighted and money-weighted returns, investment gain, growth-of-100 against the benchmark over matching dates with the return type (total or price) stated, drawdown chart on the time-weighted index, sector and position concentration, exact profit attribution per position. FIFO cost basis stated; realized gains labelled as accounting estimates.

**Company workspace**
- Header with quote, timestamp, session, data source and fundamentals coverage; watch toggle; timestamped notes; refresh (connected mode).
- Price chart (lightweight-charts) with ranges, raw versus adjusted series, benchmark overlay on a percentage scale, hover readout and a table twin.
- Financials: annual and quarterly statements with reported versus calculated marking, filing dates, standalone quarters derived from cumulative cash-flow reporting, trailing twelve months, growth, margins, free cash flow, net debt, dilution; table or chart per metric; sector-specific limitations for banks, insurers and REITs.
- Valuation lab: enterprise DCF on FCFF with editable growth path, margin, tax, D&A, capex, working capital, WACC, terminal growth, cash, debt, other adjustments and diluted shares; projection table, equity bridge, terminal share of EV, bear/base/bull scenarios, WACC x terminal growth sensitivity grid, reverse DCF on one chosen assumption, saved scenarios, provenance badges on every input, explicit handling of invalid inputs and negative equity.
- Risk: annualised volatility, maximum drawdown, beta and R² against the benchmark, daily return distribution, with the window, return type, annualisation convention, missing-data rule and minimum sample stated.
- Thesis: thesis, drivers, risks, invalidation evidence, valuation assumptions, review date, links; timestamped revision history; measurable review rules evaluated on comparable periods with "review needed" phrasing; status workflow.

**Risk workspace**
- Portfolio volatility, drawdown, beta, concentration (largest, top five, effective positions), correlation matrix, sector exposure with explicit "look-through unavailable" bucket for funds without holdings data, per-position statistics, return distribution, and a stress-test tool with position and sector shocks and stated assumptions.

**Watchlist, screener, compare**
- Sortable columns, column picker, filters, saved views, research tags and notes, selection of up to four companies for side-by-side comparison with an indexed price chart.
- The screener states its universe and data dates; it is screening the loaded universe, not the whole market.

**Settings**
- Demo / connected switch, provider configuration status (keys never shown), request log with quota and authentication failures, cache controls, bulk refresh, demo reset, theme.

**Engine and tests**
- Decimal-safe ledger engine, returns, fundamentals normaliser, ratios, DCF, risk and CSV logic in `src/calc` with 68 unit tests (see README for the run).
- Deterministic demo dataset: 12 fictional operating companies across sectors (including a bank, a REIT, a utility and a retailer with a January fiscal year), 3 funds, 3.4 years of daily prices, 13,000+ XBRL-style facts including cumulative cash-flow facts, duplicates across filings and one restatement, filings, earnings dates, two portfolios with 190+ transactions, a watchlist, theses, rules, scenarios and notes.

## Provider-dependent (connected mode)

| Capability | Provider | Notes |
|---|---|---|
| Company identity, SIC-derived sector, filings list, XBRL fundamentals | SEC EDGAR (free, `SEC_USER_AGENT` required) | Verified live in October 2026 against Apple's company facts. US filers only; ETFs and foreign issuers without XBRL are not covered. |
| Earnings-date estimate from 8-K cadence | SEC EDGAR | Labelled "estimated"; the basis shows the median gap and last release. |
| Daily price history (2 years, split-adjusted), previous close, ticker profile, search | Massive (formerly Polygon.io), free Basic plan | 5 requests per minute, end-of-day only. Benchmark comparisons from this source are price returns. |
| End-of-day quote, company overview, earnings calendar (3 months), symbol search, 100 sessions of unadjusted history | Alpha Vantage free tier | 25 requests per day; the app logs and surfaces quota errors instead of guessing. Premium keys unlock adjusted full history (`ALPHAVANTAGE_PREMIUM=true`). |

Every provider response is cached in SQLite, requests are rate-limited per provider with backoff and de-duplicated in flight, and every call is logged for the settings page. A failed request leaves previously stored data in place and reports the failure; synthetic values are never substituted.

## Not implemented or limited

- Connected mode has been exercised live only against SEC EDGAR (no key needed in this environment). The Massive and Alpha Vantage adapters follow the documented response shapes captured in October 2026 but were not run with a real key; field names are documented at the top of each adapter.
- No ETF holdings provider: look-through exposure is available only when a holdings file exists (the demo includes one fund with holdings and one without).
- Earnings dates in connected mode are estimates unless you confirm them manually with a source link; there is no corporate-calendar provider with confirmed dates on a free tier.
- Fundamentals cover the metrics listed in the methodology; segment data, bank-specific measures (net interest margin, CET1), insurer measures (combined ratio) and REIT measures (FFO, NAV) are not computed and are labelled unsupported.
- Single currency (USD), US-listed stocks and ETFs only. No options, short selling, margin, spin-offs or mergers; no cash in lieu for fractional shares.
- FIFO is the only cost-basis method; the realized figures are not tax reporting.
- The optional LLM research assistant is not included; the deterministic engine and the explanation drawer carry the sourcing instead.
- Playwright tests exercise the main workflows in demo mode at desktop (1440 px) and phone (Pixel 7) sizes; visual checks were done at 1440 px and 390 px in both themes.
