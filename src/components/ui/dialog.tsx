"use client";

import * as React from "react";
import { Dialog as RadixDialog } from "radix-ui";
import { X } from "@phosphor-icons/react";
import { cn } from "@/lib/cn";
import { Button } from "./button";

export const Dialog = RadixDialog.Root;
export const DialogTrigger = RadixDialog.Trigger;
export const DialogClose = RadixDialog.Close;

export function DialogContent({ title, description, children, className, side = "center", widthClass }: { title: string; description?: React.ReactNode; children: React.ReactNode; className?: string; side?: "center" | "right"; widthClass?: string }) {
  return (
    <RadixDialog.Portal>
      <RadixDialog.Overlay className="fixed inset-0 z-40 bg-overlay data-[state=open]:animate-in data-[state=open]:fade-in" />
      <RadixDialog.Content
        className={cn(
          "fixed z-50 flex flex-col bg-panel text-fg shadow-panel border border-border focus:outline-none",
          side === "center"
            ? cn("left-1/2 top-1/2 max-h-[calc(100dvh-32px)] w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 rounded-lg", widthClass ?? "max-w-lg")
            : cn("inset-y-0 right-0 h-dvh w-full border-y-0 border-r-0 sm:w-[440px]", widthClass),
          className,
        )}
      >
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <RadixDialog.Title className="text-[15px] font-semibold leading-6">{title}</RadixDialog.Title>
            {description ? <RadixDialog.Description className="text-xs text-fg-muted mt-0.5">{description}</RadixDialog.Description> : <RadixDialog.Description className="sr-only">{title}</RadixDialog.Description>}
          </div>
          <RadixDialog.Close asChild>
            <Button variant="ghost" size="icon" aria-label="Close">
              <X size={16} aria-hidden />
            </Button>
          </RadixDialog.Close>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 scrollbar-thin">{children}</div>
      </RadixDialog.Content>
    </RadixDialog.Portal>
  );
}
