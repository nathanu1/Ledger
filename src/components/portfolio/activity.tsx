import Link from "next/link";
import { activityStart, portfolioActivity } from "@/calc/activity";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { formatDate, formatMoney, formatShares } from "@/lib/format";
import type { PortfolioSnapshot } from "@/services/portfolio";

export function PortfolioActivity({ snapshot }: { snapshot: PortfolioSnapshot }) {
  const activity = portfolioActivity(snapshot.transactions, activityStart(snapshot.period.key, snapshot.asOf, snapshot.transactions), snapshot.asOf);
  const t = activity.totals;
  const rows = [
    ["Deposits", t.deposits], ["Withdrawals", t.withdrawals], ["Net contributions", t.netContributions],
    ["Dividends", t.dividends], ["Interest", t.interest], ["Realized gain / loss", t.realizedPnl],
    ["Trade fees", t.tradingFees], ["Other fees", t.standaloneFees],
  ];
  const lots = snapshot.holdings.flatMap((h) => (snapshot.ledger.positions[h.symbol]?.lots ?? []).map((lot) => ({ ...lot, symbol: h.symbol })));
  return <div className="grid gap-5 lg:grid-cols-2">
    <Panel>
      <PanelHeader title="Ledger activity" description={`${formatDate(activity.from)} to ${formatDate(activity.to)} · ${activity.applied} applied transactions${activity.rejected ? ` · ${activity.rejected} rejected` : ""}. Trade fees are already reflected in cost basis or realized gains.`} actions={<a className="text-xs text-accent hover:underline" href={`/api/export/activity?portfolio=${encodeURIComponent(snapshot.portfolio.id)}&period=${snapshot.period.key}`} download>Export activity</a>} />
      <PanelBody>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[13px] sm:grid-cols-4">{rows.map(([label, value]) => <div key={label}><dt className="text-fg-muted">{label}</dt><dd className="num text-fg">{formatMoney(value)}</dd></div>)}</dl>
        <details className="mt-4 border-t border-border pt-2 text-[13px]"><summary className="cursor-pointer text-fg-secondary hover:text-fg">Monthly activity ({activity.monthly.length})</summary>
          <div className="overflow-x-auto"><table className="mt-2 w-full text-left text-xs"><caption className="sr-only">Monthly ledger activity</caption><thead><tr className="text-fg-muted"><th scope="col">Month</th><th scope="col">Dividends</th><th scope="col">Interest</th><th scope="col">Realized</th><th scope="col">Fees</th></tr></thead><tbody>{activity.monthly.map((m) => <tr key={m.month} className="border-t border-border/70"><th scope="row" className="py-2 font-normal">{m.month}</th><td>{formatMoney(m.dividends)}</td><td>{formatMoney(m.interest)}</td><td>{formatMoney(m.realizedPnl)}</td><td>{formatMoney(m.totalFees)}</td></tr>)}</tbody></table></div>
        </details>
        <details className="mt-2 border-t border-border pt-2 text-[13px]"><summary className="cursor-pointer text-fg-secondary hover:text-fg">Dividend income by holding ({activity.dividendsBySymbol.length})</summary>
          <ul className="mt-2 divide-y divide-border/70">{activity.dividendsBySymbol.map((d) => <li key={d.symbol} className="flex justify-between gap-3 py-1.5"><Link href={`/company/${encodeURIComponent(d.symbol)}`} className="text-accent hover:underline">{d.symbol}</Link><span className="num">{formatMoney(d.amount)}</span></li>)}</ul>
          {!activity.dividendsBySymbol.length && <p className="mt-2 text-fg-muted">No dividends in this period.</p>}
        </details>
      </PanelBody>
    </Panel>
    <Panel><PanelHeader title="Open FIFO lots" description="Remaining shares and cost basis after sales and splits, as of the valuation date. Cost basis includes buy fees. Accounting estimates are not tax reporting." />
      <PanelBody><details className="text-[13px]"><summary className="cursor-pointer text-fg-secondary hover:text-fg">View open lots ({lots.length})</summary>
        <div className="overflow-x-auto"><table className="mt-2 w-full text-left text-xs"><caption className="sr-only">Open FIFO lots</caption><thead><tr className="text-fg-muted"><th scope="col">Holding</th><th scope="col">Acquired</th><th scope="col">Shares</th><th scope="col">Cost basis</th></tr></thead><tbody>{lots.map((lot) => <tr key={`${lot.symbol}-${lot.sourceTransactionId}`} className="border-t border-border/70"><th scope="row" className="py-2 font-normal"><Link href={`/company/${encodeURIComponent(lot.symbol)}`} className="text-accent hover:underline">{lot.symbol}</Link></th><td>{formatDate(lot.openedAt)}</td><td>{formatShares(lot.quantity)}</td><td>{formatMoney(lot.costBasis)}</td></tr>)}</tbody></table></div>
        {!lots.length && <p className="mt-2 text-fg-muted">No open lots.</p>}
      </details></PanelBody>
    </Panel>
  </div>;
}
