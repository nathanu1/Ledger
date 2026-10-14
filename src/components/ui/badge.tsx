import * as React from "react";
import { cn } from "@/lib/cn";

export type BadgeTone = "neutral" | "accent" | "positive" | "negative" | "warning" | "outline";

const tones: Record<BadgeTone, string> = {
  neutral: "bg-panel-raised text-fg-secondary border-border",
  accent: "bg-accent-soft text-accent border-transparent",
  positive: "bg-positive-soft text-positive border-transparent",
  negative: "bg-negative-soft text-negative border-transparent",
  warning: "bg-warning-soft text-warning border-transparent",
  outline: "bg-transparent text-fg-secondary border-border-strong",
};

export function Badge({ tone = "neutral", className, ...props }: React.HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  return <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-sm border px-1.5 py-0.5 text-[11px] font-medium leading-4", tones[tone], className)} {...props} />;
}
