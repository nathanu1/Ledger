import Link from "next/link";
import { ComparisonChart } from "@/components/research/comparison-chart";
import { PageHeader } from "@/components/shell/page-header";
import { EmptyState } from "@/components/ui/empty";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { Table, TableScroll, Td, Th, Tr } from "@/components/ui/table";
import { COLUMNS } from "@/components/research/columns";
import { addMonths } from "@/calc/dates";
import { getPriceSeries } from "@/services/market-data";
import { buildMetricsForSymbols } from "@/services/metrics";
import { getAsOfDate } from "@/services/settings";

export const metadata = { title: "Compare" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function ComparePage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const symbols = [...new Set((first(sp.symbols) ?? "").split(",").map((s) => s.trim().toUpperCase()).filter((s) => /^[A-Z0-9.\-]{1,12}$/.test(s)))].slice(0, 4);
  if (symbols.length < 2) {
    return (
      <>
        <PageHeader title="Compare companies" description="Pick two to four companies from the watchlist or screener." />
        <EmptyState title="Nothing to compare yet" action={<Link href="/screener" className="text-accent hover:underline">Open the screener</Link>} />
      </>
    );
  }
  const metrics = buildMetricsForSymbols(symbols);
  const asOf = getAsOfDate();
  const from = addMonths(asOf, -12);
  const series = symbols.map((s) => ({ symbol: s, points: getPriceSeries(s, from, asOf).points }));
  const rowsToShow = COLUMNS.filter((c) => c.key !== "thesisStatus");
  return (
    <>
      <PageHeader title={`Compare ${symbols.join(" · ")}`} description="Side by side on the same definitions. Trailing-twelve-month fundamentals where available; each column's data dates are in the last rows." />
      <div className="flex flex-col gap-5">
        <Panel>
          <PanelHeader title="Price, last 12 months" description="Adjusted closes re-indexed to 100 at the first common date, so moves are comparable regardless of share price." />
          <PanelBody>
            <ComparisonChart series={series} />
          </PanelBody>
        </Panel>
        <Panel>
          <PanelHeader title="Metrics" />
          <PanelBody className="px-0 pb-0">
            <TableScroll label="Comparison table">
              <Table>
                <thead>
                  <tr>
                    <Th className="sticky left-0 z-[2] bg-panel">Metric</Th>
                    {metrics.map((m) => (
                      <Th key={m.symbol} align="right">
                        <Link href={`/company/${m.symbol}`} className="num text-fg hover:text-accent">
                          {m.symbol}
                        </Link>
                        <div className="font-normal normal-case tracking-normal text-fg-muted">{m.name}</div>
                      </Th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rowsToShow.map((c) => (
                    <Tr key={c.key}>
                      <th scope="row" className="sticky left-0 z-[1] whitespace-nowrap border-b border-border/70 bg-panel px-2.5 py-2 text-left text-[13px] font-normal text-fg">
                        {c.label}
                      </th>
                      {metrics.map((m) => {
                        const f = c.format(m);
                        return (
                          <Td key={m.symbol} align="right" numeric={c.numeric} className={f.reason ? "text-fg-muted" : f.negative ? "text-negative" : f.positive ? "text-positive" : ""} title={f.reason}>
                            {f.text}
                          </Td>
                        );
                      })}
                    </Tr>
                  ))}
                  <Tr>
                    <th scope="row" className="sticky left-0 z-[1] whitespace-nowrap bg-panel px-2.5 py-2 text-left text-[13px] font-normal text-fg-muted">
                      Sector notes
                    </th>
                    {metrics.map((m) => (
                      <Td key={m.symbol} className="max-w-[260px] text-xs text-fg-muted">
                        {m.sectorProfile.notes[0] ?? "Standard operating-company metrics apply."}
                      </Td>
                    ))}
                  </Tr>
                </tbody>
              </Table>
            </TableScroll>
          </PanelBody>
        </Panel>
      </div>
    </>
  );
}
