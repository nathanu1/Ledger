"use client";

import * as React from "react";
import { AreaSeries, createChart, LineSeries, PriceScaleMode, type IChartApi, type ISeriesApi, type UTCTimestamp } from "lightweight-charts";
import { Button } from "@/components/ui/button";
import { formatDate, formatMoney, formatPct } from "@/lib/format";
import { cn } from "@/lib/cn";
import { ChartFrame, LegendKey } from "./chart-frame";
import { sample } from "./growth-chart";

export interface PricePointInput {
  date: string;
  close: number;
  adjClose: number | null;
}

type Range = "1M" | "3M" | "6M" | "1Y" | "3Y" | "ALL";
const RANGES: Range[] = ["1M", "3M", "6M", "1Y", "3Y", "ALL"];

function cssVar(name: string): string {
  if (typeof window === "undefined") return "#888";
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#888";
}

function toTs(date: string): UTCTimestamp {
  return (Date.parse(`${date}T00:00:00Z`) / 1000) as UTCTimestamp;
}

function rangeStart(range: Range, end: string): string | null {
  if (range === "ALL") return null;
  const d = new Date(`${end}T00:00:00Z`);
  const months = range === "1M" ? 1 : range === "3M" ? 3 : range === "6M" ? 6 : range === "1Y" ? 12 : 36;
  d.setUTCMonth(d.getUTCMonth() - months);
  return d.toISOString().slice(0, 10);
}

export function PriceChart({ symbol, points, benchmark, benchmarkSymbol, adjustment, height = 320 }: { symbol: string; points: PricePointInput[]; benchmark: Array<{ date: string; price: number }> | null; benchmarkSymbol: string | null; adjustment: string | null; height?: number }) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const chartRef = React.useRef<IChartApi | null>(null);
  const [range, setRange] = React.useState<Range>("1Y");
  const [mode, setMode] = React.useState<"adjusted" | "raw">(adjustment ? "adjusted" : "raw");
  const [compare, setCompare] = React.useState(false);
  const [hover, setHover] = React.useState<{ date: string; price: number; bench: number | null } | null>(null);
  const hasAdjusted = points.some((p) => p.adjClose !== null);

  const end = points[points.length - 1]?.date ?? "";
  const start = rangeStart(range, end);
  const visible = React.useMemo(() => points.filter((p) => !start || p.date >= start), [points, start]);
  const series = React.useMemo(() => visible.map((p) => ({ date: p.date, value: mode === "adjusted" && p.adjClose !== null ? p.adjClose : p.close })), [visible, mode]);
  const benchVisible = React.useMemo(() => (benchmark ?? []).filter((p) => !start || p.date >= start), [benchmark, start]);
  const first = series[0]?.value ?? null;
  const last = series[series.length - 1]?.value ?? null;
  const change = first && last ? last / first - 1 : null;
  const benchChange = benchVisible.length > 1 ? benchVisible[benchVisible.length - 1].price / benchVisible[0].price - 1 : null;

  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const palette = () => ({ text: cssVar("--chart-text"), grid: cssVar("--chart-grid"), axis: cssVar("--chart-axis"), s1: cssVar("--series-1"), bench: cssVar("--chart-benchmark"), surface: cssVar("--chart-surface"), cross: cssVar("--border-strong") });
    let colors = palette();
    const chart = createChart(el, {
      autoSize: true,
      layout: { background: { color: "transparent" }, textColor: colors.text, fontFamily: "var(--font-plex-mono), ui-monospace, monospace", fontSize: 11, attributionLogo: false },
      grid: { vertLines: { visible: false }, horzLines: { color: colors.grid } },
      rightPriceScale: { borderColor: colors.axis, mode: compare ? PriceScaleMode.Percentage : PriceScaleMode.Normal },
      timeScale: { borderColor: colors.axis, timeVisible: false, fixLeftEdge: true, fixRightEdge: true },
      crosshair: { vertLine: { color: colors.cross, labelBackgroundColor: colors.cross }, horzLine: { color: colors.cross, labelBackgroundColor: colors.cross } },
      handleScroll: false,
      handleScale: false,
    });
    chartRef.current = chart;
    const area: ISeriesApi<"Area"> = chart.addSeries(AreaSeries, { lineColor: colors.s1, topColor: `${colors.s1}33`, bottomColor: `${colors.s1}00`, lineWidth: 2, priceLineVisible: false, lastValueVisible: true, crosshairMarkerRadius: 4 });
    area.setData(series.map((p) => ({ time: toTs(p.date), value: p.value })));
    let benchSeries: ISeriesApi<"Line"> | null = null;
    if (compare && benchVisible.length) {
      benchSeries = chart.addSeries(LineSeries, { color: colors.bench, lineWidth: 1, priceLineVisible: false, lastValueVisible: true, crosshairMarkerRadius: 3 });
      benchSeries.setData(benchVisible.map((p) => ({ time: toTs(p.date), value: p.price })));
    }
    chart.timeScale().fitContent();
    const benchMap = new Map(benchVisible.map((p) => [p.date, p.price]));
    chart.subscribeCrosshairMove((param) => {
      if (!param.time || !param.seriesData.size) {
        setHover(null);
        return;
      }
      const d = new Date((param.time as number) * 1000).toISOString().slice(0, 10);
      const v = param.seriesData.get(area) as { value?: number } | undefined;
      if (v?.value === undefined) return;
      setHover({ date: d, price: v.value, bench: benchMap.get(d) ?? null });
    });
    const observer = new MutationObserver(() => {
      colors = palette();
      chart.applyOptions({ layout: { textColor: colors.text }, grid: { horzLines: { color: colors.grid } }, rightPriceScale: { borderColor: colors.axis }, timeScale: { borderColor: colors.axis } });
      area.applyOptions({ lineColor: colors.s1, topColor: `${colors.s1}33`, bottomColor: `${colors.s1}00` });
      benchSeries?.applyOptions({ color: colors.bench });
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => {
      observer.disconnect();
      chart.remove();
      chartRef.current = null;
    };
  }, [series, benchVisible, compare]);

  const legendItems = [{ label: `${symbol} (${mode === "adjusted" && hasAdjusted ? (adjustment === "splits_dividends" ? "adjusted for splits and dividends" : "split-adjusted") : "raw close"})`, color: "var(--series-1)" }];
  if (compare && benchmarkSymbol) legendItems.push({ label: `${benchmarkSymbol} (adjusted)`, color: "var(--chart-benchmark)" });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div role="group" aria-label="Range" className="flex items-center gap-0.5 rounded-md border border-border p-0.5">
          {RANGES.map((r) => (
            <button key={r} type="button" aria-pressed={range === r} onClick={() => setRange(r)} className={cn("num rounded-sm px-2 py-1 text-xs", range === r ? "bg-panel-raised text-fg font-medium" : "text-fg-muted hover:text-fg")}>
              {r}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {hasAdjusted ? (
            <div role="group" aria-label="Price series" className="flex items-center gap-0.5 rounded-md border border-border p-0.5 text-xs">
              <button type="button" aria-pressed={mode === "adjusted"} onClick={() => setMode("adjusted")} className={cn("rounded-sm px-2 py-1", mode === "adjusted" ? "bg-panel-raised text-fg font-medium" : "text-fg-muted hover:text-fg")}>
                Adjusted
              </button>
              <button type="button" aria-pressed={mode === "raw"} onClick={() => setMode("raw")} className={cn("rounded-sm px-2 py-1", mode === "raw" ? "bg-panel-raised text-fg font-medium" : "text-fg-muted hover:text-fg")}>
                Raw close
              </button>
            </div>
          ) : null}
          {benchmark && benchmarkSymbol ? (
            <Button variant={compare ? "primary" : "secondary"} size="sm" aria-pressed={compare} onClick={() => setCompare((c) => !c)}>
              {compare ? `Comparing with ${benchmarkSymbol}` : `Compare with ${benchmarkSymbol}`}
            </Button>
          ) : null}
        </div>
      </div>
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-xs text-fg-secondary" aria-live="polite">
        {hover ? (
          <>
            <span className="num">{formatDate(hover.date)}</span>
            <span className="num text-fg">{formatMoney(hover.price)}</span>
            {hover.bench !== null && compare ? <span className="num">{benchmarkSymbol} {formatMoney(hover.bench)}</span> : null}
          </>
        ) : (
          <>
            <span>
              {range === "ALL" ? "Since first data" : `Last ${range}`}: <span className={cn("num", change !== null && change < 0 ? "text-negative" : "text-positive")}>{change === null ? "n/a" : formatPct(change, { signed: true })}</span>
            </span>
            {compare && benchChange !== null ? (
              <span>
                {benchmarkSymbol}: <span className="num">{formatPct(benchChange, { signed: true })}</span>
              </span>
            ) : null}
            <span className="text-fg-muted">{compare ? "Percentage scale from the first visible day" : mode === "adjusted" && hasAdjusted ? "Adjusted series: historical prices restated for splits and dividends; use raw close for the price actually quoted" : "Raw closes as quoted"}</span>
          </>
        )}
      </div>
      <ChartFrame
        title={`${symbol} price`}
        summary={`${symbol} ${mode} close from ${series[0] ? formatDate(series[0].date) : ""} to ${series.length ? formatDate(series[series.length - 1].date) : ""}, ${change === null ? "" : `a change of ${formatPct(change, { signed: true })}`}.`}
        height={height}
        legend={<LegendKey items={legendItems} />}
        table={{
          columns: [
            { key: "date", label: "Date" },
            { key: "close", label: "Close", numeric: true },
            ...(hasAdjusted ? [{ key: "adj", label: "Adjusted close", numeric: true }] : []),
            ...(compare ? [{ key: "bench", label: benchmarkSymbol ?? "Benchmark", numeric: true }] : []),
          ],
          rows: sample(visible, 60).map((p) => ({ date: formatDate(p.date), close: formatMoney(p.close), adj: p.adjClose === null ? "n/a" : formatMoney(p.adjClose), bench: formatMoney(benchVisible.find((b) => b.date === p.date)?.price ?? null) })),
        }}
      >
        <div ref={containerRef} className="h-full w-full" />
      </ChartFrame>
    </div>
  );
}
