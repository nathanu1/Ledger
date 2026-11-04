import { isPeriodKey } from "@/calc/periods";
import { activityStart, portfolioActivity } from "@/calc/activity";
import { buildPortfolioSnapshot, getPortfolio } from "@/services/portfolio";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const id = params.get("portfolio");
  const portfolio = id ? getPortfolio(id) : null;
  if (!portfolio) return Response.json({ error: "Portfolio not found" }, { status: 404, headers: { "Cache-Control": "no-store" } });
  const period = params.get("period") ?? "ALL";
  if (!isPeriodKey(period)) return Response.json({ error: "Invalid period" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  const snapshot = buildPortfolioSnapshot(portfolio.id, { period });
  if (!snapshot) return new Response(null, { status: 404 });
  const from = activityStart(period, snapshot.asOf, snapshot.transactions);
  const activity = portfolioActivity(snapshot.transactions, from, snapshot.asOf);
  return Response.json({ schemaVersion: 1, portfolio: { id: portfolio.id, name: portfolio.name }, period, ...activity,
    notes: ["Cash dividends are counted once; linked reinvestment purchases are not additional income.", "Trade fees are included in realized gains or remaining cost basis and must not be subtracted again.", "Realized gains are FIFO accounting estimates, not tax reporting."] }, {
    headers: { "Cache-Control": "no-store", "Content-Disposition": `attachment; filename="ledger-activity-${snapshot.asOf}.json"` },
  });
}
