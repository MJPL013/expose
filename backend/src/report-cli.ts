import { loadConfig } from "./config";
import { createDatabase } from "./db/client";
import { UsageLedger } from "./usage";
import { runs } from "./db/schema";
import { aggregateReports } from "./reports";

const config = loadConfig(),
  { db, pool } = createDatabase(config.DATABASE_URL),
  ledger = new UsageLedger(db, config);
try {
  const id = process.argv[2];
  if (id) console.log(JSON.stringify(await ledger.runReport(id), null, 2));
  else {
    const matches = await db.select({ id: runs.id }).from(runs);
    const reports = await Promise.all(
      matches.map((match) => ledger.runReport(match.id)),
    );
    console.log(JSON.stringify(aggregateReports(reports), null, 2));
  }
} finally {
  await pool.end();
}
