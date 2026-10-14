// Usage: node scripts/screenshot.mjs <url> <out.png> [width] [height] [dark|light]
import { chromium } from "@playwright/test";
const [, , url, out, width = "1440", height = "900", theme = "dark"] = process.argv;
import fs from "node:fs";
const candidates = [process.env.PLAYWRIGHT_CHROMIUM_PATH, "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"].filter(Boolean);
const executablePath = candidates.find((p) => fs.existsSync(p));
const browser = await chromium.launch(executablePath ? { executablePath } : {});
const ctx = await browser.newContext({ viewport: { width: Number(width), height: Number(height) }, deviceScaleFactor: 1, colorScheme: theme === "light" ? "light" : "dark" });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => {
  if (m.type() === "error") errors.push("console: " + m.text().slice(0, 300));
});
await page.addInitScript((t) => {
  try {
    localStorage.setItem("theme", t);
  } catch {}
}, theme);
await page.goto(url, { waitUntil: "networkidle", timeout: 120000 });
await page.waitForTimeout(600);
await page.screenshot({ path: out, fullPage: true });
console.log("saved", out, "| errors:", errors.length ? errors.join(" || ") : "none");
await browser.close();
