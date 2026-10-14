"use client";

import * as React from "react";
import { Tabs as RadixTabs } from "radix-ui";
import { cn } from "@/lib/cn";

export const Tabs = RadixTabs.Root;

export function TabsList({ className, ...props }: React.ComponentProps<typeof RadixTabs.List>) {
  return <RadixTabs.List className={cn("flex items-center gap-1 overflow-x-auto scrollbar-thin border-b border-border", className)} {...props} />;
}

export function TabsTrigger({ className, ...props }: React.ComponentProps<typeof RadixTabs.Trigger>) {
  return (
    <RadixTabs.Trigger
      className={cn(
        "relative -mb-px h-9 whitespace-nowrap border-b-2 border-transparent px-3 text-sm text-fg-secondary transition-colors hover:text-fg data-[state=active]:border-accent data-[state=active]:text-fg focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus",
        className,
      )}
      {...props}
    />
  );
}

export function TabsContent({ className, ...props }: React.ComponentProps<typeof RadixTabs.Content>) {
  return <RadixTabs.Content className={cn("pt-4 focus-visible:outline-none", className)} {...props} />;
}
