import { z } from "zod";
export const GRAPH_VERSION = 1;
export const StorySchema = z.object({
  key: z.string().min(1).max(60),
  kind: z.enum(["story", "observation"]),
  title: z.string().min(1).max(100),
  summary: z.string().min(1).max(600),
  experience: z.string().max(350),
  response: z.string().max(350),
  source: z.enum(["lived", "hypothetical", "self-described", "inferred"]),
  turnIds: z.array(z.string()).min(1).max(20),
});
export const RelationshipKind = z.enum([
  "continues",
  "related-experience",
  "supports",
  "contradicts",
  "similar-response",
]);
export const StoryAnalysisSchema = z.object({
  summary: z.string().max(1600),
  nodes: z.array(StorySchema).max(40),
  edges: z
    .array(
      z.object({
        from: z.string(),
        to: z.string(),
        kind: RelationshipKind,
        reason: z.string().max(400),
      }),
    )
    .max(60),
  persona: z
    .object({
      title: z.string().max(65),
      quote: z.string().max(220),
      observations: z
        .array(
          z.object({
            text: z.string().max(220),
            nodeKeys: z.array(z.string()).min(1).max(10),
          }),
        )
        .max(2),
      nodeKeys: z.array(z.string()).max(20),
    })
    .nullable(),
});
export const LinkReviewSchema = z.object({
  links: z
    .array(
      z.object({
        from: z.string(),
        to: z.string(),
        kind: RelationshipKind,
        reason: z.string().min(1).max(400),
      }),
    )
    .max(40),
});
export type GraphNode = {
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
  id: string;
  from: string;
  to: string;
  kind: string;
  reason: string;
  inferred: boolean;
};
export type GraphView = {
  version: 1;
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
  items: { key: string; title: string; experience: string; response: string }[];
};
