"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus, Warning } from "@phosphor-icons/react";
import type { TransactionRow } from "@/db/schema";
import { TRANSACTION_TYPES } from "@/calc/types";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { Table, TableScroll, Td, Th, Tr } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty";
import { formatDate, formatMoney, formatShares } from "@/lib/format";
import { TransactionDialog } from "./transaction-dialog";

export interface TransactionViewRow extends TransactionRow {
  cashAfter: string | null;
  issue: { severity: "error" | "warning"; message: string } | null;
}

const TONE: Record<string, BadgeTone> = { BUY: "accent", SELL: "accent", DEPOSIT: "positive", WITHDRAWAL: "warning", DIVIDEND: "positive", INTEREST: "positive", FEE: "negative", SPLIT: "neutral" };

export function TransactionsTable({ portfolioId, rows }: { portfolioId: string; rows: TransactionViewRow[] }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [open, setOpen] = React.useState(searchParams.get("new") === "1");
  const [editing, setEditing] = React.useState<TransactionRow | null>(null);
  const [typeFilter, setTypeFilter] = React.useState("");
  const [symbolFilter, setSymbolFilter] = React.useState("");

  const filtered = rows.filter((r) => (!typeFilter || r.type === typeFilter) && (!symbolFilter || (r.symbol ?? "").includes(symbolFilter.toUpperCase()) || (r.note ?? "").toUpperCase().includes(symbolFilter.toUpperCase())));
  const dividends = rows.filter((r) => r.type === "DIVIDEND").map((r) => ({ id: r.id, label: `${formatDate(r.date)} · ${r.symbol} · ${formatMoney(r.amount)}` }));

  const openNew = () => {
    setEditing(null);
    setOpen(true);
  };
  const onOpenChange = (o: boolean) => {
    setOpen(o);
    if (!o && searchParams.get("new") === "1") router.replace(`/portfolio/transactions?portfolio=${portfolioId}`);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1">
          <label htmlFor="f-type" className="text-xs text-fg-muted">
            Type
          </label>
          <Select id="f-type" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="h-8 w-[160px] text-[13px]">
            <option value="">All types</option>
            {TRANSACTION_TYPES.map((t) => (
              <option key={t} value={t}>
                {t.charAt(0) + t.slice(1).toLowerCase()}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="f-symbol" className="text-xs text-fg-muted">
            Symbol or note
          </label>
          <Input id="f-symbol" value={symbolFilter} onChange={(e) => setSymbolFilter(e.target.value)} className="h-8 w-[180px] text-[13px]" placeholder="Filter" autoComplete="off" />
        </div>
        <span className="num pb-1.5 text-xs text-fg-muted">
          {filtered.length} of {rows.length}
        </span>
        <Button variant="primary" size="sm" className="ml-auto" onClick={openNew}>
          <Plus size={15} aria-hidden /> Add transaction
        </Button>
      </div>
      {filtered.length === 0 ? (
        <EmptyState title={rows.length ? "No transactions match the filter" : "No transactions yet"} description={rows.length ? undefined : "Add a deposit and a buy, or import a CSV from your broker."} action={rows.length ? undefined : <Link href={`/portfolio/import?portfolio=${portfolioId}`} className="text-accent hover:underline">Import CSV</Link>} />
      ) : (
        <TableScroll label="Transactions" className="rounded-md border border-border">
          <Table>
            <thead>
              <tr>
                <Th>Date</Th>
                <Th>Type</Th>
                <Th>Symbol</Th>
                <Th align="right">Quantity</Th>
                <Th align="right">Price</Th>
                <Th align="right">Amount</Th>
                <Th align="right">Fee</Th>
                <Th align="right">Cash after</Th>
                <Th>Note</Th>
                <Th>
                  <span className="sr-only">Actions</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <Tr key={r.id} className={r.issue?.severity === "error" ? "bg-negative-soft/30" : ""}>
                  <Td numeric className="whitespace-nowrap">
                    {formatDate(r.date)}
                  </Td>
                  <Td>
                    <span className="flex items-center gap-1.5">
                      <Badge tone={TONE[r.type] ?? "neutral"}>{r.type.charAt(0) + r.type.slice(1).toLowerCase()}</Badge>
                      {r.linkedTransactionId ? <Badge tone="outline">DRIP</Badge> : null}
                      {r.issue ? (
                        <span className="inline-flex items-center gap-1 text-xs text-negative" title={r.issue.message}>
                          <Warning size={13} aria-hidden /> {r.issue.severity === "error" ? "Not applied" : "Warning"}
                        </span>
                      ) : null}
                    </span>
                  </Td>
                  <Td>
                    {r.symbol ? (
                      <Link href={`/company/${r.symbol}`} className="num font-medium text-fg hover:text-accent">
                        {r.symbol}
                      </Link>
                    ) : (
                      <span className="text-fg-muted">Cash</span>
                    )}
                  </Td>
                  <Td align="right" numeric>
                    {r.type === "SPLIT" ? `${r.splitNumerator}:${r.splitDenominator}` : r.quantity ? formatShares(r.quantity) : ""}
                  </Td>
                  <Td align="right" numeric>
                    {r.price ? formatMoney(r.price) : ""}
                  </Td>
                  <Td align="right" numeric>
                    {r.amount ? formatMoney(r.amount) : r.quantity && r.price ? formatMoney(Number(r.quantity) * Number(r.price)) : ""}
                  </Td>
                  <Td align="right" numeric>
                    {r.fee ? formatMoney(r.fee) : ""}
                  </Td>
                  <Td align="right" numeric className={r.cashAfter !== null && Number(r.cashAfter) < 0 ? "text-negative" : "text-fg-secondary"}>
                    {r.cashAfter === null ? "" : formatMoney(r.cashAfter)}
                  </Td>
                  <Td className="max-w-[260px] truncate text-fg-secondary" title={r.note ?? undefined}>
                    {r.note}
                  </Td>
                  <Td align="right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setEditing(r);
                        setOpen(true);
                      }}
                      aria-label={`Edit ${r.type.toLowerCase()} on ${r.date}`}
                    >
                      Edit
                    </Button>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </TableScroll>
      )}
      <TransactionDialog portfolioId={portfolioId} open={open} onOpenChange={onOpenChange} editing={editing} dividends={dividends} />
    </div>
  );
}
