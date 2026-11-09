"use client";
import { useEffect, useState, useRef, useId } from "react";
import { Mic, Square, MessageCircle } from "lucide-react";
import type { GameSnapshot } from "@expose/shared/game/contracts";
import { useServices, usePlayerPreferences } from "../session/provider";
import { Button } from "../ui/primitives";
import { ClipPlayer } from "./clip-player";
import { Dialog } from "../ui/dialog";
import styles from "./host-conversation.module.css";

export function HostConversation({ snapshot }: { snapshot: GameSnapshot }) {
  const { onlineSession, audio, feedback } = useServices(),
    preferences = usePlayerPreferences();
  const [text, setText] = useState(""),
    [recording, setRecording] = useState(false),
    [busy, setBusy] = useState(false),
    [sent, setSent] = useState(false),
    [dismissed, setDismissed] = useState(false),
    [error, setError] = useState("");
  const host = snapshot.host,
    eligible = ["lobby", "reveal", "spotlight-reveal", "summary"].includes(
      snapshot.step.type,
    );
  const owns = Boolean(
    host?.deadline && host.speakingSeat === snapshot.view.viewerId,
  );
  const captureAttempt = useRef(0);
  const triggerId = useId();
  useEffect(() => {
    if (dismissed && !owns && snapshot.canAskHost && !document.hidden)
      document.getElementById(triggerId)?.focus({ preventScroll: true });
  }, [dismissed, owns, snapshot.canAskHost, triggerId]);
  function close() {
    captureAttempt.current++;
    audio.cancelCapture();
    audio.discardUnsubmitted();
    setRecording(false);
    setBusy(false);
    setDismissed(true);
    if (owns && host) onlineSession.cancelHost(host.id);
  }
  useEffect(() => {
    const onHidden = () => {
      if (document.hidden && owns && host) {
        captureAttempt.current++;
        audio.cancelCapture();
        setRecording(false);
        setBusy(false);
        setDismissed(true);
        onlineSession.cancelHost(host.id);
      }
    };
    document.addEventListener("visibilitychange", onHidden);
    return () => document.removeEventListener("visibilitychange", onHidden);
  }, [owns, host, audio, onlineSession]);
  useEffect(() => {
    feedback.suppress("host-capture", recording || busy);
    return () => feedback.suppress("host-capture", false);
  }, [recording, busy, feedback]);
  useEffect(
    () => () => {
      captureAttempt.current++;
      audio.cancelCapture();
    },
    [audio],
  );
  useEffect(() => {
    if (!recording) return;
    const timer = setTimeout(() => {
      void stop();
    }, 8000);
    return () => clearTimeout(timer);
  });
  async function stop() {
    const attempt = ++captureAttempt.current;
    setRecording(false);
    setBusy(true);
    try {
      const clip = await audio.stop();
      if (captureAttempt.current === attempt)
        setText((clip.transcript ?? "").slice(0, 240));
      audio.remove(clip.id);
    } catch (cause) {
      if (captureAttempt.current !== attempt) return;
      setError(
        cause instanceof Error ? cause.message : "Please type your question.",
      );
    } finally {
      if (captureAttempt.current === attempt) setBusy(false);
    }
  }
  if (!eligible && !host) return null;
  return (
    <section className={styles.hostConversation} aria-label="Ask the host">
      {host && !owns && <p role="status">{host.text}</p>}
      {host?.audioUrl &&
        preferences.sound.enabled &&
        (!host.playbackSeat ||
          host.playbackSeat === snapshot.view.viewerId) && (
          <HostPlayback
            key={host.id}
            src={host.audioUrl}
            fresh={Boolean(snapshot.animateTransition)}
          />
        )}
      {eligible && snapshot.canAskHost && !host?.deadline && (
        <Button
          id={triggerId}
          variant="text"
          disabled={snapshot.connection !== "connected"}
          onClick={() => {
            setSent(false);
            setDismissed(false);
            setText("");
            setError("");
            onlineSession.beginHost();
          }}
        >
          <MessageCircle size={16} />
          Tap to ask
        </Button>
      )}
      {owns && !dismissed && (
        <Dialog title="Ask the host" onClose={close}>
          {!sent ? (
            <form
              className={styles.form}
              onSubmit={(event) => {
                event.preventDefault();
                if (text.trim()) {
                  audio.cancelCapture();
                  onlineSession.askHost(text.trim());
                  setSent(true);
                }
              }}
            >
              <label className={styles.field}>
                Ask about the rules or the round
                <textarea
                  value={text}
                  maxLength={240}
                  onChange={(event) => setText(event.target.value)}
                  disabled={recording}
                  autoComplete="off"
                  rows={3}
                />
              </label>
              <div className={styles.actions}>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={busy}
                  onClick={async () => {
                    if (recording) {
                      await stop();
                      return;
                    }
                    setBusy(true);
                    const attempt = ++captureAttempt.current;
                    try {
                      await audio.start(
                        snapshot.view.viewerId,
                        snapshot.step.id,
                        {
                          purpose: "host",
                        },
                      );
                      if (captureAttempt.current === attempt)
                        setRecording(true);
                    } catch (cause) {
                      if (captureAttempt.current !== attempt) return;
                      setError(
                        cause instanceof Error
                          ? cause.message
                          : "Please type instead.",
                      );
                    } finally {
                      if (captureAttempt.current === attempt) setBusy(false);
                    }
                  }}
                >
                  {recording ? <Square size={16} /> : <Mic size={16} />}{" "}
                  {recording ? "Stop" : "Speak"}
                </Button>
                <Button
                  type="submit"
                  disabled={!text.trim() || recording || busy}
                >
                  Ask
                </Button>
              </div>
              {error && <p role="status">{error}</p>}
              <p className={styles.hint}>
                The room pauses for up to 25 seconds. Review spoken text before
                sending. Close this window or tap outside to return to the game.
              </p>
            </form>
          ) : (
            <p role="status">
              {host?.text ===
              "Your turn to ask. Speak or type a short question."
                ? "Question sent. Your host is thinking…"
                : host?.text}
            </p>
          )}
          <Button variant="ghost" onClick={close}>
            Back to the room
          </Button>
        </Dialog>
      )}
    </section>
  );
}

// Restored narration stays available for explicit playback, without replaying it.
function HostPlayback({ src, fresh }: { src: string; fresh: boolean }) {
  const [autoplay] = useState(
    () => fresh && typeof document !== "undefined" && !document.hidden,
  );
  return (
    <ClipPlayer
      controls
      autoPlay={autoplay}
      src={src}
      preload="none"
      aria-label="Host response"
    />
  );
}
