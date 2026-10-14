import { MetricsTable } from "@/components/research/metrics-table";
import { PageHeader } from "@/components/shell/page-header";
import { formatDate } from "@/lib/format";
import { getFreshness } from "@/services/market-data";
import { ensureDefaultWatchlist, getWatchlistRows, listSavedViews } from "@/services/watchlist";

export const metadata = { title: "Watchlist" };

export default async function WatchlistPage() {
  const wl = ensureDefaultWatchlist();
  const rows = getWatchlistRows(wl.id);
  const views = listSavedViews("watchlist").map((v) => ({ id: v.id, name: v.name, config: v.parsed }));
  const fresh = getFreshness();
  return (
    <>
      <PageHeader title={wl.name} description={`${rows.length} companies you follow. Columns, sort order and filters can be saved as views. Prices through ${fresh.latestPriceDate ? formatDate(fresh.latestPriceDate) : "n/a"}; fundamentals dates are shown per company.`} />
      <MetricsTable scope="watchlist" rows={rows.map((r) => ({ metrics: r.metrics, watchlistItem: { id: r.item.id, tags: r.tags, note: r.item.note } }))} savedViews={views} />
    </>
  );
}
