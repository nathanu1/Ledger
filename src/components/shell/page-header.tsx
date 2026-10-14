import * as React from "react";
import { cn } from "@/lib/cn";

export function PageHeader({ title, description, actions, eyebrow, className }: { title: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode; eyebrow?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="min-w-0">
        {eyebrow ? <div className="mb-1 text-xs text-fg-muted">{eyebrow}</div> : null}
        <h1 className="text-xl font-semibold tracking-tight text-fg sm:text-[22px]">{title}</h1>
        {description ? <p className="mt-1 max-w-[70ch] text-sm text-fg-secondary">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
