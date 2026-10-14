# Calculation methodology

Every number Ledger shows comes from the calculation engine in `src/calc`, a pure TypeScript module whose only dependency is `decimal.js`. This document states the conventions it implements. The same conventions appear in the interface next to each figure (the "i" button opens the definition, period, units, source and limitations).

## 1. Ledger and holdings

The transaction ledger is the source of truth. Holdings, cash and lots are derived by replaying transactions in order of date, then sequence number, then id.

| Type | Effect |
|---|---|
| `DEPOSIT` / `WITHDRAWAL` | External cash in / out. The only transactions treated as external flows. |
| `BUY` | Cash decreases by `quantity x price + fee`. A new lot is opened with that total cost (buy-side fees are capitalised). |
| `SELL` | Cash increases by `quantity x price - fee`. Lots are consumed first in, first out. Realized P/L = proceeds net of fees - cost of the lots consumed. A sell larger than the shares held is rejected and reported; short positions are not supported. |
| `DIVIDEND` | Cash increases; recorded as income against the symbol. |
| `INTEREST` | Cash increases; recorded as interest income. |
| `FEE` | Cash decreases; standalone account fee. |
| `SPLIT` | Every open lot's quantity is multiplied by `numerator / denominator`; lot cost is unchanged, so cost basis is preserved exactly. Fractional shares are allowed; cash in lieu is not modelled. |

Dividend reinvestment is a `DIVIDEND` plus a `BUY` linked to it. Income is counted once (the dividend) and the reinvestment is an ordinary purchase, never an external contribution.

Money and share quantities are stored and computed as exact decimals (34 significant digits, round half even). They are converted to floating point only for charts.

Cost basis method: **FIFO**. Realized figures are accounting estimates for research. They are not tax-lot reporting: wash sales, specific-lot elections and jurisdiction rules are not modelled.

Missing prices are never treated as zero. A held position without a price is listed with its cost basis and excluded from totals and weights, and the interface says so.

## 2. Valuation

- Position market value = quantity x last close on or before the valuation date (raw closes, not dividend-adjusted).
- Portfolio value = cash + sum of priced position market values.
- Unrealized P/L = market value - remaining FIFO cost basis.
- Total gain = unrealized + realized + dividends + interest - standalone fees. When every position is priced this equals ending value - net external contributions.
- Weights are shares of total value including cash.

The daily valuation series uses the union of trading days on which any held security or the benchmark has a price. Transactions dated on a non-trading day are applied on the next trading day.

## 3. Returns

### Time-weighted return (TWR)

External flows are treated as arriving at the start of the day they are recorded:

```
r_t = V_t / (V_{t-1} + F_t) - 1
```

where `V` is total portfolio value and `F_t` is net external flow (deposits - withdrawals) on day `t`. Daily returns are linked geometrically into a growth-of-100 index. Days with a non-positive opening base are treated as flat and counted; the count is shown. Returns are annualised only when the span is at least 365 days.

The sub-period return between two dates is the ratio of the growth index on those dates (each snapped to the last series date on or before it).

### Money-weighted return (MWR)

The annualised internal rate of return (XIRR, ACT/365) of the dated external flows plus the terminal value, from the investor's perspective: deposits negative, withdrawals and ending value positive. For a window that starts after inception, the opening value is treated as an initial investment.

The solver scans a coarse grid from -99.99% to +10,000% for sign changes, refines each bracket by bisection and polishes with guarded Newton steps. It reports:

- `ok` with the rate when exactly one root exists;
- `not_unique` with every root found when the flows admit more than one internal rate of return;
- `no_solution` when the net present value never crosses zero in range;
- `insufficient_data` when there are fewer than two flows, flows of only one sign, or no time span.

For windows shorter than a year the interface shows the un-annualised equivalent `(1 + rate)^years - 1` and keeps the annualised rate in the explanation, because annualising a few weeks is misleading.

### Investment gain

`investment gain = ending value - beginning value - net external contributions` over the window. Deposits are never gains. Since-inception windows begin from zero and count the first deposit as a contribution.

### Attribution

Per position over a window `(from, to]`:

```
P/L = MV(to) - MV(from) - net invested + dividends
```

where net invested = cost of buys (fees included) - proceeds of sells (net of fees) inside the window. This reconciles to the portfolio's investment gain together with interest and standalone fees. It is a dollar contribution, not a statement about why the price moved.

### Benchmark comparison

Benchmark returns are measured over the same dates as the portfolio (last close on or before the start and end). The interface states whether the series is a **total return** (adjusted closes that reinvest distributions: the demo dataset, or Alpha Vantage premium data) or a **price return** (Massive's split-adjusted bars, or raw closes).

### Drawdown

Drawdown is computed on the TWR growth index, not on raw portfolio value, so deposits cannot mask losses. Maximum drawdown is the deepest decline from a running peak; the peak, trough and first recovery date are reported.

## 4. Fundamentals

Input: XBRL facts in the shape of SEC `companyfacts` (concept, unit, value, start, end, fiscal year, fiscal period, form, filed date, accession number). The demo generator produces facts in the same shape, including the quirks below.

1. **Concept fallbacks.** Each metric has an ordered list of concepts (for example `Revenues`, then `RevenueFromContractWithCustomerExcludingAssessedTax`, then `SalesRevenueNet`). For every period the highest-priority concept with a fact wins. The availability date is the earliest filing under any candidate concept, so taxonomy renames do not hide history.
2. **Duplicates.** The same period is reported in several filings (current plus comparatives). Facts are grouped by concept, start and end; the latest filing provides the displayed value.
3. **Restatements.** When a later filing changes a period's value, the latest value is shown, the first availability date is kept, and the metric is marked restated with both values in its notes.
4. **Period labels.** The fiscal year and quarter of a period come from the earliest filing that reported it, not from later comparatives.
5. **Durations** are classified by length: about 90 days = quarter, about 180 = half, about 270 = nine months, about 365 = year. Anything else is ignored.
6. **Standalone quarters.** Income-statement items are usually reported as three-month facts; cash-flow items in 10-Qs are cumulative year-to-date. A standalone quarter is derived only by differencing two cumulative facts that share the same fiscal-year start (Q2 = six months - Q1, Q3 = nine months - six months, Q4 = fiscal year - nine months). Derived values are marked calculated and carry the derivation text. Earnings per share and share counts are not derived by differencing; the fourth-quarter EPS uses fiscal-year weighted diluted shares as a labelled proxy.
7. **Trailing twelve months** are built only from four consecutive, non-overlapping quarters (each starting within a week of the previous quarter's end). Balance-sheet items use the latest quarter. Trailing EPS is trailing net income divided by the latest diluted share count, with the sum of quarterly EPS shown in the notes when available.
8. **Calculated metrics**: gross profit (when not reported) = revenue - cost of revenue; margins = line / revenue when revenue is positive; free cash flow = operating cash flow - capital expenditure with capex normalised to a positive outflow; EBITDA = operating income + D&A; total debt = sum of reported debt components (lease liabilities excluded); net debt = total debt - cash - short-term investments; growth = change versus the same period a year earlier when the prior value is positive; effective tax rate = tax / pre-tax income when positive.
9. **Look-ahead.** Every value carries the date it first became public (`filedAt`). Rules and alerts quote that date; nothing claims a figure was known before its filing.
10. **Missing values stay missing.** No metric is ever filled with zero.

Sector applicability: banks, insurers and REITs get a profile that lists which metrics and ratios are not comparable (gross margin, EBITDA, free cash flow, enterprise value, P/E for REITs) and notes which sector-specific measures Ledger does not compute (net interest margin, combined ratio, FFO).

## 5. Ratios

- P/E = price / trailing diluted EPS; **not meaningful** when EPS is zero or negative.
- P/S = market capitalisation / trailing revenue.
- Enterprise value = market cap + total debt - cash - short-term investments; unavailable when debt or cash is missing.
- EV/EBITDA; not meaningful when EBITDA is zero or negative.
- Free cash flow yield = trailing FCF / market cap; negative values are shown as negative.
- CAGR is computed only when both endpoints are positive and the span is at least one year.
- Market capitalisation = latest price x most recent reported share count (cover-page count when available).

## 6. Discounted cash flow

Enterprise DCF on unlevered free cash flow:

```
FCFF_t = EBIT_t x (1 - tax) + D&A_t - capex_t - change in net working capital_t
EBIT_t = revenue_t x operating margin_t
D&A_t = revenue_t x D&A%            capex_t = revenue_t x capex%
ΔNWC_t = (revenue_t - revenue_{t-1}) x working-capital intensity
PV(FCFF_t) = FCFF_t / (1 + WACC)^t         (t - 0.5 under the mid-year convention)
Terminal value = FCFF_N x (1 + g) / (WACC - g), discounted from year N
Enterprise value = Σ PV(FCFF_t) + PV(terminal value)
Equity value = EV - debt + cash + other adjustments
Value per share = equity value / diluted shares
```

Operating cash flow minus capex is never used as FCFF. Terminal growth at or above WACC is rejected. Negative equity values, missing inputs and solver failures are reported explicitly. Terminal value as a share of enterprise value is always shown; above 75% a warning appears.

Defaults are seeded from reported fundamentals (revenue, margins, D&A, capex, tax rate, cash, debt, shares) and labelled reported or calculated; growth, WACC, terminal growth and working-capital intensity are labelled assumptions. Missing reported inputs are left empty for the user to supply, never fabricated.

Scenarios: bear and bull shift growth by 4 points, margin by 3 points, WACC by 1 point and terminal growth by 0.5 points from the base case. Sensitivity: value per share over WACC ± 2 points and terminal growth ± 1 point. Reverse DCF: bisection on one chosen input (uniform revenue growth, operating margin, WACC or terminal growth) with the others fixed; the value is monotone in each, so a bracketed root is unique, and an unbracketed search reports failure.

## 7. Risk

- Returns: simple daily returns on adjusted closes (splits and, where the source supports it, dividends). Portfolio-level statistics use the daily returns of the TWR growth index, so deposits do not distort them.
- Volatility: sample standard deviation x sqrt(252).
- Beta: covariance with the benchmark / benchmark variance over the dates both series have prices; R² reported alongside.
- Correlation: Pearson, over the trading days common to all series (inner join, no interpolation).
- Maximum drawdown: deepest peak-to-trough decline in the window.
- Minimum sample: 60 observations; below that the statistic is reported as not available with the reason.
- Concentration: largest weight, top-five weight, Herfindahl index and effective number of positions (1 / HHI), cash excluded from HHI.
- Sector exposure: direct holdings by sector. Funds contribute only when a holdings file exists; otherwise their weight is reported as a separate "look-through unavailable" bucket.
- Stress test: shocks are applied instantly and linearly to current market values; position shocks override sector shocks; cash is unchanged; no correlation effects. It is a hypothetical scenario, labelled as such.

## 8. Earnings dates

- `confirmed`: the company announced the date (demo) or the user confirmed it with a source link.
- `estimated`: from a provider calendar, or from the median gap between prior 8-K Item 2.02 filings (SEC EDGAR). The basis is shown with every date.

## 9. Review rules

A rule is `metric` `below | above` `threshold` on the latest `quarter | fiscal year | trailing twelve months`. It is evaluated only when the metric exists for that period and, for growth metrics, only when a comparable prior period exists. Outcomes are "review needed", "within rule" or "not evaluable", never buy or sell instructions. Every save of a thesis creates a new timestamped revision; nothing is overwritten.

## 10. Known limitations

- Short selling, options, margin interest, multiple currencies and corporate actions other than splits (spin-offs, mergers) are not modelled.
- Cash in lieu of fractional shares is not modelled.
- TWR assumes flows at the start of the day; a different convention changes sub-period returns slightly.
- The DCF is a single-stage explicit forecast with a Gordon-growth terminal value; it does not model changing capital structure or multi-stage fades beyond the growth path you enter.
- Bank, insurer and REIT valuation methods (dividend discount, FFO, excess returns) are not implemented.
