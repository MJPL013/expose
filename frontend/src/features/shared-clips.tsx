"use client";
import { useEffect, useSyncExternalStore } from "react";
import type { GameSnapshot } from "@expose/shared/game/contracts";
import { useServices } from "../session/provider";
import { ClipPlayer } from "./clip-player";
export function SharedClips({ snapshot }: { snapshot: GameSnapshot }) {
  const { onlineSession } = useServices();
  const feed = onlineSession.clips;
  const clips = useSyncExternalStore(
    feed.subscribe,
    feed.getSnapshot,
    feed.getSnapshot,
  );
  const visible = ["reveal", "spotlight-reveal", "story", "summary"].includes(
    snapshot.step.type,
  );
  useEffect(() => {
    const update = () =>
      feed.activate(
        visible && !document.hidden && snapshot.connection === "connected"
          ? `${snapshot.sessionId}:${snapshot.phaseEpoch}`
          : null,
      );
    update();
    document.addEventListener("visibilitychange", update);
    return () => {
      document.removeEventListener("visibilitychange", update);
      feed.activate(null);
    };
  }, [
    feed,
    visible,
    snapshot.sessionId,
    snapshot.phaseEpoch,
    snapshot.connection,
  ]);
  if (!visible) return null;
  const current = clips.filter(
    (clip) =>
      clip.ownerId !== snapshot.view.viewerId &&
      (snapshot.step.params.round === undefined ||
        clip.stepId.endsWith(`-${snapshot.step.params.round}`)),
  );
  if (!current.length) return null;
  return (
    <section aria-label="Consented reveal recordings">
      <h2>On the record</h2>
      {current.map((clip) => (
        <div key={clip.id}>
          <p>{snapshot.players.find((p) => p.id === clip.ownerId)?.name}</p>
          <ClipPlayer
            controls
            preload="none"
            src={clip.url}
            aria-label={`Play ${snapshot.players.find((p) => p.id === clip.ownerId)?.name}’s approved clip`}
          />
        </div>
      ))}
    </section>
  );
}
