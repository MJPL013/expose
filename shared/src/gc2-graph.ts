import { z } from "zod";
export const GRAPH_VERSION = 2;
export const EMBEDDING_TEXT_VERSION = 2;
export const EvidenceValue = z
  .strictObject({
    text: z.string().trim().min(1).max(280),
    turnIds: z.array(z.string().min(1)).min(1).max(8),
    source: z.enum(["lived", "hypothetical", "self-described", "inferred"]),
  })
  .strict();
export const StoryMetadataSchema = z
  .strictObject({
    situation: EvidenceValue.nullable(),
    trigger: EvidenceValue.nullable(),
    tags: z.array(EvidenceValue).max(8),
    goal: EvidenceValue.nullable(),
    constraints: EvidenceValue.nullable(),
    options: EvidenceValue.nullable(),
    action: EvidenceValue.nullable(),
    reasoning: EvidenceValue.nullable(),
    reaction: EvidenceValue.nullable(),
    emotions: EvidenceValue.nullable(),
    outcome: EvidenceValue.nullable(),
    reflection: EvidenceValue.nullable(),
    alternative: EvidenceValue.nullable(),
  })
  .strict();
export type StoryMetadata = z.infer<typeof StoryMetadataSchema>;
export function metadataEvidence(metadata?: StoryMetadata | null) {
  return metadata
    ? Object.values(metadata).flatMap((v) =>
        Array.isArray(v) ? v : v ? [v] : [],
      )
    : [];
}
export const StorySchema = z.strictObject({
  key: z.string().min(1).max(60),
  kind: z.enum(["story", "observation"]),
  title: z.string().min(1).max(100),
  summary: z.string().min(1).max(600),
  experience: z.string().max(350),
  response: z.string().max(350),
  source: z.enum(["lived", "hypothetical", "self-described", "inferred"]),
  turnIds: z.array(z.string()).min(1).max(20),
  metadata: StoryMetadataSchema,
});
export const RelationshipKind = z.enum([
  "continues",
  "related-experience",
  "supports",
  "contradicts",
  "similar-response",
]);
export const StoryAnalysisSchema = z.strictObject({
  summary: z.string().max(1600),
  nodes: z.array(StorySchema).max(40),
  edges: z
    .array(
      z.strictObject({
        from: z.string(),
        to: z.string(),
        kind: RelationshipKind,
        reason: z.string().max(400),
      }),
    )
    .max(60),
  persona: z
    .strictObject({
      title: z.string().max(65),
      quote: z.string().max(220),
      observations: z
        .array(
          z.strictObject({
            text: z.string().max(220),
            nodeKeys: z.array(z.string()).min(1).max(10),
          }),
        )
        .max(2),
      nodeKeys: z.array(z.string()).max(20),
    })
    .nullable(),
});
export const LinkReviewSchema = z.strictObject({
  links: z
    .array(
      z.strictObject({
        from: z.string(),
        to: z.string(),
        view: z.enum(["experience", "response"]),
        kind: RelationshipKind,
        reason: z.string().min(1).max(400),
      }),
    )
    .max(40),
});
export type GraphNode = {
  metadata?: StoryMetadata | null;
  metadataVersion?: number;
  id: string;
  personId: string;
  personName: string;
  sessionId: string;
  kind: string;
  title: string;
  summary: string;
  experience: string;
  response: string;
  source: string;
  turnIds: string[];
  provenance: "real" | "synthetic";
  analysisVersion: number;
};
export type GraphEdge = {
  similarity?: number | null;
  id: string;
  from: string;
  to: string;
  kind: string;
  reason: string;
  inferred: boolean;
};
export type GraphView = {
  version: 1 | 2;
  personPairs?: {
    people: [string, string];
    responseLinks: number;
    experienceLinks: number;
    responseSimilarity: number;
    limitedEvidence: boolean;
  }[];
  pendingSessions?: number;
  failedSessions?: number;
  nodes: GraphNode[];
  edges: GraphEdge[];
  clusters: {
    id: string;
    view: "experience" | "response";
    nodeIds: string[];
  }[];
  exploratory: true;
};
export type ComparisonSummary = {
  id: string;
  sessionId: string;
  revision: number;
  approved: boolean;
  items: {
    key: string;
    title: string;
    experience: string;
    response: string;
    metadata?: StoryMetadata | null;
  }[];
};
