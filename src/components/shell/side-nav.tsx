"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Buildings, ChartLineUp, Funnel, Gear, ListMagnifyingGlass, Notebook, ShieldCheck, SquaresFour } from "@phosphor-icons/react";
import { cn } from "@/lib/cn";
import { NAV_ITEMS, type NavItem } from "./nav-items";

const ICONS: Record<NavItem["icon"], React.ComponentType<{ size?: number; weight?: "regular" | "fill" | "bold" | "duotone"; "aria-hidden"?: boolean }>> = {
  overview: SquaresFour,
  portfolio: ChartLineUp,
  company: Buildings,
  risk: ShieldCheck,
  watchlist: ListMagnifyingGlass,
  screener: Funnel,
  theses: Notebook,
  settings: Gear,
};

export function SideNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Primary" className="hidden lg:flex lg:w-[200px] lg:shrink-0 lg:flex-col lg:border-r lg:border-border lg:bg-panel-sunken/40">
      <div className="flex h-14 items-center gap-2 px-4">
        <Link href="/" className="flex items-center gap-2 rounded-md focus-visible:outline-2 focus-visible:outline-focus">
          <span aria-hidden className="grid h-6 w-6 place-items-center rounded-sm bg-accent text-accent-contrast font-mono text-[12px] font-semibold">
            L
          </span>
          <span className="text-[15px] font-semibold tracking-tight text-fg">Ledger</span>
        </Link>
      </div>
      <ul className="flex flex-col gap-0.5 px-2 pt-1">
        {NAV_ITEMS.map((item) => {
          const Icon = ICONS[item.icon];
          const active = item.match(pathname);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-9 items-center gap-2.5 rounded-md px-2.5 text-[13px] transition-colors focus-visible:outline-2 focus-visible:outline-focus",
                  active ? "bg-accent-soft text-fg font-medium" : "text-fg-secondary hover:bg-panel-raised hover:text-fg",
                )}
              >
                <Icon size={17} weight={active ? "fill" : "regular"} aria-hidden />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
      <div className="mt-auto px-4 py-4 text-[11px] leading-4 text-fg-muted">
        Figures are estimates built from the transaction ledger and public filings. Not investment advice.
      </div>
    </nav>
  );
}

export function MobileNav() {
  const pathname = usePathname();
  const items = NAV_ITEMS.filter((i) => ["/", "/portfolio", "/watchlist", "/risk", "/settings"].includes(i.href));
  return (
    <nav aria-label="Primary" className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-panel pb-[env(safe-area-inset-bottom)] lg:hidden">
      <ul className="grid grid-cols-5">
        {items.map((item) => {
          const Icon = ICONS[item.icon];
          const active = item.match(pathname);
          return (
            <li key={item.href}>
              <Link href={item.href} aria-current={active ? "page" : undefined} className={cn("flex h-14 flex-col items-center justify-center gap-0.5 text-[10.5px]", active ? "text-accent" : "text-fg-muted")}>
                <Icon size={20} weight={active ? "fill" : "regular"} aria-hidden />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
