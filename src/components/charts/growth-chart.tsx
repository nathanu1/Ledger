"use client";

import * as React from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatDate, formatNumber } from "@/lib/format";
import { ChartFrame, LegendKey } from "./chart-frame";
import { ChartTooltipBody } from "./tooltip";

export interface GrowthPoint {
  date: string;
  portfolio: number;
  benchmark: number | null;
}

const SERIES = { portfolio: "var(--series-1)", benchmark: "var(--chart-benchmark)" };

export function GrowthChart({ points, benchmarkLabel, portfolioLabel = "Portfolio", title = "Growth of 100", height = 260, footnote }: { points: GrowthPoint[]; benchmarkLabel: string; portfolioLabel?: string; title?: string; height?: number; footnote?: React.ReactNode }) {
  const last = points[points.length - 1];
  const first = points[0];
  const summary = points.length
    ? `${title} from ${formatDate(first.date)} to ${formatDate(last.date)}. ${portfolioLabel} ends at ${formatNumber(last.portfolio, 1)}${last.benchmark !== null ? `; ${benchmarkLabel} ends at ${formatNumber(last.benchmark, 1)}` : ""}.`
    : "No data for this window.";
  const hasBenchmark = points.some((p) => p.benchmark !== null);
  const dateList = points.map((p) => p.date);
  const tickDates = useTickDates(dateList);
  const tickFormatter = React.useMemo(() => makeTickFormatter(dateList), [dateList]);
  return (
    <ChartFrame
      title={title}
      summary={summary}
      height={height}
      footnote={footnote}
      legend={<LegendKey items={[{ label: portfolioLabel, color: SERIES.portfolio }, ...(hasBenchmark ? [{ label: benchmarkLabel, color: SERIES.benchmark }] : [])]} />}
      table={{
        columns: [
          { key: "date", label: "Date" },
          { key: "portfolio", label: portfolioLabel, numeric: true },
          ...(hasBenchmark ? [{ key: "benchmark", label: benchmarkLabel, numeric: true }] : []),
        ],
        rows: sample(points, 40).map((p) => ({ date: formatDate(p.date), portfolio: formatNumber(p.portfolio, 1), benchmark: p.benchmark === null ? "n/a" : formatNumber(p.benchmark, 1) })),
      }}
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
          <XAxis dataKey="date" ticks={tickDates} tickFormatter={tickFormatter} tickLine={false} axisLine={{ stroke: "var(--chart-axis)" }} minTickGap={32} tick={{ fontSize: 11 }} />
          <YAxis width={44} tickLine={false} axisLine={false} tickFormatter={(v: number) => formatNumber(v, 0)} domain={["auto", "auto"]} tick={{ fontSize: 11 }} />
          <Tooltip
            cursor={{ stroke: "var(--border-strong)", strokeWidth: 1 }}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload as GrowthPoint;
              return (
                <ChartTooltipBody
                  title={formatDate(String(label))}
                  rows={[
                    { label: portfolioLabel, value: formatNumber(p.portfolio, 1), color: SERIES.portfolio },
                    ...(p.benchmark !== null ? [{ label: benchmarkLabel, value: formatNumber(p.benchmark, 1), color: SERIES.benchmark }] : []),
                  ]}
                />
              );
            }}
          />
          {hasBenchmark ? <Line type="monotone" dataKey="benchmark" stroke={SERIES.benchmark} strokeWidth={1.5} dot={false} isAnimationActive={false} connectNulls /> : null}
          <Line type="monotone" dataKey="portfolio" stroke={SERIES.portfolio} strokeWidth={2} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

/** Tick label that adapts to the span: day-level for short windows, month and year for long ones. */
export function makeTickFormatter(dates: string[]): (d: string) => string {
  if (dates.length === 0) return (d) => d;
  const spanDays = (Date.parse(dates[dates.length - 1]) - Date.parse(dates[0])) / 86_400_000;
  const fmt = spanDays <= 120 ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }) : new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
  return (d: string) => fmt.format(new Date(`${d}T00:00:00Z`));
}

export function shortDate(d: string): string {
  const dt = new Date(`${d}T00:00:00Z`);
  return new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric", timeZone: "UTC" }).format(dt);
}

export function useTickDates(dates: string[], maxTicks = 7): string[] {
  return React.useMemo(() => {
    if (dates.length <= maxTicks) return dates;
    const step = Math.ceil(dates.length / maxTicks);
    const out: string[] = [];
    for (let i = 0; i < dates.length; i += step) out.push(dates[i]);
    return out;
  }, [dates, maxTicks]);
}

export function sample<T>(items: T[], max: number): T[] {
  if (items.length <= max) return items;
  const step = Math.ceil(items.length / max);
  const out: T[] = [];
  for (let i = 0; i < items.length; i += step) out.push(items[i]);
  if (out[out.length - 1] !== items[items.length - 1]) out.push(items[items.length - 1]);
  return out;
}
