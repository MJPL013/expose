"use client";
import { useRef, useState } from "react";
import { Volume2, VolumeX, RotateCcw, Mic } from "lucide-react";
import type { GameSnapshot } from "@expose/shared/game/contracts";
import { useServices, usePlayerPreferences } from "../session/provider";
import { Button } from "../ui/primitives";
import { ClipPlayer } from "./clip-player";
import { VoiceInput } from "./voice-input";
import { choicesFor, matchSpokenChoice } from "@expose/shared/game/guided";
import type { ScreenProps } from "./screens/shared";
import styles from "./game.module.css";

export function HostVoiceToggle() {
  const prefs = usePlayerPreferences(),
    { preferences } = useServices();
  return (
    <Button
      variant="text"
      aria-label="Host voice"
      aria-pressed={prefs.hostVoice}
      onClick={() => preferences.saveHostVoice(!prefs.hostVoice)}
    >
      {prefs.hostVoice ? <Volume2 size={17} /> : <VolumeX size={17} />} Voice
    </Button>
  );
}
export function QuestionSpeech({ snapshot }: { snapshot: GameSnapshot }) {
  const n = snapshot.narration;
  if (!n || n.epoch !== snapshot.phaseEpoch) return null;
  return <QuestionPlayback key={n.id} snapshot={snapshot} />;
}
function QuestionPlayback({ snapshot }: { snapshot: GameSnapshot }) {
  const prefs = usePlayerPreferences(),
    n = snapshot.narration!;
  const container = useRef<HTMLDivElement>(null);
  const [heard, setHeard] = useState(false);
  const playable =
    prefs.hostVoice &&
    (!n.playbackSeat || n.playbackSeat === snapshot.view.viewerId);
  const fresh = Boolean(snapshot.narrationFresh);
  return (
    <div className={styles.questionSpeech} ref={container}>
      <span role="status">
        {n.status === "pending" || n.status === "generating"
          ? "Read the question · voice is getting ready"
          : n.status === "presenting"
            ? "Listen first · your answer time starts next"
            : "Your turn"}
      </span>
      {playable && n.audioUrl && (
        <>
          <ClipPlayer
            aria-label="Question voice"
            src={n.audioUrl}
            autoPlay={
              fresh &&
              typeof document !== "undefined" &&
              !document.hidden &&
              n.status === "presenting"
            }
            onPlay={() => setHeard(true)}
          />
          <Button
            variant="text"
            onClick={() => {
              const node = container.current?.querySelector("audio");
              if (node) {
                node.currentTime = 0;
                void node.play().catch(() => {});
              }
            }}
          >
            <RotateCcw size={14} />
            {heard ? "Replay" : "Play question"}
          </Button>
        </>
      )}
    </div>
  );
}
export function SpokenChoices(props: ScreenProps) {
  const [open, setOpen] = useState(false);
  const { snapshot, audio, send } = props;
  const choices = choicesFor(snapshot);
  if (
    !snapshot.setup.guidedVoice ||
    !snapshot.view.actionPending ||
    !choices.length ||
    !snapshot.liveVoice
  )
    return null;
  return (
    <details
      className={styles.spokenChoices}
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary>
        <Mic size={16} /> Say a choice
      </summary>
      {open && (
        <VoiceInput
          audio={audio}
          ownerId={snapshot.view.viewerId}
          stepId={snapshot.step.id}
          sample=""
          choices={choices}
          label="Your spoken choice"
          submitLabel="Lock spoken choice"
          onSubmit={async (text) => {
            const choice = matchSpokenChoice(text, choices);
            if (!choice)
              throw new Error("Choose a visible option number or name.");
            const type = snapshot.view.phase.type;
            return (
              (await send(
                type === "nomination"
                  ? { type: "nominate", playerId: choice.id }
                  : type === "sync"
                    ? { type: "predict", playerId: choice.id }
                    : { type: "vote", optionId: choice.id },
              )) !== false
            );
          }}
        />
      )}
    </details>
  );
}
