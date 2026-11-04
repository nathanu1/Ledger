# Evidence-based research review

Ledger now checks stored evidence whenever the overview is requested. Findings appear in the existing **Needs review** list and link to the existing company or risk workspace. No new screens, navigation, controls, dependencies, database migrations, credentials or scheduled processes are required.

## What it catches

- **Financial filings since a thesis revision:** for direct stock holdings worth at least 5% of known portfolio value, collect annual/quarterly filings (10-K, 10-Q, 20-F, 40-F and amendments) after the current non-closed thesis revision. One finding per symbol groups accession-deduplicated source evidence. Updating the thesis revision clears evidence older than that revision.
- **Material holdings without current research:** missing theses, closed theses and theses without a revision are coverage gaps. Funds are excluded from stock-thesis checks.
- **Aged research:** a material stock thesis older than 180 calendar days is flagged when no newer financial filing is stored. The finding explicitly says that missing stored filings do not establish that none exist. A new-filings finding supersedes this reminder.
- **Stale valuation inputs:** an open position's actual valuation close older than seven calendar days triggers a data warning, even if its latest quote is newer. Missing prices continue to use the existing missing-price alert. Weekends and short holidays fit inside the seven-day tolerance; this is not an exchange calendar.
- **Clustered earnings exposure:** direct holdings representing at least 25% of known portfolio value reporting between the as-of date and seven days later, inclusive. Each holding counts once, using its earliest event in the window (confirmed preferred on the same day). Estimates, event dates, source links and calendar basis are retained. Watchlist-only symbols are excluded. Exposure is not a predicted price move or loss.

The policy lives in `src/calc/review.ts`. Computation is deterministic and read-only. No provider requests occur during review. Findings use stable IDs and high/medium priorities; within the new findings, high-priority evidence comes first, then stable ID order. Existing rule, scheduled-review, concentration, missing-price and ledger alerts remain active.

## Export and operational use

Request `GET /api/export/review?portfolio=<portfolio-id>` from a running Ledger instance. An explicit valid portfolio is required (otherwise HTTP 404). The JSON download includes:

- schema version, portfolio identity and valuation as-of date;
- policy thresholds and coverage, including unpriced symbols and an incomplete-valuation flag;
- new research findings, stable IDs, priorities and dated source evidence;
- all overview alerts, including existing thesis-rule and ledger warnings;
- explicit limitations for downstream review or automation.

Responses are marked `Cache-Control: no-store`. As with the existing transaction export, this is a local single-user endpoint; treat the downloaded report as private portfolio information. It exports review evidence, not a database backup. No external notification is sent.

For local automation, a task scheduler can request this endpoint while Ledger is running and retain dated JSON reports. The endpoint itself does not schedule work, refresh providers, acknowledge alerts or modify a thesis. Refresh data through existing company/Settings controls before a review when current connected-mode evidence is needed. Inspect `asOf` and `coverage` before acting on a report; demo mode intentionally uses its fixed dataset date.

## Interpretation and limits

Research checks intentionally focus on material direct stock positions; earnings and price checks cover direct holdings. There is no ETF look-through, real-time monitoring, trading recommendation or automatic thesis status change. Weights exclude unpriced positions and can therefore overstate known exposure. Filing dates have day precision, so same-day filings are not classified as newer than a revision. A revision records a user's updated research; it is not proof the user read every filing. Reports summarize stored evidence, not all evidence available in the market.

## Validation

`npm test` includes pure monitoring tests for boundaries, date ordering, duplicate events, amendments, research coverage and priority, plus isolated in-memory SQLite integration tests for overview findings and the actual export route. Existing Playwright flows exercise the unchanged interface. Run `npm run build` before `npm run typecheck` when Next's generated route types are absent.
