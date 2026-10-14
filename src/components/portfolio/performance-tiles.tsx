import { TWR_CONVENTION } from "@/calc/returns";
import { Delta } from "@/components/metrics/value";
import { StatTile } from "@/components/metrics/stat-tile";
import { formatDate, formatMoney, formatPct } from "@/lib/format";
import type { PortfolioSnapshot } from "@/services/portfolio";

export function PerformanceTiles({ snapshot }: { snapshot: PortfolioSnapshot }) {
  const { valuation, ledger, twr, mwr, gain, benchmark } = snapshot;
  const unrealized = valuation.positions.reduce((acc, p) => acc + Number(p.unrealizedPnl ?? 0), 0);
  const realized = Number(ledger.totals.realizedPnl);
  const dividends = Number(ledger.totals.dividends);
  const interest = Number(ledger.totals.interest);
  const fees = Number(ledger.totals.standaloneFees);
  const totalGain = unrealized + realized + dividends + interest - fees;
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
      <StatTile
        label="Total value"
        value={<span className="num-sans">{formatMoney(valuation.totalValue)}</span>}
        sub={`Cash ${formatMoney(valuation.cash)}`}
        explain={{
          title: "Total value",
          value: formatMoney(valuation.totalValue),
          definition: "Cash plus the market value of priced positions at the last close on or before the valuation date.",
          period: `Valuation date ${formatDate(valuation.asOf)}`,
          units: "US dollars",
          status: "calculated",
          source: { provider: "Ledger engine", derivation: `Cash ${formatMoney(valuation.cash)} + positions ${formatMoney(valuation.marketValue)}.` },
          limitations: snapshot.missingPrices.length ? [`Unpriced and excluded: ${snapshot.missingPrices.join(", ")}.`] : [],
        }}
      />
      <StatTile
        label="Unrealized P/L"
        value={<Delta value={unrealized} className="text-[22px]" />}
        sub={`Cost basis ${formatMoney(valuation.positions.reduce((a, p) => a + Number(p.costBasis), 0))}`}
        explain={{
          title: "Unrealized profit or loss",
          value: formatMoney(unrealized, { signed: true }),
          definition: "Market value of open positions minus their remaining FIFO cost basis (buy-side fees included in cost).",
          units: "US dollars",
          status: "calculated",
          source: { provider: "Ledger engine (FIFO lots)" },
          limitations: ["An accounting estimate for research, not a tax-lot report."],
        }}
      />
      <StatTile
        label="Realized P/L"
        value={<Delta value={realized} className="text-[22px]" />}
        sub="FIFO, accounting estimate"
        explain={{
          title: "Realized profit or loss",
          value: formatMoney(realized, { signed: true }),
          definition: "Proceeds of sales net of fees minus the FIFO cost of the lots sold, summed over all sales since inception.",
          units: "US dollars",
          status: "calculated",
          source: { provider: "Ledger engine (FIFO lots)" },
          limitations: ["Cost basis method: first in, first out. Wash sales, lot elections and tax rules are not modelled; this is not tax-ready reporting."],
        }}
      />
      <StatTile
        label="Dividends and interest"
        value={<span className="num-sans">{formatMoney(dividends + interest)}</span>}
        sub={`Dividends ${formatMoney(dividends)} · Interest ${formatMoney(interest)}`}
        explain={{
          title: "Dividend and interest income",
          value: formatMoney(dividends + interest),
          definition: "Cash dividends and interest recorded in the ledger since inception. Reinvested dividends count once, as the dividend; the reinvestment is an ordinary purchase.",
          units: "US dollars",
          status: "reported",
          source: { provider: "Transaction ledger" },
        }}
      />
      <StatTile
        label="Total investment gain"
        value={<Delta value={totalGain} className="text-[22px]" />}
        sub={gain ? `Since ${formatDate(gain.from)}; net contributions ${formatMoney(gain.netContributions)}` : undefined}
        explain={{
          title: "Total investment gain since inception",
          value: formatMoney(totalGain, { signed: true }),
          definition: "Unrealized plus realized profit, plus dividends and interest, minus standalone account fees. Equals ending value minus net external contributions when every position is priced.",
          units: "US dollars",
          status: "calculated",
          source: { provider: "Ledger engine", derivation: `${formatMoney(unrealized)} + ${formatMoney(realized)} + ${formatMoney(dividends + interest)} - fees ${formatMoney(fees)} = ${formatMoney(totalGain)}${gain ? `. Check: ending ${formatMoney(gain.endValue)} - contributions ${formatMoney(gain.netContributions)} = ${formatMoney(gain.endValue - gain.netContributions)}.` : "."}` },
          limitations: snapshot.missingPrices.length ? ["Unpriced positions make the two methods differ."] : [],
        }}
      />
      <StatTile
        label="Return since inception"
        value={twr.totalReturn === null ? <span className="text-fg-muted">n/a</span> : <Delta value={twr.totalReturn} kind="pct" className="text-[22px]" />}
        sub={
          <>
            {twr.annualizedReturn !== null ? <>{formatPct(twr.annualizedReturn, { signed: true })} a year · </> : null}
            {mwr.result.status === "ok" ? <>MWR {formatPct(mwr.result.rate, { signed: true })}</> : <>MWR {mwr.result.status.replace("_", " ")}</>}
          </>
        }
        explain={{
          title: "Return since inception",
          value: twr.totalReturn === null ? "n/a" : formatPct(twr.totalReturn, { signed: true, digits: 2 }),
          definition: "Time-weighted return (TWR) since the first transaction, annualised when the span is at least one year. The money-weighted return (MWR) is the annualised internal rate of return of your dated deposits and withdrawals plus the ending value.",
          period: twr.startDate && twr.endDate ? `${formatDate(twr.startDate)} to ${formatDate(twr.endDate)}` : null,
          units: "Percentage",
          status: "calculated",
          source: { provider: "Ledger engine", derivation: TWR_CONVENTION },
          notes: [
            mwr.result.status === "ok" ? `Money-weighted (XIRR, ACT/365): ${formatPct(mwr.result.rate, { signed: true, digits: 2 })} annualised from ${mwr.flows.length} dated cash flows.` : `Money-weighted return: ${mwr.result.message}`,
            benchmark.inceptionReturn ? `${benchmark.name} over the same dates: ${formatPct(benchmark.inceptionReturn.totalReturn, { signed: true, digits: 2 })} (${benchmark.returnType === "total" ? "total return" : "price return"}).` : "Benchmark return unavailable for this window.",
          ],
          limitations: ["TWR measures the investments; MWR measures your dollars, including the timing of contributions."],
        }}
      />
    </div>
  );
}
