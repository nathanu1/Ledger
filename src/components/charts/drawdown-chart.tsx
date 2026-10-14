"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatDate, formatPct } from "@/lib/format";
import { ChartFrame } from "./chart-frame";
import * as React from "react";
import { makeTickFormatter, sample, useTickDates } from "./growth-chart";
import { ChartTooltipBody } from "./tooltip";

export function DrawdownChart({ points, maxDrawdown, height = 200, footnote }: { points: Array<{ date: string; drawdown: number }>; maxDrawdown: number | null; height?: number; footnote?: React.ReactNode }) {
  const dateList = points.map((p) => p.date);
  const tickDates = useTickDates(dateList);
  const tickFormatter = React.useMemo(() => makeTickFormatter(dateList), [dateList]);
  const summary = points.length ? `Drawdown from the running peak of the time-weighted growth index. Deepest decline ${maxDrawdown === null ? "not available" : formatPct(maxDrawdown)}.` : "No data.";
  return (
    <ChartFrame
      title="Drawdown from peak"
      summary={summary}
      height={height}
      footnote={footnote}
      table={{
        columns: [
          { key: "date", label: "Date" },
          { key: "dd", label: "Drawdown", numeric: true },
        ],
        rows: sample(points, 40).map((p) => ({ date: formatDate(p.date), dd: formatPct(p.drawdown) })),
      }}
    >
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
          <XAxis dataKey="date" ticks={tickDates} tickFormatter={tickFormatter} tickLine={false} axisLine={{ stroke: "var(--chart-axis)" }} tick={{ fontSize: 11 }} />
          <YAxis width={44} tickLine={false} axisLine={false} tickFormatter={(v: number) => formatPct(v, { digits: 0 })} tick={{ fontSize: 11 }} />
          <Tooltip
            cursor={{ stroke: "var(--border-strong)", strokeWidth: 1 }}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              return <ChartTooltipBody title={formatDate(String(label))} rows={[{ label: "Drawdown", value: formatPct(Number(payload[0].value)), color: "var(--chart-down)" }]} />;
            }}
          />
          <Area type="monotone" dataKey="drawdown" stroke="var(--chart-down)" strokeWidth={1.5} fill="var(--chart-down)" fillOpacity={0.12} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}
