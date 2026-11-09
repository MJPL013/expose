import { and, eq, isNull, sql } from "drizzle-orm";
import type { Database } from "../src/db/client";
import {
  graphEmbeddings as e,
  graphNodes as n,
  comparisonSummaries as summaries,
} from "./graph-schema";
import { voidSessions as sessions } from "./schema";
export type VectorFilter = {
  scope: "private" | "comparison";
  provenance: "real" | "synthetic";
  accountId?: string;
  excludeAccountId?: string;
  excludeSessionId: string;
  model: string;
  view: "experience" | "response";
};
export interface VectorStore {
  nearest(
    values: number[],
    filter: VectorFilter,
    limit: number,
  ): Promise<{ id: string; similarity: number }[]>;
}
function eligible(f: VectorFilter) {
  return and(
    eq(n.scope, f.scope),
    eq(n.provenance, f.provenance),
    eq(e.model, f.model),
    eq(e.version, 1),
    eq(e.dimensions, 768),
    eq(e.view, f.view),
    isNull(sessions.deletedAt),
    sql`${n.sessionId}<>${f.excludeSessionId}`,
    f.accountId ? eq(n.accountId, f.accountId) : undefined,
    f.excludeAccountId ? sql`${n.accountId}<>${f.excludeAccountId}` : undefined,
    f.scope === "comparison"
      ? sql`exists(select 1 from ${summaries} where ${summaries.id}=${n.summaryId} and ${summaries.approved}=true)`
      : undefined,
  );
}
/** Exact search scans all eligible pages, retaining only k candidates in memory. */
export class ArrayVectorStore implements VectorStore {
  constructor(readonly db: Database) {}
  async nearest(values: number[], filter: VectorFilter, limit: number) {
    let after = "",
      best: { id: string; similarity: number }[] = [];
    for (;;) {
      const rows = await this.db
        .select({ id: n.id, values: e.values })
        .from(e)
        .innerJoin(n, eq(n.id, e.nodeId))
        .innerJoin(sessions, eq(sessions.id, n.sessionId))
        .where(
          and(
            eligible(filter),
            after ? sql`${n.id}>${after}::uuid` : undefined,
          ),
        )
        .orderBy(n.id)
        .limit(500);
      if (!rows.length) break;
      for (const row of rows) {
        const similarity = row.values.reduce(
          (sum, v, i) => sum + v * values[i],
          0,
        );
        if (Number.isFinite(similarity)) best.push({ id: row.id, similarity });
      }
      best.sort(
        (a, b) => b.similarity - a.similarity || a.id.localeCompare(b.id),
      );
      best = best.slice(0, limit);
      after = rows.at(-1)!.id;
    }
    return best;
  }
}
/** Optional adapter: the operator enables the vector extension; startup never changes DB engines. */
export class PgVectorStore implements VectorStore {
  constructor(readonly db: Database) {}
  async nearest(values: number[], filter: VectorFilter, limit: number) {
    const similarity = sql<number>`1-(${e.values}::vector <=> ${JSON.stringify(values)}::vector)`;
    return this.db
      .select({ id: n.id, similarity })
      .from(e)
      .innerJoin(n, eq(n.id, e.nodeId))
      .innerJoin(sessions, eq(sessions.id, n.sessionId))
      .where(eligible(filter))
      .orderBy(sql`${similarity} desc`, n.id)
      .limit(limit);
  }
}
