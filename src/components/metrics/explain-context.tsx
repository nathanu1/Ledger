"use client";

import * as React from "react";

export interface ExplainSource {
  provider: string;
  reference?: string | null;
  retrievedAt?: string | null;
  derivation?: string | null;
  form?: string | null;
}

export interface ExplainDetail {
  title: string;
  value?: string | null;
  definition: string;
  period?: string | null;
  units?: string | null;
  status?: "reported" | "calculated" | "unavailable" | "assumption" | "historical" | "hypothetical";
  filedAt?: string | null;
  source?: ExplainSource | null;
  limitations?: string[];
  notes?: string[];
  links?: Array<{ label: string; href: string }>;
}

interface ExplainContextValue {
  detail: ExplainDetail | null;
  open: (detail: ExplainDetail) => void;
  close: () => void;
}

const ExplainContext = React.createContext<ExplainContextValue | null>(null);

export function ExplainProvider({ children }: { children: React.ReactNode }) {
  const [detail, setDetail] = React.useState<ExplainDetail | null>(null);
  const value = React.useMemo<ExplainContextValue>(() => ({ detail, open: setDetail, close: () => setDetail(null) }), [detail]);
  return <ExplainContext.Provider value={value}>{children}</ExplainContext.Provider>;
}

export function useExplain(): ExplainContextValue {
  const ctx = React.useContext(ExplainContext);
  if (!ctx) throw new Error("useExplain must be used inside ExplainProvider");
  return ctx;
}
