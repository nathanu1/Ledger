import { getPortfolio } from "@/services/portfolio";
import { buildOverview } from "@/services/overview";
import { buildResearchReview } from "@/services/review";

export const dynamic = "force-dynamic";

/** Explicit portfolio selection prevents exporting the wrong account by default. */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const id = params.get("portfolio");
  const portfolio = id ? getPortfolio(id) : null;
  if (!portfolio) return Response.json({ error: "Portfolio not found" }, { status: 404, headers: { "Cache-Control": "no-store" } });
  const overview = buildOverview({ portfolioId: portfolio.id });
  const snapshot = overview.snapshot;
  if (!snapshot) return Response.json({ error: "Portfolio not found" }, { status: 404 });
  const report = { ...buildResearchReview(snapshot), alerts: overview.alerts };
  const safeName = portfolio.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  return Response.json(report, { headers: {
    "Content-Disposition": `attachment; filename="ledger-${safeName}-review-${report.asOf}.json"`,
    "Cache-Control": "no-store",
  } });
}
