"use client";

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatInt, formatPct } from "@/lib/format";
import { ChartFrame } from "./chart-frame";
import { ChartTooltipBody } from "./tooltip";

export function Histogram({ bins, observations, height = 200, footnote }: { bins: Array<{ from: number; to: number; count: number }>; observations: number; height?: number; footnote?: React.ReactNode }) {
  const data = bins.map((b) => ({ label: `${formatPct(b.from, { digits: 1 })} to ${formatPct(b.to, { digits: 1 })}`, mid: (b.from + b.to) / 2, count: b.count, from: b.from, to: b.to }));
  return (
    <ChartFrame
      title="Distribution of daily returns"
      summary={`Histogram of ${observations} daily returns in ${bins.length} bins from ${bins.length ? formatPct(bins[0].from) : ""} to ${bins.length ? formatPct(bins[bins.length - 1].to) : ""}.`}
      height={height}
      footnote={footnote}
      table={{
        columns: [
          { key: "label", label: "Return range" },
          { key: "count", label: "Days", numeric: true },
        ],
        rows: data.map((d) => ({ label: d.label, count: formatInt(d.count) })),
      }}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap="12%">
          <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
          <XAxis dataKey="mid" tickFormatter={(v: number) => formatPct(v, { digits: 1 })} tickLine={false} axisLine={{ stroke: "var(--chart-axis)" }} tick={{ fontSize: 11 }} interval="preserveStartEnd" minTickGap={28} />
          <YAxis width={36} tickLine={false} axisLine={false} tick={{ fontSize: 11 }} allowDecimals={false} />
          <Tooltip
            cursor={{ fill: "var(--panel-raised)", opacity: 0.6 }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const d = payload[0].payload as (typeof data)[number];
              return <ChartTooltipBody title={d.label} rows={[{ label: "Days", value: formatInt(d.count), color: "var(--series-1)" }]} />;
            }}
          />
          <Bar dataKey="count" maxBarSize={24} radius={[4, 4, 0, 0]} isAnimationActive={false}>
            {data.map((d, i) => (
              <Cell key={i} fill={d.mid < 0 ? "var(--chart-down)" : "var(--series-1)"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}
