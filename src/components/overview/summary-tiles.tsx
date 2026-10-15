import { PERIOD_LABELS } from "@/calc/periods";
import { TWR_CONVENTION } from "@/calc/returns";
import { Delta } from "@/components/metrics/value";
import { StatTile } from "@/components/metrics/stat-tile";
import { formatDate, formatMoney, formatPct } from "@/lib/format";
import type { PortfolioSnapshot } from "@/services/portfolio";

export function SummaryTiles({ snapshot }: { snapshot: PortfolioSnapshot }) {
  const { valuation, dayChange, period, benchmark } = snapshot;
  const periodLabel = PERIOD_LABELS[period.key];
  const unpriced = snapshot.missingPrices.length;
  const benchReturn = period.benchmark?.totalReturn ?? null;
  const twr = period.twr?.totalReturn ?? null;
  const gain = period.gain;
  return (
    <div className="tile-strip grid-cols-2 lg:grid-cols-5">
      <StatTile
        label="Portfolio value"
        value={<span className="num-sans">{formatMoney(valuation.totalValue)}</span>}
        sub={
          <>
            Cash {formatMoney(valuation.cash)}
            {unpriced ? <span className="text-warning"> · {unpriced} unpriced</span> : null}
          </>
        }
        explain={{
          title: "Portfolio value",
          value: formatMoney(valuation.totalValue),
          definition: "Cash plus the market value of every priced position, using the last available close on or before the valuation date. Holdings and cash are derived from the transaction ledger (FIFO lots).",
          period: `Valuation date ${formatDate(valuation.asOf)}`,
          units: "US dollars",
          status: "calculated",
          source: { provider: "Ledger engine: your transactions and stored prices", derivation: `Cash ${formatMoney(valuation.cash)} + market value ${formatMoney(valuation.marketValue)}.` },
          limitations: unpriced ? [`${snapshot.missingPrices.join(", ")} have no price data and are excluded from the total rather than counted as zero.`] : ["Prices may lag the market; see the data freshness indicator."],
          links: [{ label: "Open holdings", href: `/portfolio?portfolio=${snapshot.portfolio.id}` }],
        }}
      />
      <StatTile
        label={dayChange.date ? `Move on ${formatDate(dayChange.date)}` : "Daily move"}
        value={dayChange.value === null ? <span className="text-fg-muted">n/a</span> : <Delta value={dayChange.value} className="text-[22px]" />}
        sub={dayChange.pct === null ? "Needs two valuation days" : <Delta value={dayChange.pct} kind="pct" digits={2} hideIcon />}
        explain={{
          title: "Daily move",
          value: dayChange.value === null ? "n/a" : formatMoney(dayChange.value, { signed: true }),
          definition: "Change in total value since the previous valuation day, net of deposits and withdrawals made that day, so moving money in or out never shows as a gain or loss.",
          period: dayChange.previousDate && dayChange.date ? `${formatDate(dayChange.previousDate)} to ${formatDate(dayChange.date)}` : null,
          units: "US dollars; percentage is the day's time-weighted return",
          status: "calculated",
          source: { provider: "Ledger engine", derivation: "Value(today) - Value(previous day) - net external flow(today)." },
          limitations: ["Uses closing prices only; intraday moves are not shown."],
        }}
      />
      <StatTile
        label={`${periodLabel} return`}
        value={twr === null ? <span className="text-fg-muted">n/a</span> : <Delta value={twr} kind="pct" className="text-[22px]" />}
        sub={
          benchReturn === null ? (
            benchmark.available ? "Benchmark unavailable for this window" : "No benchmark data"
          ) : (
            <>
              {benchmark.symbol} <Delta value={benchReturn} kind="pct" hideIcon /> <span className="text-fg-muted">({benchmark.returnType === "total" ? "total return" : "price return"})</span>
            </>
          )
        }
        explain={{
          title: `${periodLabel} time-weighted return`,
          value: twr === null ? "n/a" : formatPct(twr, { signed: true, digits: 2 }),
          definition: "Time-weighted return links each day's return geometrically, so the timing and size of your deposits and withdrawals do not affect it. It measures how the investments performed, not how much money you made.",
          period: period.twr ? `${formatDate(period.twr.from)} to ${formatDate(period.twr.to)} (${period.twr.days} days)` : null,
          units: "Percentage",
          status: "calculated",
          source: { provider: "Ledger engine", derivation: TWR_CONVENTION },
          notes: [
            benchReturn !== null
              ? `${benchmark.name} (${benchmark.symbol}) returned ${formatPct(benchReturn, { signed: true, digits: 2 })} over the matching dates (${formatDate(period.benchmark!.priceDateFrom)} to ${formatDate(period.benchmark!.priceDateTo)}), measured on ${benchmark.returnType === "total" ? "adjusted closes that reinvest distributions (total return)" : "closes that are not adjusted for dividends (price return)"}.`
              : "Benchmark comparison needs price data for the benchmark over the same dates.",
          ],
          limitations: ["Sub-year returns are not annualised.", snapshot.twr.flaggedDays ? `${snapshot.twr.flaggedDays} day(s) had no positive opening value and were treated as flat.` : ""].filter(Boolean),
          links: [{ label: "Open performance", href: `/portfolio?portfolio=${snapshot.portfolio.id}&period=${period.key}` }],
        }}
      />
      <StatTile
        label={`${periodLabel} contributions`}
        value={gain ? <span className="num-sans">{formatMoney(gain.netContributions, { signed: true })}</span> : <span className="text-fg-muted">n/a</span>}
        sub={gain ? `In ${formatMoney(gain.deposits)} · Out ${formatMoney(gain.withdrawals)}` : "No data"}
        tone="muted"
        explain={{
          title: `${periodLabel} contributions and withdrawals`,
          value: gain ? formatMoney(gain.netContributions, { signed: true }) : "n/a",
          definition: "Net external cash moved into (positive) or out of (negative) the portfolio over the period. Deposits are not investment gains and are shown separately from returns.",
          period: gain ? `${formatDate(gain.from)} to ${formatDate(gain.to)}` : null,
          units: "US dollars",
          status: "reported",
          source: { provider: "Transaction ledger", derivation: gain ? `Deposits ${formatMoney(gain.deposits)} minus withdrawals ${formatMoney(gain.withdrawals)}.` : undefined },
          notes: ["Dividends, interest and reinvested dividends are internal cash flows and are not counted here."],
        }}
      />
      <StatTile
        label={`${periodLabel} investment gain`}
        value={gain ? <Delta value={gain.investmentGain} className="text-[22px]" /> : <span className="text-fg-muted">n/a</span>}
        sub={
          period.mwr.result.status === "ok" ? (
            period.mwr.years !== null && period.mwr.years < 1 && period.mwr.holdingPeriodEquivalent !== null ? (
              <>
                Money-weighted <Delta value={period.mwr.holdingPeriodEquivalent} kind="pct" hideIcon /> <span className="text-fg-muted">over window</span>
              </>
            ) : (
              <>
                Money-weighted <Delta value={period.mwr.result.rate} kind="pct" hideIcon /> <span className="text-fg-muted">annualised</span>
              </>
            )
          ) : (
            <span className="text-fg-muted">Money-weighted: {period.mwr.result.status === "not_unique" ? "not unique" : period.mwr.result.status === "no_solution" ? "no solution" : "insufficient data"}</span>
          )
        }
        explain={{
          title: `${periodLabel} investment gain`,
          value: gain ? formatMoney(gain.investmentGain, { signed: true }) : "n/a",
          definition: "Ending value minus beginning value minus net external contributions. This is the money the investments made or lost over the period, in dollars.",
          period: gain ? `${formatDate(gain.from)} to ${formatDate(gain.to)}` : null,
          units: "US dollars",
          status: "calculated",
          source: { provider: "Ledger engine", derivation: gain ? `${formatMoney(gain.endValue)} - ${formatMoney(gain.beginValue)} - (${formatMoney(gain.netContributions)}) = ${formatMoney(gain.investmentGain)}.` : undefined },
          notes: [
            period.mwr.result.status === "ok"
              ? `Money-weighted return (XIRR of the dated flows plus terminal value, ACT/365): ${formatPct(period.mwr.result.rate, { signed: true, digits: 2 })} annualised${period.mwr.holdingPeriodEquivalent !== null ? `, equivalent to ${formatPct(period.mwr.holdingPeriodEquivalent, { signed: true, digits: 2 })} over the window` : ""}.`
              : `Money-weighted return: ${period.mwr.result.message}`,
          ],
          limitations: ["Annualised money-weighted figures over short windows can look extreme; read them with the window length in mind."],
        }}
      />
    </div>
  );
}
