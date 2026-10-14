import localFont from "next/font/local";

/** IBM Plex Sans: the interface face. Supports tabular numerals via font-variant-numeric. */
export const plexSans = localFont({
  src: [
    { path: "../fonts/IBMPlexSans-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../fonts/IBMPlexSans-400-italic.woff2", weight: "400", style: "italic" },
    { path: "../fonts/IBMPlexSans-500-normal.woff2", weight: "500", style: "normal" },
    { path: "../fonts/IBMPlexSans-600-normal.woff2", weight: "600", style: "normal" },
  ],
  variable: "--font-plex-sans",
  display: "swap",
  fallback: ["system-ui", "Segoe UI", "sans-serif"],
});

/** IBM Plex Mono: used for financial figures so digits align in columns. */
export const plexMono = localFont({
  src: [
    { path: "../fonts/IBMPlexMono-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../fonts/IBMPlexMono-500-normal.woff2", weight: "500", style: "normal" },
    { path: "../fonts/IBMPlexMono-600-normal.woff2", weight: "600", style: "normal" },
  ],
  variable: "--font-plex-mono",
  display: "swap",
  fallback: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
});
