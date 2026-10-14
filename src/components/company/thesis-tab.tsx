"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowSquareOut, CheckCircle, PauseCircle, Question, WarningCircle } from "@phosphor-icons/react";
import { METRIC_DEFINITIONS, type MetricKey, type NormalizedFinancials } from "@/calc/fundamentals";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { formatDate, formatDateTime } from "@/lib/format";
import type { RuleEvaluation, ThesisStatus, ThesisWithHistory } from "@/services/thesis";
import { RULE_METRICS } from "@/lib/rule-metrics";
import { addRuleAction, deleteRuleAction, saveThesisAction, setThesisStatusAction, toggleRuleAction } from "@/app/actions/research";

const STATUS: Record<ThesisStatus, { tone: BadgeTone; label: string }> = {
  draft: { tone: "neutral", label: "Draft" },
  active: { tone: "positive", label: "Active" },
  review: { tone: "warning", label: "Under review" },
  closed: { tone: "outline", label: "Closed" },
};

interface LinkInput {
  label: string;
  url: string;
}

export function ThesisTab({ symbol, thesis, evaluations, fin }: { symbol: string; thesis: ThesisWithHistory | null; evaluations: RuleEvaluation[]; fin: NormalizedFinancials | null }) {
  const router = useRouter();
  const current = thesis?.current ?? null;
  const [editing, setEditing] = React.useState(!current);
  const [pending, start] = React.useTransition();
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [links, setLinks] = React.useState<LinkInput[]>(() => parseLinks(current?.links));
  const [showHistory, setShowHistory] = React.useState(false);
  const [ruleMetric, setRuleMetric] = React.useState<MetricKey>("revenueGrowth");
  const [ruleOp, setRuleOp] = React.useState<"lt" | "gt">("lt");
  const [rulePeriod, setRulePeriod] = React.useState<"quarter" | "annual" | "ttm">("quarter");
  const [ruleThreshold, setRuleThreshold] = React.useState("");

  const [seenRevisionId, setSeenRevisionId] = React.useState(current?.id ?? null);
  if ((current?.id ?? null) !== seenRevisionId) {
    // A new revision arrived from the server: reset the form to it (derived during render).
    setSeenRevisionId(current?.id ?? null);
    setLinks(parseLinks(current?.links));
    setEditing(!current);
  }

  const submit = (form: FormData) => {
    start(async () => {
      const res = await saveThesisAction(symbol, {
        summary: String(form.get("summary") ?? ""),
        drivers: String(form.get("drivers") ?? ""),
        risks: String(form.get("risks") ?? ""),
        invalidation: String(form.get("invalidation") ?? ""),
        valuationAssumptions: String(form.get("valuationAssumptions") ?? ""),
        reviewDate: String(form.get("reviewDate") ?? ""),
        links,
        changeNote: String(form.get("changeNote") ?? ""),
        status: String(form.get("status") ?? "draft") as ThesisStatus,
      });
      if (!res.ok) {
        setErrors(res.fieldErrors ?? {});
        toast.error(res.message);
        return;
      }
      setErrors({});
      setEditing(false);
      toast.success(res.message);
      router.refresh();
    });
  };

  const ruleUnit = RULE_METRICS.find((m) => m.key === ruleMetric)?.unit ?? "ratio";
  const addRule = () => {
    const raw = Number(ruleThreshold.replace(/[,$%\s]/g, ""));
    if (!Number.isFinite(raw)) {
      toast.error("Enter a numeric threshold.");
      return;
    }
    const threshold = ruleUnit === "ratio" ? raw / 100 : raw;
    start(async () => {
      const res = await addRuleAction(symbol, { metric: ruleMetric, operator: ruleOp, threshold, periodType: rulePeriod });
      toast[res.ok ? "success" : "error"](res.message);
      if (res.ok) {
        setRuleThreshold("");
        router.refresh();
      }
    });
  };

  const fmtThreshold = (metric: string, v: number) => (RULE_METRICS.find((m) => m.key === metric)?.unit === "ratio" ? `${(v * 100).toFixed(1)}%` : new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(v));
  const latestAvailable = fin ? [fin.ttm?.label, fin.quarterly[fin.quarterly.length - 1]?.label, fin.annual[fin.annual.length - 1]?.label].filter(Boolean).join(" · ") : "none";

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="flex flex-col gap-5">
        <Panel>
          <PanelHeader
            title={thesis ? `Investment thesis` : "Start an investment thesis"}
            description={current ? `Revision ${thesis!.revisions.length} of ${thesis!.revisions.length} · saved ${formatDateTime(current.createdAt)}${current.reviewDate ? ` · review by ${formatDate(current.reviewDate)}` : ""}` : "Write down what you expect, what would prove you wrong, and when to check."}
            actions={
              <>
                {thesis ? <Badge tone={STATUS[thesis.thesis.status as ThesisStatus]?.tone ?? "neutral"}>{STATUS[thesis.thesis.status as ThesisStatus]?.label ?? thesis.thesis.status}</Badge> : null}
                {current && !editing ? (
                  <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
                    New revision
                  </Button>
                ) : null}
              </>
            }
          />
          <PanelBody>
            {editing ? (
              <form
                className="grid gap-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  submit(new FormData(e.currentTarget));
                }}
              >
                <Field label="Thesis" htmlFor="th-summary" hint="One or two sentences: what has to be true for this investment to work." error={errors.summary}>
                  <Textarea id="th-summary" name="summary" defaultValue={current?.summary ?? ""} required maxLength={4000} />
                </Field>
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Expected business drivers" htmlFor="th-drivers" error={errors.drivers}>
                    <Textarea id="th-drivers" name="drivers" defaultValue={current?.drivers ?? ""} maxLength={4000} />
                  </Field>
                  <Field label="Key risks" htmlFor="th-risks" error={errors.risks}>
                    <Textarea id="th-risks" name="risks" defaultValue={current?.risks ?? ""} maxLength={4000} />
                  </Field>
                  <Field label="Evidence that would invalidate it" htmlFor="th-invalidation" hint="Make this measurable; add a rule below to watch for it." error={errors.invalidation}>
                    <Textarea id="th-invalidation" name="invalidation" defaultValue={current?.invalidation ?? ""} maxLength={4000} />
                  </Field>
                  <Field label="Valuation assumptions" htmlFor="th-valuation" hint="Growth, margins, discount rate, multiple." error={errors.valuationAssumptions}>
                    <Textarea id="th-valuation" name="valuationAssumptions" defaultValue={current?.valuationAssumptions ?? ""} maxLength={4000} />
                  </Field>
                  <Field label="Review date" htmlFor="th-review" error={errors.reviewDate}>
                    <Input id="th-review" name="reviewDate" type="date" defaultValue={current?.reviewDate ?? ""} className="num" />
                  </Field>
                  <Field label="Status" htmlFor="th-status">
                    <Select id="th-status" name="status" defaultValue={thesis?.thesis.status ?? "draft"}>
                      {(Object.keys(STATUS) as ThesisStatus[]).map((s) => (
                        <option key={s} value={s}>
                          {STATUS[s].label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>
                <fieldset className="flex flex-col gap-2">
                  <legend className="text-xs font-medium text-fg-secondary">Filings and research links</legend>
                  {links.map((l, i) => (
                    <div key={i} className="grid grid-cols-[1fr_2fr_auto] gap-2">
                      <Input value={l.label} onChange={(e) => setLinks(links.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} placeholder="Label" aria-label={`Link ${i + 1} label`} maxLength={120} />
                      <Input value={l.url} onChange={(e) => setLinks(links.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))} placeholder="https://" aria-label={`Link ${i + 1} URL`} type="url" maxLength={500} inputMode="url" />
                      <Button type="button" variant="ghost" size="sm" onClick={() => setLinks(links.filter((_, j) => j !== i))} aria-label={`Remove link ${i + 1}`}>
                        Remove
                      </Button>
                    </div>
                  ))}
                  <Button type="button" variant="ghost" size="sm" className="self-start" onClick={() => setLinks([...links, { label: "", url: "" }])}>
                    Add link
                  </Button>
                </fieldset>
                <Field label="What changed in this revision" htmlFor="th-change" hint="Kept with the timestamp so you can see how your reasoning evolved." error={errors.changeNote}>
                  <Input id="th-change" name="changeNote" defaultValue="" maxLength={500} />
                </Field>
                <div className="flex justify-end gap-2">
                  {current ? (
                    <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
                      Cancel
                    </Button>
                  ) : null}
                  <Button type="submit" variant="primary" disabled={pending}>
                    {pending ? "Saving…" : "Save revision"}
                  </Button>
                </div>
              </form>
            ) : current ? (
              <div className="grid gap-4 text-sm">
                <p className="text-[15px] leading-6 text-fg">{current.summary}</p>
                <div className="grid gap-4 md:grid-cols-2">
                  <Block title="Expected drivers" body={current.drivers} />
                  <Block title="Key risks" body={current.risks} />
                  <Block title="Would invalidate it" body={current.invalidation} />
                  <Block title="Valuation assumptions" body={current.valuationAssumptions} />
                </div>
                {parseLinks(current.links).filter((l) => l.url || l.label).length ? (
                  <ul className="flex flex-wrap gap-2">
                    {parseLinks(current.links).map((l, i) => (
                      <li key={i}>
                        {l.url ? (
                          <a href={l.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-accent hover:border-accent">
                            {l.label || l.url} <ArrowSquareOut size={12} aria-hidden />
                          </a>
                        ) : (
                          <span className="inline-flex rounded-md border border-border px-2 py-1 text-xs text-fg-secondary">{l.label}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}
          </PanelBody>
        </Panel>

        {thesis && thesis.revisions.length > 0 ? (
          <Panel>
            <PanelHeader title={`Revision history (${thesis.revisions.length})`} description="Every save is kept with its timestamp." actions={<Button variant="ghost" size="sm" onClick={() => setShowHistory((s) => !s)}>{showHistory ? "Hide" : "Show"}</Button>} />
            {showHistory ? (
              <PanelBody>
                <ol className="relative ml-2 border-l border-border pl-5">
                  {thesis.revisions.map((r, i) => (
                    <li key={r.id} className="relative pb-5 last:pb-0">
                      <span aria-hidden className="absolute -left-[26px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-panel bg-accent" />
                      <div className="text-xs text-fg-muted">
                        {formatDateTime(r.createdAt)} · revision {thesis.revisions.length - i}
                        {r.reviewDate ? ` · review by ${formatDate(r.reviewDate)}` : ""}
                      </div>
                      {r.changeNote ? <div className="text-[13px] font-medium text-fg">{r.changeNote}</div> : null}
                      <p className="mt-1 text-[13px] text-fg-secondary">{r.summary}</p>
                      {r.invalidation ? <p className="mt-1 text-xs text-fg-muted">Invalidation: {r.invalidation}</p> : null}
                    </li>
                  ))}
                </ol>
              </PanelBody>
            ) : null}
          </Panel>
        ) : null}
      </div>

      <div className="flex flex-col gap-5">
        <Panel>
          <PanelHeader title="Review rules" description="Checked against the latest comparable reported period. A triggered rule means review needed, never buy or sell." />
          <PanelBody className="flex flex-col gap-3">
            {!thesis ? (
              <p className="text-sm text-fg-muted">Save a thesis first, then add rules.</p>
            ) : evaluations.length === 0 ? (
              <p className="text-sm text-fg-muted">No rules yet.</p>
            ) : (
              <ul className="divide-y divide-border/70">
                {evaluations.map((ev) => (
                  <li key={ev.rule.id} className="flex items-start gap-2 py-2 text-[13px]">
                    {ev.status === "review_needed" ? <WarningCircle size={18} className="mt-0.5 shrink-0 text-warning" aria-hidden /> : ev.status === "ok" ? <CheckCircle size={18} className="mt-0.5 shrink-0 text-positive" aria-hidden /> : <Question size={18} className="mt-0.5 shrink-0 text-fg-muted" aria-hidden />}
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-fg">
                        {ev.metricLabel} {ev.rule.operator === "lt" ? "below" : "above"} {fmtThreshold(ev.rule.metric, ev.rule.threshold)} <span className="text-fg-muted">({ev.rule.periodType === "ttm" ? "TTM" : ev.rule.periodType})</span>
                      </div>
                      <div className="text-xs text-fg-secondary">
                        <span className={ev.status === "review_needed" ? "font-medium text-warning" : ev.status === "ok" ? "text-positive" : "text-fg-muted"}>{ev.status === "review_needed" ? "Review needed" : ev.status === "ok" ? "Within rule" : "Not evaluable"}</span> · {ev.reason}
                        {ev.period?.filedAt ? ` Filed ${formatDate(ev.period.filedAt)}.` : ""}
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button variant="ghost" size="sm" aria-label={ev.rule.enabled ? "Pause rule" : "Enable rule"} onClick={() => start(async () => { const res = await toggleRuleAction(symbol, ev.rule.id, !ev.rule.enabled); toast[res.ok ? "success" : "error"](res.message); router.refresh(); })}>
                        <PauseCircle size={15} aria-hidden />
                      </Button>
                      <Button variant="ghost" size="sm" className="text-negative" onClick={() => start(async () => { const res = await deleteRuleAction(symbol, ev.rule.id); toast[res.ok ? "success" : "error"](res.message); router.refresh(); })}>
                        Delete
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {thesis?.rules.filter((r) => !r.enabled).length ? <p className="text-xs text-fg-muted">{thesis.rules.filter((r) => !r.enabled).length} paused rule(s) are not evaluated.</p> : null}
            {thesis ? (
              <form
                className="grid grid-cols-2 gap-2 border-t border-border pt-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  addRule();
                }}
              >
                <Field label="Metric" htmlFor="rule-metric" className="col-span-2">
                  <Select id="rule-metric" value={ruleMetric} onChange={(e) => setRuleMetric(e.target.value as MetricKey)}>
                    {RULE_METRICS.map((m) => (
                      <option key={m.key} value={m.key}>
                        {m.label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Review when" htmlFor="rule-op">
                  <Select id="rule-op" value={ruleOp} onChange={(e) => setRuleOp(e.target.value as "lt" | "gt")}>
                    <option value="lt">below</option>
                    <option value="gt">above</option>
                  </Select>
                </Field>
                <Field label={ruleUnit === "ratio" ? "Threshold (%)" : "Threshold ($)"} htmlFor="rule-threshold">
                  <Input id="rule-threshold" inputMode="decimal" value={ruleThreshold} onChange={(e) => setRuleThreshold(e.target.value)} className="num" placeholder={ruleUnit === "ratio" ? "10" : "13000000000"} />
                </Field>
                <Field label="Period" htmlFor="rule-period" hint={`Latest available: ${latestAvailable}`} className="col-span-2">
                  <Select id="rule-period" value={rulePeriod} onChange={(e) => setRulePeriod(e.target.value as "quarter" | "annual" | "ttm")}>
                    <option value="quarter">Latest quarter (vs same quarter a year earlier for growth)</option>
                    <option value="annual">Latest fiscal year</option>
                    <option value="ttm">Trailing twelve months</option>
                  </Select>
                </Field>
                <div className="col-span-2 flex justify-end">
                  <Button type="submit" variant="secondary" size="sm" disabled={pending}>
                    Add rule
                  </Button>
                </div>
                <p className="col-span-2 text-[11px] text-fg-muted">{METRIC_DEFINITIONS[ruleMetric].definition}</p>
              </form>
            ) : null}
          </PanelBody>
        </Panel>
        {thesis ? (
          <Panel>
            <PanelHeader title="Status" />
            <PanelBody className="flex flex-wrap gap-2">
              {(Object.keys(STATUS) as ThesisStatus[]).map((s) => (
                <Button key={s} variant={thesis.thesis.status === s ? "primary" : "secondary"} size="sm" aria-pressed={thesis.thesis.status === s} disabled={pending} onClick={() => start(async () => { const res = await setThesisStatusAction(symbol, s); toast[res.ok ? "success" : "error"](res.message); router.refresh(); })}>
                  {STATUS[s].label}
                </Button>
              ))}
            </PanelBody>
          </Panel>
        ) : null}
      </div>
    </div>
  );
}

function Block({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <h3 className="mb-1 text-[11px] font-medium uppercase tracking-wide text-fg-muted">{title}</h3>
      {body ? <p className="whitespace-pre-wrap text-[13px] leading-5 text-fg-secondary">{body}</p> : <p className="text-[13px] text-fg-muted">Not written yet.</p>}
    </div>
  );
}

function parseLinks(raw: string | null | undefined): LinkInput[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.map((x) => ({ label: String(x.label ?? ""), url: String(x.url ?? "") })) : [];
  } catch {
    return [];
  }
}
