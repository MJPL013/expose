import type { Callout, Player, ScoreEvent } from "./contracts";
import type { Ruleset } from "./definitions";

export type PrivateAnswer = {
  id: string;
  text: string;
  authorId: string | null;
  isTruth: boolean;
  isAI: boolean;
};
export type Round = {
  questionId?: string;
  targetId: string;
  prompt: string;
  answers: PrivateAnswer[];
  votes: Record<string, string>;
  scored: boolean;
  skipped?: boolean;
};

export function hash(text: string): number {
  let n = 2166136261;
  for (const char of text) n = Math.imul(n ^ char.charCodeAt(0), 16777619);
  return n >>> 0;
}
export function shuffled<T>(items: T[], seed: string): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = hash(`${seed}:${i}`) % (i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
export function scoreRound(
  round: Round,
  roundIndex: number,
  rules: Ruleset,
): ScoreEvent[] {
  if (round.skipped) return [];
  const events: ScoreEvent[] = [];
  for (const [voterId, optionId] of Object.entries(round.votes)) {
    if (voterId === round.targetId) continue;
    const answer = round.answers.find((a) => a.id === optionId);
    if (!answer || answer.authorId === voterId) continue;
    if (answer.isTruth)
      events.push({
        playerId: voterId,
        rule: "mindReader",
        points: rules.mindReader,
        round: roundIndex,
      });
    else if (answer.isAI)
      events.push({
        playerId: voterId,
        rule: "aiDecoy",
        points: rules.aiDecoy,
        round: roundIndex,
      });
    else if (answer.authorId)
      events.push({
        playerId: answer.authorId,
        rule: "bamboozle",
        points: rules.bamboozle,
        round: roundIndex,
      });
  }
  return events;
}
export function findCallout(
  self: number[],
  peers: number[],
  labels: string[],
  threshold: number,
): Callout | null {
  return (
    self
      .map((value, i) => ({
        trait: labels[i],
        self: value,
        peers: peers[i],
        gap: Math.abs(value - peers[i]),
      }))
      .filter((c) => c.gap > threshold)
      .sort((a, b) => b.gap - a.gap)[0] ?? null
  );
}
export function winners(players: Player[]): string[] {
  const highest = Math.max(...players.map((p) => p.score));
  return players.filter((p) => p.score === highest).map((p) => p.id);
}
