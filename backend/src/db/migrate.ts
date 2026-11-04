import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDatabase } from "./client";
import { loadConfig } from "../config";
const { db, pool } = createDatabase(loadConfig().DATABASE_URL);
try {
  await migrate(db, {
    migrationsFolder: new URL(
      "../../migrations",
      import.meta.url,
    ).pathname.replace(/^\/(?=[A-Za-z]:)/, ""),
  });
  console.log("Database migrations complete");
} finally {
  await pool.end();
}
