import { ExplainProvider } from "@/components/metrics/explain-context";
import { ExplainDrawer } from "@/components/metrics/explain-drawer";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { MobileNav, SideNav } from "./side-nav";
import { TopBar, type ShellData } from "./top-bar";

export function AppShell({ data, children }: { data: ShellData; children: React.ReactNode }) {
  return (
    <TooltipProvider>
      <ExplainProvider>
        <div className="flex min-h-dvh">
          <SideNav />
          <div className="flex min-w-0 flex-1 flex-col">
            <TopBar data={data} />
            <main id="main" className="min-w-0 flex-1 px-4 pb-24 pt-5 sm:px-6 lg:px-8 lg:pb-10">
              <div className="mx-auto w-full max-w-[1400px]">{children}</div>
            </main>
          </div>
        </div>
        <MobileNav />
        <ExplainDrawer />
        <Toaster />
      </ExplainProvider>
    </TooltipProvider>
  );
}
