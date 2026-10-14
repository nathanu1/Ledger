import * as React from "react";
import { cn } from "@/lib/cn";

/** Horizontal-scroll wrapper so dense tables stay usable on narrow screens. */
export function TableScroll({ className, children, label }: { className?: string; children: React.ReactNode; label?: string }) {
  return (
    <div className={cn("w-full overflow-x-auto scrollbar-thin", className)} role="region" aria-label={label} tabIndex={0}>
      {children}
    </div>
  );
}

export function Table({ className, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  return <table className={cn("w-full text-[13px] leading-5", className)} {...props} />;
}

export function Th({ className, align = "left", ...props }: React.ThHTMLAttributes<HTMLTableCellElement> & { align?: "left" | "right" | "center" }) {
  return (
    <th
      scope="col"
      className={cn("sticky top-0 z-[1] bg-panel px-2 py-2 text-[11px] font-medium uppercase tracking-wide text-fg-muted whitespace-nowrap border-b border-border", align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left", className)}
      {...props}
    />
  );
}

export function Td({ className, align = "left", numeric, ...props }: React.TdHTMLAttributes<HTMLTableCellElement> & { align?: "left" | "right" | "center"; numeric?: boolean }) {
  return <td className={cn("px-2 py-2 border-b border-border/70 align-middle", align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left", numeric && "num", className)} {...props} />;
}

export function Tr({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn("hover:bg-panel-raised/60 transition-colors", className)} {...props} />;
}
