import { expect, it } from "vitest";
import { captureContent } from "@expose/shared/game/content-snapshot";
import {
  normalizeAnswer,
  scoreSpotlight,
  type SpotlightRound,
} from "@expose/shared/game/spotlight";
import {
  createNetworkState,
  reduceIntent,
  activeStep,
  requiredActors,
} from "@expose/shared/game/engine";
import { HostDecisionSchema } from "@expose/shared/game/host";
import { SetupSchema } from "@expose/shared/game/contracts";
import { initialState } from "@expose/shared/game/engine";

it("keeps stable question IDs and authored translations for every question in both packs", () => {
  for (const pack of ["hostel-2am", "goa-trip"] as const) {
    const en = captureContent(7, pack, "en"),
      hi = captureContent(7, pack, "hi"),
      hinglish = captureContent(7, pack, "hinglish");
    for (const kind of ["fact", "favourite"] as const) {
      expect(hi.spotlight[kind].map((q) => q.id)).toEqual(
        en.spotlight[kind].map((q) => q.id),
      );
      expect(hinglish.spotlight[kind].map((q) => q.id)).toEqual(
        en.spotlight[kind].map((q) => q.id),
      );
      for (const q of hi.spotlight[kind])
        expect(q.prompt).toMatch(/[\u0900-\u097f]/);
      for (const q of hinglish.spotlight[kind])
        expect(q.prompt).not.toBe(
          en.spotlight[kind].find((e) => e.id === q.id)!.prompt,
        );
    }
    expect(hi.data.nominations).toHaveLength(en.data.nominations.length);
    expect(hi.data.roundPrompts).toHaveLength(en.data.roundPrompts.length);
  }
});
it("scores equivalent Hindi, Telugu and English facts identically using scoped aliases", () => {
  const q = captureContent(3, "hostel-2am", "hi").spotlight.fact[0];
  expect(
    ["Blue", "नीला", "నీలం", "neela"].map((s) => normalizeAnswer(s, q)),
  ).toEqual(["blue", "blue", "blue", "blue"]);
  expect(normalizeAnswer("पानी", q)).toBe("पानी"); // Water isn't an alias for a colour.
  expect(normalizeAnswer("नीला।", q)).toBe("blue");
  expect(normalizeAnswer("Blue.", { ...q, id: undefined })).toBe("blue.");
  const round: SpotlightRound = {
    targetId: "a",
    kind: "fact",
    questionIndex: 0,
    questions: [q],
    secret: "नीला",
    submissions: { b: "నీలం", c: "Blue" },
    controllers: { a: "human", b: "human", c: "human" },
    selected: null,
    standIn: false,
    skipped: false,
    scored: false,
  };
  expect(
    scoreSpotlight(round, 0, { factMatch: 100, favourite: 100 }).map(
      (e) => e.playerId,
    ),
  ).toEqual(["b", "c"]);
});
it("rejects model scoring commands and incomplete host decisions", () => {
  expect(
    HostDecisionSchema.safeParse({
      decision: "speak",
      text: "Hello",
      evidenceIds: ["standings"],
      inviteSeat: null,
      memory: null,
      points: 100,
    }).success,
  ).toBe(false);
  expect(
    HostDecisionSchema.safeParse({ decision: "speak", text: "Hello" }).success,
  ).toBe(false);
});
it("v2 retains an Act 1 opportunity even when friends agree and requires no scripted defence", () => {
  const players = initialState()
    .players.slice(0, 2)
    .map((p) => ({ ...p, controller: "human" as const, ready: true }));
  let s = createNetworkState(
    players,
    SetupSchema.parse({
      name: "You",
      mode: "remote",
      spice: "mild",
      seatCount: 2,
      gameMode: "spotlight",
    }),
    "test-run",
    "ABC123",
  );
  s.hostFlowVersion = 2;
  for (
    let attempts = 0;
    attempts < 15 && activeStep(s).type !== "callout";
    attempts++
  ) {
    const step = activeStep(s);
    for (const seat of step.type === "lobby"
      ? [players[0].id]
      : requiredActors(s)) {
      const action =
        step.type === "lobby"
          ? { type: "start" as const }
          : step.type === "traits"
            ? { type: "traits" as const, self: [5, 5, 5], friend: [5, 5, 5] }
            : { type: "nominate" as const, playerId: players[0].id };
      s = reduceIntent(
        s,
        {
          ...action,
          cid: `${attempts}:${seat}`,
          stepId: step.id,
          phaseEpoch: s.phaseEpoch,
        },
        1000,
        seat,
      );
    }
  }
  expect(activeStep(s).type).toBe("callout");
  expect(requiredActors(s)).toEqual([]);
  expect(Object.values(s.nominations).length).toBeGreaterThanOrEqual(4);
});
