"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { clearCacheAction, refreshAllAction, resetDemoAction, setDataModeAction } from "@/app/actions/settings";
import { useMounted } from "@/lib/use-mounted";

export function ModeSwitch({ mode, connectedAvailable }: { mode: "demo" | "connected"; connectedAvailable: boolean }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const choose = (m: "demo" | "connected") =>
    start(async () => {
      const res = await setDataModeAction(m);
      toast[res.ok ? "success" : "error"](res.message, { duration: 7000 });
      router.refresh();
    });
  return (
    <div role="radiogroup" aria-label="Data mode" className="grid gap-2 sm:grid-cols-2">
      <button type="button" role="radio" aria-checked={mode === "demo"} disabled={pending} onClick={() => choose("demo")} className={`rounded-md border p-3 text-left ${mode === "demo" ? "border-accent bg-accent-soft" : "border-border hover:border-border-strong"}`}>
        <div className="text-sm font-medium text-fg">Demo data</div>
        <div className="text-xs text-fg-secondary">A fictional, deterministic universe of 15 securities with three years of prices, filings and statements. No network requests.</div>
      </button>
      <button type="button" role="radio" aria-checked={mode === "connected"} disabled={pending || !connectedAvailable} onClick={() => choose("connected")} className={`rounded-md border p-3 text-left ${mode === "connected" ? "border-accent bg-accent-soft" : "border-border hover:border-border-strong"} disabled:cursor-not-allowed disabled:opacity-60`}>
        <div className="text-sm font-medium text-fg">Connected</div>
        <div className="text-xs text-fg-secondary">{connectedAvailable ? "Fetch real filings and prices from the configured providers. Failed requests are reported, never replaced with synthetic values." : "Needs SEC_USER_AGENT or a market-data API key in .env.local (see .env.example). Restart the server after editing it."}</div>
      </button>
    </div>
  );
}

export function CacheButton() {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  return (
    <Button variant="secondary" size="sm" disabled={pending} onClick={() => start(async () => { const res = await clearCacheAction(); toast[res.ok ? "success" : "error"](res.message); router.refresh(); })}>
      Clear provider cache
    </Button>
  );
}

export function RefreshAllButton({ mode }: { mode: "demo" | "connected" }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [lines, setLines] = React.useState<string[]>([]);
  return (
    <div className="flex flex-col gap-2">
      <Button variant="primary" size="sm" disabled={pending || mode === "demo"} onClick={() => start(async () => { const res = await refreshAllAction(); toast[res.ok ? "success" : "error"](res.message, { duration: 8000 }); setLines(res.data?.lines ?? []); router.refresh(); })}>
        {pending ? "Refreshing… (rate limits apply)" : "Refresh held and watched symbols"}
      </Button>
      {lines.length ? (
        <ul className="max-h-48 overflow-y-auto rounded-md border border-border bg-panel-sunken/50 p-2 text-xs text-fg-secondary scrollbar-thin">
          {lines.map((l, i) => (
            <li key={i}>{l}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function ResetDemoButton() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, start] = React.useTransition();
  return (
    <>
      <Button variant="danger" size="sm" onClick={() => setOpen(true)}>
        Reset to demo dataset
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="Replace everything with the demo dataset?" description="Every portfolio, transaction, thesis, note and cached provider response is deleted. This cannot be undone.">
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Keep my data
            </Button>
            <Button variant="danger" disabled={pending} onClick={() => start(async () => { const res = await resetDemoAction(); toast[res.ok ? "success" : "error"](res.message); setOpen(false); router.refresh(); })}>
              Replace with demo data
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function ThemeChoice() {
  const { theme, setTheme } = useTheme();
  const mounted = useMounted();
  const current = mounted ? (theme ?? "dark") : "dark";
  return (
    <div role="radiogroup" aria-label="Theme" className="flex gap-2">
      {(["dark", "light"] as const).map((t) => (
        <Button key={t} variant={current === t ? "primary" : "secondary"} size="sm" role="radio" aria-checked={current === t} onClick={() => setTheme(t)}>
          {t === "dark" ? "Dark" : "Light"}
        </Button>
      ))}
    </div>
  );
}
