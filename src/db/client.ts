import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "./schema";

export type LedgerDb = BetterSQLite3Database<typeof schema>;

const globalForDb = globalThis as unknown as { __ledgerDb?: LedgerDb; __ledgerSqlite?: Database.Database };

export function databasePath(): string {
  return process.env.LEDGER_DATABASE_PATH ?? path.join(process.cwd(), "data", "ledger.db");
}

function createDb(): LedgerDb {
  const dbPath = databasePath();
  if (dbPath !== ":memory:") fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  globalForDb.__ledgerSqlite = sqlite;
  return db;
}

/** Process-wide database handle. Migrations run on first access. */
export function getDb(): LedgerDb {
  if (!globalForDb.__ledgerDb) globalForDb.__ledgerDb = createDb();
  return globalForDb.__ledgerDb;
}

export function closeDb(): void {
  globalForDb.__ledgerSqlite?.close();
  globalForDb.__ledgerDb = undefined;
  globalForDb.__ledgerSqlite = undefined;
}

export { schema };
