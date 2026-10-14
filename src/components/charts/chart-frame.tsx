"use client";

import * as React from "react";
import { Table as TableIcon, ChartLine } from "@phosphor-icons/react";
import { cn } from "@/lib/cn";
import { Table, TableScroll, Td, Th, Tr } from "@/components/ui/table";

export interface ChartTable {
  columns: Array<{ key: string; label: string; align?: "left" | "right"; numeric?: boolean }>;
  rows: Array<Record<string, React.ReactNode>>;
}

/**
 * Every chart ships with a text summary for assistive technology and a table
 * twin so no value is reachable only through colour or hover.
 */
export function ChartFrame({ title, summary, table, children, className, height = 260, legend, footnote }: { title: string; summary: string; table: ChartTable; children: React.ReactNode; className?: string; height?: number; legend?: React.ReactNode; footnote?: React.ReactNode }) {
  const [mode, setMode] = React.useState<"chart" | "table">("chart");
  const id = React.useId();
  return (
    <figure className={cn("flex flex-col gap-2", className)} aria-labelledby={`${id}-title`} aria-describedby={`${id}-summary`}>
      <div className="flex items-center justify-between gap-2">
        <figcaption id={`${id}-title`} className="text-xs font-medium text-fg-secondary">
          {title}
        </figcaption>
        <div className="flex items-center gap-2">
          {legend}
          <div role="group" aria-label="Display mode" className="flex rounded-md border border-border p-0.5">
            <button type="button" aria-pressed={mode === "chart"} onClick={() => setMode("chart")} className={cn("grid h-6 w-7 place-items-center rounded-sm", mode === "chart" ? "bg-panel-raised text-fg" : "text-fg-muted hover:text-fg")} aria-label="Show chart">
              <ChartLine size={13} aria-hidden />
            </button>
            <button type="button" aria-pressed={mode === "table"} onClick={() => setMode("table")} className={cn("grid h-6 w-7 place-items-center rounded-sm", mode === "table" ? "bg-panel-raised text-fg" : "text-fg-muted hover:text-fg")} aria-label="Show table">
              <TableIcon size={13} aria-hidden />
            </button>
          </div>
        </div>
      </div>
      <p id={`${id}-summary`} className="sr-only">
        {summary}
      </p>
      {mode === "chart" ? (
        <div style={{ height }} className="w-full min-w-0">
          {children}
        </div>
      ) : (
        <TableScroll className="max-h-[320px] overflow-y-auto rounded-md border border-border" label={`${title} table`}>
          <Table>
            <thead>
              <tr>
                {table.columns.map((c) => (
                  <Th key={c.key} align={c.align ?? (c.numeric ? "right" : "left")}>
                    {c.label}
                  </Th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((r, i) => (
                <Tr key={i}>
                  {table.columns.map((c) => (
                    <Td key={c.key} align={c.align ?? (c.numeric ? "right" : "left")} numeric={c.numeric}>
                      {r[c.key]}
                    </Td>
                  ))}
                </Tr>
              ))}
            </tbody>
          </Table>
        </TableScroll>
      )}
      {footnote ? <p className="text-[11px] leading-4 text-fg-muted">{footnote}</p> : null}
    </figure>
  );
}

export function LegendKey({ items }: { items: Array<{ label: string; color: string; kind?: "line" | "rect" }> }) {
  return (
    <ul className="flex flex-wrap items-center gap-3 text-[11px] text-fg-secondary">
      {items.map((it) => (
        <li key={it.label} className="flex items-center gap-1.5">
          <span aria-hidden className={cn("inline-block", it.kind === "rect" ? "h-2.5 w-2.5 rounded-[2px]" : "h-0.5 w-3.5 rounded-full")} style={{ background: it.color }} />
          {it.label}
        </li>
      ))}
    </ul>
  );
}
