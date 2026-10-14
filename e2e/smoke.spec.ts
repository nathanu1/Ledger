import { expect, test } from "@playwright/test";

// Mutating flows tag their rows with a per-run token so a leftover row from an
// interrupted run (or another project) never collides with this one.
const RUN = `${Date.now().toString(36)}`;

test.describe("main workflows", () => {
  test("overview shows portfolio value, period return and contributors", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "What changed?" })).toBeVisible();
    await expect(page.getByText("Portfolio value")).toBeVisible();
    await expect(page.getByText("Biggest contributors", { exact: false })).toBeVisible();
    await expect(page.getByLabel("Demo data mode: fictional dataset")).toBeVisible();
    await page.getByRole("link", { name: "3 months" }).click();
    await expect(page).toHaveURL(/period=3M/);
    await expect(page.getByText("3 months return")).toBeVisible();
  });

  test("explain drawer opens from a metric tile", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Explain Portfolio value" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("Definition")).toBeVisible();
    await expect(dialog.getByText("FIFO", { exact: false })).toBeVisible();
    await dialog.getByRole("button", { name: "Close" }).click();
    await expect(dialog).toBeHidden();
  });

  test("portfolio holdings, performance and sorting", async ({ page }) => {
    await page.goto("/portfolio");
    await expect(page.getByRole("heading", { name: "Core Portfolio" })).toBeVisible();
    await expect(page.getByText("FIFO cost basis")).toBeVisible();
    const table = page.getByRole("region", { name: "Holdings" });
    await expect(table.getByRole("link", { name: "HALC" })).toBeVisible();
    await table.getByRole("button", { name: /Weight/ }).click();
    await expect(table.getByRole("columnheader", { name: /Weight/ })).toHaveAttribute("aria-sort", /ascending|descending/);
  });

  test("add, edit and delete a transaction", async ({ page }, testInfo) => {
    const tag = `e2e deposit ${RUN}-${testInfo.project.name}`;
    await page.goto("/portfolio/transactions?new=1");
    const dialog = page.getByRole("dialog", { name: "Add transaction" });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel("Type").selectOption("DEPOSIT");
    await dialog.getByLabel("Date").fill("2026-10-01");
    await dialog.getByLabel("Amount").fill("250");
    await dialog.getByLabel("Note", { exact: true }).fill(tag);
    await dialog.getByRole("button", { name: "Add transaction" }).click();
    await expect(dialog).toBeHidden();
    const row = page.getByRole("row").filter({ hasText: tag });
    await expect(row).toBeVisible();
    await row.getByRole("button", { name: /Edit/ }).click();
    const edit = page.getByRole("dialog", { name: "Edit transaction" });
    await edit.getByLabel("Amount").fill("300");
    await edit.getByRole("button", { name: "Save changes" }).click();
    await expect(edit).toBeHidden();
    await expect(page.getByRole("row").filter({ hasText: tag })).toContainText("$300.00");
    await page.getByRole("row").filter({ hasText: tag }).getByRole("button", { name: /Edit/ }).click();
    await page.getByRole("dialog", { name: "Edit transaction" }).getByRole("button", { name: "Delete" }).click();
    await page.getByRole("button", { name: "Yes, delete" }).click();
    await expect(page.getByRole("row").filter({ hasText: tag })).toHaveCount(0);
  });

  test("rejects a sell that exceeds holdings with a visible ledger issue", async ({ page }, testInfo) => {
    const tag = `e2e oversell ${RUN}-${testInfo.project.name}`;
    await page.goto("/portfolio/transactions?new=1");
    const dialog = page.getByRole("dialog", { name: "Add transaction" });
    await dialog.getByLabel("Type").selectOption("SELL");
    await dialog.getByLabel("Date").fill("2026-10-02");
    await dialog.getByLabel("Symbol").fill("NRVA");
    await dialog.getByLabel("Quantity (shares)").fill("9999");
    await dialog.getByLabel("Price per share").fill("100");
    await dialog.getByLabel("Note", { exact: true }).fill(tag);
    await dialog.getByRole("button", { name: "Add transaction" }).click();
    const row = page.getByRole("row").filter({ hasText: tag });
    await expect(row).toContainText("Not applied");
    await row.getByRole("button", { name: /Edit/ }).click();
    await page.getByRole("dialog", { name: "Edit transaction" }).getByRole("button", { name: "Delete" }).click();
    await page.getByRole("button", { name: "Yes, delete" }).click();
    await expect(page.getByRole("row").filter({ hasText: tag })).toHaveCount(0);
  });

  test("CSV import previews, flags duplicates and imports", async ({ page }, testInfo) => {
    const tag = `e2e import ${RUN}-${testInfo.project.name}`;
    // A per-run amount keeps the row's fingerprint distinct from any leftover row in the ledger.
    const amount = `${100 + (Date.now() % 900)}.${String(Date.now() % 97).padStart(2, "0")}`;
    await page.goto("/portfolio/import");
    await page.getByLabel("CSV text").fill(["Date,Type,Symbol,Quantity,Price,Amount,Fee,Note", `2026-10-05,Deposit,,,,${amount},,${tag}`, `2026-10-05,Deposit,,,,${amount},,${tag}`, "not-a-date,Buy,HALC,1,1,,,bad row"].join("\n"));
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByRole("heading", { name: "Map columns" })).toBeVisible();
    await expect(page.getByLabel("Date", { exact: true })).toHaveValue("Date");
    await page.getByRole("button", { name: "Review rows" }).click();
    await expect(page.getByText("1 ready", { exact: true })).toBeVisible();
    await expect(page.getByText("1 with errors", { exact: true })).toBeVisible();
    await expect(page.getByText("1 repeated in file", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: /Import 1 transactions/ }).click();
    await expect(page.getByText("Imported 1 transactions into", { exact: false })).toBeVisible();
    await page.goto("/portfolio/transactions");
    const row = page.getByRole("row").filter({ hasText: tag });
    await expect(row).toHaveCount(1);
    await row.getByRole("button", { name: /Edit/ }).click();
    await page.getByRole("dialog", { name: "Edit transaction" }).getByRole("button", { name: "Delete" }).click();
    await page.getByRole("button", { name: "Yes, delete" }).click();
  });

  test("company workspace tabs render with sourced metrics", async ({ page }) => {
    await page.goto("/company/HALC");
    const tabs = page.getByRole("navigation", { name: "Company sections" });
    await expect(page.getByRole("heading", { name: "Halcyon Semiconductor" })).toBeVisible();
    await expect(page.getByText("Revenue (TTM)")).toBeVisible();
    await tabs.getByRole("link", { name: "Financials" }).click();
    await expect(page.getByRole("region", { name: /financial statements/ })).toBeVisible();
    await page.getByRole("button", { name: "Quarterly" }).click();
    await expect(page.getByRole("columnheader", { name: /TTM to/ })).toBeVisible();
    await tabs.getByRole("link", { name: "Valuation" }).click();
    await expect(page.getByText("Estimated value per share")).toBeVisible();
    await page.getByRole("textbox", { name: "Terminal growth" }).fill("20");
    await expect(page.getByText("Terminal growth must be below WACC", { exact: false })).toBeVisible();
    await tabs.getByRole("link", { name: "Risk" }).click();
    await expect(page.getByText("Annualised volatility")).toBeVisible();
    await tabs.getByRole("link", { name: "Thesis" }).click();
    await expect(page.getByText("Review rules")).toBeVisible();
  });

  test("bank pages label sector-specific limitations", async ({ page }) => {
    await page.goto("/company/MERI?tab=financials");
    await expect(page.getByText("some standard metrics do not apply", { exact: false })).toBeVisible();
  });

  test("watchlist toggle and screener filters", async ({ page }) => {
    await page.goto("/company/ARDN");
    const button = page.getByRole("button", { name: /Watch/ });
    const wasWatching = (await button.textContent())?.includes("Watching");
    await button.click();
    await expect(page.getByRole("button", { name: wasWatching ? "Watch" : "Watching" })).toBeVisible();
    await button.click();
    await page.goto("/screener");
    await expect(page.getByRole("heading", { name: "Screener" })).toBeVisible();
    await page.getByLabel("Filter column").selectOption("revenueGrowth");
    await page.getByLabel(/^Value/).fill("0.15");
    await page.getByRole("button", { name: "Add filter" }).click();
    await expect(page.getByText(/of 15$/)).toBeVisible();
    await expect(page.getByRole("region", { name: "Screener" }).getByRole("link", { name: "PNTH" })).toHaveCount(0);
  });

  test("settings shows demo mode and provider status", async ({ page }) => {
    await page.goto("/settings");
    await expect(page.getByRole("radio", { name: /Demo data/ })).toHaveAttribute("aria-checked", "true");
    await expect(page.getByText("SEC EDGAR")).toBeVisible();
  });

  test("command palette finds a ticker", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("Control+k");
    const input = page.getByPlaceholder("Type a ticker, company, page or action");
    await expect(input).toBeVisible();
    await input.fill("QNT");
    await page.getByRole("option", { name: /QNTL/ }).click();
    await expect(page).toHaveURL(/company\/QNTL/);
  });
});
