"use client";

import * as React from "react";
import { stressTest, type StressPosition } from "@/calc/risk";
import { Delta } from "@/components/metrics/value";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { Table, TableScroll, Td, Th, Tr } from "@/components/ui/table";
import { formatMoney, formatPct } from "@/lib/format";

export function StressTestTool({ positions, cash }: { positions: StressPosition[]; cash: number }) {
  const sectors = [...new Set(positions.map((p) => p.sector).filter((s): s is string => !!s))].sort();
  const [symbolShocks, setSymbolShocks] = React.useState<Record<string, string>>({});
  const [sectorShocks, setSectorShocks] = React.useState<Record<string, string>>({});
  const toShocks = (m: Record<string, string>) => Object.fromEntries(Object.entries(m).filter(([, v]) => v.trim() !== "" && Number.isFinite(Number(v))).map(([k, v]) => [k, Number(v) / 100]));
  const result = React.useMemo(() => stressTest(positions, cash, { bySymbol: toShocks(symbolShocks), bySector: toShocks(sectorShocks) }), [positions, cash, symbolShocks, sectorShocks]);
  const anyShock = result.impacts.some((i) => i.shock !== 0);
  const preset = (pct: number) => setSectorShocks(Object.fromEntries(sectors.map((s) => [s, String(pct)])));
  return (
    <div className="grid gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
      <div className="flex flex-col gap-4">
        <div>
          <h3 className="mb-1 text-[11px] font-medium uppercase tracking-wide text-fg-muted">Sector shocks</h3>
          <p className="mb-2 text-xs text-fg-muted">Percentage change applied to every position in the sector. Funds without holdings data have no sector and are only shocked individually.</p>
          <div className="mb-2 flex flex-wrap gap-1">
            <Button variant="ghost" size="sm" onClick={() => preset(-10)}>All -10%</Button>
            <Button variant="ghost" size="sm" onClick={() => preset(-20)}>All -20%</Button>
            <Button variant="ghost" size="sm" onClick={() => { setSectorShocks({}); setSymbolShocks({}); }}>Clear</Button>
          </div>
          <ul className="space-y-1.5">
            {sectors.map((s) => (
              <li key={s} className="grid grid-cols-[1fr_90px] items-center gap-2 text-[13px]">
                <label htmlFor={`sec-${s}`} className="truncate text-fg-secondary">{s}</label>
                <div className="relative">
                  <Input id={`sec-${s}`} inputMode="decimal" value={sectorShocks[s] ?? ""} onChange={(e) => setSectorShocks({ ...sectorShocks, [s]: e.target.value })} className="num h-8 pr-6 text-right text-[13px]" placeholder="0" />
                  <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-xs text-fg-muted">%</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="mb-1 text-[11px] font-medium uppercase tracking-wide text-fg-muted">Position shocks</h3>
          <p className="mb-2 text-xs text-fg-muted">Overrides the sector shock for that position.</p>
          <ul className="max-h-[320px] space-y-1.5 overflow-y-auto pr-1 scrollbar-thin">
            {positions.map((p) => (
              <li key={p.symbol} className="grid grid-cols-[1fr_90px] items-center gap-2 text-[13px]">
                <label htmlFor={`pos-${p.symbol}`} className="num text-fg-secondary">{p.symbol} <span className="font-sans text-xs text-fg-muted">{formatMoney(p.marketValue, { whole: true })}</span></label>
                <div className="relative">
                  <Input id={`pos-${p.symbol}`} inputMode="decimal" value={symbolShocks[p.symbol] ?? ""} onChange={(e) => setSymbolShocks({ ...symbolShocks, [p.symbol]: e.target.value })} className="num h-8 pr-6 text-right text-[13px]" placeholder="0" />
                  <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-xs text-fg-muted">%</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-md border border-border bg-panel px-4 py-3">
            <div className="text-xs text-fg-muted">Estimated impact</div>
            <div className="mt-1 text-2xl font-medium"><Delta value={anyShock ? result.totalImpact : 0} className="text-2xl" hideIcon={!anyShock} /></div>
            <div className="text-xs text-fg-muted">Hypothetical, instantaneous</div>
          </div>
          <div className="rounded-md border border-border bg-panel px-4 py-3">
            <div className="text-xs text-fg-muted">As a share of value</div>
            <div className="mt-1 text-2xl font-medium">{result.impactPct === null ? "n/a" : <Delta value={anyShock ? result.impactPct : 0} kind="pct" className="text-2xl" hideIcon={!anyShock} />}</div>
            <div className="text-xs text-fg-muted">Portfolio value {formatMoney(result.portfolioValue, { whole: true })}</div>
          </div>
          <div className="rounded-md border border-border bg-panel px-4 py-3">
            <div className="text-xs text-fg-muted">Value after shock</div>
            <div className="num-sans mt-1 text-2xl font-medium text-fg">{formatMoney(result.portfolioValue + result.totalImpact, { whole: true })}</div>
            <div className="text-xs text-fg-muted">Cash {formatMoney(cash, { whole: true })} unchanged</div>
          </div>
        </div>
        <TableScroll label="Stress test impacts" className="rounded-md border border-border">
          <Table>
            <thead>
              <tr>
                <Th>Position</Th>
                <Th align="right">Market value</Th>
                <Th align="right">Shock</Th>
                <Th>Source</Th>
                <Th align="right">Impact</Th>
              </tr>
            </thead>
            <tbody>
              {result.impacts.map((i) => (
                <Tr key={i.symbol}>
                  <Td className="num font-medium">{i.symbol}</Td>
                  <Td align="right" numeric>{formatMoney(i.marketValue, { whole: true })}</Td>
                  <Td align="right" numeric>{formatPct(i.shock, { signed: true, digits: 0 })}</Td>
                  <Td className="text-xs text-fg-muted">{i.source === "symbol" ? "position shock" : i.source === "sector" ? "sector shock" : "no shock"}</Td>
                  <Td align="right" numeric>{i.shock === 0 ? <span className="text-fg-muted">0</span> : <Delta value={i.impact} hideIcon />}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </TableScroll>
        <ul className="list-disc space-y-1 pl-4 text-xs text-fg-muted">
          {result.assumptions.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
