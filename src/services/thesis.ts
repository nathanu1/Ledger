import { desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db/client";
import { theses, thesisRevisions, thesisRules, type ThesisRevisionRow, type ThesisRow, type ThesisRuleRow } from "@/db/schema";
import { METRIC_DEFINITIONS, type MetricKey, type StatementPeriod } from "@/calc/fundamentals";
import type { ISODate } from "@/calc/types";
import { newId, nowIso } from "@/lib/ids";
import { RULE_METRICS } from "@/lib/rule-metrics";
import { getFinancials } from "./fundamentals";
import { getAsOfDate } from "./settings";

export { RULE_METRICS };

export type ThesisStatus = "draft" | "active" | "review" | "closed";

export interface ThesisWithHistory {
  thesis: ThesisRow;
  current: ThesisRevisionRow | null;
  revisions: ThesisRevisionRow[];
  rules: ThesisRuleRow[];
}

export function getThesis(symbol: string): ThesisWithHistory | null {
  const db = getDb();
  const thesis = db.select().from(theses).where(eq(theses.symbol, symbol.toUpperCase())).get();
  if (!thesis) return null;
  const revisions = db.select().from(thesisRevisions).where(eq(thesisRevisions.thesisId, thesis.id)).orderBy(desc(thesisRevisions.createdAt)).all();
  const rules = db.select().from(thesisRules).where(eq(thesisRules.thesisId, thesis.id)).orderBy(thesisRules.createdAt).all();
  return { thesis, current: revisions[0] ?? null, revisions, rules };
}

export function listTheses(): ThesisWithHistory[] {
  return getDb()
    .select()
    .from(theses)
    .orderBy(desc(theses.updatedAt))
    .all()
    .map((t) => getThesis(t.symbol)!)
    .filter(Boolean);
}

export function getThesisStatuses(symbols: string[]): Map<string, string> {
  if (symbols.length === 0) return new Map();
  const rows = getDb().select({ symbol: theses.symbol, status: theses.status }).from(theses).where(inArray(theses.symbol, symbols)).all();
  return new Map(rows.map((r) => [r.symbol, r.status]));
}

export interface ThesisRevisionInput {
  summary: string;
  drivers: string;
  risks: string;
  invalidation: string;
  valuationAssumptions: string;
  reviewDate: ISODate | null;
  links: Array<{ label: string; url: string }>;
  changeNote: string | null;
}

/** Saving always appends a timestamped revision; nothing is overwritten. */
export function saveThesisRevision(symbol: string, input: ThesisRevisionInput, status?: ThesisStatus): ThesisWithHistory {
  const db = getDb();
  const now = nowIso();
  const upper = symbol.toUpperCase();
  let thesis = db.select().from(theses).where(eq(theses.symbol, upper)).get();
  if (!thesis) {
    const id = newId("th");
    db.insert(theses).values({ id, symbol: upper, status: status ?? "draft", createdAt: now, updatedAt: now }).run();
    thesis = db.select().from(theses).where(eq(theses.id, id)).get()!;
  } else {
    db.update(theses).set({ status: status ?? thesis.status, updatedAt: now }).where(eq(theses.id, thesis.id)).run();
  }
  db.insert(thesisRevisions)
    .values({
      id: newId("thr"),
      thesisId: thesis.id,
      createdAt: now,
      summary: input.summary.trim(),
      drivers: input.drivers.trim(),
      risks: input.risks.trim(),
      invalidation: input.invalidation.trim(),
      valuationAssumptions: input.valuationAssumptions.trim(),
      reviewDate: input.reviewDate,
      links: JSON.stringify(input.links.filter((l) => l.label.trim() || l.url.trim())),
      changeNote: input.changeNote?.trim() || null,
    })
    .run();
  return getThesis(upper)!;
}

export function setThesisStatus(symbol: string, status: ThesisStatus): void {
  getDb().update(theses).set({ status, updatedAt: nowIso() }).where(eq(theses.symbol, symbol.toUpperCase())).run();
}

export function addRule(symbol: string, input: { metric: MetricKey; operator: "lt" | "gt"; threshold: number; periodType: "quarter" | "annual" | "ttm" }): ThesisRuleRow | null {
  const t = getThesis(symbol);
  if (!t) return null;
  const id = newId("rule");
  getDb().insert(thesisRules).values({ id, thesisId: t.thesis.id, metric: input.metric, operator: input.operator, threshold: input.threshold, periodType: input.periodType, enabled: true, createdAt: nowIso() }).run();
  return getDb().select().from(thesisRules).where(eq(thesisRules.id, id)).get() ?? null;
}

export function toggleRule(ruleId: string, enabled: boolean): void {
  getDb().update(thesisRules).set({ enabled }).where(eq(thesisRules.id, ruleId)).run();
}

export function deleteRule(ruleId: string): void {
  getDb().delete(thesisRules).where(eq(thesisRules.id, ruleId)).run();
}

export interface RuleEvaluation {
  rule: ThesisRuleRow;
  symbol: string;
  metricLabel: string;
  status: "review_needed" | "ok" | "not_evaluable";
  value: number | null;
  period: { label: string; periodEnd: ISODate; filedAt: ISODate | null } | null;
  reason: string;
}

function latestOfType(fin: ReturnType<typeof getFinancials>, periodType: string): StatementPeriod | null {
  if (!fin) return null;
  if (periodType === "ttm") return fin.ttm;
  if (periodType === "annual") return fin.annual[fin.annual.length - 1] ?? null;
  return fin.quarterly[fin.quarterly.length - 1] ?? null;
}

/**
 * Evaluate review rules against the latest comparable period. Rules are phrased
 * as "review needed", never as instructions to trade.
 */
export function evaluateRules(symbol: string, rules?: ThesisRuleRow[]): RuleEvaluation[] {
  const t = getThesis(symbol);
  const list = rules ?? t?.rules ?? [];
  if (list.length === 0) return [];
  const fin = getFinancials(symbol);
  return list
    .filter((r) => r.enabled)
    .map((rule) => {
      const metric = rule.metric as MetricKey;
      const def = METRIC_DEFINITIONS[metric];
      const metricLabel = def?.label ?? rule.metric;
      const period = latestOfType(fin, rule.periodType);
      if (!period) return { rule, symbol, metricLabel, status: "not_evaluable", value: null, period: null, reason: `No ${rule.periodType === "ttm" ? "trailing twelve month" : rule.periodType} period is available.` };
      const mv = period.metrics[metric];
      const periodInfo = { label: period.label, periodEnd: period.periodEnd, filedAt: period.filedAt };
      if (!mv || mv.value === null) {
        return { rule, symbol, metricLabel, status: "not_evaluable", value: null, period: periodInfo, reason: mv?.notes[0] ?? `${metricLabel} is not available for ${period.label}.` };
      }
      const triggered = rule.operator === "lt" ? mv.value < rule.threshold : mv.value > rule.threshold;
      const fmt = (v: number) => (def?.unit === "ratio" ? `${(v * 100).toFixed(1)}%` : new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(v));
      return {
        rule,
        symbol,
        metricLabel,
        status: triggered ? "review_needed" : "ok",
        value: mv.value,
        period: periodInfo,
        reason: `${metricLabel} was ${fmt(mv.value)} in ${period.label} (${triggered ? "beyond" : "within"} the ${rule.operator === "lt" ? "below" : "above"} ${fmt(rule.threshold)} rule).`,
      };
    });
}

export interface ThesisAlert {
  symbol: string;
  kind: "rule" | "review_date";
  title: string;
  detail: string;
  periodEnd: ISODate | null;
  filedAt: ISODate | null;
}

/** All "review needed" items across theses: triggered rules and passed review dates. */
export function collectThesisAlerts(asOf: ISODate = getAsOfDate()): ThesisAlert[] {
  const alerts: ThesisAlert[] = [];
  for (const t of listTheses()) {
    if (t.thesis.status === "closed") continue;
    for (const ev of evaluateRules(t.thesis.symbol, t.rules)) {
      if (ev.status === "review_needed") {
        alerts.push({ symbol: t.thesis.symbol, kind: "rule", title: `Review needed: ${ev.metricLabel}`, detail: ev.reason, periodEnd: ev.period?.periodEnd ?? null, filedAt: ev.period?.filedAt ?? null });
      }
    }
    if (t.current?.reviewDate && t.current.reviewDate <= asOf) {
      alerts.push({ symbol: t.thesis.symbol, kind: "review_date", title: "Scheduled review date passed", detail: `The thesis review was due on ${t.current.reviewDate}.`, periodEnd: null, filedAt: null });
    }
  }
  return alerts;
}
