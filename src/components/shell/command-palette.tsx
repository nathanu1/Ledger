"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import { Dialog as RadixDialog } from "radix-ui";
import { useTheme } from "next-themes";
import { ArrowRight, Buildings, ChartLineUp, Gear, ListPlus, Moon, Notebook, ShieldCheck, SquaresFour, Sun, Upload } from "@phosphor-icons/react";

interface Result {
  symbol: string;
  name: string;
  exchange: string | null;
  securityType: "stock" | "etf" | null;
}

export function CommandPalette({ open, onOpenChange, portfolios }: { open: boolean; onOpenChange: (o: boolean) => void; portfolios: Array<{ id: string; name: string }> }) {
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const [query, setQuery] = React.useState("");
  const [fetched, setFetched] = React.useState<{ query: string; results: Result[] }>({ query: "", results: [] });
  const [loading, setLoading] = React.useState(false);
  const [wasOpen, setWasOpen] = React.useState(open);
  if (open !== wasOpen) {
    // Reset the query whenever the palette is re-opened (derived during render, not in an effect).
    setWasOpen(open);
    if (open) setQuery("");
  }
  const trimmed = query.trim();
  const results = trimmed && fetched.query === trimmed ? fetched.results : [];

  React.useEffect(() => {
    if (trimmed.length < 1) return;
    const controller = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}&remote=1`, { signal: controller.signal });
        const json = (await res.json()) as { results: Result[] };
        setFetched({ query: trimmed, results: json.results });
      } catch {
        // aborted or offline: keep previous results
      } finally {
        setLoading(false);
      }
    }, 180);
    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [trimmed]);

  const go = (href: string) => {
    onOpenChange(false);
    router.push(href);
  };

  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-40 bg-overlay" />
        <RadixDialog.Content className="fixed left-1/2 top-[12vh] z-50 w-[calc(100vw-24px)] max-w-xl -translate-x-1/2 overflow-hidden rounded-lg border border-border bg-panel shadow-panel focus:outline-none">
          <RadixDialog.Title className="sr-only">Command palette</RadixDialog.Title>
          <RadixDialog.Description className="sr-only">Search tickers, navigate to pages, or run actions.</RadixDialog.Description>
          <Command label="Command palette" shouldFilter={false} loop>
            <div className="border-b border-border">
              <Command.Input value={query} onValueChange={setQuery} placeholder="Type a ticker, company, page or action" autoFocus />
            </div>
            <Command.List>
              <Command.Empty>{loading ? "Searching…" : query ? "No matching tickers, pages or actions." : "Start typing to search."}</Command.Empty>
              {results.length ? (
                <Command.Group heading="Securities">
                  {results.map((r) => (
                    <Command.Item key={r.symbol} value={`sec-${r.symbol}`} onSelect={() => go(`/company/${r.symbol}`)}>
                      <Buildings size={16} className="text-fg-muted" aria-hidden />
                      <span className="num w-16 shrink-0 font-medium">{r.symbol}</span>
                      <span className="truncate text-fg-secondary">{r.name}</span>
                      <span className="ml-auto text-[11px] text-fg-muted">{r.securityType === "etf" ? "ETF" : r.exchange ?? ""}</span>
                    </Command.Item>
                  ))}
                </Command.Group>
              ) : null}
              {!query || /^(ov|po|wa|sc|ri|th|se|im|ad)/i.test(query) ? (
                <Command.Group heading="Pages">
                  <PageItem icon={<SquaresFour size={16} aria-hidden />} label="Overview" onSelect={() => go("/")} />
                  <PageItem icon={<ChartLineUp size={16} aria-hidden />} label="Portfolio" onSelect={() => go("/portfolio")} />
                  <PageItem icon={<ListPlus size={16} aria-hidden />} label="Watchlist" onSelect={() => go("/watchlist")} />
                  <PageItem icon={<ShieldCheck size={16} aria-hidden />} label="Risk" onSelect={() => go("/risk")} />
                  <PageItem icon={<Notebook size={16} aria-hidden />} label="Theses" onSelect={() => go("/theses")} />
                  <PageItem icon={<Gear size={16} aria-hidden />} label="Settings" onSelect={() => go("/settings")} />
                </Command.Group>
              ) : null}
              <Command.Group heading="Actions">
                <PageItem icon={<ListPlus size={16} aria-hidden />} label="Add a transaction" onSelect={() => go("/portfolio/transactions?new=1")} />
                <PageItem icon={<Upload size={16} aria-hidden />} label="Import transactions from CSV" onSelect={() => go("/portfolio/import")} />
                <PageItem
                  icon={resolvedTheme === "light" ? <Moon size={16} aria-hidden /> : <Sun size={16} aria-hidden />}
                  label={resolvedTheme === "light" ? "Switch to dark theme" : "Switch to light theme"}
                  onSelect={() => {
                    setTheme(resolvedTheme === "light" ? "dark" : "light");
                    onOpenChange(false);
                  }}
                />
                {portfolios.map((p) => (
                  <PageItem key={p.id} icon={<ArrowRight size={16} aria-hidden />} label={`Open portfolio: ${p.name}`} onSelect={() => go(`/portfolio?portfolio=${p.id}`)} />
                ))}
              </Command.Group>
            </Command.List>
          </Command>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

function PageItem({ icon, label, onSelect }: { icon: React.ReactNode; label: string; onSelect: () => void }) {
  return (
    <Command.Item value={label} onSelect={onSelect}>
      <span className="text-fg-muted">{icon}</span>
      <span>{label}</span>
    </Command.Item>
  );
}
