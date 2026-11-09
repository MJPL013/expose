import { eq, and } from "drizzle-orm";
import { loadConfig } from "../src/config";
import { createDatabase } from "../src/db/client";
import { accounts } from "../src/accounts/schema";
import { GnaniProviders } from "../src/providers";
import { VoidService } from "./service";
import { comparisonSummaries, analysisRuns } from "./graph-schema";
const config = loadConfig(),
  { db, pool } = createDatabase(config.DATABASE_URL),
  service = new VoidService(db, config, new GnaniProviders(config));
try {
  const command = process.argv[2];
  if (command === "grant-admin" || command === "revoke-admin") {
    const id = process.argv[3];
    const [account] = await db
      .select()
      .from(accounts)
      .where(eq(accounts.id, id ?? "00000000-0000-0000-0000-000000000000"));
    if (!account || /^(synthetic|local-test|guest):/.test(account.googleSub))
      throw new Error("Choose an existing Google account ID.");
    await db
      .update(accounts)
      .set({ role: command === "grant-admin" ? "admin" : "player" })
      .where(eq(accounts.id, id));
    console.log("Account role updated.");
  } else if (command === "approve-synthetic") {
    const rows = await db
      .select({ summary: comparisonSummaries, subject: accounts.googleSub })
      .from(comparisonSummaries)
      .innerJoin(accounts, eq(accounts.id, comparisonSummaries.accountId))
      .innerJoin(
        analysisRuns,
        eq(analysisRuns.id, comparisonSummaries.analysisId),
      )
      .where(
        and(
          eq(comparisonSummaries.approved, false),
          eq(analysisRuns.status, "ready"),
        ),
      );
    let count = 0;
    for (const { summary, subject } of rows)
      if (subject.startsWith("synthetic:")) {
        await service.graph.approve(
          summary.accountId,
          summary.id,
          summary.revision,
          true,
        );
        count++;
      }
    console.log(JSON.stringify({ syntheticSummariesApproved: count }));
  } else if (command === "retry-graph") {
    const id = process.argv[3],
      row = await service.row(id);
    await service.retryGraph(id, row.accountId);
    console.log("Graph processing queued.");
  } else
    throw new Error(
      "Commands: grant-admin ACCOUNT_ID | revoke-admin ACCOUNT_ID | approve-synthetic | retry-graph SESSION_ID",
    );
} finally {
  await pool.end();
}
