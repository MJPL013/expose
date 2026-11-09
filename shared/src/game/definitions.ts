import {
  FlowDefinitionSchema,
  type FlowDefinition,
  type StepDefinition,
  type StepType,
  type GameMode,
  type PackId,
} from "./contracts";
import { shuffled } from "./logic";
import { pacedDuration, type Pace } from "./guided";

export type Ruleset = {
  id: string;
  mindReader: number;
  bamboozle: number;
  aiDecoy: number;
  calloutThreshold: number;
  maxCallouts: number;
  factMatch: number;
  favourite: number;
};
export const classicRules: Ruleset = {
  id: "classic-v1",
  mindReader: 100,
  bamboozle: 150,
  aiDecoy: -50,
  calloutThreshold: 1.5,
  maxCallouts: 1,
  factMatch: 100,
  favourite: 100,
};
const step = (
  id: string,
  type: StepType,
  act: number,
  title: string,
  seconds: number,
  params: StepDefinition["params"] = {},
): StepDefinition => ({
  id,
  type,
  act,
  title,
  durationMs: seconds * 1000,
  params,
});
export const classicFlow: FlowDefinition = {
  id: "hostel-classic",
  version: 1,
  packId: "hostel-2am",
  rulesetId: classicRules.id,
  steps: [
    step("lobby", "lobby", 0, "The waiting room", 0),
    step("traits", "traits", 1, "Know your squad", 60),
    step("nominate-1", "nomination", 1, "Point a finger", 15, { index: 0 }),
    step("nominate-2", "nomination", 1, "One more accusation", 15, {
      index: 1,
    }),
    step("callout", "callout", 1, "Hold that thought", 25),
    step("catchphrase", "catchphrase", 2, "Your signature line", 25),
    ...[0, 1].flatMap((round) => [
      step(`answer-${round}`, "answer", 2, "Make it believable", 30, { round }),
      step(`waiting-${round}`, "waiting", 2, "Sealing the evidence", 2, {
        round,
      }),
      step(`vote-${round}`, "vote", 2, "Find the real answer", 25, { round }),
      step(`reveal-${round}`, "reveal", 2, "The truth comes out", 18, {
        round,
      }),
    ]),
    step("sync", "sync", 3, "One last prediction", 25),
    step("story", "story", 3, "A night to remember", 30),
    step("verdict", "verdict", 3, "The final verdict", 20),
    step("card", "card", 3, "Your friend dossier", 0),
    step("summary", "summary", 3, "Case closed", 0),
  ],
};
export const remixFlow: FlowDefinition = {
  ...classicFlow,
  id: "hostel-remix",
  steps: classicFlow.steps.flatMap((s) =>
    s.id === "reveal-1"
      ? [s, step("wildcard", "wildcard", 2, "Wildcard: remix", 25)]
      : [s],
  ),
};

export const seatIds = [
  "you",
  "manoj",
  "ananya",
  "kabir",
  "zoya",
  "arjun",
  "meera",
];

/** The original flow remains a compact workbench fixture; player rooms use this builder. */
export function buildFlow(
  mode: GameMode = "spotlight",
  count = 5,
  remix = false,
  rosterIds: string[] = seatIds.slice(0, count),
  seed = "hostel-rotation",
  packId: PackId = "hostel-2am",
  pace?: Pace,
): FlowDefinition {
  const targets = shuffled(rosterIds, seed);
  const opening = classicFlow.steps.slice(0, 6).map((s) => ({
    ...s,
    durationMs:
      (
        {
          lobby: 0,
          traits: 30,
          nomination: 10,
          callout: 15,
          catchphrase: 15,
        } as Partial<Record<StepType, number>>
      )[s.type]! * 1000,
  }));
  const rounds = targets.flatMap((targetId, index) =>
    mode === "bluff"
      ? [
          step(`answer-${index}`, "answer", 2, "Make it believable", 30, {
            round: index,
            targetId,
          }),
          step(`waiting-${index}`, "waiting", 2, "Sealing the evidence", 2, {
            round: index,
            targetId,
          }),
          step(`vote-${index}`, "vote", 2, "Find the real answer", 25, {
            round: index,
            targetId,
          }),
          step(`reveal-${index}`, "reveal", 2, "The truth comes out", 5, {
            round: index,
            targetId,
          }),
        ]
      : (["fact", "favourite"] as const).flatMap((kind, offset) => {
          const round = index * 2 + offset;
          const params = { round, targetId, kind, index };
          return [
            ...(kind === "fact"
              ? [
                  step(
                    `secret-${round}`,
                    "secret",
                    2,
                    "Lock your secret",
                    8,
                    params,
                  ),
                ]
              : []),
            step(`guess-${round}`, "guess", 2, "Know your friend", 18, params),
            ...(kind === "favourite"
              ? [
                  step(
                    `judge-${round}`,
                    "judge",
                    2,
                    "Pick your favourite",
                    10,
                    params,
                  ),
                ]
              : []),
            step(
              `spotlight-reveal-${round}`,
              "spotlight-reveal",
              2,
              "The squad scores",
              5,
              params,
            ),
          ];
        }),
  );
  const ending = classicFlow.steps
    .slice(-6)
    .map((s) => ({
      ...s,
      durationMs:
        (
          { sync: 15, story: 20, verdict: 10, card: 0, summary: 0 } as Partial<
            Record<StepType, number>
          >
        )[s.type] !== undefined
          ? (
              {
                sync: 15,
                story: 20,
                verdict: 10,
                card: 0,
                summary: 0,
              } as Partial<Record<StepType, number>>
            )[s.type]! * 1000
          : s.durationMs,
    }))
    .filter((s) => s.type !== "reveal");
  return {
    ...classicFlow,
    id: `${packId === "goa-trip" ? "goa" : "hostel"}-${mode}-${count}${remix ? "-remix" : ""}`,
    packId,
    version: pace ? 4 : 2,
    steps: [
      ...opening,
      ...rounds,
      ...(remix ? [step("wildcard", "wildcard", 2, "Wildcard remix", 25)] : []),
      ...ending,
    ].map((s) => ({
      ...s,
      durationMs: pace
        ? pacedDuration(s.type, pace, s.durationMs)
        : s.durationMs,
    })),
  };
}

export function buildNetworkFlow(
  mode: GameMode,
  rosterIds: string[],
  seed: string,
  packId: PackId = "hostel-2am",
  pace?: Pace,
): FlowDefinition {
  const flow = buildFlow(
    mode,
    rosterIds.length,
    false,
    rosterIds,
    seed,
    packId,
  );
  return {
    ...flow,
    version: pace ? 4 : 3,
    steps: flow.steps.map((s) => ({
      ...s,
      durationMs: pace
        ? pacedDuration(s.type, pace, s.durationMs)
        : ((
            {
              secret: 15000,
              guess: 25000,
              catchphrase: 25000,
              answer: 35000,
              reveal: 8000,
              "spotlight-reveal": 8000,
            } as Partial<Record<StepType, number>>
          )[s.type] ?? s.durationMs),
    })),
  };
}

export function validateFlow(
  input: unknown,
  registered: ReadonlySet<StepType>,
): FlowDefinition {
  const flow = FlowDefinitionSchema.parse(input);
  const ids = new Set<string>();
  const seen = new Set<string>();
  for (const s of flow.steps) {
    if (ids.has(s.id)) throw new Error(`Duplicate step ID: ${s.id}`);
    if (!registered.has(s.type))
      throw new Error(`Missing renderer/module: ${s.type}`);
    const round = s.params.round;
    if (["secret", "guess", "judge", "spotlight-reveal"].includes(s.type)) {
      if (!s.params.targetId || !s.params.kind)
        throw new Error(`${s.id} requires a target and question kind`);
      if (s.type === "secret" && s.params.kind !== "fact")
        throw new Error("Only factual questions have secrets");
      if (s.type === "judge" && s.params.kind !== "favourite")
        throw new Error("Only favourite questions need a judge");
      const sameRound = flow.steps.filter(
        (other) => other.params.round === round,
      );
      if (
        sameRound.some(
          (other) =>
            other.params.targetId !== s.params.targetId ||
            other.params.kind !== s.params.kind,
        )
      )
        throw new Error("Round participants and kind must agree");
    }
    if (
      [
        "answer",
        "waiting",
        "vote",
        "reveal",
        "secret",
        "guess",
        "judge",
        "spotlight-reveal",
      ].includes(s.type) &&
      round === undefined
    )
      throw new Error(`Round required: ${s.id}`);
    const requires: Partial<Record<StepType, string>> = {
      callout: "traits",
      waiting: `answer:${round}`,
      vote: `waiting:${round}`,
      reveal: `vote:${round}`,
      wildcard: "catchphrase",
      card: "traits",
      summary: "card",
      judge: `guess:${round}`,
      "spotlight-reveal":
        s.params.kind === "fact" ? `guess:${round}` : `judge:${round}`,
    };
    const dependency = requires[s.type];
    if (
      s.type === "guess" &&
      s.params.kind === "fact" &&
      !seen.has(`secret:${round}`)
    )
      throw new Error(`${s.id} requires secret:${round} first`);
    if (dependency && !seen.has(dependency))
      throw new Error(`${s.id} requires ${dependency} first`);
    ids.add(s.id);
    seen.add(s.type);
    seen.add(`${s.type}:${round}`);
  }
  if (flow.steps[0].type !== "lobby" || flow.steps.at(-1)?.type !== "summary")
    throw new Error("Flow must start in the lobby and end with summary.");
  return flow;
}
