import { createHash, randomUUID } from "node:crypto";
import { and, eq, isNull, inArray, desc, sql } from "drizzle-orm";
import {
  StoryAnalysisSchema,
  LinkReviewSchema,
  type GraphView,
  type ComparisonSummary,
} from "@expose/shared/gc2-graph";
import type { Transaction } from "../src/db/client";
import { ensure } from "../src/errors";
import { accounts } from "../src/accounts/schema";
import { voidSessions, voidJobs } from "./schema";
import * as g from "./graph-schema";
import { ArrayVectorStore, PgVectorStore, type VectorStore } from "./vectors";
import type { VoidService } from "./service";
import type { SessionState } from "./state";
import { storyPrompt, relationshipPrompt } from "./story-prompts";
type Row = typeof voidSessions.$inferSelect;
type Job = typeof voidJobs.$inferSelect;
export function transcriptHash(s: SessionState) {
  return createHash("sha256")
    .update(
      JSON.stringify(
        s.turns.map((t) => ({
          id: t.id,
          original: t.original,
          text: t.text,
          correction: t.correction,
          invalidated: t.invalidated,
        })),
      ),
    )
    .digest("hex");
}
export async function invalidateGraph(tx: Transaction, sessionId: string) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext('gc2-clusters'))`);
  await tx.delete(g.graphNodes).where(eq(g.graphNodes.sessionId, sessionId));
  await tx
    .update(g.analysisRuns)
    .set({ status: "superseded" })
    .where(
      and(
        eq(g.analysisRuns.sessionId, sessionId),
        eq(g.analysisRuns.status, "ready"),
      ),
    );
  await tx
    .update(g.comparisonSummaries)
    .set({ approved: false })
    .where(eq(g.comparisonSummaries.sessionId, sessionId));
  await tx.delete(g.clusterSnapshots);
}
export function clusters(
  nodes: GraphView["nodes"],
  edges: GraphView["edges"],
): GraphView["clusters"] {
  const output: GraphView["clusters"] = [];
  for (const view of ["experience", "response"] as const) {
    const ids = nodes.map((n) => n.id).sort(),
      labels = new Map(ids.map((id) => [id, id]));
    const adjacency = new Map(ids.map((id) => [id, [] as string[]]));
    for (const e of edges)
      if (
        (view === "experience"
          ? ["related-experience", "continues"]
          : ["similar-response"]
        ).includes(e.kind) &&
        adjacency.has(e.from) &&
        adjacency.has(e.to)
      ) {
        adjacency.get(e.from)!.push(e.to);
        adjacency.get(e.to)!.push(e.from);
      }
    for (let pass = 0; pass < 30; pass++) {
      let changed = false;
      for (const id of ids) {
        const votes = new Map<string, number>();
        for (const neighbor of [id, ...adjacency.get(id)!]) {
          const label = labels.get(neighbor)!;
          votes.set(label, (votes.get(label) ?? 0) + 1);
        }
        const chosen = [...votes].sort(
          (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
        )[0][0];
        if (chosen !== labels.get(id)) {
          labels.set(id, chosen);
          changed = true;
        }
      }
      if (!changed) break;
    }
    const groups = new Map<string, string[]>();
    for (const id of ids) {
      const label = labels.get(id)!;
      groups.set(label, [...(groups.get(label) ?? []), id]);
    }
    for (const [label, nodeIds] of groups)
      output.push({ id: `${view}:${label}`, view, nodeIds });
  }
  return output;
}
export class StoryGraph {
  readonly vectors: VectorStore;
  constructor(readonly service: VoidService) {
    this.vectors =
      service.config.GC2_VECTOR_STORE === "pgvector"
        ? new PgVectorStore(service.db)
        : new ArrayVectorStore(service.db);
  }
  async analyse(job: Job, row: Row) {
    const hash = transcriptHash(row.state),
      version = (row.state.analysisRevision ?? 0) + 1;
    await this.service.db
      .insert(g.analysisRuns)
      .values({
        id: job.id,
        sessionId: row.id,
        version,
        inputHash: hash,
        status: "running",
        model: this.service.config.GC2_ANALYSIS_MODEL,
      })
      .onConflictDoNothing();
    await this.service.change(row.id, (s) => {
      if (s.workId === job.id) s.processing = "running";
    });
    const transcript = await this.service.db
      .select()
      .from(g.transcriptTurns)
      .where(eq(g.transcriptTurns.sessionId, row.id))
      .orderBy(g.transcriptTurns.sequence);
    const result = await this.service.ai.generate(
      "analysis",
      StoryAnalysisSchema,
      storyPrompt,
      {
        language: row.state.language,
        transcript: transcript
          .filter((t) => t.status === "accepted")
          .map((t) => ({
            id: t.id,
            role: t.role,
            text: t.correction || t.text,
            status: t.status,
            rememberedSources:
              row.state.turns.find((turn) => turn.id === t.id)?.sources ??
              row.state.captions.find((caption) => caption.id === t.id)
                ?.sources ??
              [],
          })),
      },
    );
    const allowed = new Set(
        row.state.turns.filter((t) => !t.invalidated).map((t) => t.id),
      ),
      keys = new Set(result.nodes.map((n) => n.key));
    ensure(
      keys.size === result.nodes.length &&
        result.nodes.every((n) => n.turnIds.every((id) => allowed.has(id))) &&
        result.edges.every(
          (e) => keys.has(e.from) && keys.has(e.to) && e.from !== e.to,
        ) &&
        (!result.persona ||
          [
            ...result.persona.nodeKeys,
            ...result.persona.observations.flatMap((o) => o.nodeKeys),
          ].every((k) => keys.has(k))),
      "VOID_UNGROUNDED",
      "Analysis did not match the saved conversation.",
      502,
    );
    await this.service.change(row.id, async (s, _r, tx) => {
      ensure(
        s.workId === job.id && transcriptHash(s) === hash,
        "VOID_STALE",
        "The story changed during analysis.",
        409,
      );
      await invalidateGraph(tx, row.id);
      const ids = new Map(result.nodes.map((n) => [n.key, randomUUID()]));
      for (const node of result.nodes)
        await tx.insert(g.graphNodes).values({
          id: ids.get(node.key)!,
          sessionId: row.id,
          accountId: row.accountId,
          analysisId: job.id,
          kind: node.kind,
          title: node.title,
          summary: node.summary,
          experience: node.experience,
          response: node.response,
          source: node.source,
          turnIds: node.turnIds,
          provenance: s.provenance ?? "real",
        });
      for (const edge of result.edges)
        await tx.insert(g.graphEdges).values({
          from: ids.get(edge.from)!,
          to: ids.get(edge.to)!,
          kind: edge.kind,
          reason: edge.reason,
        });
      const items = result.nodes
        .filter((n) => n.kind === "story")
        .map((n) => ({
          key: n.key,
          title: n.title,
          experience: n.experience,
          response: n.response,
        }));
      await tx.insert(g.comparisonSummaries).values({
        sessionId: row.id,
        accountId: row.accountId,
        analysisId: job.id,
        items,
        approved: false,
      });
      await tx
        .update(g.analysisRuns)
        .set({ status: "ready", result })
        .where(eq(g.analysisRuns.id, job.id));
      s.analysisRevision = version;
      s.graphStatus = "queued";
      s.processing = "ready";
      s.status = "complete";
      delete s.workId;
      delete s.error;
      s.evidence = result.nodes.map((n) => ({
        id: ids.get(n.key)!,
        dimension: n.kind,
        summary: n.summary,
        source: n.source,
        turnIds: n.turnIds,
        sources: n.turnIds.map((t) => `${row.id}:${t}`),
      }));
      if (
        result.persona &&
        result.persona.observations.length &&
        result.persona.nodeKeys.length
      ) {
        s.persona = {
          title: result.persona.title,
          quote: result.persona.quote,
          evidenceIds: result.persona.nodeKeys.map((k) => ids.get(k)!),
          observations: result.persona.observations.map((o) => ({
            text: o.text,
            evidenceIds: o.nodeKeys.map((k) => ids.get(k)!),
          })),
        };
        s.personaVersions.push(s.persona);
      } else delete s.persona;
      s.captions.push({
        id: randomUUID(),
        text:
          s.persona?.quote ??
          "Your conversation is saved. There is not enough clear evidence for a personal reflection yet.",
        sources: [],
      });
      await this.service.enqueue(tx, row.id, "graph");
    });
  }
  async connect(job: Job, row: Row) {
    const scope = job.kind === "compare" ? "comparison" : "private";
    await this.service.change(row.id, (s) => {
      ensure(
        (s.used.graph ?? 0) < 8,
        "VOID_GRAPH_LIMIT",
        "This conversation has reached its connection-processing allowance.",
        429,
      );
      s.used.graph = (s.used.graph ?? 0) + 1;
      s.graphStatus = "running";
    });
    const nodes = await this.service.db
      .select()
      .from(g.graphNodes)
      .where(
        and(eq(g.graphNodes.sessionId, row.id), eq(g.graphNodes.scope, scope)),
      );
    const candidates: {
      from: string;
      to: string;
      view: "experience" | "response";
      similarity: number;
    }[] = [];
    for (const node of nodes)
      for (const view of ["experience", "response"] as const) {
        if (!node[view]) continue;
        const [existing] = await this.service.db
          .select()
          .from(g.graphEmbeddings)
          .where(
            and(
              eq(g.graphEmbeddings.nodeId, node.id),
              eq(g.graphEmbeddings.view, view),
              eq(
                g.graphEmbeddings.model,
                this.service.config.GC2_EMBEDDING_MODEL,
              ),
              eq(g.graphEmbeddings.version, 1),
              eq(g.graphEmbeddings.dimensions, 768),
            ),
          );
        const values =
          existing?.values ?? (await this.service.ai.embed(node[view]));
        // A tombstone or changed summary must prevent a late embedding from entering retrieval.
        await this.service.change(row.id, async (_s, _r, tx) => {
          const [live] = await tx
            .select()
            .from(g.graphNodes)
            .where(eq(g.graphNodes.id, node.id));
          ensure(live, "VOID_STALE", "This story was removed.", 409);
          if (scope === "comparison") {
            const [approved] = await tx
              .select()
              .from(g.comparisonSummaries)
              .where(
                and(
                  eq(g.comparisonSummaries.id, node.summaryId!),
                  eq(g.comparisonSummaries.approved, true),
                ),
              );
            ensure(approved, "VOID_STALE", "Comparison approval changed.", 409);
          }
          await tx
            .insert(g.graphEmbeddings)
            .values({
              nodeId: node.id,
              view,
              model: this.service.config.GC2_EMBEDDING_MODEL,
              dimensions: 768,
              values,
            })
            .onConflictDoUpdate({
              target: [g.graphEmbeddings.nodeId, g.graphEmbeddings.view],
              set: {
                model: this.service.config.GC2_EMBEDDING_MODEL,
                dimensions: 768,
                values,
                version: 1,
              },
            });
        });
        const nearest = await this.vectors.nearest(
          values,
          {
            scope,
            provenance: node.provenance as "real" | "synthetic",
            accountId: scope === "private" ? row.accountId : undefined,
            excludeAccountId:
              scope === "comparison" ? row.accountId : undefined,
            excludeSessionId: row.id,
            model: this.service.config.GC2_EMBEDDING_MODEL,
            view,
          },
          5,
        );
        for (const other of nearest)
          if (other.similarity >= 0.72)
            candidates.push({
              from: node.id,
              to: other.id,
              view,
              similarity: other.similarity,
            });
      }
    // Review a small, strongest-first set; 40-pair reviews exceeded the live deadline.
    const uniquePairs = new Map<string, (typeof candidates)[number]>();
    for (const candidate of candidates.sort(
      (a, b) =>
        b.similarity - a.similarity ||
        a.from.localeCompare(b.from) ||
        a.to.localeCompare(b.to),
    )) {
      const key = `${candidate.from}:${candidate.to}`;
      if (!uniquePairs.has(key)) uniquePairs.set(key, candidate);
    }
    const shortlist = [...uniquePairs.values()].slice(0, 12);
    if (shortlist.length) {
      const ids = [...new Set(shortlist.flatMap((p) => [p.from, p.to]))];
      const materials = await this.service.db
        .select({
          id: g.graphNodes.id,
          summary: g.graphNodes.summary,
          experience: g.graphNodes.experience,
          response: g.graphNodes.response,
        })
        .from(g.graphNodes)
        .where(inArray(g.graphNodes.id, ids));
      const result = await this.service.ai.generate(
        "analysis",
        LinkReviewSchema,
        relationshipPrompt,
        { scope, candidates: shortlist, nodes: materials },
      );
      ensure(
        result.links.every(
          (e) =>
            shortlist.some((p) => p.from === e.from && p.to === e.to) &&
            (scope === "private" ||
              ["related-experience", "similar-response"].includes(e.kind)),
        ),
        "VOID_UNGROUNDED",
        "A story connection had no supporting candidate.",
        502,
      );
      await this.service.change(row.id, async (_s, _r, tx) => {
        const live = await tx
          .select({ id: g.graphNodes.id, summaryId: g.graphNodes.summaryId })
          .from(g.graphNodes)
          .innerJoin(
            voidSessions,
            and(
              eq(voidSessions.id, g.graphNodes.sessionId),
              isNull(voidSessions.deletedAt),
            ),
          )
          .where(inArray(g.graphNodes.id, ids));
        const valid = new Set(live.map((n) => n.id));
        for (const link of result.links)
          if (valid.has(link.from) && valid.has(link.to))
            await tx
              .insert(g.graphEdges)
              .values({ ...link, inferred: true })
              .onConflictDoNothing();
      });
    }
    await this.service.db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext('gc2-clusters'))`,
      );
      const graph = await this.read(
        scope === "private" ? row.accountId : undefined,
        "all",
      );
      await tx
        .insert(g.clusterSnapshots)
        .values({
          scope:
            scope === "private" ? `private:${row.accountId}` : "comparison",
          clusters: graph.clusters,
        })
        .onConflictDoUpdate({
          target: g.clusterSnapshots.scope,
          set: { clusters: graph.clusters, updatedAt: new Date() },
        });
    });
  }
  async read(accountId?: string, provenance = "all"): Promise<GraphView> {
    const rows = await this.service.db
      .select({
        node: g.graphNodes,
        person: accounts.name,
        version: g.analysisRuns.version,
        graphStatus: sql<string>`${voidSessions.state}->>'graphStatus'`,
      })
      .from(g.graphNodes)
      .innerJoin(accounts, eq(accounts.id, g.graphNodes.accountId))
      .innerJoin(g.analysisRuns, eq(g.analysisRuns.id, g.graphNodes.analysisId))
      .innerJoin(
        voidSessions,
        and(
          eq(voidSessions.id, g.graphNodes.sessionId),
          isNull(voidSessions.deletedAt),
        ),
      )
      .where(
        and(
          eq(g.graphNodes.scope, accountId ? "private" : "comparison"),
          accountId
            ? eq(g.graphNodes.accountId, accountId)
            : sql`exists(select 1 from ${g.comparisonSummaries} where ${g.comparisonSummaries.id}=${g.graphNodes.summaryId} and ${g.comparisonSummaries.approved}=true)`,
          provenance !== "all"
            ? eq(g.graphNodes.provenance, provenance)
            : undefined,
        ),
      )
      .orderBy(g.graphNodes.id);
    const nodes: GraphView["nodes"] = rows.map(
      ({ node: n, person, version }) => ({
        id: n.id,
        personId: n.accountId,
        personName:
          n.provenance === "synthetic"
            ? person
            : `Person ${n.accountId.slice(0, 6)}`,
        sessionId: n.sessionId,
        kind: n.kind,
        title: n.title,
        summary: n.summary,
        experience: n.experience,
        response: n.response,
        source: n.source,
        turnIds: accountId ? n.turnIds : [],
        provenance: n.provenance as "real" | "synthetic",
        analysisVersion: version,
      }),
    );
    const ids = nodes.map((n) => n.id);
    const edges = ids.length
      ? await this.service.db
          .select()
          .from(g.graphEdges)
          .where(
            and(inArray(g.graphEdges.from, ids), inArray(g.graphEdges.to, ids)),
          )
      : [];
    return {
      version: 1,
      nodes,
      edges,
      clusters: clusters(nodes, edges),
      exploratory: true,
      pendingSessions: new Set(
        rows
          .filter((r) => ["queued", "running"].includes(r.graphStatus))
          .map((r) => r.node.sessionId),
      ).size,
      failedSessions: new Set(
        rows
          .filter((r) => r.graphStatus === "failed")
          .map((r) => r.node.sessionId),
      ).size,
    };
  }
  async summaries(accountId: string): Promise<ComparisonSummary[]> {
    const rows = await this.service.db
      .select({ summary: g.comparisonSummaries })
      .from(g.comparisonSummaries)
      .innerJoin(
        voidSessions,
        and(
          eq(voidSessions.id, g.comparisonSummaries.sessionId),
          isNull(voidSessions.deletedAt),
        ),
      )
      .innerJoin(
        g.analysisRuns,
        eq(g.analysisRuns.id, g.comparisonSummaries.analysisId),
      )
      .where(
        and(
          eq(g.comparisonSummaries.accountId, accountId),
          eq(g.analysisRuns.status, "ready"),
        ),
      )
      .orderBy(desc(g.comparisonSummaries.createdAt));
    return rows.map(({ summary: s }) => ({
      id: s.id,
      sessionId: s.sessionId,
      revision: s.revision,
      approved: s.approved,
      items: s.items,
    }));
  }
  async approve(
    accountId: string,
    id: string,
    revision: number,
    approved: boolean,
    items?: ComparisonSummary["items"],
  ) {
    const [summary] = await this.service.db
      .select()
      .from(g.comparisonSummaries)
      .where(
        and(
          eq(g.comparisonSummaries.id, id),
          eq(g.comparisonSummaries.accountId, accountId),
        ),
      );
    ensure(summary, "VOID_NOT_FOUND", "Summary not found.", 404);
    await this.service.change(
      summary.sessionId,
      async (s, _r, tx) => {
        const [current] = await tx
          .select()
          .from(g.comparisonSummaries)
          .where(eq(g.comparisonSummaries.id, id))
          .for("update");
        const [analysis] = await tx
          .select()
          .from(g.analysisRuns)
          .where(eq(g.analysisRuns.id, current.analysisId));
        ensure(
          current.revision === revision &&
            analysis?.status === "ready" &&
            analysis.version === s.analysisRevision,
          "VOID_STALE",
          "Refresh to review the latest summary.",
          409,
        );
        const next = items ?? current.items;
        ensure(
          next.every((n) => current.items.some((i) => i.key === n.key)) &&
            new Set(next.map((n) => n.key)).size === next.length,
          "INVALID_SUMMARY",
          "Keep only stories from this summary.",
          400,
        );
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtext('gc2-clusters'))`,
        );
        await tx.delete(g.graphNodes).where(eq(g.graphNodes.summaryId, id));
        await tx.delete(g.clusterSnapshots);
        await tx
          .update(g.comparisonSummaries)
          .set({ items: next, approved, revision: revision + 1 })
          .where(eq(g.comparisonSummaries.id, id));
        if (approved) {
          ensure(
            (s.used.graph ?? 0) < 8,
            "VOID_GRAPH_LIMIT",
            "This conversation has reached its comparison allowance.",
            429,
          );
          s.graphStatus = "queued";
          for (const item of next)
            await tx.insert(g.graphNodes).values({
              sessionId: summary.sessionId,
              accountId,
              analysisId: current.analysisId,
              summaryId: id,
              scope: "comparison",
              provenance: s.provenance ?? "real",
              kind: "story",
              title: item.title,
              summary: [item.experience, item.response]
                .filter(Boolean)
                .join(" "),
              experience: item.experience,
              response: item.response,
              source: "approved-summary",
              turnIds: [],
            });
          await this.service.enqueue(tx, summary.sessionId, "compare");
        }
      },
      accountId,
    );
  }
}
