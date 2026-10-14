"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PencilSimple, Plus, Trash } from "@phosphor-icons/react";
import type { Portfolio } from "@/db/schema";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/field";
import { deletePortfolioAction, savePortfolioAction } from "@/app/actions/portfolio";

export function PortfolioEditor({ portfolios, current }: { portfolios: Portfolio[]; current?: Portfolio | null }) {
  const router = useRouter();
  const [open, setOpen] = React.useState<null | "new" | "edit" | "delete">(portfolios.length === 0 ? "new" : null);
  const [pending, start] = React.useTransition();
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  const submit = (form: FormData, id?: string) => {
    start(async () => {
      const res = await savePortfolioAction({ name: String(form.get("name") ?? ""), benchmarkSymbol: String(form.get("benchmarkSymbol") ?? ""), description: String(form.get("description") ?? "") }, id);
      if (!res.ok) {
        setErrors(res.fieldErrors ?? {});
        toast.error(res.message);
        return;
      }
      setErrors({});
      setOpen(null);
      toast.success(res.message);
      router.push(`/portfolio?portfolio=${res.data?.id}`);
      router.refresh();
    });
  };

  const remove = (id: string) => {
    start(async () => {
      const res = await deletePortfolioAction(id);
      toast[res.ok ? "success" : "error"](res.message);
      setOpen(null);
      router.push("/portfolio");
      router.refresh();
    });
  };

  const editing = open === "edit" ? current : null;
  return (
    <>
      {current ? (
        <Button variant="ghost" size="sm" onClick={() => setOpen("edit")} aria-label={`Edit portfolio ${current.name}`}>
          <PencilSimple size={15} aria-hidden /> Edit
        </Button>
      ) : null}
      <Button variant={portfolios.length === 0 ? "primary" : "ghost"} size="sm" onClick={() => setOpen("new")}>
        <Plus size={15} aria-hidden /> New portfolio
      </Button>
      <Dialog open={open === "new" || open === "edit"} onOpenChange={(o) => (!o ? setOpen(null) : undefined)}>
        <DialogContent title={editing ? `Edit ${editing.name}` : "New portfolio"} description="Portfolios are valued in US dollars with FIFO cost basis.">
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              submit(new FormData(e.currentTarget), editing?.id);
            }}
          >
            <Field label="Name" htmlFor="pf-name" error={errors.name}>
              <Input id="pf-name" name="name" defaultValue={editing?.name ?? ""} required maxLength={80} autoComplete="off" />
            </Field>
            <Field label="Benchmark symbol" htmlFor="pf-bench" hint="Returns are compared with this security over matching dates." error={errors.benchmarkSymbol}>
              <Input id="pf-bench" name="benchmarkSymbol" defaultValue={editing?.benchmarkSymbol ?? "BMKT"} required maxLength={12} className="num uppercase" autoComplete="off" spellCheck={false} />
            </Field>
            <Field label="Description" htmlFor="pf-desc" hint="Optional" error={errors.description}>
              <Textarea id="pf-desc" name="description" defaultValue={editing?.description ?? ""} maxLength={300} />
            </Field>
            <div className="flex items-center justify-between gap-2 pt-1">
              {editing ? (
                <Button type="button" variant="danger" size="sm" onClick={() => setOpen("delete")}>
                  <Trash size={14} aria-hidden /> Delete portfolio
                </Button>
              ) : (
                <span />
              )}
              <div className="flex gap-2">
                <Button type="button" variant="ghost" onClick={() => setOpen(null)}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary" disabled={pending}>
                  {pending ? "Saving…" : editing ? "Save changes" : "Create portfolio"}
                </Button>
              </div>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={open === "delete"} onOpenChange={(o) => (!o ? setOpen(null) : undefined)}>
        <DialogContent title="Delete this portfolio?" description="Every transaction in it is removed. This cannot be undone.">
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen("edit")}>
              Keep it
            </Button>
            <Button variant="danger" disabled={pending} onClick={() => current && remove(current.id)}>
              Delete {current?.name}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
