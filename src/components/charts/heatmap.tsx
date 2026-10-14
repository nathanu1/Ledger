"use client";

import * as React from "react";
import { cn } from "@/lib/cn";

export interface HeatCell {
  value: number | null;
  label: string;
  title?: string;
  emphasis?: boolean;
}

/**
 * Diverging heatmap. Colour intensity is capped so text set in the text token
 * stays readable; every cell also prints its value, so colour never carries
 * meaning alone.
 */
export function Heatmap({ rowLabels, colLabels, cells, rowHeader, colHeader, center = 0, maxAbs, className, caption, palette }: { rowLabels: string[]; colLabels: string[]; cells: HeatCell[][]; rowHeader: string; colHeader: string; center?: number; maxAbs?: number; className?: string; caption: string; /** Colours for values above / below the centre. Defaults to the gain / loss tokens; pass a cool / warm pair when polarity is not good / bad. */ palette?: { above: string; below: string } }) {
  const above = palette?.above ?? "var(--positive)";
  const below = palette?.below ?? "var(--negative)";
  const scale = React.useMemo(() => {
    if (maxAbs) return maxAbs;
    let m = 0;
    for (const row of cells) for (const c of row) if (c.value !== null) m = Math.max(m, Math.abs(c.value - center));
    return m || 1;
  }, [cells, center, maxAbs]);
  return (
    <div className={cn("overflow-x-auto scrollbar-thin", className)} role="region" aria-label={caption} tabIndex={0}>
      <table className="w-full border-separate border-spacing-0.5 text-[12px]">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            <th scope="col" className="px-2 py-1 text-left text-[11px] font-medium text-fg-muted">
              <span className="sr-only">{rowHeader} by </span>
              {colHeader}
            </th>
            {colLabels.map((c) => (
              <th key={c} scope="col" className="num px-2 py-1 text-right text-[11px] font-medium text-fg-muted">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {cells.map((row, i) => (
            <tr key={rowLabels[i]}>
              <th scope="row" className="num whitespace-nowrap px-2 py-1 text-left text-[11px] font-medium text-fg-muted">
                {rowLabels[i]}
              </th>
              {row.map((cell, j) => {
                const rel = cell.value === null ? 0 : (cell.value - center) / scale;
                const intensity = Math.min(Math.abs(rel), 1) * 50;
                const color = rel >= 0 ? above : below;
                return (
                  <td
                    key={colLabels[j]}
                    title={cell.title}
                    className={cn("num rounded-sm px-2 py-1.5 text-right text-fg", cell.emphasis && "outline outline-2 -outline-offset-2 outline-accent", cell.value === null && "text-fg-muted")}
                    style={cell.value === null ? { background: "var(--panel-sunken)" } : { background: `color-mix(in oklab, ${color} ${intensity.toFixed(0)}%, var(--panel))` }}
                  >
                    {cell.label}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
