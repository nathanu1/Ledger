"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { MagnifyingGlass, Moon, Sun } from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Select } from "@/components/ui/field";
import { Tip } from "@/components/ui/tooltip";
import { formatDate, formatRelative } from "@/lib/format";
import { setActivePortfolio } from "@/app/actions/shell";
import { useMounted } from "@/lib/use-mounted";
import { CommandPalette } from "./command-palette";

export interface ShellData {
  mode: "demo" | "connected";
  asOf: string;
  freshness: { latestPriceDate: string | null; latestRetrievedAt: string | null; provider: string | null };
  portfolios: Array<{ id: string; name: string }>;
  activePortfolioId: string | null;
}

export function TopBar({ data }: { data: ShellData }) {
  const [paletteOpen, setPaletteOpen] = React.useState(false);
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const onPortfolioChange = (id: string) => {
    startTransition(async () => {
      await setActivePortfolio(id);
      router.refresh();
    });
  };

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-border bg-bg/90 px-3 backdrop-blur-sm sm:gap-3 sm:px-5">
      <a href="#main" className="sr-only-focusable">
        Skip to content
      </a>
      <span className="text-[15px] font-semibold tracking-tight text-fg lg:hidden">Ledger</span>
      <Button variant="secondary" size="sm" className="hidden min-w-[220px] justify-between text-fg-muted sm:flex" onClick={() => setPaletteOpen(true)} aria-label="Search tickers and commands">
        <span className="flex items-center gap-2">
          <MagnifyingGlass size={15} aria-hidden />
          Search tickers, pages, actions
        </span>
        <Kbd>⌘K</Kbd>
      </Button>
      <Button variant="ghost" size="icon" className="sm:hidden" onClick={() => setPaletteOpen(true)} aria-label="Search">
        <MagnifyingGlass size={18} aria-hidden />
      </Button>
      <div className="ml-auto flex items-center gap-2 sm:gap-3">
        {data.portfolios.length > 0 ? (
          <label className="flex items-center gap-2 text-xs text-fg-muted">
            <span className="hidden md:inline">Portfolio</span>
            <Select aria-label="Active portfolio" className="h-8 w-[150px] text-[13px] sm:w-[190px]" value={data.activePortfolioId ?? ""} onChange={(e) => onPortfolioChange(e.target.value)} disabled={pending}>
              {data.portfolios.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </label>
        ) : null}
        <Tip
          content={
            data.mode === "demo"
              ? `Fictional dataset fixed at ${formatDate(data.asOf)}. Nothing here is market data.`
              : `Latest stored close ${data.freshness.latestPriceDate ? formatDate(data.freshness.latestPriceDate) : "none"}, retrieved ${formatRelative(data.freshness.latestRetrievedAt)} via ${data.freshness.provider ?? "no provider"}.`
          }
        >
          <button type="button" className="hidden items-center gap-1.5 rounded-md px-1.5 py-1 text-xs text-fg-muted hover:bg-panel-raised focus-visible:outline-2 focus-visible:outline-focus md:flex" onClick={() => router.push("/settings")} aria-label="Data freshness details">
            <span className={`h-1.5 w-1.5 rounded-full ${data.mode === "demo" ? "bg-warning" : "bg-positive"}`} aria-hidden />
            {data.mode === "demo" ? `Data as of ${formatDate(data.asOf)}` : data.freshness.latestPriceDate ? `Prices through ${formatDate(data.freshness.latestPriceDate)}` : "No price data yet"}
          </button>
        </Tip>
        {data.mode === "demo" ? (
          <Badge tone="warning" className="h-6 px-2 text-[11px]" aria-label="Demo data mode: fictional dataset">
            Demo data
          </Badge>
        ) : (
          <Badge tone="positive" className="h-6 px-2 text-[11px]">
            Connected
          </Badge>
        )}
        <ThemeToggle />
      </div>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} portfolios={data.portfolios} />
    </header>
  );
}

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useMounted();
  const isDark = mounted ? resolvedTheme !== "light" : true;
  return (
    <Button variant="ghost" size="icon" onClick={() => setTheme(isDark ? "light" : "dark")} aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"} aria-pressed={!isDark}>
      {isDark ? <Sun size={17} aria-hidden /> : <Moon size={17} aria-hidden />}
    </Button>
  );
}
