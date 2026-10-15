# Ledger

Fun build I made with Claude, 

Stock research and portfolio intelligence for an individual investor. Local-first, single user, US-listed stocks, ETFs and cash in USD portfolios.

Ledger answers six questions: what do I own and what drove my returns, how concentrated am I, are the companies I follow improving, what assumptions are embedded in a valuation, what changed since I last looked, and does new evidence support or weaken my thesis. Every figure explains its own calculation and links to the position, filing or assumption behind it.
<table>
  <tr>
    <td width="50%">
      <img src="https://github.com/user-attachments/assets/1ec6be90-bdd0-403b-a16d-540d7ec7b102" alt="Feature 1 Desktop view" width="100%">
    </td>
    <td width="50%">
      <img src="https://github.com/user-attachments/assets/f5581209-6419-4802-89ac-b1c4d9291c7b" alt="Feature 2 Mobile view" width="100%">
    </td>
  </tr>
  <tr>
    <td width="50%">
      <img src="https://github.com/user-attachments/assets/68db9f06-ebaa-4dd1-b37e-5719fab9595a" alt="Feature 3 Analytics dashboard" width="100%">
    </td>
    <td width="50%">
      <img src="https://github.com/user-attachments/assets/9cfcbb66-a4a5-414e-a096-6937a472811c" alt="Feature 4 Settings panel" width="100%">
    </td>
  </tr>
  <tr>
    <td colspan="2">
      <img src="https://github.com/user-attachments/assets/077623c0-7aad-4ebc-8b31-f527394437cf" alt="Feature 5" width="100%">
    </td>
  </tr>
</table>

## Quick start

Requirements: Node.js 22 or newer (the SQLite driver ships prebuilt binaries for Node 22+).

```bash
npm install
npm run dev
```

Open http://localhost:3000. The first start creates `data/ledger.db`, runs the migrations and loads the demo dataset, so the application is fully usable with no keys and no network: a fictional universe of 12 operating companies and 3 funds with three years of prices, filings, financial statements, two portfolios, a watchlist and theses. A persistent "Demo data" badge marks this mode.

Production build:

```bash
npm run build
npm start
```

## Connected mode

Copy the environment template and fill in what you have:

```bash
cp .env.example .env.local
```

| Variable | Needed for | Cost |
|---|---|---|
| `SEC_USER_AGENT` | SEC EDGAR: company facts (XBRL fundamentals), filings, earnings-date estimates. Any value with an app name and contact email, as the SEC fair-access policy requires. | Free, no key |
| `MASSIVE_API_KEY` | Massive (formerly Polygon.io): 2 years of daily split-adjusted bars, previous close, ticker profiles, search. | Free Basic plan (5 requests/minute, end of day) |
| `ALPHAVANTAGE_API_KEY` | Alpha Vantage: end-of-day quotes, company overview, earnings calendar, symbol search, 100 sessions of unadjusted history. | Free tier (25 requests/day) |

Restart the server after editing the file, then switch to connected mode in **Settings**. Keys never leave the server. In connected mode:

- Opening a company page resolves it through SEC EDGAR (and the market-data provider when configured) and stores filings, facts and prices locally. Use **Refresh data** on a company page or **Refresh held and watched symbols** in Settings to fetch again; rate limits are respected with backoff, requests are de-duplicated and cached, and every call is logged on the Settings page.
- A failed or rate-limited request leaves the previously stored data in place and reports the failure. Synthetic values are never substituted.
- Switch back to demo mode at any time; **Reset to demo dataset** replaces all data with the fictional set.

Provider documentation was verified in October 2026 (endpoints, field names and free-tier limits are recorded at the top of each adapter in `src/providers`). The SEC adapter was exercised live against real filings; the Massive and Alpha Vantage adapters follow their documented response formats but were not run with a paid or personal key during development.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Development server with Turbopack |
| `npm run build` / `npm start` | Production build and server |
| `npm test` | Unit tests for the calculation engine and import validation (Vitest) |
| `npm run test:e2e` | Playwright flows against a running or auto-started dev server |
| `npm run typecheck` / `npm run lint` | TypeScript and ESLint |
| `npm run db:seed` | Reload the demo dataset (replaces all data) |
| `npm run db:reset` | Delete the database file |
| `npm run db:generate` | Generate a migration after changing `src/db/schema.ts` |
| `SEC_USER_AGENT="App you@example.com" npx tsx scripts/check-sec.ts AAPL` | Fetch a real company from SEC EDGAR and print the normalised statements |
| `node scripts/screenshot.mjs http://localhost:3000/ out.png 1440 900 dark` | Screenshot a page |

## Architecture

```
src/calc        Pure financial engine (decimal.js only): ledger replay, valuation, returns,
                drawdown, attribution, fundamentals normalisation, ratios, DCF, risk, CSV import
src/providers   Provider interfaces, rate-limited HTTP client, cache, SEC EDGAR, Massive,
                Alpha Vantage adapters, SIC sector mapping
src/db          Drizzle schema (SQLite via better-sqlite3), client, migrations in /drizzle
src/demo        Deterministic demo universe, generator and seeder
src/services    Application services joining the database, providers and engine
src/app         Next.js App Router pages, server actions and route handlers
src/components  Interface: shell, primitives, charts, metric explanations, feature components
docs            METHODOLOGY.md (calculation conventions), FEATURES.md (scope and limitations)
```

Pages render on the server from SQLite; interactive pieces (charts, tables, the DCF lab, forms) are client components that call server actions. Money and share quantities are stored and computed as exact decimal strings; ratios and returns are numbers. Every externally sourced value keeps its provider, reference, reporting period or market timestamp, units and retrieval time, and is marked reported or calculated.

Design: a dark research-terminal theme by default (ink navy, warm off-white text, restrained cyan accent, muted emerald and coral for gains and losses) with an equally supported light theme; IBM Plex Sans for the interface and IBM Plex Mono with tabular figures for numbers. Charts follow a validated colour system (categorical slots checked for colour-vision separation), every chart has a table twin and a text summary, and colour never carries meaning alone (signs, icons and labels accompany it).

## Methodology

See [docs/METHODOLOGY.md](docs/METHODOLOGY.md) for the conventions: FIFO lots, start-of-day flow treatment in the time-weighted return, the XIRR solver and its non-unique-solution handling, investment gain versus contributions, exact per-position attribution, XBRL normalisation (concept fallbacks, duplicates, restatements, standalone quarters from cumulative cash-flow facts, trailing twelve months from consecutive quarters, filing-date availability), ratio applicability, the FCFF discounted cash flow, and the risk conventions.

## Test results

Recorded on the final build in this repository (October 2026):

- `npm test`: 6 files, 68 tests passed. Coverage includes cost basis after partial sales across lots, forward and reverse splits with fractional shares, dividend reinvestment counted once, deposits and withdrawals in time-weighted and money-weighted returns (including non-unique and no-solution cases), DCF discounting and the enterprise-to-equity bridge, invalid valuation inputs, drawdown and correlation, missing prices and mismatched date ranges, standalone-quarter derivation, restatements, TTM construction, and CSV import validation with duplicate detection.
- `npm run test:e2e` (demo mode, desktop 1440×900 and Pixel 7 projects, run serially against the shared SQLite ledger): 22 of 22 flows passed, 11 per viewport: overview period switching and the explanation drawer, holdings sorting, transaction add/edit/delete, rejected oversell, CSV import with duplicate and error rows, company tabs including a rejected DCF input, bank-specific labelling, watchlist toggle and screener filters, settings and the command palette.
- `npm run typecheck` and `npm run lint`: clean (0 errors, 0 warnings).
- `npm run build`: production build compiles; every page is server-rendered on demand.
- Interface inspected from screenshots at 1440 px and 390 px in both themes.

See [docs/FEATURES.md](docs/FEATURES.md) for the list of implemented features, provider-dependent features and remaining limitations.

## Disclaimer

Ledger produces research estimates from your own ledger and public filings. Realized gains are accounting estimates, not tax reporting; valuation outputs are assumption-dependent, not price targets; nothing here is investment advice.
