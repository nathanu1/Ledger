export function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="rounded-sm border border-border-strong bg-panel-sunken px-1.5 py-0.5 font-mono text-[10.5px] text-fg-muted">{children}</kbd>;
}
