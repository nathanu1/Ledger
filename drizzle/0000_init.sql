CREATE TABLE `dcf_scenarios` (
	`id` text PRIMARY KEY NOT NULL,
	`symbol` text NOT NULL,
	`name` text NOT NULL,
	`kind` text DEFAULT 'custom' NOT NULL,
	`inputs` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `dcf_scenarios_symbol_idx` ON `dcf_scenarios` (`symbol`);--> statement-breakpoint
CREATE TABLE `earnings_events` (
	`id` text PRIMARY KEY NOT NULL,
	`symbol` text NOT NULL,
	`date` text NOT NULL,
	`status` text NOT NULL,
	`time_of_day` text,
	`fiscal_period_end` text,
	`eps_estimate` real,
	`basis` text NOT NULL,
	`source_url` text,
	`source` text NOT NULL,
	`retrieved_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `earnings_symbol_date_idx` ON `earnings_events` (`symbol`,`date`);--> statement-breakpoint
CREATE TABLE `etf_holdings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`symbol` text NOT NULL,
	`holding_symbol` text,
	`holding_name` text NOT NULL,
	`sector` text,
	`weight` real NOT NULL,
	`as_of` text NOT NULL,
	`source` text NOT NULL,
	`retrieved_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `etf_holdings_symbol_idx` ON `etf_holdings` (`symbol`);--> statement-breakpoint
CREATE TABLE `filings` (
	`accession` text PRIMARY KEY NOT NULL,
	`symbol` text NOT NULL,
	`cik` text,
	`form` text NOT NULL,
	`filed_at` text NOT NULL,
	`report_date` text,
	`primary_document` text,
	`description` text,
	`url` text,
	`source` text NOT NULL,
	`retrieved_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `filings_symbol_filed_idx` ON `filings` (`symbol`,`filed_at`);--> statement-breakpoint
CREATE TABLE `financial_facts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`symbol` text NOT NULL,
	`cik` text,
	`concept` text NOT NULL,
	`unit` text NOT NULL,
	`value` real NOT NULL,
	`start` text,
	`end` text NOT NULL,
	`fy` integer,
	`fp` text,
	`form` text NOT NULL,
	`filed` text NOT NULL,
	`accession` text NOT NULL,
	`source` text NOT NULL,
	`retrieved_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `financial_facts_symbol_idx` ON `financial_facts` (`symbol`,`concept`);--> statement-breakpoint
CREATE TABLE `import_batches` (
	`id` text PRIMARY KEY NOT NULL,
	`portfolio_id` text NOT NULL,
	`file_name` text NOT NULL,
	`mapping` text NOT NULL,
	`row_count` integer NOT NULL,
	`imported_count` integer NOT NULL,
	`skipped_count` integer NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`portfolio_id`) REFERENCES `portfolios`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `notes` (
	`id` text PRIMARY KEY NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`body` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `notes_entity_idx` ON `notes` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE TABLE `portfolios` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`base_currency` text DEFAULT 'USD' NOT NULL,
	`benchmark_symbol` text DEFAULT 'SPY' NOT NULL,
	`cost_basis_method` text DEFAULT 'FIFO' NOT NULL,
	`description` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `prices` (
	`symbol` text NOT NULL,
	`date` text NOT NULL,
	`open` real,
	`high` real,
	`low` real,
	`close` real NOT NULL,
	`adj_close` real,
	`adjustment` text,
	`volume` real,
	`source` text NOT NULL,
	`retrieved_at` text NOT NULL,
	PRIMARY KEY(`symbol`, `date`)
);
--> statement-breakpoint
CREATE TABLE `provider_cache` (
	`key` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`payload` text NOT NULL,
	`fetched_at` text NOT NULL,
	`expires_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `provider_requests` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`provider` text NOT NULL,
	`endpoint` text NOT NULL,
	`status` integer,
	`ok` integer NOT NULL,
	`outcome` text NOT NULL,
	`duration_ms` integer,
	`error` text,
	`requested_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `provider_requests_provider_idx` ON `provider_requests` (`provider`,`requested_at`);--> statement-breakpoint
CREATE TABLE `quotes` (
	`symbol` text PRIMARY KEY NOT NULL,
	`price` real NOT NULL,
	`change` real,
	`change_pct` real,
	`previous_close` real,
	`as_of` text NOT NULL,
	`session` text NOT NULL,
	`currency` text DEFAULT 'USD' NOT NULL,
	`source` text NOT NULL,
	`retrieved_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `research_visits` (
	`symbol` text PRIMARY KEY NOT NULL,
	`last_visited_at` text NOT NULL,
	`previous_visit_at` text
);
--> statement-breakpoint
CREATE TABLE `saved_views` (
	`id` text PRIMARY KEY NOT NULL,
	`scope` text NOT NULL,
	`name` text NOT NULL,
	`config` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `securities` (
	`symbol` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`exchange` text,
	`security_type` text NOT NULL,
	`sector` text,
	`industry` text,
	`cik` text,
	`sic` text,
	`description` text,
	`website` text,
	`currency` text DEFAULT 'USD' NOT NULL,
	`fiscal_year_end` text,
	`fund_family` text,
	`fund_category` text,
	`expense_ratio` real,
	`benchmark_index` text,
	`holdings_available` integer DEFAULT false NOT NULL,
	`source` text NOT NULL,
	`retrieved_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `theses` (
	`id` text PRIMARY KEY NOT NULL,
	`symbol` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `theses_symbol_unique` ON `theses` (`symbol`);--> statement-breakpoint
CREATE TABLE `thesis_revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`thesis_id` text NOT NULL,
	`created_at` text NOT NULL,
	`summary` text NOT NULL,
	`drivers` text DEFAULT '' NOT NULL,
	`risks` text DEFAULT '' NOT NULL,
	`invalidation` text DEFAULT '' NOT NULL,
	`valuation_assumptions` text DEFAULT '' NOT NULL,
	`review_date` text,
	`links` text DEFAULT '[]' NOT NULL,
	`change_note` text,
	FOREIGN KEY (`thesis_id`) REFERENCES `theses`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `thesis_revisions_thesis_idx` ON `thesis_revisions` (`thesis_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `thesis_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`thesis_id` text NOT NULL,
	`metric` text NOT NULL,
	`operator` text NOT NULL,
	`threshold` real NOT NULL,
	`period_type` text DEFAULT 'quarter' NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`thesis_id`) REFERENCES `theses`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `thesis_rules_thesis_idx` ON `thesis_rules` (`thesis_id`);--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`portfolio_id` text NOT NULL,
	`type` text NOT NULL,
	`date` text NOT NULL,
	`sequence` integer DEFAULT 0 NOT NULL,
	`symbol` text,
	`quantity` text,
	`price` text,
	`amount` text,
	`fee` text,
	`split_numerator` real,
	`split_denominator` real,
	`linked_transaction_id` text,
	`note` text,
	`fingerprint` text NOT NULL,
	`import_batch_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`portfolio_id`) REFERENCES `portfolios`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `transactions_portfolio_date_idx` ON `transactions` (`portfolio_id`,`date`,`sequence`);--> statement-breakpoint
CREATE INDEX `transactions_fingerprint_idx` ON `transactions` (`portfolio_id`,`fingerprint`);--> statement-breakpoint
CREATE TABLE `watchlist_items` (
	`id` text PRIMARY KEY NOT NULL,
	`watchlist_id` text NOT NULL,
	`symbol` text NOT NULL,
	`tags` text DEFAULT '[]' NOT NULL,
	`note` text,
	`added_at` text NOT NULL,
	FOREIGN KEY (`watchlist_id`) REFERENCES `watchlists`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `watchlist_items_unique` ON `watchlist_items` (`watchlist_id`,`symbol`);--> statement-breakpoint
CREATE TABLE `watchlists` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`created_at` text NOT NULL
);
