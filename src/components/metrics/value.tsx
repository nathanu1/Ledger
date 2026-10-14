import { cn } from "@/lib/cn";
import { formatMoney, formatMoneyCompact, formatPct, signLabel, type Numeric } from "@/lib/format";
import { ArrowDownRight, ArrowUpRight, Minus } from "@phosphor-icons/react/dist/ssr";

/**
 * Signed money or percentage with colour plus an icon and sign so meaning never
 * relies on colour alone.
 */
export function Delta({ value, kind = "money", digits, className, compact, hideIcon }: { value: Numeric; kind?: "money" | "pct"; digits?: number; className?: string; compact?: boolean; hideIcon?: boolean }) {
  const sign = signLabel(value);
  const text = kind === "money" ? (compact ? formatMoneyCompact(value, { signed: true }) : formatMoney(value, { signed: true })) : formatPct(value, { signed: true, digits });
  const Icon = sign === "positive" ? ArrowUpRight : sign === "negative" ? ArrowDownRight : Minus;
  return (
    <span className={cn("num inline-flex items-center gap-0.5 whitespace-nowrap", sign === "positive" && "text-positive", sign === "negative" && "text-negative", sign !== "positive" && sign !== "negative" && "text-fg-secondary", className)}>
      {!hideIcon && sign !== "unknown" ? <Icon size={12} weight="bold" aria-hidden /> : null}
      <span>{text}</span>
      <span className="sr-only">{sign === "positive" ? " (gain)" : sign === "negative" ? " (loss)" : ""}</span>
    </span>
  );
}

export function Missing({ reason, className }: { reason?: string; className?: string }) {
  return (
    <span className={cn("text-fg-muted", className)} title={reason} aria-label={reason ?? "Not available"}>
      {reason ? "n/a" : "n/a"}
    </span>
  );
}
