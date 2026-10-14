import * as React from "react";
import { cn } from "@/lib/cn";

export function EmptyState({ title, description, action, className, tone = "neutral" }: { title: string; description?: React.ReactNode; action?: React.ReactNode; className?: string; tone?: "neutral" | "warning" | "negative" }) {
  return (
    <div
      role={tone === "negative" ? "alert" : undefined}
      className={cn(
        "flex flex-col items-start gap-2 rounded-md border border-dashed px-4 py-5 text-sm",
        tone === "warning" ? "border-warning/40 bg-warning-soft/40" : tone === "negative" ? "border-negative/40 bg-negative-soft/40" : "border-border-strong bg-panel-sunken/50",
        className,
      )}
    >
      <p className="font-medium text-fg">{title}</p>
      {description ? <p className="text-fg-secondary max-w-prose">{description}</p> : null}
      {action ? <div className="pt-1">{action}</div> : null}
    </div>
  );
}
