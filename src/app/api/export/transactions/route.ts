import { transactionsToCsv } from "@/calc/csv-import";
import { getPortfolio, listTransactions } from "@/services/portfolio";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const portfolioId = searchParams.get("portfolio");
  const portfolio = portfolioId ? getPortfolio(portfolioId) : null;
  if (!portfolio) return new Response("Portfolio not found", { status: 404 });
  const csv = transactionsToCsv(listTransactions(portfolio.id));
  const safeName = portfolio.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="ledger-${safeName}-transactions.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
