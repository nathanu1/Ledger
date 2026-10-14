import fs from "node:fs";
import { closeDb, databasePath } from "../src/db/client";

closeDb();
const p = databasePath();
for (const suffix of ["", "-wal", "-shm", "-journal"]) {
  if (fs.existsSync(p + suffix)) fs.rmSync(p + suffix);
}
console.log(`Removed ${p}. Run "npm run db:seed" (or start the app) to recreate it.`);
