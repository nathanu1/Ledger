import { sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { securities } from "@/db/schema";
import { seedDemo } from "@/demo/seed";

let checked = false;

/** First run: create the database and load the demo dataset so the app is useful immediately. */
export function ensureDemoSeeded(): void {
  if (checked) return;
  checked = true;
  const db = getDb();
  const row = db.select({ n: sql<number>`count(*)` }).from(securities).get();
  if (!row || row.n === 0) {
    seedDemo(db, { reset: false });
  }
}
