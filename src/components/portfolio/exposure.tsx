import type { SectorExposure } from "@/calc/risk";
import { EmptyState } from "@/components/ui/empty";
import { formatPct } from "@/lib/format";

export function ExposureList({ exposure }: { exposure: SectorExposure }) {
  if (exposure.sectors.length === 0 && exposure.unavailableLookThroughWeight === 0) return <EmptyState title="No sector data" description="Sectors come from the security profile (SIC-derived in connected mode)." />;
  const max = Math.max(...exposure.sectors.map((s) => s.weight), exposure.cashWeight, exposure.unavailableLookThroughWeight, 0.0001);
  const rows = [
    ...exposure.sectors.map((s) => ({ label: s.sector, weight: s.weight, note: s.source === "mixed" ? "includes fund look-through" : null, tone: "series" as const })),
    ...(exposure.unavailableLookThroughWeight > 0 ? [{ label: "Funds without holdings data", weight: exposure.unavailableLookThroughWeight, note: `${exposure.unavailableLookThroughSymbols.join(", ")}: look-through unavailable`, tone: "muted" as const }] : []),
    ...(exposure.unclassifiedWeight > 0 ? [{ label: "Unclassified", weight: exposure.unclassifiedWeight, note: null, tone: "muted" as const }] : []),
    ...(exposure.cashWeight > 0 ? [{ label: "Cash", weight: exposure.cashWeight, note: null, tone: "muted" as const }] : []),
  ];
  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li key={r.label} className="grid grid-cols-[minmax(0,1fr)_56px] items-center gap-3 text-[13px]">
          <div className="min-w-0">
            <div className="flex items-baseline justify-between gap-2">
              <span className="truncate text-fg">{r.label}</span>
              {r.note ? <span className="truncate text-[11px] text-fg-muted">{r.note}</span> : null}
            </div>
            <div className="mt-1 h-1.5 rounded-full" aria-hidden style={{ width: `${Math.max((r.weight / max) * 100, 1)}%`, background: r.tone === "muted" ? "var(--series-muted)" : "var(--series-1)" }} />
          </div>
          <span className="num text-right text-fg-secondary">{formatPct(r.weight)}</span>
        </li>
      ))}
    </ul>
  );
}
