import { describe, it, expect } from "vitest";
import { buildFlow, classicRules } from "@expose/shared/game/definitions";
import {
  activeStep,
  initialState,
  reduceIntent,
  project,
  finishPhase,
  simulateUntil,
  setPresence,
  type EngineState,
} from "@expose/shared/game/engine";
import type { IntentAction } from "@expose/shared/game/contracts";
import {
  normalizeAnswer,
  spotlightOptions,
  spotlightQuestion,
  scoreSpotlight,
} from "@expose/shared/game/spotlight";
import { parseCheckpoint, SESSION_TTL } from "../src/session/checkpoint";
let serial = 0;
const act = (s: EngineState, action: IntentAction, who = "you", now = 1000) =>
  reduceIntent(
    s,
    {
      ...action,
      cid: `test:${++serial}`,
      stepId: activeStep(s).id,
      phaseEpoch: s.phaseEpoch,
    },
    now,
    who,
  );
function reach(
  step: string,
  count = 3,
  mode: "spotlight" | "bluff" = "spotlight",
) {
  let s = initialState(buildFlow(mode, count));
  for (let i = 0; i < 100 && activeStep(s).id !== step; i++)
    s = finishPhase(s, 1000);
  expect(activeStep(s).id).toBe(step);
  return s;
}
describe("roster-driven competitive play", () => {
  for (const mode of ["bluff", "spotlight"] as const)
    for (const count of [2, 3, 4, 5, 6, 7])
      it(`${mode}: ${count} seats finish with equal turns`, () => {
        let s = initialState(buildFlow(mode, count));
        expect(s.players).toHaveLength(count);
        const reveal = s.flow.steps.filter((step) =>
          ["reveal", "spotlight-reveal"].includes(step.type),
        );
        for (const p of s.players)
          expect(
            reveal.filter((step) => step.params.targetId === p.id),
          ).toHaveLength(mode === "bluff" ? 1 : 2);
        for (let i = 0; i < 100 && activeStep(s).type !== "summary"; i++)
          s = finishPhase(s, 1000);
        expect(activeStep(s).type).toBe("summary");
        expect(s.approved).toEqual([]);
        expect(s.scores.reduce((sum, e) => sum + e.points, 0)).toBe(
          s.players.reduce((sum, p) => sum + p.score, 0),
        );
      });
  it("locks a factual secret, waits for all guesses, and awards every normalized match", () => {
    let s = reach("secret-0");
    const target = s.spotlights[0].targetId;
    s = act(s, { type: "submit", text: "Blue" }, target);
    expect(activeStep(s).id).toBe("guess-0");
    expect(JSON.stringify(project(s))).not.toContain('"secret"');
    const others = s.players.filter((p) => p.id !== target);
    s = act(s, { type: "submit", text: "  BLUE. " }, others[0].id);
    expect(activeStep(s).id).toBe("guess-0");
    expect(project(s, others[0].id).view.actionPending).toBe(false);
    s = act(s, { type: "submit", text: "neela" }, others[1].id);
    expect(s.scores.map((e) => e.points)).toEqual([100, 100]);
    const previous = s;
    s = act(s, { type: "submit", text: "red" }, others[1].id);
    expect(s.scores).toEqual(previous.scores);
    expect(
      normalizeAnswer("  BLUE. ", spotlightQuestion(s.spotlights[0])),
    ).toBe("blue");
  });
  it("groups duplicate favourite answers and never lets matching AI bait steal their reward", () => {
    let s = reach("guess-1");
    const round = s.spotlights[1];
    const others = s.players.filter((p) => p.id !== round.targetId);
    const bait = spotlightQuestion(round).samples.at(-1)!;
    for (const p of others) s = act(s, { type: "submit", text: bait }, p.id);
    expect(activeStep(s).id).toBe("judge-1");
    const options = spotlightOptions(s.spotlights[1], 1);
    expect(options).toHaveLength(1);
    const view = project(s, round.targetId).view.phase;
    expect(view.type).toBe("judge");
    if (view.type === "judge")
      expect(Object.keys(view.options[0]).sort()).toEqual(["id", "text"]);
    s = act(s, { type: "vote", optionId: options[0].id }, round.targetId);
    expect(s.scores.filter((e) => e.round === 1).map((e) => e.points)).toEqual([
      100, 100,
    ]);
    const aiOnly = structuredClone(s.spotlights[1]);
    aiOnly.submissions = {};
    aiOnly.selected = spotlightOptions(aiOnly, 1)[0].id;
    expect(scoreSpotlight(aiOnly, 1, classicRules)).toEqual([]);
  });
  it("veto clears old answers, rejects stale actions, and second veto skips without points", () => {
    let s = reach("secret-0");
    const target = s.spotlights[0].targetId;
    s = act(s, { type: "submit", text: "Blue" }, target);
    const guessers = s.players.filter((p) => p.id !== target);
    const old = {
      type: "submit" as const,
      text: "Blue",
      cid: "late",
      stepId: "guess-0",
      phaseEpoch: s.phaseEpoch,
    };
    s = act(s, { type: "submit", text: "Blue" }, guessers[0].id);
    s = act(s, { type: "veto" }, guessers[1].id);
    expect(activeStep(s).id).toBe("secret-0");
    expect(s.spotlights[0].submissions).toEqual({});
    expect(s.spotlights[0].secret).toBeNull();
    expect(reduceIntent(s, old, 1000, guessers[0].id)).toBe(s);
    s = act(s, { type: "veto" }, target);
    expect(activeStep(s).type).toBe("spotlight-reveal");
    expect(s.scores).toEqual([]);
  });
  it("keeps six Bluff choices with five seats and prohibits self/target voting", () => {
    const s = reach("vote-0", 5, "bluff");
    expect(s.rounds[0].answers).toHaveLength(6);
    const own = s.rounds[0].answers.find((o) => o.authorId === "you")!;
    const invalid = act(s, { type: "vote", optionId: own.id });
    expect(activeStep(invalid).id).toBe("vote-0");
    expect(invalid.scores).toEqual([]);
    expect(project(s, s.rounds[0].targetId).view.actionPending).toBe(false);
  });
  it("uses configurable Spotlight rewards", () => {
    const r = reach("secret-0").spotlights[0];
    r.secret = "Blue";
    r.submissions = { other: "blue" };
    expect(
      scoreSpotlight(r, 0, { factMatch: 225, favourite: 75 })[0].points,
    ).toBe(225);
  });
});
describe("absence and recovery", () => {
  it("skips an unanswered factual secret directly to an unscored reveal", () => {
    const s = reach("secret-0");
    const next = act(s, { type: "skip" }, s.spotlights[0].targetId);
    expect(activeStep(next).type).toBe("spotlight-reveal");
    expect(next.scores).toEqual([]);
  });
  it("preserves accepted answers and defers return until the next question when AI acted", () => {
    let s = reach("secret-0");
    const target = s.spotlights[0].targetId;
    s.players.forEach((p) => {
      p.controller = "human";
    });
    s = setPresence(s, target, false, 1000);
    s = simulateUntil(s, 9000, "you");
    expect(activeStep(s).id).toBe("guess-0");
    expect(s.spotlights[0].secret).not.toBeNull();
    expect(s.spotlights[0].standIn).toBe(true);
    const secret = s.spotlights[0].secret;
    s = setPresence(s, target, true, 9001);
    expect(s.players.find((p) => p.id === target)).toMatchObject({
      controller: "ai",
      returnAfterRound: 0,
    });
    s = finishPhase(s, 10000);
    s = finishPhase(s, 11000);
    expect(s.players.find((p) => p.id === target)?.controller).not.toBe("ai");
    expect(s.spotlights[0].secret).toBe(secret);
  });
  it("resumes immediately during grace and keeps AI-earned points with the seat", () => {
    let s = reach("guess-1");
    s = setPresence(s, "you", false, 1000);
    s = setPresence(s, "you", true, 1500);
    expect(s.players[0].controller).toBe("human");
    const r = s.spotlights[1];
    const author = s.players.find((p) => p.id !== r.targetId)!;
    r.submissions[author.id] = "Chai first";
    r.controllers[author.id] = "ai";
    for (const p of s.players.filter((p) => p.id !== r.targetId))
      s = act(s, { type: "skip" }, p.id);
    const option = spotlightOptions(s.spotlights[1], 1).find((o) =>
      o.authors.includes(author.id),
    )!;
    s = act(s, { type: "vote", optionId: option.id }, r.targetId);
    expect(s.players.find((p) => p.id === author.id)).toMatchObject({
      score: expect.any(Number),
      aiPoints: 100,
    });
  });
  it("catches up deterministically, transfers host, and never approves cards", () => {
    let s = reach("traits");
    s = setPresence(s, "you", false, 1000);
    const restored = simulateUntil(s, 600000);
    expect(activeStep(restored).type).toBe("card");
    expect(restored.players[0].host).toBe(false);
    expect(restored.approved).toEqual([]);
    expect(simulateUntil(restored, 600001).scores).toEqual(restored.scores);
    expect(simulateUntil(s, 600000)).toEqual(restored);
  });
  it("validates checkpoints and rejects expired/corrupt state", () => {
    const state = reach("guess-0");
    const checkpoint = {
      version: 2,
      createdAt: 1000,
      savedAt: 1000,
      seatId: "you",
      seatToken: "opaque-seat-identity",
      state,
    };
    expect(parseCheckpoint(JSON.stringify(checkpoint), 2000).state).toEqual(
      state,
    );
    expect(() =>
      parseCheckpoint(JSON.stringify(checkpoint), 1000 + SESSION_TTL),
    ).toThrow("expired");
    expect(() => parseCheckpoint("{oops", 2000)).toThrow();
    expect(() =>
      parseCheckpoint(
        JSON.stringify({ ...checkpoint, state: { ...state, stepIndex: 999 } }),
        2000,
      ),
    ).toThrow();
    expect(JSON.stringify(checkpoint)).not.toMatch(/blob:|audio\/webm/);
  });
});
