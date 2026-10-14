"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { deriveScenarios, REVERSE_DCF_TARGETS, reverseDcf, runDcf, sensitivityGrid, type DcfInputs, type DcfResult, type ReverseDcfTarget } from "@/calc/dcf";
import type { SectorProfile } from "@/calc/ratios";
import { Heatmap } from "@/components/charts/heatmap";
import { ExplainButton } from "@/components/metrics/explain-button";
import { Delta } from "@/components/metrics/value";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty";
import { Field, Input, Select } from "@/components/ui/field";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { Table, TableScroll, Td, Th, Tr } from "@/components/ui/table";
import { cn } from "@/lib/cn";
import { formatCompact, formatDate, formatDateTime, formatMoney, formatMoneyCompact, formatPct } from "@/lib/format";
import type { DcfScenarioRow } from "@/db/schema";
import type { DcfDefaults } from "@/services/dcf";
import { deleteScenarioAction, saveScenarioAction } from "@/app/actions/research";

type Draft = Record<string, string>;

const PCT_FIELDS = new Set(["operatingMargin", "taxRate", "daPctRevenue", "capexPctRevenue", "nwcPctRevenueChange", "wacc", "terminalGrowth"]);

function toDraft(inputs: DcfInputs | null, missing: string[]): Draft {
  const d: Draft = {};
  const pct = (v: number) => (v * 100).toFixed(2).replace(/\.?0+$/, "");
  if (!inputs) {
    for (const k of ["baseRevenue", "operatingMargin", "taxRate", "daPctRevenue", "capexPctRevenue", "nwcPctRevenueChange", "wacc", "terminalGrowth", "cash", "debt", "otherAdjustments", "dilutedShares", "currentPrice"]) d[k] = "";
    for (let i = 0; i < 5; i += 1) d[`g${i}`] = "";
    d.taxRate = "21";
    d.wacc = "9";
    d.terminalGrowth = "2.5";
    d.nwcPctRevenueChange = "10";
    d.otherAdjustments = "0";
    return d;
  }
  d.baseRevenue = missing.includes("baseRevenue") ? "" : String(Math.round(inputs.baseRevenue));
  inputs.revenueGrowth.forEach((g, i) => (d[`g${i}`] = pct(g)));
  d.operatingMargin = missing.includes("operatingMargin") ? "" : pct(Array.isArray(inputs.operatingMargin) ? inputs.operatingMargin[0] : inputs.operatingMargin);
  d.taxRate = pct(inputs.taxRate);
  d.daPctRevenue = missing.includes("daPctRevenue") ? "" : pct(inputs.daPctRevenue);
  d.capexPctRevenue = missing.includes("capexPctRevenue") ? "" : pct(inputs.capexPctRevenue);
  d.nwcPctRevenueChange = pct(inputs.nwcPctRevenueChange);
  d.wacc = pct(inputs.wacc);
  d.terminalGrowth = pct(inputs.terminalGrowth);
  d.cash = missing.includes("cash") ? "" : String(Math.round(inputs.cash));
  d.debt = missing.includes("debt") ? "" : String(Math.round(inputs.debt));
  d.otherAdjustments = String(Math.round(inputs.otherAdjustments));
  d.dilutedShares = missing.includes("dilutedShares") ? "" : String(Math.round(inputs.dilutedShares));
  d.currentPrice = inputs.currentPrice === null || inputs.currentPrice === undefined ? "" : String(inputs.currentPrice);
  return d;
}

function parseDraft(d: Draft, midYear: boolean): { inputs: DcfInputs | null; missing: string[] } {
  const num = (k: string) => {
    const v = d[k]?.replace(/[,$\s]/g, "");
    if (v === undefined || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? (PCT_FIELDS.has(k) || k.startsWith("g") ? n / 100 : n) : null;
  };
  const missing: string[] = [];
  const req = (k: string) => {
    const v = num(k);
    if (v === null) missing.push(k);
    return v ?? 0;
  };
  const growth = [0, 1, 2, 3, 4].map((i) => req(`g${i}`));
  const inputs: DcfInputs = {
    baseRevenue: req("baseRevenue"),
    revenueGrowth: growth,
    operatingMargin: req("operatingMargin"),
    taxRate: req("taxRate"),
    daPctRevenue: req("daPctRevenue"),
    capexPctRevenue: req("capexPctRevenue"),
    nwcPctRevenueChange: req("nwcPctRevenueChange"),
    wacc: req("wacc"),
    terminalGrowth: req("terminalGrowth"),
    cash: req("cash"),
    debt: req("debt"),
    otherAdjustments: num("otherAdjustments") ?? 0,
    dilutedShares: req("dilutedShares"),
    currentPrice: num("currentPrice"),
    midYearConvention: midYear,
  };
  return { inputs: missing.length ? null : inputs, missing };
}

const FIELD_LABELS: Record<string, string> = {
  baseRevenue: "Starting revenue",
  g0: "Growth year 1",
  g1: "Growth year 2",
  g2: "Growth year 3",
  g3: "Growth year 4",
  g4: "Growth year 5",
  operatingMargin: "Operating margin",
  taxRate: "Tax rate",
  daPctRevenue: "D&A, % of revenue",
  capexPctRevenue: "Capex, % of revenue",
  nwcPctRevenueChange: "Working capital, % of revenue change",
  wacc: "WACC",
  terminalGrowth: "Terminal growth",
  cash: "Cash and investments",
  debt: "Total debt",
  otherAdjustments: "Other equity adjustments",
  dilutedShares: "Diluted shares",
  currentPrice: "Current price",
};

const SOURCE_TONE: Record<string, { tone: BadgeTone; label: string }> = {
  reported: { tone: "accent", label: "Reported" },
  calculated: { tone: "neutral", label: "Calculated" },
  assumption: { tone: "warning", label: "Assumption" },
  missing: { tone: "negative", label: "Missing" },
  user: { tone: "outline", label: "Your input" },
};

export function ValuationTab({ symbol, defaults, scenarios, price, priceDate, sectorProfile, isEtf }: { symbol: string; defaults: DcfDefaults | null; scenarios: DcfScenarioRow[]; price: number | null; priceDate: string | null; sectorProfile: SectorProfile; isEtf: boolean }) {
  const router = useRouter();
  const initial = React.useMemo(() => toDraft(defaults?.inputs ?? null, defaults?.missing ?? []), [defaults]);
  const [draft, setDraft] = React.useState<Draft>(initial);
  const [midYear, setMidYear] = React.useState(false);
  const [touched, setTouched] = React.useState<Set<string>>(new Set());
  const [target, setTarget] = React.useState<ReverseDcfTarget>("revenueGrowth");
  const [saveOpen, setSaveOpen] = React.useState(false);
  const [saveName, setSaveName] = React.useState("");
  const [saveKind, setSaveKind] = React.useState("custom");
  const [pending, start] = React.useTransition();

  const { inputs, missing } = React.useMemo(() => parseDraft(draft, midYear), [draft, midYear]);
  const result: DcfResult | null = React.useMemo(() => (inputs ? runDcf(inputs) : null), [inputs]);
  const scenarioResults = React.useMemo(() => {
    if (!inputs) return null;
    const s = deriveScenarios(inputs);
    return { bear: { inputs: s.bear, result: runDcf(s.bear) }, base: { inputs: s.base, result: runDcf(s.base) }, bull: { inputs: s.bull, result: runDcf(s.bull) } };
  }, [inputs]);
  const grid = React.useMemo(() => {
    if (!inputs) return null;
    const waccs = [-0.02, -0.01, 0, 0.01, 0.02].map((d) => inputs.wacc + d).filter((w) => w > 0);
    const gs = [-0.01, -0.005, 0, 0.005, 0.01].map((d) => inputs.terminalGrowth + d);
    return { waccs, gs, cells: sensitivityGrid(inputs, waccs, gs) };
  }, [inputs]);
  const reverse = React.useMemo(() => (inputs && inputs.currentPrice ? reverseDcf(inputs, target, inputs.currentPrice) : null), [inputs, target]);

  if (isEtf) return <EmptyState title="Valuation does not apply to funds" description="An enterprise DCF values an operating business. For a fund, look at its holdings, expense ratio and the companies it owns." />;

  const set = (k: string, v: string) => {
    setDraft((d) => ({ ...d, [k]: v }));
    setTouched((t) => new Set(t).add(k));
  };
  const provenance = (k: string) => {
    if (touched.has(k)) return SOURCE_TONE.user;
    const key = k.startsWith("g") ? "revenueGrowth" : k;
    const p = defaults?.provenance[key];
    if (!p) return k === "currentPrice" ? { tone: "accent" as BadgeTone, label: "Quote" } : SOURCE_TONE.assumption;
    return SOURCE_TONE[p.source] ?? SOURCE_TONE.assumption;
  };
  const provenanceDetail = (k: string) => {
    const key = k.startsWith("g") ? "revenueGrowth" : k;
    return touched.has(k) ? "Entered by you in this session." : (defaults?.provenance[key]?.detail ?? (k === "currentPrice" ? `Latest stored price${priceDate ? ` (${formatDate(priceDate)})` : ""}.` : "Assumption."));
  };
  const applyInputs = (next: DcfInputs) => {
    setDraft(toDraft(next, []));
    setTouched(new Set(Object.keys(FIELD_LABELS)));
  };
  const loadScenario = (row: DcfScenarioRow) => {
    try {
      const saved = JSON.parse(row.inputs) as Partial<DcfInputs>;
      const merged: DcfInputs = { ...(inputs ?? defaults?.inputs ?? ({} as DcfInputs)), ...saved, currentPrice: price } as DcfInputs;
      applyInputs(merged);
      setMidYear(!!merged.midYearConvention);
      toast.success(`Loaded "${row.name}".`);
    } catch {
      toast.error("This saved scenario could not be read.");
    }
  };
  const save = () => {
    if (!inputs) return;
    start(async () => {
      const res = await saveScenarioAction(symbol, saveName, saveKind, inputs);
      toast[res.ok ? "success" : "error"](res.message);
      if (res.ok) {
        setSaveOpen(false);
        setSaveName("");
        router.refresh();
      }
    });
  };

  const numField = (k: string, opts: { unit?: string; step?: string; hint?: string } = {}) => {
    const prov = provenance(k);
    return (
      <div key={k} className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-2">
          <label htmlFor={`dcf-${k}`} className="text-xs font-medium text-fg-secondary">
            {FIELD_LABELS[k]}
          </label>
          <span className="flex items-center gap-1">
            <Badge tone={prov.tone}>{prov.label}</Badge>
            <ExplainButton detail={{ title: FIELD_LABELS[k], definition: provenanceDetail(k), status: prov.label === "Reported" ? "reported" : prov.label === "Calculated" ? "calculated" : "assumption", units: opts.unit === "%" ? "Percent" : "US dollars or shares, as entered", notes: opts.hint ? [opts.hint] : [] }} />
          </span>
        </div>
        <div className="relative">
          <Input id={`dcf-${k}`} inputMode="decimal" value={draft[k] ?? ""} onChange={(e) => set(k, e.target.value)} className={cn("num pr-8", !draft[k] && "border-negative")} aria-invalid={!draft[k]} placeholder={!draft[k] ? "required" : undefined} />
          {opts.unit ? <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-fg-muted">{opts.unit}</span> : null}
        </div>
      </div>
    );
  };

  const ok = result?.ok ? result : null;
  const upside = ok?.impliedUpside ?? null;

  return (
    <div className="flex flex-col gap-5">
      {!sectorProfile.dcfSupported ? <EmptyState tone="warning" title={`An enterprise DCF is not suitable for a ${sectorProfile.label.toLowerCase()}`} description={`${sectorProfile.notes[0] ?? ""} You can still run the model with your own inputs, but treat the output as not meaningful for this business.`} /> : null}
      {defaults?.missing.length ? <EmptyState tone="warning" title="Some reported inputs are missing" description={`Ledger will not invent them. Enter ${defaults.missing.map((m) => FIELD_LABELS[m] ?? m).join(", ")} yourself; the field badge will show it as your input.`} /> : null}
      <p className="text-sm text-fg-secondary">
        Enterprise DCF on unlevered free cash flow: FCFF = EBIT x (1 - tax) + D&amp;A - capex - change in working capital. Every output is an assumption-dependent estimate, not a price target. Defaults start from {defaults?.basisLabel ? `${defaults.basisLabel} figures` : "reported figures where available"}; growth, WACC and terminal growth are placeholders for you to set.
      </p>

      <div className="grid gap-5 xl:grid-cols-[380px_minmax(0,1fr)]">
        <div className="flex flex-col gap-4">
          <Panel>
            <PanelHeader title="Assumptions" description="Edit any input; results update immediately." />
            <PanelBody className="flex flex-col gap-4">
              <fieldset className="flex flex-col gap-3">
                <legend className="mb-1 text-[11px] font-medium uppercase tracking-wide text-fg-muted">Revenue and margin</legend>
                {numField("baseRevenue", { unit: "$" })}
                <div className="grid grid-cols-5 gap-1.5">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <div key={i} className="flex flex-col gap-1">
                      <label htmlFor={`dcf-g${i}`} className="text-[11px] text-fg-muted">
                        Y{i + 1} growth
                      </label>
                      <div className="relative">
                        <Input id={`dcf-g${i}`} inputMode="decimal" value={draft[`g${i}`] ?? ""} onChange={(e) => set(`g${i}`, e.target.value)} className={cn("num px-1.5 pr-4 text-[12px]", !draft[`g${i}`] && "border-negative")} aria-label={`Revenue growth year ${i + 1} percent`} />
                        <span className="pointer-events-none absolute inset-y-0 right-1 flex items-center text-[10px] text-fg-muted">%</span>
                      </div>
                    </div>
                  ))}
                </div>
                <p className="text-[11px] text-fg-muted">
                  Growth path: {provenance("g0").label} · {provenanceDetail("g0")}
                </p>
                {numField("operatingMargin", { unit: "%" })}
              </fieldset>
              <fieldset className="flex flex-col gap-3">
                <legend className="mb-1 text-[11px] font-medium uppercase tracking-wide text-fg-muted">Cash conversion</legend>
                {numField("taxRate", { unit: "%" })}
                {numField("daPctRevenue", { unit: "%" })}
                {numField("capexPctRevenue", { unit: "%" })}
                {numField("nwcPctRevenueChange", { unit: "%", hint: "Share of each year's revenue increase absorbed by receivables, inventory and payables." })}
              </fieldset>
              <fieldset className="flex flex-col gap-3">
                <legend className="mb-1 text-[11px] font-medium uppercase tracking-wide text-fg-muted">Discounting</legend>
                {numField("wacc", { unit: "%" })}
                {numField("terminalGrowth", { unit: "%", hint: "Must stay below WACC." })}
                <label className="flex items-center gap-2 text-sm text-fg-secondary">
                  <input type="checkbox" checked={midYear} onChange={(e) => setMidYear(e.target.checked)} className="h-4 w-4 accent-[var(--accent)]" />
                  Mid-year discounting convention
                </label>
              </fieldset>
              <fieldset className="flex flex-col gap-3">
                <legend className="mb-1 text-[11px] font-medium uppercase tracking-wide text-fg-muted">Equity bridge</legend>
                {numField("cash", { unit: "$" })}
                {numField("debt", { unit: "$" })}
                {numField("otherAdjustments", { unit: "$", hint: "Positive adds to equity (non-operating assets); negative subtracts (minority interest, preferred stock)." })}
                {numField("dilutedShares")}
                {numField("currentPrice", { unit: "$" })}
              </fieldset>
              <Button variant="ghost" size="sm" onClick={() => { setDraft(initial); setTouched(new Set()); setMidYear(false); }}>
                Reset to defaults
              </Button>
            </PanelBody>
          </Panel>
        </div>

        <div className="flex flex-col gap-5">
          {!inputs ? (
            <EmptyState tone="warning" title="Fill in the required inputs to run the model" description={`Missing: ${missing.map((m) => FIELD_LABELS[m] ?? m).join(", ")}.`} />
          ) : result && !result.ok ? (
            <EmptyState tone="negative" title="The model cannot run with these inputs" description={<ul className="list-disc pl-4">{result.errors.map((e) => <li key={e.field + e.message}>{e.message}</li>)}</ul>} />
          ) : ok ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className={cn("rounded-md border border-border bg-panel px-4 py-3 sm:col-span-2", ok.equityNegative && "border-negative/50")}>
                  <div className="flex items-center justify-between gap-2 text-xs text-fg-muted">
                    Estimated value per share
                    <ExplainButton detail={{ title: "Estimated value per share", value: formatMoney(ok.valuePerShare), definition: "Equity value divided by diluted shares, where equity value is enterprise value minus debt plus cash and other adjustments.", status: "assumption", source: { provider: "DCF model with your assumptions", derivation: ok.assumptions.join(" ") }, limitations: ["Assumption-dependent estimate. Small changes in WACC or terminal growth move it a lot; see the sensitivity grid.", ...ok.warnings] }} />
                  </div>
                  <div className="mt-1 flex flex-wrap items-baseline gap-3">
                    <span className={cn("num-sans text-3xl font-medium tracking-tight", ok.equityNegative ? "text-negative" : "text-fg")}>{formatMoney(ok.valuePerShare)}</span>
                    {upside !== null && inputs.currentPrice ? (
                      <span className="text-sm text-fg-secondary">
                        vs price {formatMoney(inputs.currentPrice)} <Delta value={upside} kind="pct" />
                      </span>
                    ) : (
                      <span className="text-sm text-fg-muted">No current price to compare</span>
                    )}
                  </div>
                  {ok.equityNegative ? <p className="mt-1 text-xs text-negative">Equity value is negative under these assumptions: claims on the business exceed its estimated enterprise value.</p> : null}
                </div>
                <Stat label="Enterprise value" value={formatMoneyCompact(ok.enterpriseValue)} sub={`PV of cash flows ${formatMoneyCompact(ok.sumPvFcff)}`} />
                <Stat label="Terminal value share" value={ok.terminalShareOfEv === null ? "n/a" : formatPct(ok.terminalShareOfEv)} sub={`PV of terminal value ${formatMoneyCompact(ok.pvTerminalValue)}`} warn={ok.terminalShareOfEv !== null && ok.terminalShareOfEv > 0.75} />
              </div>
              {ok.warnings.length ? (
                <ul className="list-disc space-y-1 rounded-md border border-warning/40 bg-warning-soft/40 px-6 py-3 text-xs text-fg-secondary">
                  {ok.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              ) : null}

              <Panel>
                <PanelHeader title="Projection" description={`${ok.years.length}-year forecast; ${midYear ? "mid-year" : "end-of-year"} discounting at ${formatPct(inputs.wacc, { digits: 2 })} WACC.`} />
                <PanelBody className="px-0 pb-0">
                  <TableScroll label="DCF projection">
                    <Table>
                      <thead>
                        <tr>
                          <Th>Year</Th>
                          <Th align="right">Revenue</Th>
                          <Th align="right">Growth</Th>
                          <Th align="right">EBIT</Th>
                          <Th align="right">NOPAT</Th>
                          <Th align="right">D&amp;A</Th>
                          <Th align="right">Capex</Th>
                          <Th align="right">ΔNWC</Th>
                          <Th align="right">FCFF</Th>
                          <Th align="right">Discount</Th>
                          <Th align="right">PV</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {ok.years.map((y) => (
                          <Tr key={y.year}>
                            <Td numeric>{y.year}</Td>
                            <Td align="right" numeric>{formatMoneyCompact(y.revenue)}</Td>
                            <Td align="right" numeric>{formatPct(y.growth)}</Td>
                            <Td align="right" numeric>{formatMoneyCompact(y.ebit)}</Td>
                            <Td align="right" numeric>{formatMoneyCompact(y.nopat)}</Td>
                            <Td align="right" numeric>{formatMoneyCompact(y.da)}</Td>
                            <Td align="right" numeric>{formatMoneyCompact(y.capex)}</Td>
                            <Td align="right" numeric>{formatMoneyCompact(y.deltaNwc)}</Td>
                            <Td align="right" numeric className={y.fcff < 0 ? "text-negative" : ""}>{formatMoneyCompact(y.fcff)}</Td>
                            <Td align="right" numeric>{y.discountFactor.toFixed(3)}</Td>
                            <Td align="right" numeric>{formatMoneyCompact(y.presentValue)}</Td>
                          </Tr>
                        ))}
                        <Tr>
                          <Td colSpan={8} className="text-fg-secondary">Terminal value: final FCFF x (1 + g) / (WACC - g) = {formatMoneyCompact(ok.terminalValue)}</Td>
                          <Td align="right" numeric>{formatMoneyCompact(ok.terminalValue)}</Td>
                          <Td align="right" numeric>{(ok.pvTerminalValue / ok.terminalValue).toFixed(3)}</Td>
                          <Td align="right" numeric>{formatMoneyCompact(ok.pvTerminalValue)}</Td>
                        </Tr>
                        <Tr>
                          <Td colSpan={10} className="font-medium">Enterprise value - debt {formatMoneyCompact(inputs.debt)} + cash {formatMoneyCompact(inputs.cash)} {inputs.otherAdjustments >= 0 ? "+" : "-"} other {formatMoneyCompact(Math.abs(inputs.otherAdjustments))} = equity {formatMoneyCompact(ok.equityValue)} / {formatCompact(inputs.dilutedShares)} shares</Td>
                          <Td align="right" numeric className="font-medium">{formatMoney(ok.valuePerShare)}</Td>
                        </Tr>
                      </tbody>
                    </Table>
                  </TableScroll>
                </PanelBody>
              </Panel>

              <div className="grid gap-5 lg:grid-cols-2">
                <Panel>
                  <PanelHeader title="Scenarios" description="Bear and bull cases shift growth by 4 points, margin by 3 points, WACC by 1 point and terminal growth by 0.5 points from your base case. Apply one to edit it." />
                  <PanelBody>
                    {scenarioResults ? (
                      <ul className="grid gap-2 sm:grid-cols-3">
                        {(["bear", "base", "bull"] as const).map((k) => {
                          const s = scenarioResults[k];
                          const r = s.result;
                          return (
                            <li key={k} className="rounded-md border border-border bg-panel-sunken/50 p-3">
                              <div className="text-xs capitalize text-fg-muted">{k}</div>
                              <div className={cn("num-sans text-xl font-medium", r.ok && r.equityNegative ? "text-negative" : "text-fg")}>{r.ok ? formatMoney(r.valuePerShare) : "n/a"}</div>
                              <div className="text-[11px] text-fg-muted">{r.ok && inputs.currentPrice ? formatPct(r.valuePerShare / inputs.currentPrice - 1, { signed: true }) + " vs price" : r.ok ? "" : r.errors[0]?.message}</div>
                              <div className="mt-1 text-[11px] text-fg-muted">g {formatPct(s.inputs.revenueGrowth[0])}→{formatPct(s.inputs.revenueGrowth[4])} · margin {formatPct(Array.isArray(s.inputs.operatingMargin) ? s.inputs.operatingMargin[0] : s.inputs.operatingMargin)} · WACC {formatPct(s.inputs.wacc, { digits: 2 })}</div>
                              {k !== "base" ? (
                                <Button variant="ghost" size="sm" className="mt-1 px-1" onClick={() => applyInputs(s.inputs)}>
                                  Apply as inputs
                                </Button>
                              ) : null}
                            </li>
                          );
                        })}
                      </ul>
                    ) : null}
                  </PanelBody>
                </Panel>
                <Panel>
                  <PanelHeader title="Reverse DCF" description="Solve for the one assumption that reproduces the current price, holding every other input fixed." />
                  <PanelBody className="flex flex-col gap-3">
                    <Field label="Solve for" htmlFor="dcf-target">
                      <Select id="dcf-target" value={target} onChange={(e) => setTarget(e.target.value as ReverseDcfTarget)}>
                        {(Object.keys(REVERSE_DCF_TARGETS) as ReverseDcfTarget[]).map((t) => (
                          <option key={t} value={t}>
                            {REVERSE_DCF_TARGETS[t].label}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <p className="text-xs text-fg-muted">{REVERSE_DCF_TARGETS[target].description}</p>
                    {!inputs.currentPrice ? (
                      <p className="text-sm text-fg-muted">Enter a current price to solve.</p>
                    ) : reverse?.ok ? (
                      <div className="rounded-md border border-border bg-panel-sunken/50 p-3">
                        <div className="text-xs text-fg-muted">Implied {REVERSE_DCF_TARGETS[target].label.toLowerCase()}</div>
                        <div className="num-sans text-2xl font-medium text-fg">{formatPct(reverse.value, { digits: 2 })}</div>
                        <p className="mt-1 text-xs text-fg-secondary">
                          At this value the model returns {formatMoney(reverse.result.valuePerShare)} per share, matching the price of {formatMoney(inputs.currentPrice)} ({reverse.iterations} bisection steps).
                          {target === "revenueGrowth" ? ` Your current path averages ${formatPct(inputs.revenueGrowth.reduce((a, b) => a + b, 0) / inputs.revenueGrowth.length)}.` : ""}
                        </p>
                      </div>
                    ) : reverse ? (
                      <p className="text-sm text-warning">{reverse.reason}</p>
                    ) : null}
                  </PanelBody>
                </Panel>
              </div>

              {grid ? (
                <Panel>
                  <PanelHeader title="Sensitivity: WACC versus terminal growth" description={`Value per share. Colour shows upside (green) or downside (red) against the ${inputs.currentPrice ? `current price of ${formatMoney(inputs.currentPrice)}` : "base case"}; the outlined cell is your base case.`} />
                  <PanelBody>
                    <Heatmap
                      rowHeader="WACC"
                      colHeader="Terminal growth"
                      rowLabels={grid.waccs.map((w) => formatPct(w, { digits: 1 }))}
                      colLabels={grid.gs.map((g) => formatPct(g, { digits: 1 }))}
                      center={inputs.currentPrice ?? ok.valuePerShare}
                      maxAbs={(inputs.currentPrice ?? ok.valuePerShare) * 0.6}
                      caption={`Sensitivity of value per share to WACC (rows) and terminal growth (columns) for ${symbol}`}
                      cells={grid.cells.map((row) =>
                        row.map((c) => ({
                          value: c.valuePerShare,
                          label: c.valuePerShare === null ? "n/a" : formatMoney(c.valuePerShare, { whole: true }),
                          title: c.error ?? `WACC ${formatPct(c.wacc, { digits: 2 })}, g ${formatPct(c.terminalGrowth, { digits: 2 })}${c.valuePerShare !== null && inputs.currentPrice ? `: ${formatPct(c.valuePerShare / inputs.currentPrice - 1, { signed: true })} vs price` : ""}`,
                          emphasis: Math.abs(c.wacc - inputs.wacc) < 1e-9 && Math.abs(c.terminalGrowth - inputs.terminalGrowth) < 1e-9,
                        })),
                      )}
                    />
                  </PanelBody>
                </Panel>
              ) : null}

              <Panel>
                <PanelHeader title="Assumptions in force" />
                <PanelBody>
                  <ul className="list-disc space-y-1 pl-4 text-sm text-fg-secondary">
                    {ok.assumptions.map((a) => (
                      <li key={a}>{a}</li>
                    ))}
                    <li>Reported inputs come from the latest filings in the Financials tab; placeholders are labelled as assumptions on each field.</li>
                  </ul>
                </PanelBody>
              </Panel>
            </>
          ) : null}

          <Panel>
            <PanelHeader title="Saved scenarios" description="Store a set of assumptions to revisit later." actions={<Button variant="secondary" size="sm" onClick={() => setSaveOpen(true)} disabled={!inputs}>Save current</Button>} />
            <PanelBody>
              {scenarios.length === 0 ? (
                <p className="text-sm text-fg-muted">No saved scenarios for {symbol}.</p>
              ) : (
                <ul className="divide-y divide-border/70 text-[13px]">
                  {scenarios.map((s) => (
                    <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                      <div>
                        <span className="font-medium text-fg">{s.name}</span> <Badge tone="outline">{s.kind}</Badge>
                        <div className="text-xs text-fg-muted">Updated {formatDateTime(s.updatedAt)}</div>
                      </div>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" onClick={() => loadScenario(s)}>
                          Load
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-negative"
                          disabled={pending}
                          onClick={() =>
                            start(async () => {
                              const res = await deleteScenarioAction(symbol, s.id);
                              toast[res.ok ? "success" : "error"](res.message);
                              router.refresh();
                            })
                          }
                        >
                          Delete
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </PanelBody>
          </Panel>
        </div>
      </div>

      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent title="Save scenario" description="Saves the current assumptions for this company.">
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
          >
            <Field label="Name" htmlFor="sc-name">
              <Input id="sc-name" value={saveName} onChange={(e) => setSaveName(e.target.value)} required maxLength={80} autoComplete="off" />
            </Field>
            <Field label="Kind" htmlFor="sc-kind">
              <Select id="sc-kind" value={saveKind} onChange={(e) => setSaveKind(e.target.value)}>
                <option value="custom">Custom</option>
                <option value="base">Base</option>
                <option value="bear">Bear</option>
                <option value="bull">Bull</option>
              </Select>
            </Field>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setSaveOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={pending || !saveName.trim()}>
                Save
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Stat({ label, value, sub, warn }: { label: string; value: string; sub?: string; warn?: boolean }) {
  return (
    <div className={cn("rounded-md border border-border bg-panel px-4 py-3", warn && "border-warning/50")}>
      <div className="text-xs text-fg-muted">{label}</div>
      <div className="num-sans mt-1 text-xl font-medium text-fg">{value}</div>
      {sub ? <div className="text-[11px] text-fg-muted">{sub}</div> : null}
    </div>
  );
}
