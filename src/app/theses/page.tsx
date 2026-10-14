import Link from "next/link";
import { CheckCircle, Question, WarningCircle } from "@phosphor-icons/react/dist/ssr";
import { PageHeader } from "@/components/shell/page-header";
import { AlertsList } from "@/components/overview/lists";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { formatDate, formatDateTime } from "@/lib/format";
import { buildPortfolioSnapshot, resolvePortfolioId } from "@/services/portfolio";
import { getSecurities } from "@/services/securities";
import { getAsOfDate } from "@/services/settings";
import { collectThesisAlerts, evaluateRules, listTheses } from "@/services/thesis";
import { watchedSymbols } from "@/services/watchlist";

export const metadata = { title: "Theses" };

const STATUS: Record<string, { tone: BadgeTone; label: string }> = {
  draft: { tone: "neutral", label: "Draft" },
  active: { tone: "positive", label: "Active" },
  review: { tone: "warning", label: "Under review" },
  closed: { tone: "outline", label: "Closed" },
};

export default async function ThesesPage() {
  const asOf = getAsOfDate();
  const theses = listTheses();
  const alerts = collectThesisAlerts(asOf);
  const portfolioId = resolvePortfolioId(null);
  const held = portfolioId ? (buildPortfolioSnapshot(portfolioId, { period: "1M" })?.holdings.map((h) => h.symbol) ?? []) : [];
  const covered = new Set(theses.map((t) => t.thesis.symbol));
  const candidates = [...new Set([...held, ...watchedSymbols()])].filter((s) => !covered.has(s));
  const names = getSecurities([...theses.map((t) => t.thesis.symbol), ...candidates]);
  return (
    <>
      <PageHeader title="Thesis journal" description="One thesis per company, with every revision kept. Rules are checked against the latest comparable reported period and phrased as review needed, never as instructions." />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex flex-col gap-4">
          {theses.length === 0 ? (
            <EmptyState title="No theses yet" description="Open a company page and use the Thesis tab to write one." />
          ) : (
            theses.map((t) => {
              const evals = evaluateRules(t.thesis.symbol, t.rules);
              const review = evals.filter((e) => e.status === "review_needed").length;
              const ok = evals.filter((e) => e.status === "ok").length;
              const na = evals.filter((e) => e.status === "not_evaluable").length;
              const overdue = t.current?.reviewDate && t.current.reviewDate <= asOf;
              return (
                <Panel key={t.thesis.id}>
                  <PanelHeader
                    title={
                      <span className="flex items-center gap-2">
                        <Link href={`/company/${t.thesis.symbol}?tab=thesis`} className="num hover:text-accent">
                          {t.thesis.symbol}
                        </Link>
                        <span className="font-normal text-fg-secondary">{names.get(t.thesis.symbol)?.name ?? ""}</span>
                        <Badge tone={STATUS[t.thesis.status]?.tone ?? "neutral"}>{STATUS[t.thesis.status]?.label ?? t.thesis.status}</Badge>
                      </span>
                    }
                    description={`${t.revisions.length} revision${t.revisions.length === 1 ? "" : "s"} · updated ${formatDateTime(t.thesis.updatedAt)}${t.current?.reviewDate ? ` · review by ${formatDate(t.current.reviewDate)}${overdue ? " (passed)" : ""}` : ""}`}
                    actions={
                      <span className="flex items-center gap-2 text-xs">
                        {review ? (
                          <span className="inline-flex items-center gap-1 text-warning">
                            <WarningCircle size={14} aria-hidden /> {review} review
                          </span>
                        ) : null}
                        {ok ? (
                          <span className="inline-flex items-center gap-1 text-positive">
                            <CheckCircle size={14} aria-hidden /> {ok} within
                          </span>
                        ) : null}
                        {na ? (
                          <span className="inline-flex items-center gap-1 text-fg-muted">
                            <Question size={14} aria-hidden /> {na} n/a
                          </span>
                        ) : null}
                      </span>
                    }
                  />
                  <PanelBody>
                    <p className="text-sm text-fg">{t.current?.summary}</p>
                    {t.current?.invalidation ? <p className="mt-2 text-xs text-fg-muted">Would invalidate: {t.current.invalidation}</p> : null}
                  </PanelBody>
                </Panel>
              );
            })
          )}
        </div>
        <div className="flex flex-col gap-5">
          <Panel>
            <PanelHeader title="Needs review" description="Triggered rules and passed review dates." />
            <PanelBody>
              <AlertsList alerts={alerts.map((a) => ({ kind: a.kind === "rule" ? "thesis" : "review_date", symbol: a.symbol, title: `${a.symbol}: ${a.title}`, detail: a.detail, href: `/company/${a.symbol}?tab=thesis` }))} />
            </PanelBody>
          </Panel>
          {candidates.length ? (
            <Panel>
              <PanelHeader title="Without a thesis" description="Held or watched companies you have not written up." />
              <PanelBody>
                <ul className="flex flex-wrap gap-2">
                  {candidates.map((s) => (
                    <li key={s}>
                      <Link href={`/company/${s}?tab=thesis`} className="num inline-flex rounded-md border border-border px-2 py-1 text-xs text-fg hover:border-accent hover:text-accent">
                        {s}
                      </Link>
                    </li>
                  ))}
                </ul>
              </PanelBody>
            </Panel>
          ) : null}
        </div>
      </div>
    </>
  );
}
