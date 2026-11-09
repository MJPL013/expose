import {
  IntentSchema,
  SetupSchema,
  stepTypes,
  type Callout,
  type FlowDefinition,
  type FriendCard,
  type GameSnapshot,
  type Intent,
  type PhaseView,
  type Player,
  type ScoreEvent,
  type Setup,
  type StepDefinition,
  type StepType,
  type Controller,
} from "./contracts";
import {
  classicFlow,
  classicRules,
  buildNetworkFlow,
  validateFlow,
  type Ruleset,
} from "./definitions";
import { copy, pack } from "./content";
import { narratedInputs, type Narration } from "./guided";
import { freshContent } from "./fresh-content";
import {
  captureContent,
  contentFor,
  type ContentSnapshot,
} from "./content-snapshot";
import {
  findCallout,
  hash,
  scoreRound,
  shuffled,
  winners,
  type Round,
} from "./logic";
import {
  scoreSpotlight,
  spotlightOptions,
  spotlightQuestion,
  type SpotlightRound,
} from "./spotlight";

export type EngineState = {
  narration?: Narration;
  questionHistory?: string[];
  runQuestionHistory?: string[];
  hostFlowVersion?: number;
  network?: boolean;
  optionIds?: Record<string, string>;
  content?: ContentSnapshot;
  ratingsByPlayer?: Record<
    string,
    { self: number[]; friend: number[]; friendId: string }
  >;
  cardDecisions?: Record<string, "approve" | "reject">;
  sessionId: string;
  phaseEpoch: number;
  startedAt: number;
  completed: Record<string, string[]>;
  controllers: Record<string, Record<string, Controller>>;
  spotlights: Record<number, SpotlightRound>;
  flow: FlowDefinition;
  rules: Ruleset;
  setup: Setup;
  players: Player[];
  roomCode: string;
  stepIndex: number;
  revision: number;
  deadline: number | null;
  seen: string[];
  self: number[];
  friend: number[];
  callout: Callout | null;
  callouts: number;
  catchphrases: Record<string, string>;
  rounds: Record<number, Round>;
  scores: ScoreEvent[];
  nominations: Record<string, string>;
  prediction: Record<string, string>;
  predictionRevealed: boolean;
  approved: string[];
  vetoes: string[];
  notice: string | null;
  defenses: Record<string, string>;
};

export function createNetworkState(
  players: Player[],
  setup: Setup,
  runId: string,
  roomCode: string,
  optionIds: Record<string, string> = {},
  questionHistory: string[] = [],
): EngineState {
  const state = initialState(
    buildNetworkFlow(
      setup.gameMode ?? "spotlight",
      players.map((p) => p.id),
      runId,
      setup.packId,
      setup.pace,
    ),
    classicRules,
    { ...setup, seatCount: setup.seatCount ?? 5 },
  );
  return {
    ...state,
    network: true,
    content: setup.pace
      ? freshContent(
          captureContent(players.length, setup.packId, setup.hostLanguage),
          setup,
          runId,
          questionHistory,
        )
      : captureContent(players.length, setup.packId, setup.hostLanguage),
    questionHistory: [...questionHistory],
    runQuestionHistory: [],
    optionIds,
    ratingsByPlayer: {},
    cardDecisions: {},
    players: structuredClone(players),
    sessionId: runId,
    roomCode,
    catchphrases: {},
  };
}

export function friendTarget(s: EngineState, viewerId: string): string {
  const roster = shuffled(s.players, `friend-targets:${s.sessionId}`);
  const index = roster.findIndex((p) => p.id === viewerId);
  return roster[(index + 1) % roster.length]?.id ?? viewerId;
}

function updateNetworkCallout(s: EngineState) {
  const pack = contentFor(s.content);
  let best: Callout | null = null;
  for (const player of s.players) {
    const own = s.ratingsByPlayer?.[player.id];
    const peers = Object.values(s.ratingsByPlayer ?? {}).filter(
      (r) => r.friendId === player.id,
    );
    if (!own || !peers.length) continue;
    const mean = own.self.map(
      (_, i) => peers.reduce((sum, r) => sum + r.friend[i], 0) / peers.length,
    );
    const gap = findCallout(
      own.self,
      mean,
      pack.traits.map((t) => t.right),
      s.rules.calloutThreshold,
    );
    if (gap && (!best || gap.gap > best.gap))
      best = { ...gap, targetId: player.id };
  }
  s.callout = best;
}
export const engineRegistry = new Set<StepType>(stepTypes);
export const defaultSetup: Setup = {
  name: "You",
  spice: "medium",
  mode: "remote",
  adult: false,
};

export function initialState(
  flow: FlowDefinition = classicFlow,
  rules: Ruleset = classicRules,
  setup: Setup = defaultSetup,
): EngineState {
  validateFlow(flow, engineRegistry);
  if (flow.rulesetId !== rules.id)
    throw new Error("Flow and scoring ruleset do not match.");
  const count =
    setup.seatCount ??
    (new Set(flow.steps.map((step) => step.params.targetId).filter(Boolean))
      .size ||
      4);
  setup = {
    ...setup,
    packId: flow.packId,
    seatCount: count,
    gameMode: flow.id.includes("spotlight") ? "spotlight" : "bluff",
  };
  return {
    sessionId: "fixture",
    content: captureContent(count, flow.packId),
    phaseEpoch: 0,
    startedAt: 0,
    completed: {},
    controllers: {},
    spotlights: {},
    flow,
    rules,
    setup: SetupSchema.parse(setup),
    roomCode: "DEMO42",
    stepIndex: 0,
    revision: 0,
    deadline: null,
    seen: [],
    players: [
      {
        id: "you",
        name: setup.name,
        initials: setup.name.slice(0, 2).toUpperCase(),
        color: setup.color ?? "#ffb020",
        avatar: setup.avatar ?? 0,
        score: 0,
        ready: false,
        host: true,
      },
      {
        id: "manoj",
        name: "Manoj",
        initials: "MA",
        color: "#b5b2d8",
        avatar: 1,
        score: 0,
        ready: true,
        host: false,
      },
      {
        id: "ananya",
        name: "Ananya",
        initials: "AN",
        color: "#dca58d",
        avatar: 2,
        score: 0,
        ready: true,
        host: false,
      },
      {
        id: "kabir",
        name: "Kabir",
        initials: "KA",
        color: "#a8baa0",
        avatar: 3,
        score: 0,
        ready: true,
        host: false,
      },
      {
        id: "zoya",
        name: "Zoya",
        initials: "ZO",
        color: "#b5b2d8",
        avatar: 1,
        score: 0,
        ready: true,
        host: false,
      },
      {
        id: "arjun",
        name: "Arjun",
        initials: "AR",
        color: "#a8baa0",
        avatar: 2,
        score: 0,
        ready: true,
        host: false,
      },
      {
        id: "meera",
        name: "Meera",
        initials: "ME",
        color: "#dca58d",
        avatar: 3,
        score: 0,
        ready: true,
        host: false,
      },
    ]
      .slice(0, setup.seatCount ?? (flow.version === 1 ? 4 : 5))
      .map((p) => ({
        ...p,
        controller:
          p.id === "you" ? ("human" as const) : ("simulated" as const),
        connected: true,
        disconnectedAt: null,
        returnAfterRound: null,
        aiPoints: 0,
      })),
    self: [5, 5, 5],
    friend: [5, 5, 5],
    callout: null,
    callouts: 0,
    catchphrases: {
      you: pack.catchphraseSample,
      ...pack.botCatchphrases,
    },
    rounds: {},
    scores: [],
    nominations: {},
    prediction: {},
    predictionRevealed: false,
    approved: [],
    vetoes: [],
    notice: null,
    defenses: {},
  };
}
export function activeStep(s: EngineState): StepDefinition {
  return s.flow.steps[s.stepIndex];
}
/** Preview only known public prompts; voting/judging options wait until released. */
export function previewNextInput(
  s: EngineState,
  now: number,
): GameSnapshot | null {
  const next = s.flow.steps[s.stepIndex + 1];
  if (
    s.flow.version < 4 ||
    !s.setup.guidedVoice ||
    !next ||
    !narratedInputs.has(next.type) ||
    ["vote", "judge"].includes(next.type)
  )
    return null;
  const preview = structuredClone(s);
  preview.stepIndex++;
  prepare(preview, now, preview.players[0].id);
  return project(preview, preview.players[0].id);
}

function nextQuestionIndex(
  s: EngineState,
  questions: { id?: string }[],
  fallback = 0,
) {
  const unseen = questions.findIndex(
    (q) => !s.questionHistory?.includes(q.id!),
  );
  if (unseen >= 0) return unseen;
  const freshThisRun = questions.findIndex(
    (q) => !s.runQuestionHistory?.includes(q.id!),
  );
  return freshThisRun >= 0 ? freshThisRun : fallback % questions.length;
}
function createRound(s: EngineState, index: number): Round {
  const pack = contentFor(s.content);
  const deck = s.content?.bluff;
  const question = deck?.[nextQuestionIndex(s, deck, index)];
  return {
    questionId: question?.id,
    targetId: activeStep(s).params.targetId ?? (index === 0 ? "manoj" : "you"),
    prompt:
      s.flow.version === 1
        ? pack.scenarios[index % 2]
        : (
            question?.prompt ??
            pack.roundPrompts?.[index % pack.roundPrompts.length] ??
            "The squad has five minutes to leave. What does {name} say?"
          ).replaceAll(
            "{name}",
            s.players.find((p) => p.id === activeStep(s).params.targetId)
              ?.name ?? "your friend",
          ),
    answers: [],
    votes: {},
    scored: false,
  };
}
function fillAnswers(s: EngineState, index: number) {
  const pack = contentFor(s.content);
  const round = (s.rounds[index] ??= createRound(s, index));
  for (const [i, p] of s.players.entries()) {
    if (!round.answers.some((a) => a.authorId === p.id)) {
      if (s.flow.version >= 2) {
        if (p.id === round.targetId) {
          round.skipped = true;
          round.answers.push({
            id: `r${index}-passed`,
            authorId: p.id,
            text: "No real answer submitted. This round has no points.",
            isTruth: true,
            isAI: false,
          });
        }
        continue;
      }
      const lines = [
        ...pack.lines[s.setup.spice].slice(0, 4),
        "Bas charger mil jaaye, phir ready.",
        "Chappal mein chalte hain. Full confidence.",
      ];
      const preferred = lines[(i + index) % lines.length];
      const used = new Set(
        round.answers.map((a) => a.text.trim().toLowerCase()),
      );
      const text = !used.has(preferred.toLowerCase())
        ? preferred
        : lines.find((line) => !used.has(line.toLowerCase()))!;
      round.answers.push({
        id: `r${index}-o${hash(`${p.id}:${index}`).toString(36)}`,
        authorId: p.id,
        text,
        isTruth: p.id === round.targetId,
        isAI: false,
      });
    }
  }
  if (!round.answers.some((a) => a.isAI)) {
    const decoy =
      s.content?.bluff?.find((q) => q.id === round.questionId)?.samples[0] ??
      pack.lines[s.setup.spice][4];
    round.answers.push({
      id:
        s.optionIds?.[`${index}:decoy`] ??
        `r${index}-o${hash(`decoy:${index}`).toString(36)}`,
      text: round.answers.some(
        (a) => a.text.toLowerCase() === decoy.toLowerCase(),
      )
        ? pack.alternateDecoy
        : decoy,
      authorId: null,
      isTruth: false,
      isAI: true,
    });
  }
  round.answers = shuffled(
    round.answers,
    s.optionIds?.[`${index}:shuffle`] ?? `options:${index}`,
  );
}
function fillVotes(s: EngineState, index: number, actorId: string) {
  const round = s.rounds[index];
  if (!round) return;
  for (const player of s.players) {
    if (
      player.id === round.targetId ||
      player.id === actorId ||
      round.votes[player.id]
    )
      continue;
    const choices = round.answers.filter((a) => a.authorId !== player.id);
    if (choices.length)
      round.votes[player.id] =
        choices[hash(`${player.id}:vote:${index}`) % choices.length].id;
  }
}
function prepare(s: EngineState, now: number, actorId: string) {
  const step = activeStep(s);
  s.startedAt = now;
  s.phaseEpoch += 1;
  for (const p of s.players) {
    if (
      p.connected &&
      p.returnAfterRound !== null &&
      p.returnAfterRound !== step.params.round
    ) {
      p.controller = s.network || p.id === "you" ? "human" : "simulated";
      p.returnAfterRound = null;
    }
  }
  s.deadline = step.durationMs ? now + step.durationMs : null;
  delete s.narration;
  if (
    s.network &&
    s.flow.version >= 4 &&
    s.setup.guidedVoice &&
    narratedInputs.has(step.type)
  ) {
    s.narration = {
      id: `${s.sessionId}:${s.phaseEpoch}`,
      epoch: s.phaseEpoch,
      text: "",
      status: "pending",
      generationDeadline: now + 8000,
      opensAt: now + 13000,
    };
    s.deadline = s.narration.opensAt + step.durationMs;
  }
  const roundIndex = step.params.round ?? 0;
  if (step.type === "callout") s.callouts += 1;
  if (step.type === "answer")
    s.rounds[roundIndex] ??= createRound(s, roundIndex);
  if (step.type === "waiting") fillAnswers(s, roundIndex);
  if (step.type === "vote") {
    fillAnswers(s, roundIndex);
    if (s.flow.version === 1) fillVotes(s, roundIndex, actorId);
  }
  if (step.type === "reveal") {
    if (s.flow.version === 1) fillVotes(s, roundIndex, actorId);
    const round = s.rounds[roundIndex];
    if (!round.scored) {
      const events = scoreRound(round, roundIndex, s.rules);
      for (const e of events)
        e.controller =
          s.controllers[
            `${e.rule === "bamboozle" ? "answer" : "vote"}-${roundIndex}`
          ]?.[e.playerId] ?? "human";
      s.scores.push(...events);
      for (const e of events) {
        const player = s.players.find((p) => p.id === e.playerId);
        if (player) {
          player.score += e.points;
          if (e.controller === "ai") player.aiPoints += e.points;
        }
      }
      round.scored = true;
    }
  }
  if (["secret", "guess", "judge", "spotlight-reveal"].includes(step.type)) {
    const round = (s.spotlights[roundIndex] ??= {
      targetId: step.params.targetId!,
      kind: step.params.kind!,
      questionIndex:
        s.flow.version >= 4 && s.content
          ? nextQuestionIndex(
              s,
              s.content.spotlight[step.params.kind!],
              step.params.index ?? 0,
            )
          : (step.params.index ?? 0),
      questions: s.content?.spotlight[step.params.kind!],
      secret: null,
      submissions: {},
      controllers: {},
      selected: null,
      standIn: false,
      skipped: false,
      scored: false,
    });
    if (step.type === "spotlight-reveal" && !round.scored) {
      const events = scoreSpotlight(round, roundIndex, s.rules);
      s.scores.push(...events);
      for (const e of events) {
        const p = s.players.find((p) => p.id === e.playerId)!;
        p.score += e.points;
        if (e.controller === "ai") p.aiPoints += e.points;
      }
      round.scored = true;
    }
  }
  if (s.flow.version >= 4) {
    const id =
      step.type === "answer"
        ? s.rounds[roundIndex]?.questionId
        : ["secret", "guess"].includes(step.type)
          ? spotlightQuestion(s.spotlights[roundIndex]).id
          : undefined;
    if (id && !s.questionHistory?.includes(id))
      (s.questionHistory ??= []).push(id);
    if (id && !s.runQuestionHistory?.includes(id))
      (s.runQuestionHistory ??= []).push(id);
  }
}
function advance(s: EngineState, now: number, actorId: string) {
  if (s.network && activeStep(s).type === "traits") updateNetworkCallout(s);
  if (s.stepIndex >= s.flow.steps.length - 1) return;
  s.stepIndex += 1;
  while (
    activeStep(s).type === "callout" &&
    (s.hostFlowVersion ?? 1) < 2 &&
    (!s.callout || s.callouts >= s.rules.maxCallouts)
  )
    s.stepIndex += 1;
  const next = activeStep(s);
  if (
    s.flow.version >= 2 &&
    ((next.type === "guess" && s.spotlights[next.params.round!]?.skipped) ||
      (next.type === "vote" && s.rounds[next.params.round!]?.skipped))
  ) {
    s.stepIndex = s.flow.steps.findIndex(
      (step) =>
        step.params.round === next.params.round &&
        step.type === (next.type === "guess" ? "spotlight-reveal" : "reveal"),
    );
  }
  prepare(s, now, actorId);
}
function revealPrediction(s: EngineState, actorId: string) {
  for (const player of s.players)
    if (player.id !== actorId)
      s.prediction[player.id] =
        s.players[hash(`${player.id}:prediction`) % s.players.length].id;
  s.predictionRevealed = true;
}

/** Pure intent reducer. Time and player identity are injected by the session adapter. */
export function reduceIntent(
  previous: EngineState,
  raw: Intent,
  now: number,
  actorId = "you",
): EngineState {
  if (previous.flow.version >= 2)
    return reduceCompetitive(previous, raw, now, actorId);
  const parsed = IntentSchema.safeParse(raw);
  if (!parsed.success)
    return {
      ...previous,
      notice: copy.invalidAction,
      revision: previous.revision + 1,
    };
  const intent = parsed.data;
  if (
    previous.seen.includes(intent.cid) ||
    intent.stepId !== activeStep(previous).id
  )
    return previous;
  const s = structuredClone(previous);
  s.seen = [...s.seen.slice(-199), intent.cid];
  s.notice = null;
  s.revision += 1;
  const step = activeStep(s);
  const roundIndex = step.params.round ?? 0;
  const isPlayer = (id: string) => s.players.some((p) => p.id === id);
  if (!isPlayer(actorId)) return previous;
  if (intent.type === "restart") {
    const reset = initialState(s.flow, s.rules, s.setup);
    return { ...reset, revision: s.revision, seen: [intent.cid] };
  }
  if (intent.type === "ready" && step.type === "lobby") {
    s.players.find((p) => p.id === actorId)!.ready = intent.ready;
  } else if (
    intent.type === "start" &&
    step.type === "lobby" &&
    s.players.find((p) => p.id === actorId)?.host
  ) {
    if (s.players.every((p) => p.ready)) advance(s, now, actorId);
    else s.notice = "Everyone needs to be ready before the host starts.";
  } else if (intent.type === "traits" && step.type === "traits") {
    s.self = intent.self;
    s.friend = intent.friend;
    s.callout = findCallout(
      s.self,
      [8, 7, 9],
      pack.traits.map((t) => t.right),
      s.rules.calloutThreshold,
    );
    advance(s, now, actorId);
  } else if (
    intent.type === "nominate" &&
    step.type === "nomination" &&
    isPlayer(intent.playerId)
  ) {
    s.nominations[step.id] = intent.playerId;
    advance(s, now, actorId);
  } else if (
    intent.type === "submit" &&
    ["answer", "catchphrase", "callout", "wildcard"].includes(step.type)
  ) {
    if (step.type === "answer") {
      const round = s.rounds[roundIndex];
      round.answers = round.answers.filter((a) => a.authorId !== actorId);
      round.answers.push({
        id: `r${roundIndex}-o${hash(`${actorId}:${roundIndex}`).toString(36)}`,
        text: intent.text,
        authorId: actorId,
        isTruth: actorId === round.targetId,
        isAI: false,
      });
    } else if (step.type === "catchphrase" || step.type === "wildcard")
      s.catchphrases[actorId] = intent.text;
    else s.defenses[actorId] = intent.text;
    advance(s, now, actorId);
  } else if (intent.type === "vote" && step.type === "vote") {
    const round = s.rounds[roundIndex];
    const option = round.answers.find((a) => a.id === intent.optionId);
    if (
      actorId === round.targetId ||
      !option ||
      option.authorId === actorId ||
      round.votes[actorId]
    )
      s.notice = copy.unavailableVote;
    else {
      round.votes[actorId] = option.id;
      advance(s, now, actorId);
    }
  } else if (
    intent.type === "predict" &&
    step.type === "sync" &&
    isPlayer(intent.playerId) &&
    !s.predictionRevealed
  ) {
    s.prediction[actorId] = intent.playerId;
    revealPrediction(s, actorId);
  } else if (intent.type === "approve" && step.type === "card") {
    if (!s.approved.includes(actorId)) s.approved.push(actorId);
    advance(s, now, actorId);
  } else if (intent.type === "reject" && step.type === "card") {
    s.approved = s.approved.filter((id) => id !== actorId);
    advance(s, now, actorId);
  } else if (
    intent.type === "veto" &&
    [
      "nomination",
      "answer",
      "catchphrase",
      "wildcard",
      "sync",
      "callout",
    ].includes(step.type)
  ) {
    if (s.vetoes.includes(step.id)) {
      s.notice = copy.skippedQuestion;
      advance(s, now, actorId);
    } else {
      s.vetoes.push(step.id);
      if (step.type === "answer")
        s.rounds[roundIndex].prompt =
          pack.replacementScenarios[
            roundIndex % pack.replacementScenarios.length
          ];
      s.notice = copy.replacedQuestion;
      s.deadline = step.durationMs ? now + step.durationMs : null;
    }
  } else if (
    intent.type === "skip" &&
    step.type !== "lobby" &&
    step.type !== "summary"
  ) {
    if (step.type === "traits")
      s.callout = findCallout(
        s.self,
        [8, 7, 9],
        pack.traits.map((t) => t.right),
        s.rules.calloutThreshold,
      );
    if (step.type === "sync" && !s.predictionRevealed) {
      revealPrediction(s, actorId);
      s.deadline = now + 5000;
    } else advance(s, now, actorId);
  } else if (
    intent.type === "next" &&
    ["waiting", "reveal", "story", "verdict"].includes(step.type)
  )
    advance(s, now, actorId);
  else if (
    intent.type === "next" &&
    step.type === "vote" &&
    (s.rounds[roundIndex].targetId === actorId ||
      s.rounds[roundIndex].votes[actorId])
  )
    advance(s, now, actorId);
  else if (
    intent.type === "next" &&
    step.type === "sync" &&
    s.predictionRevealed
  )
    advance(s, now, actorId);
  else s.notice = copy.unavailableAction;
  return s;
}

export function timeout(
  previous: EngineState,
  now: number,
  actorId = "you",
): EngineState {
  if (previous.deadline === null || now < previous.deadline) return previous;
  if (previous.flow.version >= 2) {
    const s = structuredClone(previous);
    const at = previous.deadline;
    const step = activeStep(s);
    if (step.type === "secret" && !s.spotlights[step.params.round!].secret)
      s.spotlights[step.params.round!].skipped = true;
    if (step.type === "sync" && !s.predictionRevealed) {
      s.predictionRevealed = true;
      s.deadline = at + 5000;
    } else advance(s, at, actorId);
    s.revision += 1;
    return s;
  }
  return reduceIntent(
    previous,
    {
      type: "skip",
      cid: `timeout:${previous.revision}:${activeStep(previous).id}`,
      stepId: activeStep(previous).id,
    },
    now,
    actorId,
  );
}

/** Actors required by this phase; spectators never receive input urgency. */
export function requiredActors(s: EngineState): string[] {
  const step = activeStep(s);
  const target =
    step.params.targetId ?? s.rounds[step.params.round ?? 0]?.targetId;
  if (["secret", "judge"].includes(step.type)) return target ? [target] : [];
  if (["guess", "vote"].includes(step.type))
    return s.players.filter((p) => p.id !== target).map((p) => p.id);
  if (step.type === "callout") if (s.hostFlowVersion === 2) return [];
  if (step.type === "callout")
    return [
      s.network ? (s.callout?.targetId ?? s.players[0].id) : s.players[0].id,
    ];
  if (step.type === "sync" && s.predictionRevealed) return [];
  return [
    "traits",
    "nomination",
    "catchphrase",
    "answer",
    "wildcard",
    "sync",
  ].includes(step.type)
    ? s.players.map((p) => p.id)
    : [];
}

function completeAction(s: EngineState, actorId: string, now: number) {
  const step = activeStep(s);
  const done = (s.completed[step.id] ??= []);
  if (!done.includes(actorId)) done.push(actorId);
  const player = s.players.find((p) => p.id === actorId)!;
  (s.controllers[step.id] ??= {})[actorId] = player.controller;
  if (requiredActors(s).every((id) => done.includes(id))) {
    if (step.type === "sync") {
      s.predictionRevealed = true;
      s.deadline = now + 5000;
    } else advance(s, now, actorId);
  }
}

function reduceCompetitive(
  previous: EngineState,
  raw: Intent,
  now: number,
  actorId: string,
): EngineState {
  const pack = contentFor(previous.content);
  const parsed = IntentSchema.safeParse(raw);
  if (!parsed.success)
    return {
      ...previous,
      notice: copy.invalidAction,
      revision: previous.revision + 1,
    };
  const intent = parsed.data;
  const step = activeStep(previous);
  if (
    previous.seen.includes(intent.cid) ||
    intent.stepId !== step.id ||
    (intent.phaseEpoch !== undefined &&
      intent.phaseEpoch !== previous.phaseEpoch)
  )
    return previous;
  const actor = previous.players.find((p) => p.id === actorId);
  if (!actor) return previous;
  const s = structuredClone(previous);
  const n = step.params.round ?? 0;
  const spot = s.spotlights[n];
  const done = s.completed[step.id]?.includes(actorId);
  const pending = requiredActors(s).includes(actorId) && !done;
  const validPlayer = (id: string) => s.players.some((p) => p.id === id);
  s.notice = null;
  s.revision++;
  s.seen = [...s.seen.slice(-999), intent.cid];
  const invalid = () => ({
    ...previous,
    revision: s.revision,
    notice: copy.unavailableAction,
  });
  if (
    s.narration &&
    s.narration.epoch === s.phaseEpoch &&
    s.narration.status !== "done"
  )
    return invalid();
  if (intent.type === "adult.confirm" && step.type === "lobby")
    s.players.find((p) => p.id === actorId)!.adultConfirmed = true;
  else if (
    intent.type === "appearance.update" &&
    ["lobby", "summary"].includes(step.type)
  ) {
    Object.assign(
      s.players.find((p) => p.id === actorId)!,
      { avatar: intent.avatar, color: intent.color },
    );
  } else if (
    intent.type === "settings.update" &&
    step.type === "lobby" &&
    actor.host
  ) {
    if (intent.spice === "spicy" && !intent.adult) return invalid();
    s.setup = {
      ...s.setup,
      pace: intent.pace,
      hostLanguage: intent.hostLanguage,
      spice: intent.spice,
      adult: intent.adult,
      guidedVoice: intent.guidedVoice,
    };
    s.flow = buildNetworkFlow(
      s.setup.gameMode ?? "spotlight",
      s.players.map((p) => p.id),
      s.sessionId,
      s.setup.packId,
      intent.pace,
    );
    s.content = freshContent(
      captureContent(s.players.length, s.setup.packId, s.setup.hostLanguage),
      s.setup,
      s.sessionId,
      s.questionHistory,
    );
    s.players.forEach((p) => {
      p.ready = false;
    });
  } else if (intent.type === "ready" && step.type === "lobby") {
    if (
      s.flow.version >= 4 &&
      s.setup.spice === "spicy" &&
      intent.ready &&
      !actor.adultConfirmed
    )
      return { ...s, notice: "Confirm you are 18+ before getting ready." };
    s.players.find((p) => p.id === actorId)!.ready = intent.ready;
  } else if (intent.type === "start" && step.type === "lobby" && actor.host) {
    if (!s.players.every((p) => p.ready && p.connected))
      return {
        ...s,
        notice: "Everyone needs to be ready before the host starts.",
      };
    advance(s, now, actorId);
  } else if (intent.type === "restart" && step.type === "summary") {
    const reset = initialState(s.flow, s.rules, s.setup);
    const sessionId = `${s.sessionId}-rematch-${s.revision}`;
    if (s.setup.pace)
      reset.content = freshContent(
        captureContent(s.players.length, s.setup.packId, s.setup.hostLanguage),
        s.setup,
        sessionId,
        s.questionHistory,
      );
    return {
      ...reset,
      sessionId,
      questionHistory: s.questionHistory,
      revision: s.revision,
    };
  } else if (intent.type === "traits" && step.type === "traits" && pending) {
    if (s.network)
      (s.ratingsByPlayer ??= {})[actorId] = {
        self: intent.self,
        friend: intent.friend,
        friendId: friendTarget(s, actorId),
      };
    else if (actorId === s.players[0].id) {
      s.self = intent.self;
      s.friend = intent.friend;
      s.callout = findCallout(
        s.self,
        [8, 7, 9],
        pack.traits.map((t) => t.right),
        s.rules.calloutThreshold,
      );
    }
    completeAction(s, actorId, now);
  } else if (
    intent.type === "nominate" &&
    step.type === "nomination" &&
    pending &&
    validPlayer(intent.playerId)
  ) {
    s.nominations[`${step.id}:${actorId}`] = intent.playerId;
    if (actorId === s.players[0].id) s.nominations[step.id] = intent.playerId;
    completeAction(s, actorId, now);
  } else if (
    intent.type === "submit" &&
    pending &&
    [
      "secret",
      "guess",
      "answer",
      "callout",
      "catchphrase",
      "wildcard",
    ].includes(step.type)
  ) {
    if (["secret", "guess"].includes(step.type) && intent.text.length > 80)
      return { ...s, notice: "Keep this answer within 80 characters." };
    if (step.type === "secret") {
      spot.secret = intent.text;
      spot.standIn = actor.controller === "ai";
    } else if (step.type === "guess") {
      spot.submissions[actorId] = intent.text;
      spot.controllers[actorId] = actor.controller;
    } else if (step.type === "answer")
      s.rounds[n].answers.push({
        id:
          s.optionIds?.[`${n}:${actorId}`] ??
          `r${n}-o${hash(`${actorId}:${n}`).toString(36)}`,
        text: intent.text,
        authorId: actorId,
        isTruth: actorId === s.rounds[n].targetId,
        isAI: false,
      });
    else if (step.type === "callout") s.defenses[actorId] = intent.text;
    else s.catchphrases[actorId] = intent.text;
    completeAction(s, actorId, now);
  } else if (intent.type === "vote" && step.type === "judge" && pending) {
    if (!spotlightOptions(spot, n).some((o) => o.id === intent.optionId))
      return invalid();
    spot.selected = intent.optionId;
    spot.standIn ||= actor.controller === "ai";
    completeAction(s, actorId, now);
  } else if (intent.type === "vote" && step.type === "vote" && pending) {
    const option = s.rounds[n].answers.find((a) => a.id === intent.optionId);
    if (!option || option.authorId === actorId)
      return { ...s, notice: copy.unavailableVote };
    s.rounds[n].votes[actorId] = option.id;
    completeAction(s, actorId, now);
  } else if (
    intent.type === "predict" &&
    step.type === "sync" &&
    pending &&
    validPlayer(intent.playerId)
  ) {
    s.prediction[actorId] = intent.playerId;
    completeAction(s, actorId, now);
  } else if (
    ["approve", "reject"].includes(intent.type) &&
    step.type === "card" &&
    actor.controller !== "ai" &&
    actor.connected
  ) {
    if (intent.type === "approve" && !s.approved.includes(actorId))
      s.approved.push(actorId);
    if (s.network) {
      (s.cardDecisions ??= {})[actorId] = intent.type as "approve" | "reject";
      if (
        s.players
          .filter((p) => p.controller === "human" && p.connected)
          .every((p) => s.cardDecisions?.[p.id])
      )
        advance(s, now, actorId);
    } else advance(s, now, actorId);
  } else if (
    intent.type === "veto" &&
    pending &&
    [
      "secret",
      "guess",
      "answer",
      "catchphrase",
      "nomination",
      "callout",
      "wildcard",
      "sync",
    ].includes(step.type)
  ) {
    const key =
      spot && ["secret", "guess"].includes(step.type)
        ? `question-${n}`
        : step.id;
    if (s.vetoes.includes(key)) {
      if (spot && ["secret", "guess"].includes(step.type)) {
        spot.skipped = true;
        spot.submissions = {};
        spot.secret = null;
        s.stepIndex = s.flow.steps.findIndex(
          (x) => x.type === "spotlight-reveal" && x.params.round === n,
        );
        prepare(s, now, actorId);
      } else {
        if (step.type === "answer") {
          s.rounds[n].votes = {};
          s.rounds[n].skipped = true;
        }
        advance(s, now, actorId);
      }
      s.notice = copy.skippedQuestion;
    } else {
      s.vetoes.push(key);
      if (spot && ["secret", "guess"].includes(step.type)) {
        const unseen =
          s.flow.version >= 4 && spot.questions
            ? nextQuestionIndex(s, spot.questions, spot.questionIndex + 1)
            : -1;
        spot.questionIndex =
          unseen >= 0
            ? unseen
            : (spot.questionIndex + 1) % (spot.questions?.length ?? 6);
        spot.secret = null;
        spot.submissions = {};
        spot.controllers = {};
        spot.selected = null;
        spot.standIn = false;
        for (const x of s.flow.steps.filter((x) => x.params.round === n)) {
          delete s.completed[x.id];
          delete s.controllers[x.id];
        }
        s.stepIndex = s.flow.steps.findIndex((x) => x.params.round === n);
      } else {
        delete s.completed[step.id];
        delete s.controllers[step.id];
        if (step.type === "answer") {
          s.rounds[n].answers = [];
          const replacements =
            pack.replacementRoundPrompts ?? pack.replacementScenarios;
          const deck = s.content?.bluff;
          const replacement = deck?.[nextQuestionIndex(s, deck, n + 1)];
          if (replacement) s.rounds[n].questionId = replacement.id;
          s.rounds[n].prompt = (
            replacement?.prompt ?? replacements[n % replacements.length]
          ).replaceAll(
            "{name}",
            s.players.find((p) => p.id === s.rounds[n].targetId)!.name,
          );
        }
        if (step.type === "sync") s.prediction = {};
      }
      prepare(s, now, actorId);
      s.notice = copy.replacedQuestion;
    }
  } else if (intent.type === "skip" && pending) {
    if (step.type === "secret") spot.skipped = true;
    completeAction(s, actorId, now);
  } else if (
    (intent.type === "next" || intent.type === "skip") &&
    ((step.type === "callout" && s.hostFlowVersion === 2) ||
      ["waiting", "reveal", "spotlight-reveal", "story", "verdict"].includes(
        step.type,
      ) ||
      (step.type === "sync" && s.predictionRevealed))
  ) {
    advance(s, now, actorId);
  } else if (
    intent.type === "skip" &&
    step.type === "card" &&
    actor.controller !== "ai"
  ) {
    if (s.network) {
      (s.cardDecisions ??= {})[actorId] = "reject";
      if (
        s.players
          .filter((p) => p.controller === "human" && p.connected)
          .every((p) => s.cardDecisions?.[p.id])
      )
        advance(s, now, actorId);
    } else advance(s, now, actorId);
  } else return invalid();
  return s;
}

export function setPresence(
  previous: EngineState,
  id: string,
  connected: boolean,
  now: number,
): EngineState {
  const s = structuredClone(previous);
  const p = s.players.find((p) => p.id === id);
  if (!p || p.connected === connected) return previous;
  p.connected = connected;
  if (!connected) p.disconnectedAt = now;
  else {
    const n = activeStep(s).params.round;
    const acted =
      n !== undefined &&
      s.flow.steps.some(
        (step) =>
          step.params.round === n && s.controllers[step.id]?.[id] === "ai",
      );
    p.returnAfterRound = acted ? n! : null;
    if (!acted)
      p.controller = s.network || id === "you" ? "human" : "simulated";
    p.disconnectedAt = null;
  }
  s.revision++;
  return s;
}

/** Seeded bot decisions consume prompts/public choices, never another seat's private answer. */
function simulatedAction(
  s: EngineState,
  id: string,
): import("./contracts").IntentAction {
  const pack = contentFor(s.content);
  const step = activeStep(s);
  const n = step.params.round ?? 0;
  const seed = hash(`${id}:${step.id}:${s.vetoes.length}`);
  if (step.type === "lobby") return { type: "start" };
  if (["secret", "guess"].includes(step.type)) {
    const q = spotlightQuestion(s.spotlights[n]);
    const options =
      s.spotlights[n].kind === "favourite" && q.samples.length > 1
        ? q.samples.slice(0, -1)
        : q.samples;
    return { type: "submit", text: options[seed % options.length] };
  }
  if (step.type === "judge") {
    const options = spotlightOptions(s.spotlights[n], n);
    return options.length
      ? { type: "vote", optionId: options[seed % options.length].id }
      : { type: "skip" };
  }
  if (step.type === "vote") {
    const options = s.rounds[n].answers.filter((o) => o.authorId !== id);
    return options.length
      ? { type: "vote", optionId: options[seed % options.length].id }
      : { type: "skip" };
  }
  if (step.type === "traits")
    return { type: "traits", self: [6, 7, 8], friend: [8, 7, 9] };
  if (step.type === "nomination")
    return {
      type: "nominate",
      playerId: s.players[seed % s.players.length].id,
    };
  if (step.type === "sync")
    return { type: "predict", playerId: s.players[seed % s.players.length].id };
  if (step.type === "answer") {
    const lines = [
      ...pack.lines[s.setup.spice].slice(0, 4),
      ...(s.flow.version >= 4
        ? [pack.alternateDecoy, pack.catchphraseSample]
        : [
            "Bas charger mil jaaye, phir ready.",
            "Chappal mein chalte hain. Full confidence.",
          ]),
    ];
    return {
      type: "submit",
      text: lines[s.players.findIndex((p) => p.id === id) % lines.length],
    };
  }
  return { type: "submit", text: s.catchphrases[id] ?? pack.catchphraseSample };
}

/** Replays scheduled events in time order, including time spent outside the app. */
export function simulateUntil(
  previous: EngineState,
  now: number,
  viewerId = "you",
): EngineState {
  if (previous.flow.version === 1) return timeout(previous, now, viewerId);
  let s = previous;
  for (let safety = 0; safety < 1500; safety++) {
    if (
      s.narration &&
      s.narration.epoch === s.phaseEpoch &&
      s.narration.status !== "done"
    )
      break;
    const step = activeStep(s);
    const takeover = s.players
      .filter((p) => !p.connected && p.controller !== "ai")
      .map((p) => ({
        id: p.id,
        at: Math.min(p.disconnectedAt! + 15000, s.deadline ?? Infinity),
        kind: "takeover" as const,
      }));
    const bots = requiredActors(s)
      .filter((id) => !s.completed[step.id]?.includes(id))
      .flatMap((id) => {
        const p = s.players.find((p) => p.id === id)!;
        if (
          p.controller !== "ai" &&
          (!p.connected || p.controller === "human" || p.id === viewerId)
        )
          return [];
        return [
          {
            id,
            at: Math.max(
              s.startedAt + 1100 + (hash(`${step.id}:${id}`) % 1700),
              p.disconnectedAt === null
                ? 0
                : Math.min(p.disconnectedAt + 15000, s.deadline ?? Infinity),
            ),
            kind: "bot" as const,
          },
        ];
      });
    if (
      step.type === "lobby" &&
      s.players.every((p) => p.ready && p.connected)
    ) {
      const host = s.players.find(
        (p) => p.host && p.controller !== "human" && p.id !== viewerId,
      );
      if (host)
        bots.push({
          id: host.id,
          at: Math.max(s.startedAt + 1100, now),
          kind: "bot",
        });
    }
    const events = [
      ...takeover,
      ...bots,
      ...(s.deadline !== null
        ? [{ id: viewerId, at: s.deadline, kind: "timeout" as const }]
        : []),
    ].sort(
      (a, b) =>
        a.at - b.at ||
        (a.kind === "takeover" ? -1 : b.kind === "timeout" ? -1 : 1),
    );
    const event = events[0];
    if (!event || event.at > now) break;
    if (event.kind === "takeover") {
      s = structuredClone(s);
      const p = s.players.find((p) => p.id === event.id)!;
      p.controller = "ai";
      if (p.host) {
        const successor =
          s.players.find((p) => p.connected && p.controller === "human") ??
          s.players.find((p) => p.connected);
        if (successor) {
          p.host = false;
          successor.host = true;
        }
      }
      s.revision++;
    } else if (event.kind === "bot") {
      const next = reduceCompetitive(
        s,
        {
          ...simulatedAction(s, event.id),
          cid: `bot:${s.phaseEpoch}:${step.id}:${event.id}`,
          stepId: step.id,
          phaseEpoch: s.phaseEpoch,
        },
        event.at,
        event.id,
      );
      if (next === s || next.notice) break;
      s = next;
    } else s = timeout(s, event.at, viewerId);
  }
  return s;
}

/** Developer fixtures use the same validated actions and scoring as a running match. */
export function finishPhase(
  previous: EngineState,
  now: number,
  viewerId = "you",
) {
  let s = structuredClone(previous);
  const step = activeStep(s);
  if (step.type === "lobby")
    s.players.forEach((p) => {
      p.ready = true;
    });
  for (const id of requiredActors(s)) {
    if (activeStep(s).id !== step.id) break;
    if (!s.completed[step.id]?.includes(id))
      s = reduceIntent(
        s,
        {
          ...simulatedAction(s, id),
          cid: `fixture:${s.phaseEpoch}:${id}`,
          stepId: step.id,
        },
        now,
        id,
      );
  }
  if (activeStep(s).id === step.id)
    s = reduceIntent(
      s,
      {
        type: step.type === "lobby" ? "start" : "skip",
        cid: `fixture:end:${s.phaseEpoch}`,
        stepId: step.id,
      },
      now,
      viewerId,
    );
  return s;
}

export function friendCard(s: EngineState, viewerId: string): FriendCard {
  const pack = contentFor(s.content);
  const p = s.players.find((p) => p.id === viewerId)!;
  const values = s.network
    ? (s.ratingsByPlayer?.[viewerId]?.self ?? [5, 5, 5])
    : viewerId === s.players[0].id
      ? s.self
      : viewerId === s.players[1].id
        ? s.friend
        : [6, 8, 7];
  return {
    subjectId: p.id,
    name: p.name,
    title: values[2] >= 5 ? pack.cardTitles.late : pack.cardTitles.planner,
    quote: s.catchphrases[p.id] ?? pack.catchphraseSample,
    traits: pack.traits.map((t, i) => ({
      label: t.right,
      value: values[i] * 10,
    })),
    caseId: `GX / ${s.roomCode} / 004`,
    avatar: p.avatar,
    color: p.color,
  };
}

/** Only this projection crosses into renderers. No private answer metadata before reveal. */
export function project(
  s: EngineState,
  viewerId = "you",
  paused = false,
  interrupted = false,
): GameSnapshot {
  const pack = contentFor(s.content);
  const step = activeStep(s);
  const n = step.params.round ?? 0;
  const round = s.rounds[n];
  const vetoed = s.vetoes.includes(step.id);
  let phase: PhaseView;
  switch (step.type) {
    case "secret":
    case "guess":
    case "judge": {
      const r = s.spotlights[n];
      const q = spotlightQuestion(r);
      phase = {
        type: step.type,
        round: n,
        targetId: r.targetId,
        kind: r.kind,
        prompt: q.prompt.replace(
          "{name}",
          s.players.find((p) => p.id === r.targetId)!.name,
        ),
        sample: q.samples[0],
        standIn: r.standIn,
        options:
          step.type === "judge"
            ? spotlightOptions(r, n).map(({ id, text }) => ({ id, text }))
            : [],
      };
      break;
    }
    case "spotlight-reveal": {
      const r = s.spotlights[n];
      const options = spotlightOptions(r, n);
      const q = spotlightQuestion(r);
      const events = s.scores.filter((e) => e.round === n);
      phase = {
        type: "spotlight-reveal",
        round: n,
        targetId: r.targetId,
        kind: r.kind,
        prompt: q.prompt.replace(
          "{name}",
          s.players.find((p) => p.id === r.targetId)!.name,
        ),
        answer: r.skipped
          ? null
          : r.kind === "fact"
            ? r.secret
            : (options.find((o) => o.id === r.selected)?.text ?? null),
        options: options.map((o) => ({
          ...o,
          selected:
            r.kind === "favourite"
              ? o.id === r.selected
              : o.authors.some((id) => events.some((e) => e.playerId === id)),
        })),
        scoreEvents: events,
        standIn: r.standIn,
      };
      break;
    }
    case "lobby":
      phase = { type: "lobby" };
      break;
    case "traits":
      phase = {
        type: "traits",
        traits: pack.traits,
        friendId: s.network
          ? friendTarget(s, viewerId)
          : s.players.find((p) => p.id !== viewerId)!.id,
      };
      break;
    case "nomination":
      phase = {
        type: "nomination",
        question: vetoed
          ? pack.replacementNomination
          : pack.nominations[step.params.index ?? 0],
        selected:
          s.nominations[`${step.id}:${viewerId}`] ??
          s.nominations[step.id] ??
          null,
      };
      break;
    case "callout":
      phase = {
        type: "callout",
        callout: s.callout ?? {
          trait: pack.traits[2].right,
          self: 3,
          peers: 9,
          gap: 6,
        },
        line: vetoed
          ? pack.replacementCallout
          : pack.calloutLines[s.setup.spice],
      };
      break;
    case "catchphrase":
      phase = {
        type: "catchphrase",
        prompt: vetoed ? pack.replacementCatchphrase : pack.catchphrase,
        sample: pack.catchphraseSample,
      };
      break;
    case "answer":
      phase = {
        type: "answer",
        round: n,
        targetId: round.targetId,
        prompt: round.prompt,
        sample:
          s.content?.bluff?.find((q) => q.id === round.questionId)
            ?.samples[0] ?? pack.lines[s.setup.spice][0],
        isTarget: round.targetId === viewerId,
      };
      break;
    case "waiting":
      phase = { type: "waiting", round: n, targetId: round.targetId };
      break;
    case "vote":
      phase = {
        type: "vote",
        round: n,
        targetId: round.targetId,
        prompt: round.prompt,
        options: round.answers.map((a) => ({
          id: a.id,
          text: a.text,
          isOwn: a.authorId === viewerId,
        })),
        selected: round.votes[viewerId] ?? null,
        canVote:
          viewerId !== round.targetId &&
          !round.votes[viewerId] &&
          !s.completed[step.id]?.includes(viewerId),
      };
      break;
    case "reveal":
      phase = {
        type: "reveal",
        round: n,
        targetId: round.targetId,
        options: round.answers.map((a) => ({
          id: a.id,
          text: a.text,
          isOwn: a.authorId === viewerId,
          authorId: a.authorId,
          authorName:
            s.players.find((p) => p.id === a.authorId)?.name ?? copy.aiDecoy,
          isTruth: a.isTruth,
          isAI: a.isAI,
          voters: Object.entries(round.votes)
            .filter(([, id]) => id === a.id)
            .map(([id]) => id),
        })),
        scoreEvents: s.scores.filter((e) => e.round === n),
      };
      break;
    case "wildcard":
      phase = {
        type: "wildcard",
        prompt: vetoed ? pack.replacementWildcard : pack.wildcard,
        sample: pack.wildcardSample,
      };
      break;
    case "sync":
      phase = {
        type: "sync",
        question: vetoed ? pack.replacementNomination : pack.syncQuestion,
        selected: s.prediction[viewerId] ?? null,
        results: s.predictionRevealed
          ? s.players.map((p) => ({
              playerId: p.id,
              count: Object.values(s.prediction).filter((id) => id === p.id)
                .length,
            }))
          : null,
      };
      break;
    case "story": {
      const hero = s.players.find(
        (p) => p.id === (s.nominations["nominate-1"] ?? "manoj"),
      )!;
      phase = {
        type: "story",
        ...pack.story(
          hero.name,
          s.players[0].name,
          s.catchphrases.you,
          s.players.map((p) => p.name),
        ),
      };
      break;
    }
    case "verdict":
      phase = {
        type: "verdict",
        winners: winners(s.players),
        totalBluffs: s.scores.filter((e) => e.rule === "bamboozle").length,
      };
      break;
    case "card":
      phase = {
        type: "card",
        card: friendCard(s, viewerId),
        approved: s.approved.includes(viewerId),
      };
      break;
    case "summary":
      phase = {
        type: "summary",
        card: friendCard(s, viewerId),
        approved: s.approved.includes(viewerId),
        scores: [...s.players]
          .sort((a, b) => b.score - a.score)
          .map((p) => ({ name: p.name, score: p.score })),
      };
      break;
  }
  return {
    protocol_version: 2,
    sessionId: s.sessionId,
    phaseEpoch: s.phaseEpoch,
    roundCount: s.flow.steps.filter(
      (step) => step.type === "reveal" || step.type === "spotlight-reveal",
    ).length,
    durationMinutes: Math.ceil(
      s.flow.steps.reduce((sum, step) => sum + step.durationMs, 0) / 60000,
    ),
    revision: s.revision,
    roomCode: s.roomCode,
    flowId: s.flow.id,
    scoring: {
      mindReader: s.rules.mindReader,
      bamboozle: s.rules.bamboozle,
      aiDecoy: s.rules.aiDecoy,
      factMatch: s.rules.factMatch,
      favourite: s.rules.favourite,
    },
    step,
    stepIndex: s.stepIndex,
    stepCount: s.flow.steps.length,
    deadline: s.deadline,
    paused,
    interrupted,
    players: s.players.map((p) => ({ ...p })),
    setup: { ...s.setup },
    view: {
      viewerId,
      phase,
      actionPending:
        requiredActors(s).includes(viewerId) &&
        !s.completed[step.id]?.includes(viewerId) &&
        s.players.find((p) => p.id === viewerId)?.controller !== "ai" &&
        Boolean(s.players.find((p) => p.id === viewerId)?.connected),
      submitted: s.completed[step.id]?.includes(viewerId) ?? false,
      completed: (s.completed[step.id] ?? []).filter((id) =>
        requiredActors(s).includes(id),
      ).length,
      required: requiredActors(s).length,
    },
    notice: s.notice,
  };
}
