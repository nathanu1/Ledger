"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { TRANSACTION_TYPES, type TransactionType } from "@/calc/types";
import type { TransactionRow } from "@/db/schema";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { deleteTransactionAction, saveTransactionAction, type TransactionFormInput } from "@/app/actions/portfolio";

const TYPE_LABELS: Record<TransactionType, string> = {
  BUY: "Buy",
  SELL: "Sell",
  DEPOSIT: "Deposit",
  WITHDRAWAL: "Withdrawal",
  DIVIDEND: "Cash dividend",
  INTEREST: "Interest",
  FEE: "Fee",
  SPLIT: "Stock split",
};

const TYPE_HELP: Record<TransactionType, string> = {
  BUY: "Cost basis = quantity x price + fee. For a dividend reinvestment, record the dividend and a linked buy.",
  SELL: "Proceeds = quantity x price - fee. Lots are matched first in, first out.",
  DEPOSIT: "External cash in. Deposits are never counted as investment gains.",
  WITHDRAWAL: "External cash out.",
  DIVIDEND: "Cash received; recorded as income for the symbol.",
  INTEREST: "Interest on the cash balance.",
  FEE: "A standalone account fee (trade commissions belong on the trade).",
  SPLIT: "Multiplies open lots by new shares per old shares; cost basis is unchanged.",
};

export function TransactionDialog({ portfolioId, open, onOpenChange, editing, dividends }: { portfolioId: string; open: boolean; onOpenChange: (o: boolean) => void; editing: TransactionRow | null; dividends: Array<{ id: string; label: string }> }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [type, setType] = React.useState<TransactionType>((editing?.type as TransactionType) ?? "BUY");
  const [confirmDelete, setConfirmDelete] = React.useState(false);

  const [seen, setSeen] = React.useState<{ id: string | null; open: boolean }>({ id: editing?.id ?? null, open });
  if (seen.id !== (editing?.id ?? null) || seen.open !== open) {
    // Reset the form when a different transaction is opened (derived during render, not in an effect).
    setSeen({ id: editing?.id ?? null, open });
    setType((editing?.type as TransactionType) ?? "BUY");
    setErrors({});
    setConfirmDelete(false);
  }

  const isTrade = type === "BUY" || type === "SELL";
  const needsAmount = ["DEPOSIT", "WITHDRAWAL", "DIVIDEND", "INTEREST", "FEE"].includes(type);
  const needsSymbol = isTrade || type === "DIVIDEND" || type === "SPLIT";

  const submit = (form: FormData) => {
    const raw: TransactionFormInput = {
      type,
      date: String(form.get("date") ?? ""),
      symbol: String(form.get("symbol") ?? ""),
      quantity: String(form.get("quantity") ?? ""),
      price: String(form.get("price") ?? ""),
      amount: String(form.get("amount") ?? ""),
      fee: String(form.get("fee") ?? ""),
      splitNumerator: String(form.get("splitNumerator") ?? ""),
      splitDenominator: String(form.get("splitDenominator") ?? ""),
      linkedTransactionId: String(form.get("linkedTransactionId") ?? ""),
      note: String(form.get("note") ?? ""),
    };
    start(async () => {
      const res = await saveTransactionAction(portfolioId, raw, editing?.id ?? null);
      if (!res.ok) {
        setErrors(res.fieldErrors ?? {});
        toast.error(res.message);
        return;
      }
      toast.success(res.message);
      onOpenChange(false);
      router.refresh();
    });
  };

  const remove = () => {
    if (!editing) return;
    start(async () => {
      const res = await deleteTransactionAction(editing.id);
      toast[res.ok ? "success" : "error"](res.message);
      onOpenChange(false);
      router.refresh();
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={editing ? "Edit transaction" : "Add transaction"} description={TYPE_HELP[type]}>
        <form
          className="grid grid-cols-2 gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            submit(new FormData(e.currentTarget));
          }}
        >
          <Field label="Type" htmlFor="tx-type" error={errors.type}>
            <Select id="tx-type" name="type" value={type} onChange={(e) => setType(e.target.value as TransactionType)}>
              {TRANSACTION_TYPES.map((t) => (
                <option key={t} value={t}>
                  {TYPE_LABELS[t]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Date" htmlFor="tx-date" error={errors.date}>
            <Input id="tx-date" name="date" type="date" defaultValue={editing?.date ?? ""} required className="num" />
          </Field>
          {needsSymbol ? (
            <Field label="Symbol" htmlFor="tx-symbol" error={errors.symbol} className={isTrade ? "" : "col-span-2"}>
              <Input id="tx-symbol" name="symbol" defaultValue={editing?.symbol ?? ""} className="num uppercase" autoComplete="off" spellCheck={false} maxLength={12} placeholder="HALC" />
            </Field>
          ) : null}
          {isTrade ? (
            <>
              <Field label="Quantity (shares)" htmlFor="tx-qty" error={errors.quantity}>
                <Input id="tx-qty" name="quantity" inputMode="decimal" defaultValue={editing?.quantity ?? ""} className="num" placeholder="10" />
              </Field>
              <Field label="Price per share" htmlFor="tx-price" error={errors.price}>
                <Input id="tx-price" name="price" inputMode="decimal" defaultValue={editing?.price ?? ""} className="num" placeholder="123.45" />
              </Field>
              <Field label="Fee or commission" htmlFor="tx-fee" hint="Optional" error={errors.fee}>
                <Input id="tx-fee" name="fee" inputMode="decimal" defaultValue={editing?.fee ?? ""} className="num" placeholder="0" />
              </Field>
            </>
          ) : null}
          {needsAmount ? (
            <Field label="Amount" htmlFor="tx-amount" error={errors.amount} className="col-span-2">
              <Input id="tx-amount" name="amount" inputMode="decimal" defaultValue={editing?.amount ?? ""} className="num" placeholder="1000.00" />
            </Field>
          ) : null}
          {type === "SPLIT" ? (
            <>
              <Field label="New shares" htmlFor="tx-num" error={errors.splitNumerator}>
                <Input id="tx-num" name="splitNumerator" inputMode="numeric" defaultValue={editing?.splitNumerator?.toString() ?? ""} className="num" placeholder="4" />
              </Field>
              <Field label="Per old shares" htmlFor="tx-den" error={errors.splitDenominator}>
                <Input id="tx-den" name="splitDenominator" inputMode="numeric" defaultValue={editing?.splitDenominator?.toString() ?? "1"} className="num" placeholder="1" />
              </Field>
            </>
          ) : null}
          {type === "BUY" && dividends.length ? (
            <Field label="Reinvests dividend" htmlFor="tx-link" hint="Link this buy to the dividend it reinvests (DRIP). Income is counted once, on the dividend." className="col-span-2">
              <Select id="tx-link" name="linkedTransactionId" defaultValue={editing?.linkedTransactionId ?? ""}>
                <option value="">Not a reinvestment</option>
                {dividends.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.label}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}
          <Field label="Note" htmlFor="tx-note" hint="Optional" className="col-span-2">
            <Textarea id="tx-note" name="note" defaultValue={editing?.note ?? ""} maxLength={500} className="min-h-[60px]" />
          </Field>
          <div className="col-span-2 flex items-center justify-between gap-2 pt-1">
            {editing ? (
              confirmDelete ? (
                <div className="flex items-center gap-2 text-xs text-fg-secondary">
                  Delete this transaction?
                  <Button type="button" variant="danger" size="sm" onClick={remove} disabled={pending}>
                    Yes, delete
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>
                    No
                  </Button>
                </div>
              ) : (
                <Button type="button" variant="ghost" size="sm" className="text-negative" onClick={() => setConfirmDelete(true)}>
                  Delete
                </Button>
              )
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={pending}>
                {pending ? "Saving…" : editing ? "Save changes" : "Add transaction"}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
