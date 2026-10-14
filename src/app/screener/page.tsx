import { MetricsTable } from "@/components/research/metrics-table";
import { PageHeader } from "@/components/shell/page-header";
import { EmptyState } from "@/components/ui/empty";
import { formatDate } from "@/lib/format";
import { getFreshness } from "@/services/market-data";
import { getDataMode } from "@/services/settings";
import { getUniverseRows, listSavedViews } from "@/services/watchlist";

export const metadata = { title: "Screener" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function ScreenerPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const rows = getUniverseRows();
  const views = listSavedViews("screener").map((v) => ({ id: v.id, name: v.name, config: v.parsed }));
  const initialView = views.find((v) => v.id === first(sp.view)) ?? null;
  const fresh = getFreshness();
  const mode = getDataMode();
  return (
    <>
      <PageHeader
        title="Screener"
        description={
          mode === "demo"
            ? `Screens the demo universe: ${rows.length} fictional securities with prices through ${fresh.latestPriceDate ? formatDate(fresh.latestPriceDate) : "n/a"}. This is not the whole market.`
            : `Screens the ${rows.length} securities with locally stored data (every symbol you have opened or imported), not the whole market. Prices through ${fresh.latestPriceDate ? formatDate(fresh.latestPriceDate) : "n/a"}.`
        }
      />
      {mode === "connected" ? <EmptyState className="mb-4" title="Coverage grows as you research" description="Open a company page or import transactions to add a symbol to the universe. Fundamentals come from SEC EDGAR filings; prices from the configured market-data provider." /> : null}
      <MetricsTable scope="screener" rows={rows.map((m) => ({ metrics: m }))} savedViews={views} initialView={initialView} />
    </>
  );
}
