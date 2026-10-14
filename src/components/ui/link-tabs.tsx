import Link from "next/link";
import { cn } from "@/lib/cn";

export function LinkTabs({ tabs, current, hrefFor, label }: { tabs: Array<{ key: string; label: string }>; current: string; hrefFor: (key: string) => string; label: string }) {
  return (
    <nav aria-label={label} className="flex items-center gap-1 overflow-x-auto scrollbar-thin border-b border-border">
      {tabs.map((t) => {
        const active = t.key === current;
        return (
          <Link
            key={t.key}
            href={hrefFor(t.key)}
            aria-current={active ? "page" : undefined}
            className={cn("relative -mb-px h-9 whitespace-nowrap border-b-2 px-3 text-sm leading-9 transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus", active ? "border-accent text-fg" : "border-transparent text-fg-secondary hover:text-fg")}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
