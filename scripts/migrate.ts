import { closeDb, databasePath, getDb } from "../src/db/client";

getDb();
console.log(`Database ready at ${databasePath()}`);
closeDb();
