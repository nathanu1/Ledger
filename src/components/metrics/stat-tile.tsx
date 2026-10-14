import * as React from "react";
import { cn } from "@/lib/cn";
import type { ExplainDetail } from "./explain-context";
import { ExplainButton } from "./explain-button";

export function StatTile({ label, value, sub, explain, className, tone }: { label: string; value: React.ReactNode; sub?: React.ReactNode; explain?: ExplainDetail; className?: string; tone?: "default" | "muted" }) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1 rounded-md border border-border bg-panel px-4 py-3", className)}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs leading-4 text-fg-muted">{label}</span>
        {explain ? <ExplainButton detail={explain} /> : null}
      </div>
      <div className={cn("font-sans text-[22px] font-medium leading-7 tracking-tight", tone === "muted" ? "text-fg-secondary" : "text-fg")}>{value}</div>
      {sub ? <div className="text-xs text-fg-secondary leading-4">{sub}</div> : null}
    </div>
  );
}
