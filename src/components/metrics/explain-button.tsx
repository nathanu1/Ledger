"use client";

import { Info } from "@phosphor-icons/react";
import { cn } from "@/lib/cn";
import { useExplain, type ExplainDetail } from "./explain-context";

export function ExplainButton({ detail, className, label }: { detail: ExplainDetail; className?: string; label?: string }) {
  const { open } = useExplain();
  return (
    <button
      type="button"
      onClick={() => open(detail)}
      aria-label={label ?? `Explain ${detail.title}`}
      className={cn("inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-sm text-fg-muted hover:bg-panel-raised hover:text-accent focus-visible:outline-2 focus-visible:outline-focus", className)}
    >
      <Info size={14} aria-hidden />
    </button>
  );
}
