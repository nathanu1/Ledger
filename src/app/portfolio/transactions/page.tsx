import Link from "next/link";
import { ArrowLeft, DownloadSimple, UploadSimple } from "@phosphor-icons/react/dist/ssr";
import { LedgerReplayer, sortTransactions } from "@/calc/ledger";
import { TransactionsTable, type TransactionViewRow } from "@/components/portfolio/transactions-table";
import { PageHeader } from "@/components/shell/page-header";
import { buttonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty";
import { listTransactionRows, resolvePortfolioId, getPortfolio, rowToTransaction } from "@/services/portfolio";

export const metadata = { title: "Transactions" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function TransactionsPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const portfolioId = resolvePortfolioId(first(sp.portfolio));
  const portfolio = portfolioId ? getPortfolio(portfolioId) : null;
  if (!portfolio) {
    return (
      <>
        <PageHeader title="Transactions" />
        <EmptyState title="No portfolio" action={<Link href="/portfolio" className="text-accent hover:underline">Create one</Link>} />
      </>
    );
  }
  const rows = listTransactionRows(portfolio.id);
  // Running cash balance and per-transaction issues from a single replay.
  const replayer = new LedgerReplayer();
  const cashAfter = new Map<string, string>();
  for (const t of sortTransactions(rows.map(rowToTransaction))) {
    replayer.apply(t);
    cashAfter.set(t.id, replayer.cash.toString());
  }
  const issues = new Map(replayer.snapshot(null).issues.filter((i) => i.transactionId).map((i) => [i.transactionId, { severity: i.severity, message: i.message }]));
  const viewRows: TransactionViewRow[] = [...rows]
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.sequence - a.sequence))
    .map((r) => ({ ...r, cashAfter: cashAfter.get(r.id) ?? null, issue: issues.get(r.id) ?? null }));

  return (
    <>
      <PageHeader
        eyebrow={
          <Link href={`/portfolio?portfolio=${portfolio.id}`} className="inline-flex items-center gap-1 text-fg-muted hover:text-fg">
            <ArrowLeft size={13} aria-hidden /> {portfolio.name}
          </Link>
        }
        title="Transactions"
        description="The ledger is the source of truth: holdings and cash are derived from these rows. Cash after each row shows the running balance in ledger order."
        actions={
          <>
            <Link href={`/portfolio/import?portfolio=${portfolio.id}`} className={buttonClasses("secondary", "sm")}>
              <UploadSimple size={15} aria-hidden /> Import CSV
            </Link>
            <a href={`/api/export/transactions?portfolio=${portfolio.id}`} className={buttonClasses("secondary", "sm")} download>
              <DownloadSimple size={15} aria-hidden /> Export CSV
            </a>
          </>
        }
      />
      <TransactionsTable portfolioId={portfolio.id} rows={viewRows} />
    </>
  );
}
