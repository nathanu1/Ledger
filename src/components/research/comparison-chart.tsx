"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartFrame, LegendKey } from "@/components/charts/chart-frame";
import { makeTickFormatter, sample, useTickDates } from "@/components/charts/growth-chart";
import { ChartTooltipBody } from "@/components/charts/tooltip";
import { EmptyState } from "@/components/ui/empty";
import { formatDate, formatNumber } from "@/lib/format";
import * as React from "react";

const SLOTS = ["var(--series-1)", "var(--series-2)", "var(--series-3)", "var(--series-4)"];

export function ComparisonChart({ series }: { series: Array<{ symbol: string; points: Array<{ date: string; price: number }> }> }) {
  const withData = series.filter((s) => s.points.length > 1);
  const data = React.useMemo(() => {
    if (withData.length === 0) return [] as Array<Record<string, number | string | null>>;
    const maps = withData.map((s) => new Map(s.points.map((p) => [p.date, p.price])));
    const dates = withData[0].points.map((p) => p.date).filter((d) => maps.every((m) => m.has(d)));
    if (dates.length === 0) return [];
    const base = withData.map((s, i) => maps[i].get(dates[0]) as number);
    return dates.map((d) => {
      const row: Record<string, number | string | null> = { date: d };
      withData.forEach((s, i) => (row[s.symbol] = ((maps[i].get(d) as number) / base[i]) * 100));
      return row;
    });
  }, [withData]);
  const dateList = data.map((d) => String(d.date));
  const ticks = useTickDates(dateList);
  const tickFormatter = React.useMemo(() => makeTickFormatter(dateList), [dateList]);
  if (data.length < 2) return <EmptyState title="Not enough overlapping price data" description="The compared companies need prices on common dates." />;
  const last = data[data.length - 1];
  return (
    <ChartFrame
      title="Indexed price (first common date = 100)"
      summary={`Indexed prices from ${formatDate(String(data[0].date))} to ${formatDate(String(last.date))}: ${withData.map((s) => `${s.symbol} ${formatNumber(Number(last[s.symbol]), 1)}`).join(", ")}.`}
      height={280}
      legend={<LegendKey items={withData.map((s, i) => ({ label: s.symbol, color: SLOTS[i] }))} />}
      table={{ columns: [{ key: "date", label: "Date" }, ...withData.map((s) => ({ key: s.symbol, label: s.symbol, numeric: true }))], rows: sample(data, 40).map((d) => ({ date: formatDate(String(d.date)), ...Object.fromEntries(withData.map((s) => [s.symbol, formatNumber(Number(d[s.symbol]), 1)])) })) }}
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
          <XAxis dataKey="date" ticks={ticks} tickFormatter={tickFormatter} tickLine={false} axisLine={{ stroke: "var(--chart-axis)" }} tick={{ fontSize: 11 }} />
          <YAxis width={44} tickLine={false} axisLine={false} tickFormatter={(v: number) => formatNumber(v, 0)} domain={["auto", "auto"]} tick={{ fontSize: 11 }} />
          <Tooltip
            cursor={{ stroke: "var(--border-strong)", strokeWidth: 1 }}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const row = payload[0].payload as Record<string, number | string>;
              return <ChartTooltipBody title={formatDate(String(label))} rows={withData.map((s, i) => ({ label: s.symbol, value: formatNumber(Number(row[s.symbol]), 1), color: SLOTS[i] }))} />;
            }}
          />
          {withData.map((s, i) => (
            <Line key={s.symbol} type="monotone" dataKey={s.symbol} stroke={SLOTS[i]} strokeWidth={i === 0 ? 2 : 1.5} dot={false} isAnimationActive={false} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}
