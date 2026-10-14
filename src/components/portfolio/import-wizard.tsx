"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Papa from "papaparse";
import { toast } from "sonner";
import { CheckCircle, FileCsv, WarningCircle } from "@phosphor-icons/react";
import { MAPPING_FIELDS, suggestMapping, type DateFormat, type ImportColumnMapping, type ImportValidation } from "@/calc/csv-import";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty";
import { Field, Select, Textarea } from "@/components/ui/field";
import { Table, TableScroll, Td, Th, Tr } from "@/components/ui/table";
import { commitImportAction, previewImportAction } from "@/app/actions/portfolio";
import { formatDate, formatMoney, formatShares } from "@/lib/format";

type Step = "upload" | "map" | "preview" | "done";

const SAMPLE = `Date,Type,Symbol,Quantity,Price,Amount,Fee,Note
2024-01-02,Deposit,,,,10000,,Opening deposit
2024-01-03,Buy,HALC,10,120.50,,1,
2024-03-15,Dividend,BRKW,,,27.50,,
2024-06-14,Split,KSTR,,,,,2:1`;

export function ImportWizard({ portfolioId, portfolioName }: { portfolioId: string; portfolioName: string }) {
  const router = useRouter();
  const [step, setStep] = React.useState<Step>("upload");
  const [fileName, setFileName] = React.useState("pasted.csv");
  const [headers, setHeaders] = React.useState<string[]>([]);
  const [rows, setRows] = React.useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = React.useState<ImportColumnMapping | null>(null);
  const [dateFormat, setDateFormat] = React.useState<DateFormat>("auto");
  const [validation, setValidation] = React.useState<ImportValidation | null>(null);
  const [includeDuplicates, setIncludeDuplicates] = React.useState(false);
  const [pending, start] = React.useTransition();
  const [result, setResult] = React.useState<{ imported: number; skipped: number } | null>(null);
  const [parseError, setParseError] = React.useState<string | null>(null);
  const [pasted, setPasted] = React.useState("");

  const parseText = (text: string, name: string) => {
    const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: "greedy", transformHeader: (h) => h.trim() });
    if (parsed.errors.length && parsed.data.length === 0) {
      setParseError(parsed.errors[0].message);
      return;
    }
    const hdrs = parsed.meta.fields ?? [];
    if (hdrs.length < 2) {
      setParseError("The file needs a header row with at least a date and a type column.");
      return;
    }
    setParseError(null);
    setFileName(name);
    setHeaders(hdrs);
    setRows(parsed.data.map((r) => Object.fromEntries(hdrs.map((h) => [h, String(r[h] ?? "")]))));
    setMapping(suggestMapping(hdrs));
    setStep("map");
  };

  const onFile = (file: File | undefined) => {
    if (!file) return;
    file.text().then((text) => parseText(text, file.name));
  };

  const preview = () => {
    if (!mapping) return;
    start(async () => {
      const res = await previewImportAction({ portfolioId, rows, mapping, dateFormat });
      if (!res.ok || !res.data) {
        toast.error(res.message);
        return;
      }
      setValidation(res.data);
      setStep("preview");
    });
  };

  const commit = () => {
    if (!mapping) return;
    start(async () => {
      const res = await commitImportAction({ portfolioId, fileName, rows, mapping, dateFormat, includeDuplicates });
      if (!res.ok || !res.data) {
        toast.error(res.message);
        return;
      }
      setResult(res.data);
      setStep("done");
      toast.success(res.message);
      router.refresh();
    });
  };

  const steps: Array<{ key: Step; label: string }> = [
    { key: "upload", label: "1. Choose file" },
    { key: "map", label: "2. Map columns" },
    { key: "preview", label: "3. Review" },
    { key: "done", label: "4. Done" },
  ];

  return (
    <div className="flex flex-col gap-5">
      <ol className="flex flex-wrap gap-2 text-xs" aria-label="Import steps">
        {steps.map((s) => (
          <li key={s.key} aria-current={s.key === step ? "step" : undefined} className={`rounded-md border px-2.5 py-1 ${s.key === step ? "border-accent bg-accent-soft text-fg" : "border-border text-fg-muted"}`}>
            {s.label}
          </li>
        ))}
      </ol>

      {step === "upload" ? (
        <div className="grid gap-5 lg:grid-cols-2">
          <div className="panel flex flex-col gap-3 p-5">
            <h2 className="text-sm font-semibold">Upload a CSV</h2>
            <p className="text-sm text-fg-secondary">Export transactions from your broker as CSV. Column names are matched automatically and can be adjusted in the next step. Up to 5,000 rows per import.</p>
            <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border-strong px-4 py-8 text-sm text-fg-secondary hover:border-accent">
              <FileCsv size={28} className="text-fg-muted" aria-hidden />
              <span>Choose a .csv file</span>
              <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
            </label>
            {parseError ? <p className="text-sm text-negative" role="alert">{parseError}</p> : null}
          </div>
          <div className="panel flex flex-col gap-3 p-5">
            <h2 className="text-sm font-semibold">Or paste CSV text</h2>
            <Textarea value={pasted} onChange={(e) => setPasted(e.target.value)} placeholder={SAMPLE} className="num min-h-[160px] text-xs" aria-label="CSV text" spellCheck={false} />
            <div className="flex gap-2">
              <Button variant="primary" size="sm" onClick={() => parseText(pasted, "pasted.csv")} disabled={!pasted.trim()}>
                Continue
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setPasted(SAMPLE)}>
                Use sample
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {step === "map" && mapping ? (
        <div className="panel flex flex-col gap-4 p-5">
          <div>
            <h2 className="text-sm font-semibold">Map columns</h2>
            <p className="text-sm text-fg-secondary">
              {rows.length} rows from <span className="num">{fileName}</span>. Date and Type are required; other columns depend on the transaction type.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {MAPPING_FIELDS.map((f) => (
              <Field key={f.key} label={`${f.label}${f.required ? "" : " (optional)"}`} htmlFor={`map-${f.key}`} hint={f.hint}>
                <Select id={`map-${f.key}`} value={mapping[f.key] ?? ""} onChange={(e) => setMapping({ ...mapping, [f.key]: e.target.value || null })}>
                  <option value="">Not in file</option>
                  {headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </Select>
              </Field>
            ))}
            <Field label="Date format" htmlFor="map-datefmt" hint="Ambiguous dates like 03/04/2024 need an explicit order.">
              <Select id="map-datefmt" value={dateFormat} onChange={(e) => setDateFormat(e.target.value as DateFormat)}>
                <option value="auto">Detect (ISO, then month/day/year)</option>
                <option value="YMD">Year-month-day</option>
                <option value="MDY">Month/day/year</option>
                <option value="DMY">Day/month/year</option>
              </Select>
            </Field>
          </div>
          <div className="rounded-md border border-border">
            <TableScroll label="First rows of the file" className="max-h-[220px]">
              <Table>
                <thead>
                  <tr>
                    {headers.map((h) => (
                      <Th key={h}>{h}</Th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 5).map((r, i) => (
                    <Tr key={i}>
                      {headers.map((h) => (
                        <Td key={h} className="whitespace-nowrap">
                          {r[h]}
                        </Td>
                      ))}
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </TableScroll>
          </div>
          <div className="flex justify-between">
            <Button variant="ghost" onClick={() => setStep("upload")}>
              Back
            </Button>
            <Button variant="primary" onClick={preview} disabled={pending || !mapping.date || !mapping.type}>
              {pending ? "Checking…" : "Review rows"}
            </Button>
          </div>
        </div>
      ) : null}

      {step === "preview" && validation ? (
        <div className="panel flex flex-col gap-4 p-5">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <h2 className="mr-2 text-sm font-semibold">Review before importing</h2>
            <Badge tone="positive">{validation.summary.importable} ready</Badge>
            {validation.summary.invalid ? <Badge tone="negative">{validation.summary.invalid} with errors</Badge> : null}
            {validation.summary.duplicatesOfExisting ? <Badge tone="warning">{validation.summary.duplicatesOfExisting} already in ledger</Badge> : null}
            {validation.summary.duplicatesInFile ? <Badge tone="warning">{validation.summary.duplicatesInFile} repeated in file</Badge> : null}
          </div>
          <p className="text-sm text-fg-secondary">Rows with errors are skipped. Duplicates are detected by date, type, symbol, quantity, price, amount and fee; they are skipped unless you choose to include them.</p>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={includeDuplicates} onChange={(e) => setIncludeDuplicates(e.target.checked)} className="h-4 w-4 accent-[var(--accent)]" />
            Import duplicates too
          </label>
          <TableScroll label="Rows to import" className="max-h-[420px] rounded-md border border-border">
            <Table>
              <thead>
                <tr>
                  <Th>Row</Th>
                  <Th>Status</Th>
                  <Th>Date</Th>
                  <Th>Type</Th>
                  <Th>Symbol</Th>
                  <Th align="right">Quantity</Th>
                  <Th align="right">Price</Th>
                  <Th align="right">Amount</Th>
                  <Th>Details</Th>
                </tr>
              </thead>
              <tbody>
                {validation.rows.slice(0, 300).map((r) => (
                  <Tr key={r.rowNumber} className={r.errors.length ? "bg-negative-soft/30" : r.duplicate ? "bg-warning-soft/30" : ""}>
                    <Td numeric>{r.rowNumber}</Td>
                    <Td>
                      {r.errors.length ? (
                        <span className="inline-flex items-center gap-1 text-negative">
                          <WarningCircle size={14} aria-hidden /> Error
                        </span>
                      ) : r.duplicate ? (
                        <span className="text-warning">{r.duplicate === "existing" ? "Duplicate of ledger" : "Duplicate in file"}</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-positive">
                          <CheckCircle size={14} aria-hidden /> Ready
                        </span>
                      )}
                    </Td>
                    <Td numeric>{r.transaction ? formatDate(r.transaction.date) : r.raw[Object.keys(r.raw)[0]]}</Td>
                    <Td>{r.transaction?.type ?? ""}</Td>
                    <Td className="num">{r.transaction?.symbol ?? ""}</Td>
                    <Td align="right" numeric>
                      {r.transaction?.type === "SPLIT" ? `${r.transaction.splitNumerator}:${r.transaction.splitDenominator}` : r.transaction?.quantity ? formatShares(r.transaction.quantity) : ""}
                    </Td>
                    <Td align="right" numeric>
                      {r.transaction?.price ? formatMoney(r.transaction.price) : ""}
                    </Td>
                    <Td align="right" numeric>
                      {r.transaction?.amount ? formatMoney(r.transaction.amount) : ""}
                    </Td>
                    <Td className="max-w-[320px] text-xs text-fg-secondary">{[...r.errors, ...r.warnings].join(" ")}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </TableScroll>
          {validation.rows.length > 300 ? <p className="text-xs text-fg-muted">Showing the first 300 of {validation.rows.length} rows; all rows are processed on import.</p> : null}
          <div className="flex justify-between">
            <Button variant="ghost" onClick={() => setStep("map")}>
              Back to mapping
            </Button>
            <Button variant="primary" onClick={commit} disabled={pending || (validation.summary.importable === 0 && !includeDuplicates)}>
              {pending ? "Importing…" : `Import ${includeDuplicates ? validation.summary.valid : validation.summary.importable} transactions`}
            </Button>
          </div>
        </div>
      ) : null}

      {step === "done" && result ? (
        <EmptyState
          title={`Imported ${result.imported} transactions into ${portfolioName}`}
          description={`${result.skipped} rows were skipped. Holdings, cash and returns have been recalculated from the ledger.`}
          action={
            <div className="flex gap-3">
              <Link href={`/portfolio?portfolio=${portfolioId}`} className="text-accent hover:underline">
                View holdings
              </Link>
              <Link href={`/portfolio/transactions?portfolio=${portfolioId}`} className="text-accent hover:underline">
                View transactions
              </Link>
            </div>
          }
        />
      ) : null}
    </div>
  );
}
