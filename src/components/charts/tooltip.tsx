"use client";

import * as React from "react";

export interface TooltipRow {
  label: string;
  value: string;
  color?: string;
}

/** Shared tooltip body: values lead, labels follow, series keyed by a short line. */
export function ChartTooltipBody({ title, rows }: { title: string; rows: TooltipRow[] }) {
  return (
    <div className="rounded-md border border-border bg-panel-raised px-2.5 py-2 text-xs shadow-panel">
      <div className="mb-1 text-fg-muted">{title}</div>
      <ul className="space-y-0.5">
        {rows.map((r) => (
          <li key={r.label} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-fg-secondary">
              {r.color ? <span aria-hidden className="inline-block h-0.5 w-3 rounded-full" style={{ background: r.color }} /> : null}
              {r.label}
            </span>
            <span className="num font-medium text-fg">{r.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
