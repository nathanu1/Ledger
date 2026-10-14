import type { Metadata, Viewport } from "next";
import { ThemeProvider } from "next-themes";
import { AppShell } from "@/components/shell/app-shell";
import { ensureDemoSeeded } from "@/services/bootstrap";
import { getFreshness } from "@/services/market-data";
import { listPortfolios, resolvePortfolioId } from "@/services/portfolio";
import { plexMono, plexSans } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Ledger", template: "%s · Ledger" },
  description: "Stock research and portfolio intelligence for an individual investor.",
  applicationName: "Ledger",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0b1020" },
    { media: "(prefers-color-scheme: light)", color: "#f4f6f9" },
  ],
};

export const dynamic = "force-dynamic";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  ensureDemoSeeded();
  const freshness = getFreshness();
  const portfolios = listPortfolios().map((p) => ({ id: p.id, name: p.name }));
  const activePortfolioId = resolvePortfolioId(null);
  return (
    <html lang="en" suppressHydrationWarning className={`${plexSans.variable} ${plexMono.variable}`}>
      <body className="font-sans antialiased">
        <ThemeProvider attribute="data-theme" defaultTheme="dark" enableSystem={false} disableTransitionOnChange>
          <AppShell data={{ mode: freshness.mode, asOf: freshness.asOf, freshness: { latestPriceDate: freshness.latestPriceDate, latestRetrievedAt: freshness.latestRetrievedAt, provider: freshness.provider }, portfolios, activePortfolioId }}>
            {children}
          </AppShell>
        </ThemeProvider>
      </body>
    </html>
  );
}
