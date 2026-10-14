"use client";

import { Toaster as Sonner } from "sonner";
import { useTheme } from "next-themes";

export function Toaster() {
  const { resolvedTheme } = useTheme();
  return (
    <Sonner
      theme={resolvedTheme === "light" ? "light" : "dark"}
      position="bottom-right"
      toastOptions={{
        classNames: {
          toast: "!bg-panel-raised !text-fg !border !border-border !shadow-panel !rounded-md",
          description: "!text-fg-secondary",
        },
      }}
    />
  );
}
