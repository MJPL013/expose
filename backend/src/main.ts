import { loadConfig } from "./config";
import { createDatabase } from "./db/client";
import { buildServer } from "./server";
import { BatchService } from "./batch";
import { startJobs } from "./jobs";

const config = loadConfig(),
  { db, pool } = createDatabase(config.DATABASE_URL);
const services = await buildServer(config, db, { logger: true });
const batch = new BatchService(db, config, services.media, services.usage);
services.setBatch(batch);
const stopJobs = await startJobs(
  config.DATABASE_URL,
  db,
  services.rooms,
  services.media,
  batch,
  (error) => services.app.log.error({ err: error }, "Background work failed"),
);
await services.app.listen({ port: config.PORT, host: "127.0.0.1" });
let closing = false;
async function shutdown() {
  if (closing) return;
  closing = true;
  await stopJobs();
  await services.app.close();
  await pool.end();
}
process.once("SIGINT", () => void shutdown());
process.once("SIGTERM", () => void shutdown());
