"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  Fragment,
} from "react";
import { ArrowRight, Keyboard, Mic, Square, Trash2 } from "lucide-react";
import {
  languageNames,
  speechMatchesRoom,
  type SpeechLanguage,
} from "@expose/shared/game/host";
import type { LocalAudioService, RecordedClip } from "../media/local-audio";
import { Button } from "../ui/primitives";
import { ActionDock } from "../ui/action-dock";
import { useServices, usePlayerPreferences } from "../session/provider";
import { NetworkSession } from "../session/network-session";
import { usePhaseDraft } from "../session/phase-draft";
import { ClipPlayer } from "./clip-player";
import styles from "./game.module.css";
import {
  matchSpokenChoice,
  type SpokenChoice,
} from "@expose/shared/game/guided";
export type AudioFailure = "none" | "denied" | "unsupported";
export type AnswerOriginal = { original: string; language: SpeechLanguage };
type Status = "idle" | "permission" | "connecting" | "recording" | "processing";
export function VoiceInput({
  audio,
  ownerId,
  stepId,
  sample,
  onSubmit,
  failure = "none",
  label = "Your answer",
  submitLabel = "Seal my answer",
  maxLength = 240,
  maxRecordingSeconds = 8,
  hostBeatId,
  hostTurn,
  choices,
}: {
  audio: LocalAudioService;
  ownerId: string;
  stepId: string;
  sample: string;
  onSubmit: (text: string, source?: AnswerOriginal) => void | Promise<boolean>;
  failure?: AudioFailure;
  label?: string;
  submitLabel?: string;
  maxLength?: number;
  maxRecordingSeconds?: number;
  hostBeatId?: string;
  hostTurn?: number;
  choices?: SpokenChoice[];
}) {
  const { feedback, session, preferences } = useServices();
  const SubmitContainer = choices ? Fragment : ActionDock;
  const prefs = usePlayerPreferences();
  const snapshot = useSyncExternalStore(
    session.subscribe,
    session.getSnapshot,
    session.getSnapshot,
  );
  const online = Boolean(snapshot.online),
    voiceAvailable = !online || snapshot.liveVoice === true;
  const scope = [
    snapshot.sessionId,
    ownerId,
    snapshot.phaseEpoch,
    hostBeatId ?? stepId,
    hostTurn ?? "answer",
  ].join(":");
  const [draft, setDraft] = usePhaseDraft(scope, {
    original: "",
    gameplay: "",
    reviewed: "",
    language: prefs.speechLanguage,
    attempts: 0,
  });
  const [mode, setMode] = useState<"type" | "voice">(() =>
    voiceAvailable && (hostBeatId || snapshot.setup.mode !== "same-room")
      ? "voice"
      : "type",
  );
  const [status, setStatus] = useState<Status>("idle");
  const statusRef = useRef<Status>("idle"),
    generation = useRef(0),
    translationGeneration = useRef(0);
  const [permission, setPermission] = useState(audio.microphoneReady),
    [seconds, setSeconds] = useState(0);
  const [clip, setClip] = useState<RecordedClip | null>(null),
    [consent, setConsent] = useState(false);
  const [error, setError] = useState(""),
    [segments, setSegments] = useState("");
  const [translating, setTranslating] = useState(false),
    [sending, setSending] = useState(false);
  const language = draft.language,
    roomLanguage = snapshot.setup.hostLanguage ?? "hinglish";
  const crossLanguage =
    !choices && online && !speechMatchesRoom(language, roomLanguage);
  const remaining = Math.min(
    2 - draft.attempts,
    hostBeatId
      ? (snapshot.hostBeat?.remainingRecordings ?? 2)
      : (snapshot.remainingRecordings ?? 2),
  );
  const busy = status !== "idle";
  const setStage = useCallback((value: Status) => {
    statusRef.current = value;
    setStatus(value);
  }, []);
  const cancel = useCallback(() => {
    generation.current++;
    translationGeneration.current++;
    audio.cancelCapture();
    setStage("idle");
    setSeconds(0);
    setSegments("");
    setTranslating(false);
  }, [audio, setStage]);
  useEffect(() => {
    const captureGeneration = generation,
      preparationGeneration = translationGeneration;
    const hidden = () => {
      if (document.hidden) cancel();
    };
    document.addEventListener("visibilitychange", hidden);
    return () => {
      document.removeEventListener("visibilitychange", hidden);
      captureGeneration.current++;
      preparationGeneration.current++;
      audio.cancelCapture();
      audio.discardUnsubmitted();
    };
  }, [audio, cancel]);
  useEffect(
    () =>
      session.subscribe(() => {
        const current = session.getSnapshot();
        if (current.online && current.connection !== "connected") cancel();
      }),
    [session, cancel],
  );
  useEffect(() => {
    feedback.suppress(scope, busy);
    return () => feedback.suppress(scope, false);
  }, [feedback, scope, busy]);
  const translate = useCallback(
    async (original: string, from: SpeechLanguage) => {
      if (
        choices ||
        !original.trim() ||
        !(session instanceof NetworkSession) ||
        speechMatchesRoom(from, roomLanguage)
      )
        return;
      const request = ++translationGeneration.current;
      setTranslating(true);
      setError("");
      try {
        const result = await session.translateAnswer(
          original,
          from,
          hostBeatId,
          hostTurn,
        );
        if (request === translationGeneration.current)
          setDraft((d) =>
            d.original === original && d.language === from
              ? { ...d, gameplay: result.text, reviewed: original }
              : d,
          );
      } catch {
        if (request === translationGeneration.current)
          setError(
            "Translation could not finish. Enter or correct the gameplay text below, then Send.",
          );
      } finally {
        if (request === translationGeneration.current) setTranslating(false);
      }
    },
    [choices, session, roomLanguage, hostBeatId, hostTurn, setDraft],
  );
  const enable = async () => {
    if (statusRef.current !== "idle") return;
    const attempt = ++generation.current;
    setStage("permission");
    setError("");
    try {
      if (failure !== "none" || !navigator.mediaDevices?.getUserMedia)
        throw new Error(
          "Microphone unavailable. Use HTTPS, allow the microphone, or type.",
        );
      await audio.prepareMicrophone();
      if (attempt === generation.current) {
        setPermission(true);
        setStage("idle");
      }
    } catch (cause) {
      if (attempt === generation.current) {
        setError(
          cause instanceof Error
            ? cause.message
            : "Microphone permission denied. You can type.",
        );
        setStage("idle");
      }
    }
  };
  const start = async () => {
    if (!permission || remaining <= 0 || statusRef.current !== "idle") return;
    const attempt = ++generation.current;
    setStage("connecting");
    setError("");
    setSegments("");
    setConsent(false);
    setSeconds(0);
    if (clip) {
      audio.remove(clip.id);
      setClip(null);
    }
    try {
      await audio.start(ownerId, stepId, {
        purpose: hostBeatId ? "host" : "answer",
        language,
        hostBeatId,
        hostTurn,
        onSegment: (text) => {
          if (attempt === generation.current) setSegments(text);
        },
      });
      if (attempt !== generation.current) {
        audio.cancelCapture();
        return;
      }
      setDraft((d) => ({ ...d, attempts: d.attempts + 1 }));
      setStage("recording");
    } catch (cause) {
      if (attempt === generation.current) {
        setError(
          cause instanceof Error
            ? cause.message
            : "Recording failed. You can type.",
        );
        setStage("idle");
      }
    }
  };
  const finish = useCallback(async () => {
    if (
      statusRef.current === "connecting" ||
      statusRef.current === "permission"
    ) {
      cancel();
      return;
    }
    if (statusRef.current !== "recording") return;
    const attempt = generation.current;
    setStage("processing");
    try {
      const recorded = await audio.stop();
      if (attempt !== generation.current) {
        audio.remove(recorded.id);
        return;
      }
      const original = (recorded.transcript ?? (online ? "" : sample)).slice(
        0,
        maxLength,
      );
      setClip(recorded);
      setDraft((d) => ({ ...d, original, gameplay: "", reviewed: "" }));
      setStage("idle");
      if (!original.trim())
        setError(
          "No speech was recognised. Edit, type, or use your remaining recording.",
        );
      else void translate(original, language);
    } catch (cause) {
      if (attempt === generation.current) {
        setStage("idle");
        setError(
          cause instanceof Error
            ? cause.message
            : "Transcription failed. Type or pass.",
        );
      }
    }
  }, [
    audio,
    cancel,
    language,
    maxLength,
    online,
    sample,
    setDraft,
    setStage,
    translate,
  ]);
  useEffect(() => {
    if (status !== "recording") return;
    const began = Date.now();
    const timer = setInterval(() => {
      const elapsed = (Date.now() - began) / 1000;
      setSeconds(Math.floor(elapsed));
      if (elapsed >= maxRecordingSeconds) void finish();
    }, 100);
    return () => clearInterval(timer);
  }, [status, maxRecordingSeconds, finish]);
  const text = crossLanguage ? draft.gameplay : draft.original;
  const matchedChoice = choices ? matchSpokenChoice(text, choices) : null;
  const ready = Boolean(
    text.trim() &&
    text.length <= maxLength &&
    (!crossLanguage || draft.reviewed === draft.original) &&
    !busy &&
    !translating &&
    !sending &&
    (!choices || matchedChoice) &&
    (!online || snapshot.connection === "connected"),
  );
  return (
    <form
      id={"voice-form-" + stepId}
      className={styles.voiceForm}
      onSubmit={async (e) => {
        e.preventDefault();
        if (!ready) return;
        setSending(true);
        setError("");
        try {
          if (clip) audio.commit(clip.id, consent);
          if (
            (await onSubmit(text.trim(), {
              original: draft.original.trim(),
              language,
            })) === false
          ) {
            if (clip) audio.uncommit(clip.id);
            return;
          }
          if (
            clip &&
            consent &&
            !hostBeatId &&
            session instanceof NetworkSession
          ) {
            const shared = await session.shareClip(
              clip,
              snapshot.sessionId,
              snapshot.phaseEpoch,
            );
            if (shared) audio.markShared(clip.id, shared.id);
          }
        } catch (cause) {
          if (clip) audio.setConsent(clip.id, false);
          setError(
            cause instanceof Error
              ? cause.message
              : "Could not send. Please retry.",
          );
        } finally {
          setSending(false);
        }
      }}
    >
      <div
        className={styles.inputModes}
        role="group"
        aria-label="Answer input method"
      >
        <button
          type="button"
          aria-pressed={mode === "type"}
          onClick={() => {
            cancel();
            setMode("type");
          }}
        >
          <Keyboard size={16} />
          Type instead
        </button>
        <button
          type="button"
          aria-pressed={mode === "voice"}
          disabled={!voiceAvailable}
          onClick={() => setMode("voice")}
        >
          <Mic size={16} />
          Speak
        </button>
      </div>
      <label className={styles.languageControl}>
        Answer language
        <select
          value={language}
          disabled={busy}
          onChange={(e) => {
            const selected = e.target.value as SpeechLanguage;
            translationGeneration.current++;
            setTranslating(false);
            preferences.saveSpeechLanguage(selected);
            setDraft((d) => ({
              ...d,
              language: selected,
              reviewed: "",
              gameplay: "",
            }));
          }}
        >
          <option value="en-IN">English</option>
          <option value="hi-IN">हिन्दी · Hindi</option>
          <option value="te-IN">తెలుగు · Telugu</option>
        </select>
      </label>
      {!voiceAvailable && (
        <p role="status">Live transcription is off. You can still type.</p>
      )}
      {mode === "voice" && (
        <div className={styles.recorder}>
          <p role="status" aria-live="polite">
            {status === "recording"
              ? "Listening · " + seconds + "s / " + maxRecordingSeconds + "s"
              : status === "processing"
                ? "Finishing transcription…"
                : status === "connecting"
                  ? "Connecting… release to cancel"
                  : status === "permission"
                    ? "Waiting for microphone permission…"
                    : Math.max(0, remaining) +
                      " recordings left · Review before Send"}
          </p>
          {!permission ? (
            <Button
              type="button"
              variant="ghost"
              onClick={() => void enable()}
              disabled={busy}
            >
              Enable microphone
            </Button>
          ) : (
            <>
              <button
                type="button"
                className={styles.holdMic}
                aria-label="Hold to speak, release to review"
                disabled={
                  (remaining <= 0 && status !== "recording") ||
                  status === "processing"
                }
                style={{ touchAction: "none" }}
                onPointerDown={(e) => {
                  if (e.button !== 0) return;
                  e.preventDefault();
                  e.currentTarget.setPointerCapture(e.pointerId);
                  void start();
                }}
                onPointerUp={(e) => {
                  e.preventDefault();
                  void finish();
                }}
                onPointerCancel={cancel}
                onKeyDown={(e) => {
                  if ((e.key === " " || e.key === "Enter") && !e.repeat) {
                    e.preventDefault();
                    void start();
                  }
                }}
                onKeyUp={(e) => {
                  if (e.key === " " || e.key === "Enter") {
                    e.preventDefault();
                    void finish();
                  }
                }}
                onBlur={() => {
                  if (
                    statusRef.current === "recording" ||
                    statusRef.current === "connecting"
                  )
                    cancel();
                }}
              >
                <Mic size={24} /> Hold to speak
              </button>
              <Button
                type="button"
                variant="text"
                disabled={
                  status === "processing" ||
                  (remaining <= 0 && status === "idle")
                }
                onClick={() => {
                  if (statusRef.current === "idle") void start();
                  else void finish();
                }}
              >
                {status === "recording" || status === "connecting" ? (
                  <>
                    <Square size={14} />
                    Stop recording
                  </>
                ) : (
                  "Start recording"
                )}
              </Button>
            </>
          )}
          {(status === "permission" || status === "connecting") && (
            <Button type="button" variant="text" onClick={cancel}>
              Cancel
            </Button>
          )}
          {segments && (
            <p aria-live="polite" dir="auto">
              {segments}
            </p>
          )}
        </div>
      )}
      {clip && (
        <div className={styles.clipPreview}>
          <ClipPlayer
            controls
            src={clip.url}
            aria-label="Play your private recording"
            preload="metadata"
          />
          <Button
            type="button"
            variant="text"
            onClick={() => {
              audio.remove(clip.id);
              setClip(null);
              setConsent(false);
            }}
          >
            <Trash2 size={14} />
            Delete clip
          </Button>
          {!hostBeatId && !choices && (
            <label className={styles.check}>
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
              />
              Include this clip when my answer is revealed
            </label>
          )}
        </div>
      )}
      {(mode === "type" || draft.original || clip) && (
        <>
          <div className={styles.answerLabel}>
            <label htmlFor={"answer-" + stepId}>
              {crossLanguage
                ? "Original answer"
                : clip
                  ? online
                    ? "Review your transcript"
                    : "Edit your sample transcript"
                  : label}
            </label>
            <span aria-hidden="true">
              {draft.original.length}/{maxLength}
            </span>
          </div>
          <textarea
            id={"answer-" + stepId}
            dir="auto"
            value={draft.original}
            disabled={busy}
            maxLength={maxLength}
            placeholder="Your words go here…"
            onChange={(e) => {
              translationGeneration.current++;
              setTranslating(false);
              setDraft((d) => ({
                ...d,
                original: e.target.value,
                reviewed: "",
                gameplay: "",
              }));
            }}
          />
          {clip && !online && (
            <p className={styles.tiny}>
              Sample transcript · not speech recognition. Replace it with your
              own words.
            </p>
          )}
          {crossLanguage && (
            <>
              <Button
                type="button"
                variant="ghost"
                disabled={busy || translating || !draft.original.trim()}
                onClick={() => void translate(draft.original, language)}
              >
                {translating
                  ? "Translating…"
                  : "Review in " + languageNames[roomLanguage]}
              </Button>
              <label htmlFor={"gameplay-" + stepId}>
                Gameplay answer · {languageNames[roomLanguage]} (editable)
              </label>
              <textarea
                id={"gameplay-" + stepId}
                dir="auto"
                value={draft.gameplay}
                disabled={busy || translating}
                maxLength={maxLength}
                placeholder="Translation, or write your own version here"
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    gameplay: e.target.value,
                    reviewed: d.original,
                  }))
                }
              />
              <p className={styles.tiny}>
                Send confirms both texts. Points use the gameplay answer shown
                here.
              </p>
            </>
          )}
          {choices && (
            <p role="status">
              {matchedChoice
                ? `Selected: ${matchedChoice.text}`
                : "Say an option number or the exact name. You can also tap a choice."}
            </p>
          )}
        </>
      )}
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      <SubmitContainer>
        <Button type="submit" form={"voice-form-" + stepId} disabled={!ready}>
          {sending
            ? "Sending…"
            : busy
              ? "Listening…"
              : !draft.original && mode === "voice"
                ? "Speak to add an answer"
                : submitLabel}
          <ArrowRight size={18} />
        </Button>
      </SubmitContainer>
    </form>
  );
}
