import { closeDb, databasePath, getDb } from "../src/db/client";
import { seedDemo } from "../src/demo/seed";

const reset = process.argv.includes("--reset") || !process.argv.includes("--append");
const db = getDb();
const started = Date.now();
const { counts } = seedDemo(db, { reset });
console.log(`Seeded demo data into ${databasePath()} in ${Date.now() - started} ms${reset ? " (existing data cleared)" : ""}`);
for (const [table, n] of Object.entries(counts)) console.log(`  ${table.padEnd(18)} ${n}`);
closeDb();
