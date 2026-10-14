import Link from "next/link";
import { PERIOD_KEYS, PERIOD_LABELS, type PeriodKey } from "@/calc/periods";
import { cn } from "@/lib/cn";

export function PeriodSelector({ current, basePath, params, keys = PERIOD_KEYS }: { current: PeriodKey; basePath: string; params?: Record<string, string | undefined>; keys?: readonly PeriodKey[] }) {
  return (
    <nav aria-label="Period" className="flex items-center gap-0.5 rounded-md border border-border p-0.5">
      {keys.map((k) => {
        const sp = new URLSearchParams();
        for (const [key, v] of Object.entries(params ?? {})) if (v) sp.set(key, v);
        sp.set("period", k);
        const active = k === current;
        return (
          <Link
            key={k}
            href={`${basePath}?${sp.toString()}`}
            aria-current={active ? "page" : undefined}
            aria-label={PERIOD_LABELS[k]}
            className={cn("num rounded-sm px-2 py-1 text-xs transition-colors focus-visible:outline-2 focus-visible:outline-focus", active ? "bg-panel-raised text-fg font-medium" : "text-fg-muted hover:text-fg")}
          >
            {k}
          </Link>
        );
      })}
    </nav>
  );
}
