"use client";
import { uiCopy } from "../../content/ui.en";

import type { ReactNode } from "react";
import { ArrowRight, Check, Flag } from "lucide-react";
import type {
  GameSnapshot,
  IntentAction,
  PhaseView,
  Player,
} from "@expose/shared/game/contracts";
import type { LocalAudioService } from "../../media/local-audio";
import { Avatar, Button } from "../../ui/primitives";
import { ActionDock } from "../../ui/action-dock";
import { VoiceInput, type AudioFailure } from "../voice-input";
import styles from "../game.module.css";
export type ScreenProps = {
  snapshot: GameSnapshot;
  phase: PhaseView;
  send: (intent: IntentAction) => void | Promise<boolean>;
  audio: LocalAudioService;
  failure: AudioFailure;
};
export function player(s: GameSnapshot, id: string) {
  return s.players.find((p) => p.id === id)!;
}
export function Heading({
  eyebrow,
  children,
  description,
}: {
  eyebrow: string;
  children: ReactNode;
  description?: ReactNode;
}) {
  return (
    <div className={styles.heading}>
      <span className={styles.eyebrow}>{eyebrow}</span>
      <h1 tabIndex={-1}>{children}</h1>
      {description && <p>{description}</p>}
    </div>
  );
}
export function SecondaryActions({
  send,
  veto = false,
}: {
  send: ScreenProps["send"];
  veto?: boolean;
}) {
  return (
    <ActionDock>
      <div className={styles.secondaryActions}>
        {veto && (
          <Button variant="text" onClick={() => send({ type: "veto" })}>
            <Flag size={13} />
            {uiCopy.shared.vetoQuestion}
          </Button>
        )}
        <Button variant="text" onClick={() => send({ type: "skip" })}>
          {uiCopy.shared.skipThisStep}
          <ArrowRight size={13} />
        </Button>
      </div>
    </ActionDock>
  );
}
export function PlayerChoice({
  p,
  onClick,
  selected = false,
  label,
}: {
  p: Player;
  onClick: () => void;
  selected?: boolean;
  label?: string;
}) {
  return (
    <button
      className={`${styles.playerChoice} ${selected ? styles.selectedChoice : ""}`}
      onClick={onClick}
      aria-pressed={selected}
    >
      <Avatar name={p.name} color={p.color} variant={p.avatar} size={44} />
      <span>
        {p.name}
        <small>{label ?? uiCopy.shared.aUsualSuspect}</small>
      </span>
      {selected ? <Check size={18} /> : <ArrowRight size={17} />}
    </button>
  );
}
export function InputScreen({
  snapshot,
  audio,
  failure,
  send,
  sample,
  label,
  submitLabel,
}: ScreenProps & { sample: string; label?: string; submitLabel?: string }) {
  return (
    <>
      <VoiceInput
        key={`${snapshot.step.id}:${snapshot.view.viewerId}`}
        audio={audio}
        ownerId={snapshot.view.viewerId}
        stepId={snapshot.step.id}
        sample={sample}
        failure={failure}
        label={label}
        submitLabel={submitLabel}
        onSubmit={(text, source) => send({ type: "submit", text, ...source })}
      />
      <SecondaryActions send={send} veto />
    </>
  );
}
