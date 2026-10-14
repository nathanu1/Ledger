import Link from "next/link";
import type { AttributionResult } from "@/calc/attribution";
import { ExplainButton } from "@/components/metrics/explain-button";
import { Delta } from "@/components/metrics/value";
import { EmptyState } from "@/components/ui/empty";
import { formatDate, formatMoney } from "@/lib/format";

export function Contributors({ attribution, names }: { attribution: AttributionResult | null; names: Map<string, string> }) {
  if (!attribution || attribution.positions.length === 0) {
    return <EmptyState title="No contributions to show" description="Once the portfolio has at least two valuation days in the selected period, each position's profit or loss appears here." />;
  }
  const priced = attribution.positions.filter((p) => p.pnl !== null);
  const positive = priced.filter((p) => Number(p.pnl) > 0).slice(0, 4);
  const negative = priced.filter((p) => Number(p.pnl) < 0).sort((a, b) => Number(a.pnl) - Number(b.pnl)).slice(0, 4);
  const render = (list: typeof priced, empty: string) =>
    list.length === 0 ? (
      <p className="text-xs text-fg-muted">{empty}</p>
    ) : (
      <ul className="divide-y divide-border/70">
        {list.map((p) => (
          <li key={p.symbol} className="flex items-center justify-between gap-2 py-1.5 text-[13px]">
            <div className="flex min-w-0 items-center gap-2">
              <Link href={`/company/${p.symbol}`} className="num font-medium text-fg hover:text-accent">
                {p.symbol}
              </Link>
              <span className="truncate text-xs text-fg-muted">{names.get(p.symbol) ?? ""}</span>
            </div>
            <div className="flex items-center gap-1">
              <Delta value={p.pnl} />
              <ExplainButton
                detail={{
                  title: `${p.symbol} profit or loss, ${formatDate(attribution.from)} to ${formatDate(attribution.to)}`,
                  value: formatMoney(p.pnl, { signed: true }),
                  definition: "Exact accounting attribution: change in market value, minus net money invested in the position during the period (buys minus sells, fees included), plus cash dividends received.",
                  period: `${formatDate(attribution.from)} to ${formatDate(attribution.to)}`,
                  units: "US dollars",
                  status: "calculated",
                  source: {
                    provider: "Ledger engine",
                    derivation: `Market value ${formatMoney(p.endValue)} - ${formatMoney(p.startValue)} - net invested ${formatMoney(p.netInvested)} + dividends ${formatMoney(p.dividends)} = ${formatMoney(p.pnl)}.`,
                  },
                  limitations: ["This is the position's dollar contribution to the portfolio's investment gain. It does not claim why the price moved."],
                  links: [{ label: `Open ${p.symbol}`, href: `/company/${p.symbol}` }],
                }}
              />
            </div>
          </li>
        ))}
      </ul>
    );
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div>
        <h3 className="mb-1 text-[11px] font-medium uppercase tracking-wide text-fg-muted">Added the most</h3>
        {render(positive, "No position gained over this period.")}
      </div>
      <div>
        <h3 className="mb-1 text-[11px] font-medium uppercase tracking-wide text-fg-muted">Cost the most</h3>
        {render(negative, "No position lost over this period.")}
      </div>
      {attribution.unpricedSymbols.length ? <p className="text-xs text-warning sm:col-span-2">Not attributed (no price data): {attribution.unpricedSymbols.join(", ")}.</p> : null}
    </div>
  );
}
