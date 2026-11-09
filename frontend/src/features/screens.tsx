"use client";
import type { ComponentType } from "react";
import type { StepType } from "@expose/shared/game/contracts";
import type { ScreenProps } from "./screens/shared";
import { Lobby } from "./screens/lobby";
import { Traits, Nomination, Callout } from "./screens/act-one";
import {
  Catchphrase,
  Answer,
  Waiting,
  Vote,
  Reveal,
  Wildcard,
} from "./screens/act-two";
import { Sync, Story, Verdict, Card, Summary } from "./screens/act-three";
import { Spotlight, SpotlightReveal } from "./screens/spotlight";
export type { ScreenProps } from "./screens/shared";
export const rendererRegistry = {
  secret: Spotlight,
  guess: Spotlight,
  judge: Spotlight,
  "spotlight-reveal": SpotlightReveal,
  lobby: Lobby,
  traits: Traits,
  nomination: Nomination,
  callout: Callout,
  catchphrase: Catchphrase,
  answer: Answer,
  waiting: Waiting,
  vote: Vote,
  reveal: Reveal,
  wildcard: Wildcard,
  sync: Sync,
  story: Story,
  verdict: Verdict,
  card: Card,
  summary: Summary,
} satisfies Record<StepType, ComponentType<ScreenProps>>;
