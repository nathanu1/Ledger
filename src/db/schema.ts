/**
 * Ledger database schema (SQLite via Drizzle).
 *
 * Money and share quantities on the transaction ledger are stored as TEXT
 * decimal strings so no precision is lost. Market data (prices, quotes) and
 * reported fundamentals are REAL. Every externally sourced row carries its
 * provider and retrieval timestamp.
 */
import { index, integer, primaryKey, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const portfolios = sqliteTable("portfolios", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  baseCurrency: text("base_currency").notNull().default("USD"),
  benchmarkSymbol: text("benchmark_symbol").notNull().default("SPY"),
  costBasisMethod: text("cost_basis_method").notNull().default("FIFO"),
  description: text("description"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const transactions = sqliteTable(
  "transactions",
  {
    id: text("id").primaryKey(),
    portfolioId: text("portfolio_id")
      .notNull()
      .references(() => portfolios.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    date: text("date").notNull(),
    sequence: integer("sequence").notNull().default(0),
    symbol: text("symbol"),
    quantity: text("quantity"),
    price: text("price"),
    amount: text("amount"),
    fee: text("fee"),
    splitNumerator: real("split_numerator"),
    splitDenominator: real("split_denominator"),
    linkedTransactionId: text("linked_transaction_id"),
    note: text("note"),
    fingerprint: text("fingerprint").notNull(),
    importBatchId: text("import_batch_id"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [
    index("transactions_portfolio_date_idx").on(t.portfolioId, t.date, t.sequence),
    index("transactions_fingerprint_idx").on(t.portfolioId, t.fingerprint),
  ],
);

export const importBatches = sqliteTable("import_batches", {
  id: text("id").primaryKey(),
  portfolioId: text("portfolio_id")
    .notNull()
    .references(() => portfolios.id, { onDelete: "cascade" }),
  fileName: text("file_name").notNull(),
  mapping: text("mapping").notNull(),
  rowCount: integer("row_count").notNull(),
  importedCount: integer("imported_count").notNull(),
  skippedCount: integer("skipped_count").notNull(),
  createdAt: text("created_at").notNull(),
});

export const securities = sqliteTable("securities", {
  symbol: text("symbol").primaryKey(),
  name: text("name").notNull(),
  exchange: text("exchange"),
  securityType: text("security_type").notNull(), // stock | etf
  sector: text("sector"),
  industry: text("industry"),
  cik: text("cik"),
  sic: text("sic"),
  description: text("description"),
  website: text("website"),
  currency: text("currency").notNull().default("USD"),
  fiscalYearEnd: text("fiscal_year_end"), // MMDD
  // ETF fund-level information
  fundFamily: text("fund_family"),
  fundCategory: text("fund_category"),
  expenseRatio: real("expense_ratio"),
  benchmarkIndex: text("benchmark_index"),
  holdingsAvailable: integer("holdings_available", { mode: "boolean" }).notNull().default(false),
  source: text("source").notNull(),
  retrievedAt: text("retrieved_at").notNull(),
});

export const prices = sqliteTable(
  "prices",
  {
    symbol: text("symbol").notNull(),
    date: text("date").notNull(),
    open: real("open"),
    high: real("high"),
    low: real("low"),
    close: real("close").notNull(),
    /** Close adjusted for splits (and dividends when the source supports it). */
    adjClose: real("adj_close"),
    /** What adjClose is adjusted for: "splits" | "splits_dividends" | null when adjClose is absent. */
    adjustment: text("adjustment"),
    volume: real("volume"),
    source: text("source").notNull(),
    retrievedAt: text("retrieved_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.symbol, t.date] })],
);

export const quotes = sqliteTable("quotes", {
  symbol: text("symbol").primaryKey(),
  price: real("price").notNull(),
  change: real("change"),
  changePct: real("change_pct"),
  previousClose: real("previous_close"),
  /** Market timestamp of the quote (ISO 8601). */
  asOf: text("as_of").notNull(),
  /** regular | pre | post | closed | eod */
  session: text("session").notNull(),
  currency: text("currency").notNull().default("USD"),
  source: text("source").notNull(),
  retrievedAt: text("retrieved_at").notNull(),
});

export const financialFacts = sqliteTable(
  "financial_facts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    symbol: text("symbol").notNull(),
    cik: text("cik"),
    concept: text("concept").notNull(),
    unit: text("unit").notNull(),
    value: real("value").notNull(),
    start: text("start"),
    end: text("end").notNull(),
    fy: integer("fy"),
    fp: text("fp"),
    form: text("form").notNull(),
    filed: text("filed").notNull(),
    accession: text("accession").notNull(),
    source: text("source").notNull(),
    retrievedAt: text("retrieved_at").notNull(),
  },
  (t) => [index("financial_facts_symbol_idx").on(t.symbol, t.concept)],
);

export const filings = sqliteTable(
  "filings",
  {
    accession: text("accession").primaryKey(),
    symbol: text("symbol").notNull(),
    cik: text("cik"),
    form: text("form").notNull(),
    filedAt: text("filed_at").notNull(),
    reportDate: text("report_date"),
    primaryDocument: text("primary_document"),
    description: text("description"),
    url: text("url"),
    source: text("source").notNull(),
    retrievedAt: text("retrieved_at").notNull(),
  },
  (t) => [index("filings_symbol_filed_idx").on(t.symbol, t.filedAt)],
);

export const earningsEvents = sqliteTable(
  "earnings_events",
  {
    id: text("id").primaryKey(),
    symbol: text("symbol").notNull(),
    date: text("date").notNull(),
    /** confirmed | estimated */
    status: text("status").notNull(),
    /** pre-market | post-market | null */
    timeOfDay: text("time_of_day"),
    fiscalPeriodEnd: text("fiscal_period_end"),
    epsEstimate: real("eps_estimate"),
    /** How the date was established, shown to the user. */
    basis: text("basis").notNull(),
    sourceUrl: text("source_url"),
    source: text("source").notNull(),
    retrievedAt: text("retrieved_at").notNull(),
  },
  (t) => [index("earnings_symbol_date_idx").on(t.symbol, t.date)],
);

export const etfHoldings = sqliteTable(
  "etf_holdings",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    symbol: text("symbol").notNull(),
    holdingSymbol: text("holding_symbol"),
    holdingName: text("holding_name").notNull(),
    sector: text("sector"),
    weight: real("weight").notNull(),
    asOf: text("as_of").notNull(),
    source: text("source").notNull(),
    retrievedAt: text("retrieved_at").notNull(),
  },
  (t) => [index("etf_holdings_symbol_idx").on(t.symbol)],
);

export const watchlists = sqliteTable("watchlists", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  createdAt: text("created_at").notNull(),
});

export const watchlistItems = sqliteTable(
  "watchlist_items",
  {
    id: text("id").primaryKey(),
    watchlistId: text("watchlist_id")
      .notNull()
      .references(() => watchlists.id, { onDelete: "cascade" }),
    symbol: text("symbol").notNull(),
    /** JSON array of strings. */
    tags: text("tags").notNull().default("[]"),
    note: text("note"),
    addedAt: text("added_at").notNull(),
  },
  (t) => [uniqueIndex("watchlist_items_unique").on(t.watchlistId, t.symbol)],
);

export const savedViews = sqliteTable("saved_views", {
  id: text("id").primaryKey(),
  /** watchlist | screener */
  scope: text("scope").notNull(),
  name: text("name").notNull(),
  /** JSON: { columns, sort, filters } */
  config: text("config").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const theses = sqliteTable("theses", {
  id: text("id").primaryKey(),
  symbol: text("symbol").notNull().unique(),
  /** draft | active | review | closed */
  status: text("status").notNull().default("draft"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const thesisRevisions = sqliteTable(
  "thesis_revisions",
  {
    id: text("id").primaryKey(),
    thesisId: text("thesis_id")
      .notNull()
      .references(() => theses.id, { onDelete: "cascade" }),
    createdAt: text("created_at").notNull(),
    summary: text("summary").notNull(),
    drivers: text("drivers").notNull().default(""),
    risks: text("risks").notNull().default(""),
    invalidation: text("invalidation").notNull().default(""),
    valuationAssumptions: text("valuation_assumptions").notNull().default(""),
    reviewDate: text("review_date"),
    /** JSON array of { label, url } */
    links: text("links").notNull().default("[]"),
    changeNote: text("change_note"),
  },
  (t) => [index("thesis_revisions_thesis_idx").on(t.thesisId, t.createdAt)],
);

export const thesisRules = sqliteTable(
  "thesis_rules",
  {
    id: text("id").primaryKey(),
    thesisId: text("thesis_id")
      .notNull()
      .references(() => theses.id, { onDelete: "cascade" }),
    /** revenueGrowth | operatingMargin | sharesDilutedGrowth | totalDebt | netDebt | fcfMargin | grossMargin */
    metric: text("metric").notNull(),
    /** lt | gt */
    operator: text("operator").notNull(),
    threshold: real("threshold").notNull(),
    /** quarter | annual | ttm */
    periodType: text("period_type").notNull().default("quarter"),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
    createdAt: text("created_at").notNull(),
  },
  (t) => [index("thesis_rules_thesis_idx").on(t.thesisId)],
);

export const dcfScenarios = sqliteTable(
  "dcf_scenarios",
  {
    id: text("id").primaryKey(),
    symbol: text("symbol").notNull(),
    name: text("name").notNull(),
    /** bear | base | bull | custom */
    kind: text("kind").notNull().default("custom"),
    /** JSON DcfInputs */
    inputs: text("inputs").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [index("dcf_scenarios_symbol_idx").on(t.symbol)],
);

export const notes = sqliteTable(
  "notes",
  {
    id: text("id").primaryKey(),
    /** company | portfolio | position | metric | page */
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    body: text("body").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [index("notes_entity_idx").on(t.entityType, t.entityId)],
);

export const providerCache = sqliteTable("provider_cache", {
  key: text("key").primaryKey(),
  provider: text("provider").notNull(),
  payload: text("payload").notNull(),
  fetchedAt: text("fetched_at").notNull(),
  expiresAt: text("expires_at").notNull(),
});

export const providerRequests = sqliteTable(
  "provider_requests",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    provider: text("provider").notNull(),
    endpoint: text("endpoint").notNull(),
    status: integer("status"),
    ok: integer("ok", { mode: "boolean" }).notNull(),
    /** ok | quota | auth | network | error */
    outcome: text("outcome").notNull(),
    durationMs: integer("duration_ms"),
    error: text("error"),
    requestedAt: text("requested_at").notNull(),
  },
  (t) => [index("provider_requests_provider_idx").on(t.provider, t.requestedAt)],
);

export const researchVisits = sqliteTable("research_visits", {
  symbol: text("symbol").primaryKey(),
  lastVisitedAt: text("last_visited_at").notNull(),
  previousVisitAt: text("previous_visit_at"),
});

export type Portfolio = typeof portfolios.$inferSelect;
export type TransactionRow = typeof transactions.$inferSelect;
export type Security = typeof securities.$inferSelect;
export type PriceRow = typeof prices.$inferSelect;
export type QuoteRow = typeof quotes.$inferSelect;
export type FinancialFactRow = typeof financialFacts.$inferSelect;
export type FilingRow = typeof filings.$inferSelect;
export type EarningsEventRow = typeof earningsEvents.$inferSelect;
export type WatchlistItemRow = typeof watchlistItems.$inferSelect;
export type ThesisRow = typeof theses.$inferSelect;
export type ThesisRevisionRow = typeof thesisRevisions.$inferSelect;
export type ThesisRuleRow = typeof thesisRules.$inferSelect;
export type DcfScenarioRow = typeof dcfScenarios.$inferSelect;
export type NoteRow = typeof notes.$inferSelect;
export type SavedViewRow = typeof savedViews.$inferSelect;
