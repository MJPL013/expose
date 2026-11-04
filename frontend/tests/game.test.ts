import { describe, expect, it } from "vitest";
import {
  stepTypes,
  type Intent,
  type IntentAction,
} from "@expose/shared/game/contracts";
import {
  classicFlow,
  classicRules,
  remixFlow,
  validateFlow,
} from "@expose/shared/game/definitions";
import {
  activeStep,
  initialState,
  project,
  reduceIntent,
  timeout,
  type EngineState,
} from "@expose/shared/game/engine";
import {
  findCallout,
  scoreRound,
  winners,
  type Round,
} from "@expose/shared/game/logic";
import { MockSession } from "../src/session/mock-session";

let cid = 0;
function act(s: EngineState, action: IntentAction, who = "you", now = 1000) {
  return reduceIntent(
    s,
    { ...action, cid: `test-${++cid}`, stepId: activeStep(s).id },
    now,
    who,
  );
}
function toStep(id: string, initial = initialState()) {
  let state = initial;
  if (activeStep(state).type === "lobby" && id !== "lobby")
    state = act(state, { type: "ready", ready: true });
  for (let i = 0; i < 40 && activeStep(state).id !== id; i++)
    state = act(state, {
      type: activeStep(state).type === "lobby" ? "start" : "skip",
    });
  expect(activeStep(state).id).toBe(id);
  return state;
}

describe("configurable flow", () => {
  it("validates both variants and supports reordering independent blocks", () => {
    const registry = new Set(stepTypes);
    expect(
      validateFlow(remixFlow, registry).steps.some(
        (s) => s.type === "wildcard",
      ),
    ).toBe(true);
    expect(
      validateFlow(classicFlow, registry).steps.some(
        (s) => s.type === "wildcard",
      ),
    ).toBe(false);
    const flow = structuredClone(classicFlow);
    [flow.steps[2], flow.steps[3]] = [flow.steps[3], flow.steps[2]];
    expect(validateFlow(flow, registry).steps[2].id).toBe("nominate-2");
  });
  it("rejects missing prerequisites, duplicate IDs, and missing renderers", () => {
    expect(() =>
      validateFlow(
        {
          ...classicFlow,
          steps: classicFlow.steps.filter((s) => s.id !== "answer-0"),
        },
        new Set(stepTypes),
      ),
    ).toThrow("requires answer:0");
    expect(() =>
      validateFlow(
        { ...classicFlow, steps: [...classicFlow.steps, classicFlow.steps[0]] },
        new Set(stepTypes),
      ),
    ).toThrow("Duplicate");
    expect(() => validateFlow(classicFlow, new Set(["lobby"]))).toThrow(
      "Missing renderer",
    );
  });
  it("finishes a whole session through timeout and skip fallbacks", () => {
    let state = act(act(initialState(), { type: "ready", ready: true }), {
      type: "start",
    });
    let steps = 0;
    while (activeStep(state).type !== "summary" && steps++ < 35) {
      state =
        state.deadline !== null
          ? timeout(state, state.deadline + 1)
          : act(state, { type: "skip" });
    }
    expect(activeStep(state).type).toBe("summary");
    expect(state.rounds[0].scored).toBe(true);
    expect(state.rounds[1].scored).toBe(true);
    expect(state.approved).toEqual([]);
  });
  it("skips the callout when ratings agree, and caps interruptions", () => {
    let state = act(act(initialState(), { type: "ready", ready: true }), {
      type: "start",
    });
    state = act(state, { type: "traits", self: [8, 7, 9], friend: [4, 4, 4] });
    state = act(state, { type: "skip" });
    state = act(state, { type: "skip" });
    expect(activeStep(state).type).toBe("catchphrase");
    expect(findCallout([8, 7, 9], [8, 7, 9], ["a", "b", "c"], 1.5)).toBeNull();
    const triggered = toStep("callout");
    expect(triggered.callouts).toBe(1);
  });
});

describe("bluff privacy and scoring", () => {
  it("projects anonymous options without revealing authors, truth, or AI labels", () => {
    const state = toStep("vote-0");
    const view = project(state).view.phase;
    expect(view.type).toBe("vote");
    if (view.type !== "vote") return;
    expect(view.options).toHaveLength(5);
    for (const option of view.options)
      expect(Object.keys(option).sort()).toEqual(["id", "isOwn", "text"]);
    expect(JSON.stringify(project(state))).not.toContain('"isTruth"');
    expect(JSON.stringify(project(state))).not.toContain('"isAI"');
    expect(JSON.stringify(project(state))).not.toContain('"authorId"');
    expect(state.rounds[0].answers.filter((a) => a.isTruth)).toHaveLength(1);
    expect(state.rounds[0].answers.filter((a) => a.isAI)).toHaveLength(1);
  });
  it("rejects self-votes and votes by the target", () => {
    const state = toStep("vote-0");
    const own = state.rounds[0].answers.find((a) => a.authorId === "you")!;
    expect(
      activeStep(act(state, { type: "vote", optionId: own.id })).type,
    ).toBe("vote");
    const valid = state.rounds[0].answers.find((a) => a.authorId !== "manoj")!;
    expect(
      activeStep(act(state, { type: "vote", optionId: valid.id }, "manoj"))
        .type,
    ).toBe("vote");
    expect(project(toStep("vote-1")).view.phase).toMatchObject({
      type: "vote",
      canVote: false,
      targetId: "you",
    });
  });
  it("deduplicates clicks and ignores stale step intents", () => {
    const state = toStep("vote-0");
    const truth = state.rounds[0].answers.find((a) => a.isTruth)!;
    const intent: Intent = {
      type: "vote",
      optionId: truth.id,
      cid: "same-click",
      stepId: activeStep(state).id,
    };
    const next = reduceIntent(state, intent, 1000);
    expect(activeStep(next).type).toBe("reveal");
    expect(reduceIntent(next, intent, 1001)).toBe(next);
    expect(reduceIntent(next, { ...intent, cid: "late-click" }, 1002)).toBe(
      next,
    );
    expect(next.players[0].score).toBeGreaterThanOrEqual(100);
  });
  it("changes points through the ruleset and shares tied ranks", () => {
    const round: Round = {
      targetId: "manoj",
      scored: false,
      prompt: "prompt",
      answers: [
        {
          id: "real",
          authorId: "manoj",
          isTruth: true,
          isAI: false,
          text: "A",
        },
        {
          id: "bluff",
          authorId: "you",
          isTruth: false,
          isAI: false,
          text: "B",
        },
        { id: "ai", authorId: null, isTruth: false, isAI: true, text: "C" },
      ],
      votes: { you: "real", ananya: "bluff", kabir: "ai", manoj: "real" },
    };
    expect(scoreRound(round, 0, classicRules).map((e) => e.points)).toEqual([
      100, 150, -50,
    ]);
    expect(
      scoreRound(round, 0, { ...classicRules, mindReader: 200 }).map(
        (e) => e.points,
      ),
    ).toEqual([200, 150, -50]);
    expect(winners(initialState().players)).toHaveLength(4);
  });
  it("keeps user answers in the reveal and avoids duplicate fixture options", () => {
    let state = toStep("answer-1");
    state = act(state, {
      type: "submit",
      text: "Bro, tension mat le. I know a shortcut.",
    });
    state = act(state, { type: "next" });
    expect(
      new Set(state.rounds[1].answers.map((a) => a.text.toLowerCase())).size,
    ).toBe(5);
    state = act(state, { type: "next" });
    const phase = project(state).view.phase;
    expect(phase.type).toBe("reveal");
    if (phase.type === "reveal")
      expect(phase.options.find((a) => a.isTruth)?.text).toBe(
        "Bro, tension mat le. I know a shortcut.",
      );
  });
  it("replaces a vetoed prompt, then allows it to be skipped", () => {
    let state = toStep("answer-0");
    const old = state.rounds[0].prompt;
    state = act(state, { type: "veto" });
    expect(state.rounds[0].prompt).not.toBe(old);
    state = act(state, { type: "veto" });
    expect(activeStep(state).type).toBe("waiting");
  });
});

describe("approval and local session adapter", () => {
  it("only the subject's approval unlocks their own artifacts", () => {
    const state = toStep("card");
    const approved = act(state, { type: "approve" });
    expect(project(approved).view.phase).toMatchObject({
      type: "summary",
      approved: true,
    });
    expect(project(approved, "manoj").view.phase).toMatchObject({
      type: "summary",
      approved: false,
    });
    expect(project(act(state, { type: "reject" })).view.phase).toMatchObject({
      approved: false,
    });
  });
  it("enforces host start and setup validation", () => {
    let lobby = initialState();
    expect(activeStep(act(lobby, { type: "start" })).type).toBe("lobby");
    lobby = act(lobby, { type: "ready", ready: true });
    lobby = act(lobby, { type: "ready", ready: false }, "kabir");
    expect(activeStep(act(lobby, { type: "start" })).type).toBe("lobby");
    lobby = act(lobby, { type: "ready", ready: true }, "kabir");
    expect(activeStep(act(lobby, { type: "start" })).type).toBe("traits");
    expect(
      activeStep(act(initialState(), { type: "start" }, "kabir")).type,
    ).toBe("lobby");
    expect(() =>
      initialState(classicFlow, classicRules, {
        name: "",
        spice: "mild",
        mode: "remote",
        adult: false,
      }),
    ).toThrow();
    expect(() =>
      initialState(classicFlow, classicRules, {
        name: "Tester",
        spice: "spicy",
        mode: "remote",
        adult: false,
      }),
    ).toThrow();
  });
  it("pauses deadlines during interruption and resumes without losing the phase", () => {
    let now = 1000;
    const session = new MockSession(classicFlow, classicRules, () => now);
    session.sendIntent({
      type: "ready",
      ready: true,
      cid: "ready",
      stepId: "lobby",
    });
    session.sendIntent({ type: "start", cid: "start", stepId: "lobby" });
    const deadline = session.getSnapshot().deadline!;
    session.setInterrupted(true);
    now += 90_000;
    session.tick();
    expect(session.getSnapshot().step.type).toBe("traits");
    session.setInterrupted(false);
    expect(session.getSnapshot().deadline).toBe(deadline + 90_000);
    now = session.getSnapshot().deadline! + 1;
    session.tick();
    expect(session.getSnapshot().step.type).toBe("nomination");
    session.dispose();
  });
  it("constructs all preview fixtures through valid transitions and resets deterministically", () => {
    const session = new MockSession(remixFlow);
    for (const step of remixFlow.steps) {
      session.jumpTo(step.id);
      expect(session.getSnapshot().step.id).toBe(step.id);
    }
    session.jumpTo("vote-0");
    const first = session.getSnapshot().view.phase;
    session.restart();
    session.jumpTo("vote-0");
    expect(session.getSnapshot().view.phase).toEqual(first);
    expect(() =>
      session.joinRoom("WRONG", {
        name: "You",
        spice: "mild",
        mode: "remote",
        adult: false,
      }),
    ).toThrow("DEMO42");
    session.dispose();
  });
});
