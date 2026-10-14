import Link from "next/link";
import { formatPct } from "@/lib/format";

/** Horizontal weight bars without a background track: bar length plus the printed value carry the meaning. */
export function WeightBars({ items, max }: { items: Array<{ symbol: string; name?: string; weight: number | null; href?: string }>; max?: number }) {
  const scale = max ?? Math.max(...items.map((i) => i.weight ?? 0), 0.0001);
  return (
    <ul className="space-y-2">
      {items.map((it) => (
        <li key={it.symbol} className="grid grid-cols-[minmax(0,1fr)_56px] items-center gap-3 text-[13px]">
          <div className="min-w-0">
            <div className="flex items-baseline justify-between gap-2">
              {it.href ? (
                <Link href={it.href} className="num font-medium text-fg hover:text-accent">
                  {it.symbol}
                </Link>
              ) : (
                <span className="num font-medium text-fg">{it.symbol}</span>
              )}
              {it.name ? <span className="truncate text-xs text-fg-muted">{it.name}</span> : null}
            </div>
            <div className="mt-1 h-1.5 rounded-full" aria-hidden style={{ width: `${Math.max(((it.weight ?? 0) / scale) * 100, 1)}%`, background: "var(--series-1)" }} />
          </div>
          <span className="num text-right text-fg-secondary">{it.weight === null ? "n/a" : formatPct(it.weight)}</span>
        </li>
      ))}
    </ul>
  );
}
