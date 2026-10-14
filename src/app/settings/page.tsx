import { ArrowSquareOut } from "@phosphor-icons/react/dist/ssr";
import { PageHeader } from "@/components/shell/page-header";
import { CacheButton, ModeSwitch, RefreshAllButton, ResetDemoButton, ThemeChoice } from "@/components/settings/controls";
import { Badge } from "@/components/ui/badge";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { formatDate, formatDateTime, formatRelative } from "@/lib/format";
import { connectedModeAvailable, providerStatuses } from "@/providers/registry";
import { getFreshness } from "@/services/market-data";
import { getDataMode, getSetting } from "@/services/settings";
import { getCacheStats, getProviderUsage } from "@/services/usage";

export const metadata = { title: "Settings" };

export default function SettingsPage() {
  const mode = getDataMode();
  const providers = providerStatuses();
  const usage = getProviderUsage(24);
  const cache = getCacheStats();
  const fresh = getFreshness();
  const seededAt = getSetting("demo_seeded_at");
  return (
    <>
      <PageHeader title="Settings" description="Data mode, providers, quotas and caches. API keys live only in your environment file on the server; this page never shows them." />
      <div className="grid gap-5 lg:grid-cols-2">
        <Panel className="lg:col-span-2">
          <PanelHeader title="Data mode" description={`Currently ${mode === "demo" ? "demo data" : "connected"}. ${mode === "demo" ? `Demo dataset fixed at ${formatDate(fresh.asOf)}${seededAt ? `, loaded ${formatRelative(seededAt)}` : ""}.` : `Prices stored through ${fresh.latestPriceDate ? formatDate(fresh.latestPriceDate) : "none"} for ${fresh.symbolsWithPrices} symbols.`}`} />
          <PanelBody>
            <ModeSwitch mode={mode} connectedAvailable={connectedModeAvailable()} />
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHeader title="Providers" description="Configured through environment variables; restart the server after changing them." />
          <PanelBody>
            <ul className="divide-y divide-border/70">
              {providers.map((p) => (
                <li key={p.id} className="py-3 text-[13px]">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-fg">{p.name}</span>
                    <Badge tone={p.configured ? "positive" : "neutral"}>{p.configured ? "Configured" : "Not configured"}</Badge>
                  </div>
                  <div className="text-xs text-fg-secondary">{p.role}</div>
                  <div className="mt-1 text-xs text-fg-muted">{p.requirement}</div>
                  {p.notes.map((n) => (
                    <div key={n} className="text-xs text-fg-muted">{n}</div>
                  ))}
                  <a href={p.docsUrl} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs text-accent hover:underline">
                    Documentation <ArrowSquareOut size={12} aria-hidden />
                  </a>
                </li>
              ))}
            </ul>
          </PanelBody>
        </Panel>

        <div className="flex flex-col gap-5">
          <Panel>
            <PanelHeader title="Requests in the last 24 hours" description="Every provider call is logged so quota problems are visible." />
            <PanelBody>
              {usage.length === 0 ? (
                <p className="text-sm text-fg-muted">No provider requests yet.</p>
              ) : (
                <ul className="divide-y divide-border/70 text-[13px]">
                  {usage.map((u) => (
                    <li key={u.provider} className="py-2">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-fg">{u.provider}</span>
                        <span className="num text-xs text-fg-secondary">{u.ok} ok · {u.quota} quota · {u.auth} auth · {u.errors} other</span>
                      </div>
                      {u.lastError ? <div className="mt-1 text-xs text-negative">{formatDateTime(u.lastError.at)} · {u.lastError.endpoint}: {u.lastError.message}</div> : null}
                    </li>
                  ))}
                </ul>
              )}
            </PanelBody>
          </Panel>
          <Panel>
            <PanelHeader title="Refresh" description={mode === "demo" ? "Disabled in demo mode." : "Fetches history, quotes, fundamentals and the earnings calendar for every held and watched symbol, respecting provider rate limits (this can take minutes on free tiers)."} />
            <PanelBody>
              <RefreshAllButton mode={mode} />
            </PanelBody>
          </Panel>
          <Panel>
            <PanelHeader title="Cache" description={`${cache.entries} cached provider responses${cache.newest ? `, newest ${formatRelative(cache.newest)}` : ""}. Clearing forces fresh requests on the next refresh.`} actions={<CacheButton />} />
          </Panel>
          <Panel>
            <PanelHeader title="Appearance" description="Dark is the default; both themes are supported throughout." actions={<ThemeChoice />} />
          </Panel>
          <Panel>
            <PanelHeader title="Demo dataset" description="Reload the fictional dataset. This deletes all portfolios, transactions, theses and notes." actions={<ResetDemoButton />} />
          </Panel>
        </div>
      </div>
    </>
  );
}
