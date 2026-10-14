import Link from "next/link";
import { CalendarCheck, CalendarBlank, Warning, Bell, Scales, Database, ListChecks } from "@phosphor-icons/react/dist/ssr";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty";
import { Delta } from "@/components/metrics/value";
import { formatDate, formatMoney } from "@/lib/format";
import type { OverviewAlert, OverviewData, WatchlistChange } from "@/services/overview";

export function EarningsList({ events }: { events: OverviewData["upcomingEarnings"] }) {
  if (events.length === 0) return <EmptyState title="No earnings dates in the next 60 days" description="Dates appear for holdings and watchlist companies when a provider calendar or a filing cadence estimate is available." />;
  return (
    <ul className="divide-y divide-border/70">
      {events.map((e) => (
        <li key={e.id} className="flex items-center justify-between gap-3 py-2 text-[13px]">
          <div className="flex min-w-0 items-center gap-2.5">
            {e.status === "confirmed" ? <CalendarCheck size={16} className="shrink-0 text-positive" aria-hidden /> : <CalendarBlank size={16} className="shrink-0 text-fg-muted" aria-hidden />}
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Link href={`/company/${e.symbol}`} className="num font-medium text-fg hover:text-accent">
                  {e.symbol}
                </Link>
                <span className="truncate text-xs text-fg-muted">{e.name}</span>
                {e.held ? <Badge tone="neutral">Held</Badge> : null}
              </div>
              <div className="text-xs text-fg-muted">
                <span className={e.status === "confirmed" ? "text-positive" : ""}>{e.status === "confirmed" ? "Confirmed" : "Estimated"}</span>
                {e.timeOfDay ? ` · ${e.timeOfDay}` : ""}
                <span className="sr-only">. {e.basis}</span>
                <abbr title={e.basis} className="ml-1 cursor-help no-underline text-fg-muted/80" aria-hidden>
                  (basis)
                </abbr>
              </div>
            </div>
          </div>
          <span className="num shrink-0 text-fg-secondary">{formatDate(e.date)}</span>
        </li>
      ))}
    </ul>
  );
}

export function WatchlistChanges({ changes }: { changes: WatchlistChange[] }) {
  if (changes.length === 0) return <EmptyState title="Watchlist is empty" description="Add companies from the command palette or a company page to see their daily moves and new filings here." action={<Link href="/watchlist" className="text-accent hover:underline">Open watchlist</Link>} />;
  return (
    <ul className="divide-y divide-border/70">
      {changes.map((c) => (
        <li key={c.symbol} className="flex items-center justify-between gap-3 py-2 text-[13px]">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Link href={`/company/${c.symbol}`} className="num font-medium text-fg hover:text-accent">
                {c.symbol}
              </Link>
              <span className="truncate text-xs text-fg-muted">{c.name}</span>
            </div>
            {c.newFilings.length ? (
              <div className="text-xs text-fg-muted">
                {c.newFilings.length} new filing{c.newFilings.length > 1 ? "s" : ""} in 14 days: {c.newFilings.slice(0, 3).map((f) => f.form).join(", ")}
              </div>
            ) : (
              <div className="text-xs text-fg-muted">No new filings in 14 days</div>
            )}
          </div>
          <div className="num shrink-0 text-right">
            <div className="text-fg">{c.price ? formatMoney(c.price.price) : "n/a"}</div>
            {c.price?.changePct !== null && c.price?.changePct !== undefined ? <Delta value={c.price.changePct} kind="pct" digits={2} className="text-xs" /> : <span className="text-xs text-fg-muted">no change data</span>}
          </div>
        </li>
      ))}
    </ul>
  );
}

const ALERT_ICON: Record<OverviewAlert["kind"], React.ComponentType<{ size?: number; className?: string; "aria-hidden"?: boolean }>> = {
  thesis: Bell,
  review_date: ListChecks,
  concentration: Scales,
  data: Database,
  ledger: Warning,
};

export function AlertsList({ alerts }: { alerts: OverviewAlert[] }) {
  if (alerts.length === 0) return <EmptyState title="Nothing needs review" description="Thesis rules, review dates, concentration and data coverage are all within their limits." />;
  return (
    <ul className="space-y-2">
      {alerts.map((a, i) => {
        const Icon = ALERT_ICON[a.kind];
        return (
          <li key={i}>
            <Link href={a.href} className="flex gap-2.5 rounded-md border border-border bg-panel px-3 py-2.5 text-[13px] hover:border-border-strong focus-visible:outline-2 focus-visible:outline-focus">
              <Icon size={16} className={a.kind === "ledger" || a.kind === "data" ? "mt-0.5 shrink-0 text-warning" : "mt-0.5 shrink-0 text-accent"} aria-hidden />
              <div className="min-w-0">
                <div className="font-medium text-fg">{a.title}</div>
                <div className="text-xs text-fg-secondary">{a.detail}</div>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
