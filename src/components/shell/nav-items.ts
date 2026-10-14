export interface NavItem {
  href: string;
  label: string;
  icon: "overview" | "portfolio" | "company" | "risk" | "watchlist" | "screener" | "theses" | "settings";
  match: (pathname: string) => boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Overview", icon: "overview", match: (p) => p === "/" },
  { href: "/portfolio", label: "Portfolio", icon: "portfolio", match: (p) => p.startsWith("/portfolio") },
  { href: "/watchlist", label: "Watchlist", icon: "watchlist", match: (p) => p.startsWith("/watchlist") || p.startsWith("/compare") },
  { href: "/screener", label: "Screener", icon: "screener", match: (p) => p.startsWith("/screener") },
  { href: "/risk", label: "Risk", icon: "risk", match: (p) => p.startsWith("/risk") },
  { href: "/theses", label: "Theses", icon: "theses", match: (p) => p.startsWith("/theses") },
  { href: "/settings", label: "Settings", icon: "settings", match: (p) => p.startsWith("/settings") },
];
