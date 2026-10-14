"use client";

import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartFrame, LegendKey } from "./chart-frame";
import { ChartTooltipBody } from "./tooltip";

export interface BarPoint {
  label: string;
  value: number | null;
  /** Optional second series (e.g. a margin shown in the tooltip only). */
  secondary?: number | null;
  calculated?: boolean;
}

export function BarsChart({ title, points, format, secondaryLabel, secondaryFormat, height = 220, footnote, signColor = false, seriesLabel }: { title: string; points: BarPoint[]; format: (v: number) => string; secondaryLabel?: string; secondaryFormat?: (v: number) => string; height?: number; footnote?: React.ReactNode; signColor?: boolean; seriesLabel?: string }) {
  const valid = points.filter((p) => p.value !== null);
  const summary = valid.length ? `${title}: ${valid.length} periods from ${points[0].label} to ${points[points.length - 1].label}; latest ${format(valid[valid.length - 1].value as number)}.` : `${title}: no data.`;
  const hasNegative = valid.some((p) => (p.value as number) < 0);
  return (
    <ChartFrame
      title={title}
      summary={summary}
      height={height}
      footnote={footnote}
      legend={seriesLabel ? <LegendKey items={[{ label: seriesLabel, color: "var(--series-1)", kind: "rect" }]} /> : undefined}
      table={{
        columns: [
          { key: "label", label: "Period" },
          { key: "value", label: seriesLabel ?? title, numeric: true },
          ...(secondaryLabel ? [{ key: "secondary", label: secondaryLabel, numeric: true }] : []),
        ],
        rows: points.map((p) => ({
          label: `${p.label}${p.calculated ? " (calculated)" : ""}`,
          value: p.value === null ? "n/a" : format(p.value),
          secondary: p.secondary === null || p.secondary === undefined ? "n/a" : (secondaryFormat ?? format)(p.secondary),
        })),
      }}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap="30%">
          <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
          <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: "var(--chart-axis)" }} tick={{ fontSize: 11 }} interval="preserveStartEnd" minTickGap={16} />
          <YAxis width={52} tickLine={false} axisLine={false} tickFormatter={(v: number) => format(v)} tick={{ fontSize: 11 }} />
          {hasNegative ? <ReferenceLine y={0} stroke="var(--chart-axis)" /> : null}
          <Tooltip
            cursor={{ fill: "var(--panel-raised)", opacity: 0.6 }}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload as BarPoint;
              return (
                <ChartTooltipBody
                  title={`${String(label)}${p.calculated ? " · calculated" : ""}`}
                  rows={[
                    { label: seriesLabel ?? title, value: p.value === null ? "n/a" : format(p.value), color: "var(--series-1)" },
                    ...(secondaryLabel && p.secondary !== null && p.secondary !== undefined ? [{ label: secondaryLabel, value: (secondaryFormat ?? format)(p.secondary) }] : []),
                  ]}
                />
              );
            }}
          />
          <Bar dataKey="value" maxBarSize={24} radius={[4, 4, 0, 0]} isAnimationActive={false}>
            {points.map((p, i) => (
              <Cell key={i} fill={signColor && (p.value ?? 0) < 0 ? "var(--chart-down)" : "var(--series-1)"} fillOpacity={p.calculated ? 0.7 : 1} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}
