"use client";
import { useEffect, useState } from "react";
import type { GameSnapshot } from "@expose/shared/game/contracts";
import { useServices, usePlayerPreferences } from "../session/provider";
import { Button, HostLine } from "../ui/primitives";
import { VoiceInput } from "./voice-input";
import { ClipPlayer } from "./clip-player";
import styles from "./game.module.css";

export function HostMoment({ snapshot }: { snapshot: GameSnapshot }) {
  const { onlineSession, audio } = useServices(),
    preferences = usePlayerPreferences();
  const beat = snapshot.hostBeat,
    [error, setError] = useState("");
  const id = beat ? `${beat.id}:${beat.turn}` : "";
  if (snapshot.hostFlowVersion !== 2) return null;
  if (beat?.status === "done" && !beat.text) return null;
  if (!beat)
    return ["callout", "story"].includes(snapshot.step.type) ? (
      <HostLine>The host is catching up with the room…</HostLine>
    ) : null;
  const owns =
    beat.status === "reply" && beat.invitedSeat === snapshot.view.viewerId;
  const invited = snapshot.players.find((p) => p.id === beat.invitedSeat);
  return (
    <section className={styles.hostMoment} aria-label="Your AI host">
      <span className={styles.eyebrow}>
        {beat.stage === "closing"
          ? "ONE LAST THING…"
          : "YOUR HOST HAS A THOUGHT"}
      </span>
      <p role="status" dir="auto">
        {beat.status === "generating"
          ? "Putting the pieces together…"
          : beat.text}
      </p>
      {beat.replies
        ?.filter((reply) => reply.outcome === "answer")
        .map((reply, index) => (
          <blockquote key={index}>
            <strong>
              {snapshot.players.find((p) => p.id === reply.seatId)?.name}
            </strong>
            <p dir="auto">{reply.original ?? reply.text}</p>
            {reply.original && reply.original !== reply.text && (
              <p dir="auto">{reply.text}</p>
            )}
          </blockquote>
        ))}
      {beat.audioUrl &&
        preferences.hostVoice &&
        (!beat.playbackSeat ||
          beat.playbackSeat === snapshot.view.viewerId) && (
          <HostAudio
            key={id}
            id={id}
            src={beat.audioUrl}
            fresh={Boolean(snapshot.hostAudioFresh)}
          />
        )}
      {beat.status === "reply" && (
        <p>
          {owns
            ? "Your turn, if you want it. Voice, text or pass."
            : `${invited?.name ?? "Your friend"} has the mic. Replying is optional.`}
        </p>
      )}
      {owns && (
        <fieldset
          disabled={snapshot.connection !== "connected"}
          className={styles.screenFieldset}
        >
          <VoiceInput
            key={id}
            audio={audio}
            ownerId={snapshot.view.viewerId}
            stepId={`host-${id}`}
            hostBeatId={beat.id}
            hostTurn={beat.turn}
            sample=""
            label="Your reply"
            submitLabel="Send reply"
            onSubmit={(text, source) =>
              onlineSession.replyHost(
                beat.id,
                beat.turn,
                text,
                "answer",
                source,
              )
            }
          />
          <div className={styles.secondaryActions}>
            <Button
              variant="text"
              onClick={() =>
                void onlineSession
                  .replyHost(beat.id, beat.turn, "", "pass")
                  .catch((cause) => setError(cause.message))
              }
            >
              Pass
            </Button>
            <Button
              variant="text"
              onClick={() =>
                void onlineSession
                  .replyHost(beat.id, beat.turn, "", "stt-failed")
                  .catch((cause) => setError(cause.message))
              }
            >
              Mic trouble · move on
            </Button>
          </div>
        </fieldset>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}

function HostAudio({
  id,
  src,
  fresh,
}: {
  id: string;
  src: string;
  fresh: boolean;
}) {
  const key = `expose.host-heard:${id}`;
  const [autoplay] = useState(() => {
    try {
      return fresh && !document.hidden && !sessionStorage.getItem(key);
    } catch {
      return false;
    }
  });
  useEffect(() => {
    try {
      sessionStorage.setItem(key, "1");
    } catch {
      /* Explicit playback remains available. */
    }
  }, [key]);
  return (
    <ClipPlayer
      controls
      autoPlay={autoplay}
      src={src}
      preload="none"
      aria-label="Host voice"
    />
  );
}
export function RevealedOriginals({ snapshot }: { snapshot: GameSnapshot }) {
  const sources = snapshot.revealedSources?.filter(
    (s) => s.original !== s.text,
  );
  if (!sources?.length) return null;
  return (
    <details className={styles.hostMoment}>
      <summary>Original answers and confirmed translations</summary>
      {sources.map((s) => (
        <div key={`${s.epoch}:${s.seatId}`}>
          <strong>
            {snapshot.players.find((p) => p.id === s.seatId)?.name}
          </strong>
          <p dir="auto">{s.original}</p>
          <p dir="auto">{s.text}</p>
        </div>
      ))}
    </details>
  );
}
