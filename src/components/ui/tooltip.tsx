"use client";

import * as React from "react";
import { Tooltip as RadixTooltip } from "radix-ui";

export function TooltipProvider({ children }: { children: React.ReactNode }) {
  return <RadixTooltip.Provider delayDuration={250}>{children}</RadixTooltip.Provider>;
}

export function Tip({ content, children }: { content: React.ReactNode; children: React.ReactElement }) {
  return (
    <RadixTooltip.Root>
      <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
      <RadixTooltip.Portal>
        <RadixTooltip.Content sideOffset={6} className="z-50 max-w-xs rounded-md border border-border bg-panel-raised px-2.5 py-1.5 text-xs text-fg shadow-panel">
          {content}
          <RadixTooltip.Arrow className="fill-panel-raised" />
        </RadixTooltip.Content>
      </RadixTooltip.Portal>
    </RadixTooltip.Root>
  );
}
