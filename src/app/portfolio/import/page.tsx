import Link from "next/link";
import { ArrowLeft } from "@phosphor-icons/react/dist/ssr";
import { ImportWizard } from "@/components/portfolio/import-wizard";
import { PageHeader } from "@/components/shell/page-header";
import { EmptyState } from "@/components/ui/empty";
import { getPortfolio, resolvePortfolioId } from "@/services/portfolio";

export const metadata = { title: "Import transactions" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function ImportPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const portfolioId = resolvePortfolioId(first(sp.portfolio));
  const portfolio = portfolioId ? getPortfolio(portfolioId) : null;
  if (!portfolio) {
    return (
      <>
        <PageHeader title="Import transactions" />
        <EmptyState title="Create a portfolio first" action={<Link href="/portfolio" className="text-accent hover:underline">Portfolio</Link>} />
      </>
    );
  }
  return (
    <>
      <PageHeader
        eyebrow={
          <Link href={`/portfolio?portfolio=${portfolio.id}`} className="inline-flex items-center gap-1 text-fg-muted hover:text-fg">
            <ArrowLeft size={13} aria-hidden /> {portfolio.name}
          </Link>
        }
        title="Import transactions from CSV"
        description="Preview, map columns, and check for duplicates before anything is written to the ledger."
      />
      <ImportWizard portfolioId={portfolio.id} portfolioName={portfolio.name} />
    </>
  );
}
