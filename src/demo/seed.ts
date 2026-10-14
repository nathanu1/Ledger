import type { LedgerDb } from "@/db/client";
import * as schema from "@/db/schema";
import { generateDemoDataset, type DemoDataset } from "./generate";
import { DEMO_AS_OF } from "./universe";

const BATCH = 400;

function insertAll<T extends { $inferInsert: unknown }>(db: LedgerDb, table: T, rows: T["$inferInsert"][]): void {
  for (let i = 0; i < rows.length; i += BATCH) {
    // @ts-expect-error generic drizzle insert over a table union
    db.insert(table).values(rows.slice(i, i + BATCH)).run();
  }
}

export interface SeedResult {
  dataset: DemoDataset;
  counts: Record<string, number>;
}

/** Remove every row Ledger stores (demo and user data alike). */
export function clearAllData(db: LedgerDb): void {
  const tables = [
    schema.transactions,
    schema.importBatches,
    schema.portfolios,
    schema.prices,
    schema.quotes,
    schema.financialFacts,
    schema.filings,
    schema.earningsEvents,
    schema.etfHoldings,
    schema.watchlistItems,
    schema.watchlists,
    schema.savedViews,
    schema.thesisRules,
    schema.thesisRevisions,
    schema.theses,
    schema.dcfScenarios,
    schema.notes,
    schema.providerCache,
    schema.providerRequests,
    schema.researchVisits,
    schema.securities,
  ];
  for (const t of tables) db.delete(t).run();
}

export function seedDemo(db: LedgerDb, options: { reset?: boolean } = {}): SeedResult {
  const dataset = generateDemoDataset(DEMO_AS_OF);
  const counts: Record<string, number> = {};
  db.transaction((tx) => {
    if (options.reset) clearAllData(tx as unknown as LedgerDb);
    const t = tx as unknown as LedgerDb;
    insertAll(t, schema.securities, dataset.securities);
    insertAll(t, schema.prices, dataset.prices);
    insertAll(t, schema.quotes, dataset.quotes);
    insertAll(t, schema.financialFacts, dataset.facts);
    insertAll(t, schema.filings, dataset.filings);
    insertAll(t, schema.earningsEvents, dataset.earnings);
    insertAll(t, schema.etfHoldings, dataset.etfHoldings);
    insertAll(t, schema.portfolios, dataset.portfolios);
    insertAll(t, schema.transactions, dataset.transactions);
    insertAll(t, schema.watchlists, dataset.watchlists);
    insertAll(t, schema.watchlistItems, dataset.watchlistItems);
    insertAll(t, schema.savedViews, dataset.savedViews);
    insertAll(t, schema.theses, dataset.theses);
    insertAll(t, schema.thesisRevisions, dataset.thesisRevisions);
    insertAll(t, schema.thesisRules, dataset.thesisRules);
    insertAll(t, schema.dcfScenarios, dataset.dcfScenarios);
    insertAll(t, schema.notes, dataset.notes);
    const now = new Date().toISOString();
    const settingRows = [
      { key: "data_mode", value: "demo", updatedAt: now },
      { key: "demo_as_of", value: DEMO_AS_OF, updatedAt: now },
      { key: "default_portfolio_id", value: "pf-core", updatedAt: now },
      { key: "demo_seeded_at", value: now, updatedAt: now },
    ];
    for (const row of settingRows) {
      t.insert(schema.settings).values(row).onConflictDoUpdate({ target: schema.settings.key, set: { value: row.value, updatedAt: now } }).run();
    }
  });
  for (const [key, rows] of Object.entries(dataset)) if (Array.isArray(rows)) counts[key] = rows.length;
  return { dataset, counts };
}
