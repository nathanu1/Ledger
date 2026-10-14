"use client";

import * as React from "react";
import Link from "next/link";
import { flexRender, getCoreRowModel, getSortedRowModel, useReactTable, type ColumnDef, type SortingState } from "@tanstack/react-table";
import { CaretDown, CaretUp, CaretUpDown } from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { Table, TableScroll, Td, Th, Tr } from "@/components/ui/table";
import { Delta } from "@/components/metrics/value";
import { cn } from "@/lib/cn";
import { formatDate, formatMoney, formatPct, formatShares } from "@/lib/format";

export interface HoldingRow {
  symbol: string;
  name: string;
  securityType: "stock" | "etf" | "unknown";
  sector: string | null;
  quantity: string;
  averageCost: string | null;
  costBasis: string;
  price: number | null;
  priceDate: string | null;
  marketValue: string | null;
  weight: number | null;
  dayChange: number | null;
  dayChangePct: number | null;
  unrealizedPnl: string | null;
  unrealizedPnlPct: number | null;
  realizedPnl: string;
  dividends: string;
  totalGain: string | null;
}

const num = (v: string | number | null | undefined) => (v === null || v === undefined ? Number.NEGATIVE_INFINITY : Number(v));

export function HoldingsTable({ rows, asOf }: { rows: HoldingRow[]; asOf: string }) {
  const [sorting, setSorting] = React.useState<SortingState>([{ id: "marketValue", desc: true }]);
  const columns = React.useMemo<ColumnDef<HoldingRow>[]>(
    () => [
      {
        id: "symbol",
        accessorKey: "symbol",
        header: "Position",
        cell: ({ row }) => (
          <div className="flex min-w-[132px] max-w-[172px] items-center gap-2">
            <Link href={`/company/${row.original.symbol}`} className="num font-medium text-fg hover:text-accent">
              {row.original.symbol}
            </Link>
            <span className="truncate text-xs text-fg-muted">{row.original.name}</span>
            {row.original.securityType === "etf" ? <Badge tone="outline">ETF</Badge> : null}
          </div>
        ),
      },
      { id: "quantity", accessorFn: (r) => Number(r.quantity), header: "Shares", cell: ({ row }) => formatShares(row.original.quantity), meta: { numeric: true } },
      { id: "averageCost", accessorFn: (r) => num(r.averageCost), header: "Avg cost", cell: ({ row }) => formatMoney(row.original.averageCost), meta: { numeric: true } },
      { id: "costBasis", accessorFn: (r) => Number(r.costBasis), header: "Cost basis", cell: ({ row }) => formatMoney(row.original.costBasis), meta: { numeric: true } },
      {
        id: "price",
        accessorFn: (r) => num(r.price),
        header: "Price",
        cell: ({ row }) =>
          row.original.price === null ? (
            <span className="text-warning" title="No price data">
              n/a
            </span>
          ) : (
            <span title={row.original.priceDate && row.original.priceDate !== asOf ? `Last close ${formatDate(row.original.priceDate)}` : undefined} className={cn(row.original.priceDate && row.original.priceDate < asOf ? "text-fg-secondary" : "")}>
              {formatMoney(row.original.price)}
              {row.original.priceDate && row.original.priceDate < asOf ? <span className="sr-only"> (stale: {formatDate(row.original.priceDate)})</span> : null}
            </span>
          ),
        meta: { numeric: true },
      },
      { id: "marketValue", accessorFn: (r) => num(r.marketValue), header: "Market value", cell: ({ row }) => (row.original.marketValue === null ? <span className="text-fg-muted">n/a</span> : formatMoney(row.original.marketValue)), meta: { numeric: true } },
      { id: "weight", accessorFn: (r) => r.weight ?? -1, header: "Weight", cell: ({ row }) => (row.original.weight === null ? <span className="text-fg-muted">n/a</span> : formatPct(row.original.weight)), meta: { numeric: true } },
      {
        id: "dayChange",
        accessorFn: (r) => r.dayChange ?? Number.NEGATIVE_INFINITY,
        header: "Day",
        cell: ({ row }) =>
          row.original.dayChange === null ? (
            <span className="text-fg-muted">n/a</span>
          ) : (
            <div className="flex flex-col items-end leading-4">
              <Delta value={row.original.dayChange} />
              <Delta value={row.original.dayChangePct} kind="pct" digits={2} hideIcon className="text-[11px]" />
            </div>
          ),
        meta: { numeric: true },
      },
      {
        id: "unrealizedPnl",
        accessorFn: (r) => num(r.unrealizedPnl),
        header: "Unrealized",
        cell: ({ row }) =>
          row.original.unrealizedPnl === null ? (
            <span className="text-fg-muted">n/a</span>
          ) : (
            <div className="flex flex-col items-end leading-4">
              <Delta value={row.original.unrealizedPnl} />
              <Delta value={row.original.unrealizedPnlPct} kind="pct" hideIcon className="text-[11px]" />
            </div>
          ),
        meta: { numeric: true },
      },
      { id: "realizedPnl", accessorFn: (r) => Number(r.realizedPnl), header: "Realized", cell: ({ row }) => <Delta value={row.original.realizedPnl} hideIcon />, meta: { numeric: true } },
      { id: "dividends", accessorFn: (r) => Number(r.dividends), header: "Dividends", cell: ({ row }) => formatMoney(row.original.dividends), meta: { numeric: true } },
      { id: "totalGain", accessorFn: (r) => num(r.totalGain), header: "Total gain", cell: ({ row }) => (row.original.totalGain === null ? <span className="text-fg-muted">n/a</span> : <Delta value={row.original.totalGain} />), meta: { numeric: true } },
    ],
    [asOf],
  );
  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Table returns functions the React Compiler cannot memoise; the compiler is not enabled here.
  const table = useReactTable({ data: rows, columns, state: { sorting }, onSortingChange: setSorting, getCoreRowModel: getCoreRowModel(), getSortedRowModel: getSortedRowModel() });
  return (
    <TableScroll label="Holdings">
      <Table>
        <thead>
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id}>
              {hg.headers.map((h) => {
                const numeric = (h.column.columnDef.meta as { numeric?: boolean } | undefined)?.numeric;
                const sorted = h.column.getIsSorted();
                return (
                  <Th key={h.id} align={numeric ? "right" : "left"} aria-sort={sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : "none"}>
                    <button type="button" onClick={h.column.getToggleSortingHandler()} className={cn("inline-flex items-center gap-1 rounded-sm hover:text-fg focus-visible:outline-2 focus-visible:outline-focus", numeric && "flex-row-reverse")}>
                      {flexRender(h.column.columnDef.header, h.getContext())}
                      {sorted === "asc" ? <CaretUp size={11} aria-hidden /> : sorted === "desc" ? <CaretDown size={11} aria-hidden /> : <CaretUpDown size={11} className="opacity-50" aria-hidden />}
                    </button>
                  </Th>
                );
              })}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((r) => (
            <Tr key={r.id}>
              {r.getVisibleCells().map((c) => {
                const numeric = (c.column.columnDef.meta as { numeric?: boolean } | undefined)?.numeric;
                return (
                  <Td key={c.id} align={numeric ? "right" : "left"} numeric={numeric}>
                    {flexRender(c.column.columnDef.cell, c.getContext())}
                  </Td>
                );
              })}
            </Tr>
          ))}
        </tbody>
      </Table>
    </TableScroll>
  );
}
