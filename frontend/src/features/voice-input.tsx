"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  Fragment,
} from "react";
import { ArrowRight, Mic, MicOff } from "lucide-react";
import {
  languageNames,
  speechMatchesRoom,
  type SpeechLanguage,
} from "@expose/shared/game/host";
import type { LocalAudioService } from "../media/local-audio";
import { Button } from "../ui/primitives";
import { ActionDock } from "../ui/action-dock";
import { useServices, usePlayerPreferences } from "../session/provider";
import { NetworkSession } from "../session/network-session";
import { usePhaseDraft } from "../session/phase-draft";
import {
  matchSpokenChoice,
  type SpokenChoice,
} from "@expose/shared/game/guided";
import styles from "./game.module.css";
export type AudioFailure = "none" | "denied" | "unsupported";
export type AnswerOriginal = { original: string; language: SpeechLanguage };
type Mode = "handsfree" | "hold" | "type";
type Status = "idle" | "permission" | "preparing" | "recording" | "processing";
export function VoiceInput({
  audio,
  ownerId,
  stepId,
  sample,
  onSubmit,
  failure = "none",
  label = "Your answer",
  submitLabel = "Send",
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
  const { feedback, session, preferences } = useServices(),
    prefs = usePlayerPreferences();
  const snapshot = useSyncExternalStore(
    session.subscribe,
    session.getSnapshot,
    session.getSnapshot,
  );
  const online = Boolean(snapshot.online),
    available = !online || snapshot.liveVoice === true,
    modern = online && snapshot.voiceInputVersion === 2;
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
  const [mode, setMode] = useState<Mode>(() =>
    !available
      ? "type"
      : prefs.voiceMode === "handsfree" && !modern
        ? "hold"
        : prefs.voiceMode,
  );
  const [status, setStatus] = useState<Status>("idle"),
    statusRef = useRef<Status>("idle");
  const [manualMode, setManualMode] = useState(false);
  const [wasSubmitted, setWasSubmitted] = useState(false);
  const setManual = useCallback((value: boolean) => {
    manual.current = value;
    setManualMode(value);
  }, []);
  const setSubmitted = (value: boolean) => {
    submitted.current = value;
    setWasSubmitted(value);
  };
  const [vadReady, setVadReady] = useState(false);
  const [permission, setPermission] = useState(audio.microphoneReady),
    [seconds, setSeconds] = useState(0),
    [error, setError] = useState("");
  const previouslyReady = useRef(audio.microphoneReady);
  const [segments, setSegments] = useState(""),
    [translating, setTranslating] = useState(false),
    [sending, setSending] = useState(false);
  const [automatic, setAutomatic] = useState(false),
    [countdown, setCountdown] = useState<number | null>(null),
    [blocked, setBlocked] = useState(true);
  const generation = useRef(0),
    translationGeneration = useRef(0),
    began = useRef(0),
    append = useRef(false),
    manual = useRef(false),
    submitted = useRef(false),
    autoTimer = useRef<ReturnType<typeof setTimeout> | null>(null),
    speechPending = useRef(false);
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
  const cap =
    snapshot.recordingLimits?.[hostBeatId ? "host" : "answer"] ??
    maxRecordingSeconds;
  const busy = status !== "idle",
    Container = choices ? Fragment : ActionDock;
  const setStage = useCallback((value: Status) => {
    statusRef.current = value;
    setStatus(value);
  }, []);
  const stopAuto = useCallback(() => {
    if (autoTimer.current) clearTimeout(autoTimer.current);
    autoTimer.current = null;
    setCountdown(null);
    setAutomatic(false);
  }, []);
  const edit = () => {
    setManual(true);
    stopAuto();
  };
  const cancel = useCallback(() => {
    if (statusRef.current === "permission") {
      audio.muteMicrophone();
      setPermission(false);
    }
    generation.current++;
    translationGeneration.current++;
    stopAuto();
    audio.listen(null);
    audio.cancelCapture();
    setStage("idle");
    setSegments("");
    setTranslating(false);
    setSeconds(0);
    speechPending.current = false;
  }, [audio, setStage, stopAuto]);
  useEffect(
    () => () => {
      generation.current++;
      translationGeneration.current++;
      if (autoTimer.current) clearTimeout(autoTimer.current);
      audio.listen(null);
      audio.cancelCapture();
    },
    [audio, scope],
  );
  useEffect(() => {
    if (!choices) return;
    const manualChoice = (event: Event) => {
      const target = event.target;
      if (!(target instanceof Element) || !target.closest("button")) return;
      if (document.getElementById("voice-form-" + stepId)?.contains(target))
        return;
      setManual(true);
      cancel();
    };
    document.addEventListener("click", manualChoice, true);
    return () => document.removeEventListener("click", manualChoice, true);
  }, [choices, stepId, cancel, setManual]);
  useEffect(() => {
    const update = () => {
      const c = session.getSnapshot();
      const microphoneReady = audio.microphoneReady;
      if (previouslyReady.current && !microphoneReady) {
        setManual(true);
        cancel();
      }
      previouslyReady.current = microphoneReady;
      const owns = hostBeatId
        ? c.hostBeat?.id === hostBeatId &&
          c.hostBeat.turn === hostTurn &&
          c.hostBeat.status === "reply" &&
          c.hostBeat.invitedSeat === ownerId
        : c.view.actionPending && !c.paused;
      const presented = !c.narration || c.narration.status === "done";
      const denied =
        document.hidden ||
        !owns ||
        !presented ||
        (c.voicePlaybackUntil ?? 0) > Date.now() ||
        audio.playbackBlocked ||
        (c.online && c.connection !== "connected");
      setBlocked(Boolean(denied));
      setPermission(audio.microphoneReady);
      setVadReady(audio.handsfreeReady);
      if (
        denied &&
        ["permission", "recording", "preparing"].includes(statusRef.current)
      )
        cancel();
      if (denied) {
        if (autoTimer.current) clearTimeout(autoTimer.current);
        autoTimer.current = null;
        setCountdown(null);
      }
      if (document.hidden || (c.online && c.connection !== "connected"))
        audio.muteMicrophone();
    };
    update();
    const timer = setInterval(update, 100),
      unsub = session.subscribe(update);
    document.addEventListener("visibilitychange", update);
    return () => {
      clearInterval(timer);
      unsub();
      document.removeEventListener("visibilitychange", update);
    };
  }, [audio, session, hostBeatId, hostTurn, ownerId, cancel, setManual]);
  useEffect(() => {
    feedback.suppress(
      scope,
      busy ||
        (mode === "handsfree" &&
          permission &&
          !blocked &&
          !manualMode &&
          !wasSubmitted),
    );
    return () => feedback.suppress(scope, false);
  }, [
    feedback,
    scope,
    busy,
    mode,
    permission,
    blocked,
    manualMode,
    wasSubmitted,
  ]);
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
        if (request === translationGeneration.current) {
          setManual(true);
          stopAuto();
          setError(
            "Translation could not finish. Correct the gameplay text, then Send.",
          );
        }
      } finally {
        if (request === translationGeneration.current) setTranslating(false);
      }
    },
    [
      choices,
      session,
      roomLanguage,
      hostBeatId,
      hostTurn,
      setDraft,
      stopAuto,
      setManual,
    ],
  );
  const enable = async () => {
    if (statusRef.current !== "idle") return;
    const attempt = ++generation.current;
    setStage("permission");
    setError("");
    try {
      if (failure !== "none")
        throw new Error("Microphone unavailable. Allow access or type.");
      await audio.prepareMicrophone();
      if (attempt === generation.current) {
        setPermission(true);
        setStage("idle");
        setManual(false);
      }
    } catch (e) {
      if (attempt === generation.current) {
        setError(
          e instanceof Error
            ? e.message
            : "Microphone unavailable. Type instead.",
        );
        setStage("idle");
      }
    }
  };
  const start = async (continueDraft = false) => {
    if (
      !audio.microphoneReady ||
      remaining <= 0 ||
      statusRef.current !== "idle" ||
      blocked ||
      submitted.current
    )
      return;
    stopAuto();
    setManual(false);
    append.current = continueDraft;
    const attempt = ++generation.current;
    setStage("preparing");
    setError("");
    setSegments("");
    setSeconds(0);
    try {
      await audio.start(ownerId, stepId, {
        purpose: hostBeatId ? "host" : "answer",
        language,
        hostBeatId,
        hostTurn,
        preRoll: mode === "handsfree",
        maxSeconds: cap,
        onAccepted: (left) => {
          if (attempt === generation.current)
            setDraft((d) => ({
              ...d,
              attempts: Math.max(d.attempts, 2 - left),
            }));
        },
        onSegment: (text) => {
          if (attempt === generation.current) setSegments(text);
        },
        onLimit: () => {
          if (attempt === generation.current) void actions.current.finish(true);
        },
        onError: (e) => {
          if (attempt === generation.current) {
            setManual(true);
            stopAuto();
            setError(e.message);
            audio.cancelCapture();
            setStage("idle");
          }
        },
      });
      if (attempt !== generation.current) {
        audio.cancelCapture();
        return;
      }
      if (!online) setDraft((d) => ({ ...d, attempts: d.attempts + 1 }));
      began.current = Date.now();
      setStage("recording");
    } catch (e) {
      if (attempt === generation.current) {
        setManual(true);
        setStage("idle");
        setError(
          e instanceof Error ? e.message : "Recording failed. Type or retry.",
        );
      }
    }
  };
  const finish = async (hitCap = false) => {
    if (
      statusRef.current === "preparing" ||
      statusRef.current === "permission"
    ) {
      cancel();
      return;
    }
    if (statusRef.current !== "recording") return;
    const attempt = generation.current;
    setStage("processing");
    speechPending.current = false;
    try {
      const result = await audio.stop();
      if (attempt !== generation.current) return;
      const recognised = result.transcript ?? (online ? "" : sample),
        combined = append.current
          ? `${draft.original} ${recognised}`.trim()
          : recognised,
        original = combined.slice(0, maxLength);
      setDraft((d) => ({ ...d, original, gameplay: "", reviewed: "" }));
      setStage("idle");
      if (!recognised.trim()) {
        setManual(true);
        setError("No speech recognised. Retry, edit, type or pass.");
      } else {
        if (hitCap || combined.length > maxLength) {
          setManual(true);
          setError("Recording limit reached. Check your answer, then Send.");
        }
        setAutomatic(
          mode === "handsfree" &&
            !manual.current &&
            !hitCap &&
            combined.length <= maxLength,
        );
        void translate(original, language);
      }
    } catch (e) {
      if (attempt === generation.current) {
        setManual(true);
        stopAuto();
        setStage("idle");
        setError(
          e instanceof Error
            ? e.message
            : "Transcription failed. Type or retry.",
        );
      }
    }
  };
  const text = crossLanguage ? draft.gameplay : draft.original,
    matched = choices ? matchSpokenChoice(text, choices) : null;
  const ready = Boolean(
    text.trim() &&
    text.length <= maxLength &&
    (!crossLanguage || draft.reviewed === draft.original) &&
    !busy &&
    !translating &&
    !sending &&
    !blocked &&
    (!choices || matched) &&
    !wasSubmitted,
  );
  const submit = async () => {
    if (!ready || submitted.current) return;
    stopAuto();
    audio.listen(null);
    setSubmitted(true);
    setSending(true);
    setError("");
    try {
      if (
        (await onSubmit(text.trim(), {
          original: draft.original.trim(),
          language,
        })) === false
      ) {
        setSubmitted(false);
        setManual(true);
        setError("Answer was not accepted. Review and send again.");
      }
    } catch (e) {
      setSubmitted(false);
      setManual(true);
      setError(e instanceof Error ? e.message : "Could not send. Retry.");
    } finally {
      setSending(false);
    }
  };
  const actions = useRef({ start, finish, submit });
  useEffect(() => {
    actions.current = { start, finish, submit };
  });
  useEffect(() => {
    if (status !== "recording") return;
    const timer = setInterval(() => {
      const elapsed = (Date.now() - began.current) / 1000;
      setSeconds(Math.floor(elapsed));
      if (elapsed >= cap) void actions.current.finish(true);
    }, 100);
    return () => clearInterval(timer);
  }, [status, cap]);
  useEffect(() => {
    const armed =
      modern &&
      mode === "handsfree" &&
      permission &&
      !blocked &&
      (remaining > 0 || status === "recording" || status === "preparing") &&
      !manual.current &&
      !submitted.current &&
      (status === "idle" || status === "recording" || status === "preparing");
    if (!armed) {
      audio.listen(null);
      return;
    }
    audio.listen({
      onset: () => {
        speechPending.current = true;
        if (autoTimer.current) clearTimeout(autoTimer.current);
        autoTimer.current = null;
        setCountdown(null);
      },
      misfire: () => {
        speechPending.current = false;
        setAutomatic(false);
        if (draft.original) setManual(true);
      },
      start: () => {
        void actions.current.start(Boolean(draft.original));
      },
      end: () => {
        void actions.current.finish();
      },
      error: (e) => {
        setManual(true);
        stopAuto();
        setMode("hold");
        setError(
          e.message || "Hands-free unavailable. Use Hold to speak or Type.",
        );
      },
    });
  }, [
    audio,
    modern,
    mode,
    permission,
    blocked,
    remaining,
    status,
    draft.original,
    manualMode,
    wasSubmitted,
    setManual,
    stopAuto,
  ]);
  useEffect(() => {
    if (
      !automatic ||
      !ready ||
      manual.current ||
      mode !== "handsfree" ||
      speechPending.current
    )
      return;
    setCountdown(2);
    const secondsTimer = setTimeout(() => setCountdown(1), 1000);
    autoTimer.current = setTimeout(() => {
      autoTimer.current = null;
      if (!manual.current && !speechPending.current)
        void actions.current.submit();
    }, 2000);
    return () => {
      clearTimeout(secondsTimer);
      if (autoTimer.current) clearTimeout(autoTimer.current);
      autoTimer.current = null;
    };
  }, [automatic, ready, mode, text]);
  const chooseMode = (next: Mode) => {
    cancel();
    setError("");
    setMode(next);
    preferences.saveVoiceMode(next);
    setManual(false);
    if (next === "type") {
      audio.muteMicrophone();
      setPermission(false);
    }
  };
  return (
    <form
      id={"voice-form-" + stepId}
      className={styles.voiceForm}
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <div
        className={styles.inputModes}
        role="group"
        aria-label="Answer input method"
      >
        {(["handsfree", "hold", "type"] as Mode[]).map((value) => (
          <button
            type="button"
            key={value}
            aria-pressed={mode === value}
            disabled={
              value !== "type" &&
              (!available || (value === "handsfree" && !modern))
            }
            onClick={() => chooseMode(value)}
          >
            {value === "handsfree"
              ? "Hands-free"
              : value === "hold"
                ? "Hold to speak"
                : "Type"}
          </button>
        ))}
      </div>
      <label className={styles.languageControl}>
        Answer language
        <select
          value={language}
          disabled={busy}
          onChange={(e) => {
            edit();
            translationGeneration.current++;
            setTranslating(false);
            const selected = e.target.value as SpeechLanguage;
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
      {!available && (
        <p role="status">Live transcription is off. You can type.</p>
      )}
      {mode !== "type" && (
        <div className={styles.recorder}>
          <p role="status" aria-live="polite">
            {status === "permission"
              ? "Preparing microphone…"
              : status === "preparing"
                ? "Preparing capture…"
                : status === "recording"
                  ? `Listening · ${seconds}s / ${cap}s`
                  : status === "processing"
                    ? "Finishing transcription…"
                    : !permission
                      ? "Microphone off"
                      : blocked
                        ? "Listening paused · wait for your turn"
                        : mode === "handsfree" && !manualMode && remaining > 0
                          ? vadReady
                            ? "Listening for your answer"
                            : "Preparing hands-free…"
                          : `${Math.max(0, remaining)} recordings left`}
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
              {mode === "hold" && (
                <button
                  type="button"
                  className={styles.holdMic}
                  aria-label="Hold to speak, release to review"
                  disabled={
                    blocked || remaining <= 0 || status === "processing"
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
                    if (["recording", "preparing"].includes(statusRef.current))
                      cancel();
                  }}
                >
                  <Mic size={24} /> Hold to speak
                </button>
              )}
              {mode === "hold" && (
                <Button
                  type="button"
                  variant="text"
                  disabled={
                    blocked ||
                    status === "processing" ||
                    (remaining <= 0 && status === "idle")
                  }
                  onClick={() =>
                    statusRef.current === "idle" ? void start() : void finish()
                  }
                >
                  {status === "recording"
                    ? "Stop recording"
                    : "Start recording"}
                </Button>
              )}
              <Button
                type="button"
                variant="text"
                onClick={() => {
                  edit();
                  cancel();
                  audio.muteMicrophone();
                  setPermission(false);
                }}
              >
                <MicOff size={16} /> Mute mic
              </Button>
            </>
          )}
          {busy && (
            <Button
              type="button"
              variant="text"
              onClick={() => {
                edit();
                cancel();
              }}
            >
              Cancel recording
            </Button>
          )}
          {segments && (
            <p aria-live="polite" dir="auto">
              {segments}
            </p>
          )}
        </div>
      )}
      {(mode === "type" || draft.original) && (
        <>
          <label htmlFor={"answer-" + stepId}>
            {crossLanguage ? "Original answer" : label}
          </label>
          <textarea
            id={"answer-" + stepId}
            dir="auto"
            value={draft.original}
            disabled={busy}
            maxLength={maxLength}
            placeholder="Your words go here…"
            onFocus={edit}
            onChange={(e) => {
              edit();
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
          {!online && mode !== "type" && (
            <p className={styles.tiny}>
              Offline sample transcript · edit it before sending.
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
                Gameplay answer · {languageNames[roomLanguage]}
              </label>
              <textarea
                id={"gameplay-" + stepId}
                value={draft.gameplay}
                dir="auto"
                disabled={busy || translating}
                maxLength={maxLength}
                onFocus={edit}
                onChange={(e) => {
                  edit();
                  setDraft((d) => ({
                    ...d,
                    gameplay: e.target.value,
                    reviewed: d.original,
                  }));
                }}
              />
            </>
          )}
          {choices && (
            <p role="status">
              {matched
                ? `Selected: ${matched.text}`
                : "Say one visible option number or exact name, or tap a choice."}
            </p>
          )}
        </>
      )}
      {(draft.original || draft.attempts > 0) && (
        <div className={styles.secondaryActions}>
          <Button
            type="button"
            variant="text"
            onClick={() => {
              edit();
              document.getElementById("answer-" + stepId)?.focus();
            }}
          >
            Edit
          </Button>
          <Button
            type="button"
            variant="text"
            disabled={remaining <= 0 || busy || !permission || blocked}
            onClick={() => {
              cancel();
              setError("");
              append.current = false;
              setDraft((d) => ({
                ...d,
                original: "",
                gameplay: "",
                reviewed: "",
              }));
              setManual(false);
              if (mode !== "handsfree") void start(false);
            }}
          >
            Retry recording
          </Button>
        </div>
      )}
      {countdown !== null && (
        <p role="status">
          Sending in {countdown}…{" "}
          <Button type="button" variant="text" onClick={edit}>
            Cancel auto-send
          </Button>
        </p>
      )}
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      <Container>
        <Button type="submit" form={"voice-form-" + stepId} disabled={!ready}>
          {sending ? "Sending…" : busy ? "Listening…" : submitLabel}
          <ArrowRight size={18} />
        </Button>
      </Container>
    </form>
  );
}
