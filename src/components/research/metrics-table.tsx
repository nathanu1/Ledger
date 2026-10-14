"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { flexRender, getCoreRowModel, getSortedRowModel, useReactTable, type ColumnDef, type SortingState } from "@tanstack/react-table";
import { CaretDown, CaretUp, CaretUpDown, Columns, Funnel, X } from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClasses } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty";
import { Field, Input, Select } from "@/components/ui/field";
import { Table, TableScroll, Td, Th, Tr } from "@/components/ui/table";
import { cn } from "@/lib/cn";
import type { CompanyMetrics } from "@/services/metrics";
import type { ViewConfig } from "@/services/watchlist";
import { COLUMNS, COLUMN_MAP, DEFAULT_COLUMNS } from "./columns";
import { deleteViewAction, saveViewAction } from "@/app/actions/views";
import { removeWatchlistItemAction, updateWatchlistItemAction } from "@/app/actions/research";

export interface MetricsRow {
  metrics: CompanyMetrics;
  watchlistItem?: { id: string; tags: string[]; note: string | null } | null;
}

export interface SavedViewOption {
  id: string;
  name: string;
  config: ViewConfig;
}

type Filter = ViewConfig["filters"][number];

export function MetricsTable({ rows, scope, savedViews, initialView }: { rows: MetricsRow[]; scope: "watchlist" | "screener"; savedViews: SavedViewOption[]; initialView?: SavedViewOption | null }) {
  const router = useRouter();
  const [columnsVisible, setColumnsVisible] = React.useState<string[]>(initialView?.config.columns.length ? initialView.config.columns : DEFAULT_COLUMNS);
  const [filters, setFilters] = React.useState<Filter[]>(initialView?.config.filters ?? []);
  const [sorting, setSorting] = React.useState<SortingState>(initialView?.config.sort ? [{ id: initialView.config.sort.column, desc: initialView.config.sort.direction === "desc" }] : []);
  const [viewId, setViewId] = React.useState<string>(initialView?.id ?? "");
  const [selected, setSelected] = React.useState<string[]>([]);
  const [saveOpen, setSaveOpen] = React.useState(false);
  const [saveName, setSaveName] = React.useState("");
  const [editItem, setEditItem] = React.useState<MetricsRow | null>(null);
  const [pending, start] = React.useTransition();
  const [showColumns, setShowColumns] = React.useState(false);
  const [draftFilter, setDraftFilter] = React.useState<Filter>({ column: "revenueGrowth", operator: "gt", value: 0.1 });

  const filtered = React.useMemo(
    () =>
      rows.filter((r) =>
        filters.every((f) => {
          const col = COLUMN_MAP.get(f.column);
          if (!col) return true;
          const v = col.get(r.metrics);
          if (f.operator === "contains") return typeof v === "string" && typeof f.value === "string" && v.toLowerCase().includes(f.value.toLowerCase());
          if (v === null || typeof v !== "number") return false;
          return f.operator === "gt" ? v > Number(f.value) : f.operator === "lt" ? v < Number(f.value) : v === Number(f.value);
        }),
      ),
    [rows, filters],
  );

  const columns = React.useMemo<ColumnDef<MetricsRow>[]>(() => {
    const defs: ColumnDef<MetricsRow>[] = [
      {
        id: "select",
        header: () => <span className="sr-only">Compare</span>,
        cell: ({ row }) => {
          const s = row.original.metrics.symbol;
          const checked = selected.includes(s);
          return <input type="checkbox" aria-label={`Select ${s} to compare`} checked={checked} disabled={!checked && selected.length >= 4} onChange={(e) => setSelected(e.target.checked ? [...selected, s] : selected.filter((x) => x !== s))} className="h-4 w-4 accent-[var(--accent)]" />;
        },
        enableSorting: false,
      },
      {
        id: "symbol",
        accessorFn: (r) => r.metrics.symbol,
        header: "Company",
        cell: ({ row }) => (
          <div className="flex min-w-[170px] max-w-[260px] flex-col leading-4">
            <span className="flex items-center gap-2">
              <Link href={`/company/${row.original.metrics.symbol}`} className="num font-medium text-fg hover:text-accent">
                {row.original.metrics.symbol}
              </Link>
              <span className="truncate text-xs text-fg-muted">{row.original.metrics.name}</span>
              {row.original.metrics.securityType === "etf" ? <Badge tone="outline">ETF</Badge> : null}
            </span>
            {row.original.watchlistItem?.tags.length ? (
              <span className="mt-1 flex flex-wrap gap-1">
                {row.original.watchlistItem.tags.map((t) => (
                  <Badge key={t} tone="neutral">
                    {t}
                  </Badge>
                ))}
              </span>
            ) : null}
          </div>
        ),
      },
    ];
    for (const key of columnsVisible) {
      const col = COLUMN_MAP.get(key);
      if (!col) continue;
      defs.push({
        id: col.key,
        accessorFn: (r) => {
          const v = col.get(r.metrics);
          return v === null ? (col.numeric ? Number.NEGATIVE_INFINITY : "") : v;
        },
        header: col.label,
        meta: { numeric: col.numeric },
        cell: ({ row }) => {
          const f = col.format(row.original.metrics);
          return (
            <span className={cn(f.reason && "text-fg-muted", f.negative && "text-negative", f.positive && "text-positive")} title={f.reason}>
              {f.text}
            </span>
          );
        },
      });
    }
    if (scope === "watchlist") {
      defs.push({
        id: "note",
        accessorFn: (r) => r.watchlistItem?.note ?? "",
        header: "Note",
        cell: ({ row }) => (
          <button type="button" onClick={() => setEditItem(row.original)} className="max-w-[260px] truncate text-left text-xs text-fg-secondary hover:text-fg" title={row.original.watchlistItem?.note ?? "Add a note"}>
            {row.original.watchlistItem?.note ?? <span className="text-fg-muted">Add note or tags</span>}
          </button>
        ),
        enableSorting: false,
      });
    }
    return defs;
  }, [columnsVisible, selected, scope]);

  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Table returns functions the React Compiler cannot memoise; the compiler is not enabled here.
  const table = useReactTable({ data: filtered, columns, state: { sorting }, onSortingChange: setSorting, getCoreRowModel: getCoreRowModel(), getSortedRowModel: getSortedRowModel() });

  const currentConfig = (): ViewConfig => ({ columns: columnsVisible, sort: sorting[0] ? { column: sorting[0].id, direction: sorting[0].desc ? "desc" : "asc" } : null, filters });
  const applyView = (id: string) => {
    setViewId(id);
    const v = savedViews.find((x) => x.id === id);
    if (!v) return;
    setColumnsVisible(v.config.columns.length ? v.config.columns : DEFAULT_COLUMNS);
    setFilters(v.config.filters);
    setSorting(v.config.sort ? [{ id: v.config.sort.column, desc: v.config.sort.direction === "desc" }] : []);
  };
  const save = (asNew: boolean) => {
    start(async () => {
      const res = await saveViewAction(scope, saveName || savedViews.find((v) => v.id === viewId)?.name || "View", currentConfig(), asNew ? undefined : viewId || undefined);
      toast[res.ok ? "success" : "error"](res.message);
      if (res.ok) {
        setSaveOpen(false);
        setSaveName("");
        if (res.data) setViewId(res.data.id);
        router.refresh();
      }
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1">
          <label htmlFor="view-select" className="text-xs text-fg-muted">
            Saved view
          </label>
          <Select id="view-select" value={viewId} onChange={(e) => applyView(e.target.value)} className="h-8 w-[200px] text-[13px]">
            <option value="">Default columns</option>
            {savedViews.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </Select>
        </div>
        <Button variant="secondary" size="sm" onClick={() => setSaveOpen(true)}>
          Save view
        </Button>
        {viewId ? (
          <Button variant="ghost" size="sm" className="text-negative" disabled={pending} onClick={() => start(async () => { const res = await deleteViewAction(scope, viewId); toast[res.ok ? "success" : "error"](res.message); setViewId(""); router.refresh(); })}>
            Delete view
          </Button>
        ) : null}
        <div className="relative">
          <Button variant="secondary" size="sm" onClick={() => setShowColumns((s) => !s)} aria-expanded={showColumns} aria-controls="column-picker">
            <Columns size={15} aria-hidden /> Columns ({columnsVisible.length})
          </Button>
          {showColumns ? (
            <div id="column-picker" className="absolute left-0 top-full z-20 mt-1 w-[320px] rounded-md border border-border bg-panel p-3 shadow-panel">
              {(["price", "fundamentals", "valuation", "research"] as const).map((g) => (
                <fieldset key={g} className="mb-2">
                  <legend className="mb-1 text-[11px] font-medium uppercase tracking-wide text-fg-muted">{g}</legend>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                    {COLUMNS.filter((c) => c.group === g).map((c) => (
                      <label key={c.key} className="flex items-center gap-2 text-[13px]">
                        <input type="checkbox" checked={columnsVisible.includes(c.key)} onChange={(e) => setColumnsVisible(e.target.checked ? [...columnsVisible, c.key].sort((a, b) => COLUMNS.findIndex((x) => x.key === a) - COLUMNS.findIndex((x) => x.key === b)) : columnsVisible.filter((k) => k !== c.key))} className="h-3.5 w-3.5 accent-[var(--accent)]" />
                        {c.label}
                      </label>
                    ))}
                  </div>
                </fieldset>
              ))}
              <div className="flex justify-end">
                <Button variant="ghost" size="sm" onClick={() => setShowColumns(false)}>
                  Done
                </Button>
              </div>
            </div>
          ) : null}
        </div>
        <div className="ml-auto flex items-center gap-2">
          {selected.length >= 2 ? (
            <Link href={`/compare?symbols=${selected.join(",")}`} className={buttonClasses("primary", "sm")}>
              Compare {selected.length}
            </Link>
          ) : (
            <span className="text-xs text-fg-muted">Select 2 to 4 companies to compare</span>
          )}
        </div>
      </div>

      <form
        className="flex flex-wrap items-end gap-2 rounded-md border border-border bg-panel-sunken/40 px-3 py-2"
        onSubmit={(e) => {
          e.preventDefault();
          setFilters([...filters, draftFilter]);
        }}
      >
        <Funnel size={15} className="mb-2 text-fg-muted" aria-hidden />
        <div className="flex flex-col gap-1">
          <label htmlFor="flt-col" className="text-[11px] text-fg-muted">
            Filter column
          </label>
          <Select id="flt-col" value={draftFilter.column} onChange={(e) => setDraftFilter({ ...draftFilter, column: e.target.value, operator: COLUMN_MAP.get(e.target.value)?.numeric ? "gt" : "contains", value: COLUMN_MAP.get(e.target.value)?.numeric ? 0 : "" })} className="h-8 w-[170px] text-[13px]">
            {COLUMNS.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="flt-op" className="text-[11px] text-fg-muted">
            Condition
          </label>
          <Select id="flt-op" value={draftFilter.operator} onChange={(e) => setDraftFilter({ ...draftFilter, operator: e.target.value as Filter["operator"] })} className="h-8 w-[130px] text-[13px]">
            {COLUMN_MAP.get(draftFilter.column)?.numeric ? (
              <>
                <option value="gt">greater than</option>
                <option value="lt">less than</option>
              </>
            ) : (
              <option value="contains">contains</option>
            )}
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="flt-val" className="text-[11px] text-fg-muted">
            Value{COLUMN_MAP.get(draftFilter.column)?.numeric && isPctColumn(draftFilter.column) ? " (fraction, e.g. 0.15 for 15%)" : ""}
          </label>
          <Input id="flt-val" value={String(draftFilter.value)} onChange={(e) => setDraftFilter({ ...draftFilter, value: COLUMN_MAP.get(draftFilter.column)?.numeric ? Number(e.target.value) : e.target.value })} className="h-8 w-[150px] text-[13px]" inputMode={COLUMN_MAP.get(draftFilter.column)?.numeric ? "decimal" : "text"} />
        </div>
        <Button type="submit" variant="secondary" size="sm">
          Add filter
        </Button>
        {filters.map((f, i) => (
          <span key={i} className="inline-flex items-center gap-1 rounded-md bg-accent-soft px-2 py-1 text-xs text-fg">
            {COLUMN_MAP.get(f.column)?.label ?? f.column} {f.operator === "gt" ? ">" : f.operator === "lt" ? "<" : f.operator === "eq" ? "=" : "contains"} {isPctColumn(f.column) && typeof f.value === "number" ? `${(f.value * 100).toFixed(0)}%` : String(f.value)}
            <button type="button" onClick={() => setFilters(filters.filter((_, j) => j !== i))} aria-label="Remove filter" className="rounded-sm hover:text-negative">
              <X size={12} aria-hidden />
            </button>
          </span>
        ))}
        <span className="num ml-auto text-xs text-fg-muted">
          {filtered.length} of {rows.length}
        </span>
      </form>

      {filtered.length === 0 ? (
        <EmptyState title={rows.length ? "No companies match these filters" : scope === "watchlist" ? "Your watchlist is empty" : "No securities in the coverage universe"} description={rows.length ? "Remove a filter or widen a threshold." : scope === "watchlist" ? "Open any company page and choose Watch, or use the command palette." : undefined} />
      ) : (
        <TableScroll label={scope === "watchlist" ? "Watchlist" : "Screener"} className="rounded-md border border-border">
          <Table>
            <thead>
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id}>
                  {hg.headers.map((h) => {
                    const numeric = (h.column.columnDef.meta as { numeric?: boolean } | undefined)?.numeric;
                    const sorted = h.column.getIsSorted();
                    return (
                      <Th key={h.id} align={numeric ? "right" : "left"} aria-sort={sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : "none"}>
                        {h.column.getCanSort() ? (
                          <button type="button" onClick={h.column.getToggleSortingHandler()} className={cn("inline-flex items-center gap-1 rounded-sm hover:text-fg focus-visible:outline-2 focus-visible:outline-focus", numeric && "flex-row-reverse")}>
                            {flexRender(h.column.columnDef.header, h.getContext())}
                            {sorted === "asc" ? <CaretUp size={11} aria-hidden /> : sorted === "desc" ? <CaretDown size={11} aria-hidden /> : <CaretUpDown size={11} className="opacity-50" aria-hidden />}
                          </button>
                        ) : (
                          flexRender(h.column.columnDef.header, h.getContext())
                        )}
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
      )}

      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent title="Save view" description="Saves the visible columns, sort order and filters.">
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              save(!viewId);
            }}
          >
            <Field label="Name" htmlFor="view-name">
              <Input id="view-name" value={saveName} onChange={(e) => setSaveName(e.target.value)} placeholder={savedViews.find((v) => v.id === viewId)?.name ?? "Growth above 15%"} maxLength={80} autoComplete="off" />
            </Field>
            <div className="flex justify-end gap-2">
              {viewId ? (
                <Button type="button" variant="secondary" disabled={pending} onClick={() => save(false)}>
                  Update current view
                </Button>
              ) : null}
              <Button type="submit" variant="primary" disabled={pending}>
                Save as new
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={editItem !== null} onOpenChange={(o) => (!o ? setEditItem(null) : undefined)}>
        {editItem?.watchlistItem ? (
          <DialogContent title={`${editItem.metrics.symbol} · tags and note`} description="Research tags are free text; separate them with commas.">
            <form
              className="flex flex-col gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                const form = new FormData(e.currentTarget);
                const item = editItem.watchlistItem!;
                start(async () => {
                  const res = await updateWatchlistItemAction(item.id, { tags: String(form.get("tags") ?? "").split(",").map((t) => t.trim()).filter(Boolean), note: String(form.get("note") ?? "") });
                  toast[res.ok ? "success" : "error"](res.message);
                  setEditItem(null);
                  router.refresh();
                });
              }}
            >
              <Field label="Tags" htmlFor="wl-tags">
                <Input id="wl-tags" name="tags" defaultValue={editItem.watchlistItem.tags.join(", ")} autoComplete="off" />
              </Field>
              <Field label="Note" htmlFor="wl-note">
                <Input id="wl-note" name="note" defaultValue={editItem.watchlistItem.note ?? ""} maxLength={500} autoComplete="off" />
              </Field>
              <div className="flex items-center justify-between">
                <Button type="button" variant="ghost" size="sm" className="text-negative" disabled={pending} onClick={() => { const item = editItem.watchlistItem!; start(async () => { const res = await removeWatchlistItemAction(item.id); toast[res.ok ? "success" : "error"](res.message); setEditItem(null); router.refresh(); }); }}>
                  Remove from watchlist
                </Button>
                <Button type="submit" variant="primary" disabled={pending}>
                  Save
                </Button>
              </div>
            </form>
          </DialogContent>
        ) : null}
      </Dialog>
    </div>
  );
}

function isPctColumn(key: string): boolean {
  return ["changePct", "revenueGrowth", "grossMargin", "operatingMargin", "fcfMargin", "fcfYield", "sharesDilutedGrowth"].includes(key);
}
