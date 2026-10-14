"use client";

import Link from "next/link";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { formatDate, formatDateTime } from "@/lib/format";
import { useExplain, type ExplainDetail } from "./explain-context";

const STATUS_TONE: Record<NonNullable<ExplainDetail["status"]>, { tone: BadgeTone; label: string }> = {
  reported: { tone: "accent", label: "Reported" },
  calculated: { tone: "neutral", label: "Calculated" },
  unavailable: { tone: "warning", label: "Unavailable" },
  assumption: { tone: "warning", label: "Assumption" },
  historical: { tone: "neutral", label: "Historical estimate" },
  hypothetical: { tone: "warning", label: "Hypothetical" },
};

export function ExplainDrawer() {
  const { detail, close } = useExplain();
  return (
    <Dialog open={detail !== null} onOpenChange={(o) => (!o ? close() : undefined)}>
      {detail ? (
        <DialogContent side="right" title={detail.title} description="How this figure is defined and where it comes from">
          <div className="flex flex-col gap-5 text-sm">
            {detail.value !== undefined && detail.value !== null ? (
              <div className="flex items-baseline justify-between gap-3">
                <span className="num text-2xl font-medium text-fg">{detail.value}</span>
                {detail.status ? <Badge tone={STATUS_TONE[detail.status].tone}>{STATUS_TONE[detail.status].label}</Badge> : null}
              </div>
            ) : detail.status ? (
              <Badge tone={STATUS_TONE[detail.status].tone} className="self-start">
                {STATUS_TONE[detail.status].label}
              </Badge>
            ) : null}
            <Section title="Definition">
              <p>{detail.definition}</p>
            </Section>
            <dl className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-2 text-[13px]">
              {detail.period ? <Row label="Period" value={detail.period} /> : null}
              {detail.units ? <Row label="Units" value={detail.units} /> : null}
              {detail.filedAt ? <Row label="Available since" value={`${formatDate(detail.filedAt)} (filing date)`} /> : null}
              {detail.source ? <Row label="Provider" value={detail.source.provider} /> : null}
              {detail.source?.form ? <Row label="Form" value={detail.source.form} /> : null}
              {detail.source?.reference ? <Row label="Reference" value={<span className="break-all font-mono text-xs">{detail.source.reference}</span>} /> : null}
              {detail.source?.retrievedAt ? <Row label="Retrieved" value={formatDateTime(detail.source.retrievedAt)} /> : null}
            </dl>
            {detail.source?.derivation ? (
              <Section title="Derivation">
                <p className="text-fg-secondary">{detail.source.derivation}</p>
              </Section>
            ) : null}
            {detail.notes?.length ? (
              <Section title="Notes">
                <ul className="list-disc space-y-1 pl-4 text-fg-secondary">
                  {detail.notes.map((n, i) => (
                    <li key={i}>{n}</li>
                  ))}
                </ul>
              </Section>
            ) : null}
            {detail.limitations?.length ? (
              <Section title="Limitations">
                <ul className="list-disc space-y-1 pl-4 text-fg-secondary">
                  {detail.limitations.map((n, i) => (
                    <li key={i}>{n}</li>
                  ))}
                </ul>
              </Section>
            ) : null}
            {detail.links?.length ? (
              <Section title="Go to">
                <ul className="space-y-1">
                  {detail.links.map((l) => (
                    <li key={l.href}>
                      <Link href={l.href} className="text-accent hover:underline" onClick={close}>
                        {l.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </Section>
            ) : null}
          </div>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-1 text-[11px] font-medium uppercase tracking-wide text-fg-muted">{title}</h3>
      {children}
    </section>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <>
      <dt className="text-fg-muted">{label}</dt>
      <dd className="text-fg">{value}</dd>
    </>
  );
}
