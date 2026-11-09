"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowUpRight,
  Mic,
  MicOff,
  Settings2,
  History,
  LogOut,
  Send,
  SkipForward,
  Check,
  Download,
  Share2,
  RotateCcw,
  Trash2,
  Keyboard,
  Volume2,
} from "lucide-react";
import type {
  Persona,
  VoidLanguage,
  VoidView,
  VoiceMode,
  VoidIdentity,
  VoidIdentityView,
} from "@expose/shared/gc2";
import { ComparisonApproval } from "./comparison";
import { accountApi } from "../src/account/client";
import { Dialog } from "../src/ui/dialog";
import { useServices } from "../src/session/provider";
import { api, VoidClient, type Presence } from "./client";
import { Eclipse } from "./eclipse";
import { downloadCard, prepareCard } from "./card";
import styles from "./void.module.css";

type Me = VoidIdentityView;
type Entry = {
  id: string;
  date: string;
  status: string;
  language: VoidLanguage;
  persona?: Persona;
  processing?: "queued" | "running" | "ready" | "failed";
  graphStatus?: "queued" | "running" | "ready" | "failed";
  canRetryAnalysis?: boolean;
  canRetryGraph?: boolean;
  finished?: boolean;
  flowVersion?: 1 | 2;
};
const labels: Record<Presence, string> = {
  idle: "A little space for you",
  listening: "I'm listening",
  user: "Your space. Keep going.",
  thinking: "A moment to think",
  speaking: "The Void",
  paused: "Take your time",
  reveal: "A little of you, reflected",
  review: "Room for a little more?",
};

export function VoidExperience() {
  const router = useRouter();
  const [client] = useState(() => new VoidClient());
  const s = useSyncExternalStore(
    client.subscribe,
    client.getSnapshot,
    client.getSnapshot,
  );
  const { sounds } = useServices();
  const [me, setMe] = useState<Me | null>(null),
    [error, setError] = useState("");
  const [screen, setScreen] = useState<
    "landing" | "conversation" | "history" | "saved"
  >("landing");
  const [language, setLanguage] = useState<VoidLanguage>("en");
  const [busy, setBusy] = useState(false),
    [settings, setSettings] = useState(false),
    [draft, setDraft] = useState("");
  const [history, setHistory] = useState<Entry[]>([]),
    [saved, setSaved] = useState<Entry | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null),
    [leave, setLeave] = useState<string | null>(null);
  const [leaveGuest, setLeaveGuest] = useState(false);
  const [correction, setCorrection] = useState(false),
    [correctionText, setCorrectionText] = useState("");
  useEffect(() => {
    client.loadPreference();
    sounds.suppress("gc2", true);
    void api<Me>("/me")
      .then((identity) => {
        setMe(identity);
        if (
          !identity.account &&
          new URLSearchParams(window.location.search).get("signin") ===
            "cancelled"
        ) {
          setError(
            "Sign-in was cancelled. You can try again whenever you're ready.",
          );
        }
      })
      .catch((e) => setError(e.message));
    const pause = () => {
      if (document.hidden) client.pause();
    };
    const before = (event: BeforeUnloadEvent) => {
      if (
        client.getSnapshot().connected &&
        client.getSnapshot().view?.status !== "complete"
      ) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    const pagehide = () => client.pause();
    document.addEventListener("visibilitychange", pause);
    window.addEventListener("pagehide", pagehide);
    window.addEventListener("beforeunload", before);
    return () => {
      client.dispose();
      sounds.suppress("gc2", false);
      document.removeEventListener("visibilitychange", pause);
      window.removeEventListener("pagehide", pagehide);
      window.removeEventListener("beforeunload", before);
      delete document.documentElement.dataset.gc2Active;
    };
  }, [client, sounds]);
  useEffect(() => {
    document.documentElement.dataset.gc2Active = String(
      s.connected && s.view?.status !== "complete",
    );
  }, [s.connected, s.view?.status]);
  useEffect(() => {
    if (screen !== "history") return;
    let disposed = false;
    const timer = setInterval(() => {
      if (document.hidden) return;
      void api<{ sessions: Entry[] }>("/history")
        .then((r) => {
          if (!disposed) setHistory(r.sessions);
        })
        .catch(() => {});
    }, 5000);
    return () => {
      disposed = true;
      clearInterval(timer);
    };
  }, [screen]);
  const attempt = async (work: () => Promise<unknown>) => {
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  };
  const googleSignIn = () => {
    // OAuth is a server redirect to Google, so leave the Next router.
    window.location.assign(
      new URL(
        "/api/account/v1/auth/google?returnTo=/void",
        window.location.origin,
      ).href,
    );
  };
  const begin = async () =>
    attempt(async () => {
      if (!me) return;
      let identity = me.account;
      if (!identity) {
        if (me.guestAvailable) {
          const createGuest = () =>
            api<{ account: VoidIdentity }>("/auth/guest", "POST", {
              version: 1,
              accepted: true,
            });
          // Two tabs starting together reuse the cookie issued by the first tab.
          const result = navigator.locks
            ? await navigator.locks.request("expose-void-guest", createGuest)
            : await createGuest();
          identity = result.account;
          setMe({ ...me, account: identity });
        } else if (me.configured) {
          googleSignIn();
          return;
        } else {
          throw new Error(
            "The Void is temporarily unavailable. Please try again later.",
          );
        }
      }
      if (s.mode !== "type" && !(await client.enable())) return;
      if (s.mode === "type") await client.unlockAudio().catch(() => {});
      let v: VoidView;
      try {
        if (identity.onboardingVersion < 1) {
          await api("/onboarding", "POST", {
            version: 1,
            accepted: true,
          });
          setMe({ ...me, account: { ...identity, onboardingVersion: 1 } });
        }
        v = await api<VoidView>("/sessions", "POST", {
          language,
          storageConsent: true,
        });
      } catch (error) {
        client.mute();
        throw error;
      }
      client.defaultSpeechLanguage(v.language);
      setScreen("conversation");
      await client.connect(v.id, v.meaningfulTurns === 0);
    });
  const resume = async (id: string) =>
    attempt(async () => {
      if (s.mode !== "type" && !(await client.enable())) return;
      await client.unlockAudio().catch(() => {});
      setScreen("conversation");
      await client.connect(id);
    });
  const showHistory = async () =>
    attempt(async () => {
      client.pause();
      setHistory((await api<{ sessions: Entry[] }>("/history")).sessions);
      setScreen("history");
    });
  const active = screen === "conversation" && s.view;
  const visibleError =
    error ||
    (screen === "conversation" || screen === "landing" ? s.error : "") ||
    (active ? s.view?.error : "");
  const done = active && s.view?.status === "complete";
  const processing = Boolean(
    active && s.view?.processing && s.view.processing !== "ready",
  );
  const shouldConfirmExit = Boolean(active && !done && !processing);
  useEffect(() => {
    if (!shouldConfirmExit) return;
    const confirmLink = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const link = (event.target as Element)?.closest<HTMLAnchorElement>(
        "a[href]",
      );
      if (!link || link.target || link.download) return;
      const url = new URL(link.href);
      if (url.origin !== location.origin || url.pathname === location.pathname)
        return;
      event.preventDefault();
      event.stopPropagation();
      setLeave(url.pathname + url.search + url.hash);
    };
    document.addEventListener("click", confirmLink, true);
    return () => document.removeEventListener("click", confirmLink, true);
  }, [shouldConfirmExit]);
  const canAnswer =
    active &&
    !processing &&
    s.connected &&
    ["ready", "review", "error"].includes(s.view!.status) &&
    s.presence !== "speaking";
  const reveal = done
    ? s.view?.persona
    : screen === "saved"
      ? saved?.persona
      : undefined;
  const currentId = screen === "saved" ? saved?.id : s.view?.id;
  const status =
    s.presence === "user" && s.elapsed >= 50
      ? `${60 - s.elapsed}s · You can continue after this`
      : labels[s.presence];
  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <Link
          href="/"
          className={styles.brand}
          onClick={(e) => {
            if (active && !done) {
              e.preventDefault();
              setLeave("/");
            }
          }}
        >
          <ArrowLeft size={17} /> the void <small>by expose</small>
        </Link>
        <div className={styles.headerActions}>
          {me?.account && (
            <button
              className={styles.icon}
              aria-label="Private conversation history"
              onClick={() => void showHistory()}
              disabled={busy}
            >
              <History size={18} />
            </button>
          )}
          <button
            className={styles.icon}
            aria-label="Voice and language settings"
            onClick={() => setSettings(true)}
          >
            <Settings2 size={18} />
          </button>
        </div>
      </header>
      <main id="main" className={styles.content}>
        {screen === "landing" && (
          <section className={styles.landing}>
            <span className={styles.eyebrow}>
              A conversation with yourself. Almost.
            </span>
            <h1>
              Say something
              <br />
              <em>into the void.</em>
            </h1>
            <p className={styles.intro}>
              Small stories. Unexpected questions.
              <br />A little of you, reflected back.
            </p>
            <div className={styles.landingOrb}>
              <Eclipse />
            </div>
            {!me ? (
              <p className={styles.notice}>Finding your space…</p>
            ) : (
              <>
                <button
                  className={styles.primary}
                  onClick={() => void begin()}
                  disabled={busy || !me.available}
                >
                  {s.mode === "type" ? (
                    <Keyboard size={18} />
                  ) : (
                    <Mic size={18} />
                  )}
                  {busy
                    ? "Getting your space ready…"
                    : !me.account && me.guestAvailable
                      ? "Continue as guest"
                      : "Enter The Void"}
                </button>
                <button
                  className={styles.textButton}
                  onClick={() =>
                    client.setMode(s.mode === "type" ? "handsfree" : "type")
                  }
                >
                  {s.mode === "type" ? "Use my voice" : "I'd rather type"}
                </button>
                {!me.account && me.configured && me.guestAvailable && (
                  <button
                    className={styles.textButton}
                    onClick={googleSignIn}
                    disabled={busy}
                  >
                    Sign in with Google
                  </button>
                )}
                {!me.account && me.guestAvailable && (
                  <p className={styles.disclosure}>
                    By continuing, you agree to save recordings, transcripts and
                    reflections privately on this server until you delete them.
                    This browser remembers your guest profile; clearing its data
                    loses access.
                  </p>
                )}
                {me.account?.kind === "guest" && (
                  <p className={styles.disclosure}>
                    Guest · remembered in this browser
                  </p>
                )}
                {me.account && me.account.onboardingVersion < 1 && (
                  <p className={styles.disclosure}>
                    By entering, you agree to save completed voice recordings,
                    transcripts and reflections until you delete them. They help
                    The Void remember you. Comparisons with other people require
                    your separate approval.
                  </p>
                )}
                {!me.available && (
                  <p className={styles.notice}>
                    The AI is currently unavailable. Your saved conversations
                    are still here.
                  </p>
                )}
              </>
            )}
            {visibleError && (
              <p className={styles.error} role="alert">
                {visibleError}
              </p>
            )}
          </section>
        )}
        {screen === "history" && (
          <section className={styles.history}>
            <span className={styles.eyebrow}>Only yours</span>
            <h1>
              Things you&apos;ve
              <br />
              left with the void.
            </h1>
            <button
              className={styles.secondary}
              onClick={() => {
                setScreen("landing");
                setError("");
              }}
            >
              A new conversation <ArrowUpRight size={16} />
            </button>
            {!history.length && (
              <p className={styles.empty}>
                A little quiet here, for now. Your completed stories and
                reflections will live here.
              </p>
            )}
            {history.map((item) => (
              <article className={styles.historyItem} key={item.id}>
                <div>
                  <time dateTime={item.date}>
                    {new Date(item.date).toLocaleDateString(undefined, {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    })}
                  </time>
                  <h2>
                    {item.persona?.title ||
                      (item.processing === "failed"
                        ? item.canRetryAnalysis === false
                          ? "Saved · analysis unavailable"
                          : "Analysis needs a retry"
                        : item.processing === "queued" ||
                            item.processing === "running"
                          ? "Finding the connections"
                          : item.status === "complete"
                            ? "A little conversation"
                            : "A story in progress")}
                  </h2>
                  {item.persona && <p>{item.persona.quote}</p>}
                  {item.graphStatus === "failed" &&
                    item.canRetryGraph !== false && (
                      <button
                        className={styles.textButton}
                        onClick={() =>
                          void attempt(async () => {
                            await api(
                              `/sessions/${item.id}/retry-graph`,
                              "POST",
                              {},
                            );
                            await showHistory();
                          })
                        }
                      >
                        Retry story connections
                      </button>
                    )}
                </div>
                <div className={styles.row}>
                  <button
                    className={styles.secondary}
                    disabled={
                      (item.processing === "failed" &&
                        item.canRetryAnalysis === false) ||
                      item.processing === "queued" ||
                      item.processing === "running"
                    }
                    onClick={() =>
                      item.processing === "failed"
                        ? void attempt(async () => {
                            await api(
                              `/sessions/${item.id}/retry-analysis`,
                              "POST",
                              {},
                            );
                            await showHistory();
                          })
                        : item.status === "complete"
                          ? (setSaved(item), setScreen("saved"))
                          : void resume(item.id)
                    }
                  >
                    {item.processing === "failed"
                      ? item.canRetryAnalysis === false
                        ? "Retry limit reached"
                        : "Retry analysis"
                      : item.processing === "queued" ||
                          item.processing === "running"
                        ? "Processing…"
                        : item.status === "complete"
                          ? "Open"
                          : "Resume"}
                  </button>
                  <button
                    className={styles.icon}
                    aria-label="Delete this conversation"
                    onClick={() => setDeleting(item.id)}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </article>
            ))}
            {!!history.length && (
              <button
                className={styles.textButton}
                onClick={() => setDeleting("all")}
              >
                Delete all Void data
              </button>
            )}
          </section>
        )}
        {reveal && currentId && (
          <>
            <Reveal
              key={currentId}
              persona={reveal}
              feedback={screen === "saved" ? undefined : s.view?.feedback}
              onFeedback={(feedback) =>
                void attempt(() =>
                  api(`/sessions/${currentId}/feedback`, "POST", { feedback }),
                )
              }
              onCorrect={
                s.view?.flowVersion === 2 ||
                saved?.flowVersion === 2 ||
                s.view?.reflection
                  ? () => {
                      client.mute();
                      setCorrection(true);
                    }
                  : undefined
              }
              onAgain={() => {
                client.pause();
                setScreen("landing");
              }}
            />
            <ComparisonApproval sessionId={currentId} />
          </>
        )}
        {processing && (
          <section className={styles.conversation}>
            <div className={styles.orbStage}>
              <Eclipse state="thinking" />
            </div>
            <h1 className={styles.caption}>
              {s.view?.processing === "failed"
                ? "Your stories are safe. Analysis needs another try."
                : "Your stories are saved. Finding the connections."}
            </h1>
            <p className={styles.notice}>
              You can leave now. Your reflection will appear in private history.
            </p>
            <button
              className={styles.secondary}
              onClick={() => void showHistory()}
            >
              Open history
            </button>
          </section>
        )}
        {((active && !reveal && !processing) ||
          (screen === "saved" && !reveal)) && (
          <section className={styles.conversation}>
            <div className={styles.orbStage}>
              <Eclipse
                state={s.presence}
                sample={() => client.sampleAmplitude()}
              />
            </div>
            <div className={styles.status} role="status" aria-live="polite">
              {s.view?.wrapSuggested && s.presence !== "speaking"
                ? "We can keep talking, or finish whenever you like."
                : status}
            </div>
            <h1 className={styles.caption}>
              {screen === "saved"
                ? "Some stories don't need a label. Yours are saved here."
                : s.view?.caption.text}
            </h1>
            {s.view?.reflection && !done && (
              <p className={styles.reflection}>
                <strong>What I understood:</strong> {s.view.reflection.text}
                <button
                  onClick={() => {
                    client.mute();
                    setCorrection(true);
                  }}
                >
                  Not quite
                </button>
              </p>
            )}
            {active && s.audioBlocked && (
              <div className={styles.row}>
                <button
                  className={styles.secondary}
                  onClick={() => client.continueWithoutAudio()}
                >
                  Continue with captions
                </button>
                {s.view?.caption.audioId && (
                  <button
                    className={styles.icon}
                    aria-label="Play AI voice"
                    onClick={() => client.replay()}
                  >
                    <Volume2 size={18} />
                  </button>
                )}
              </div>
            )}
            {active && !s.connected && (
              <button
                className={styles.primary}
                onClick={() => void resume(s.view!.id)}
                disabled={busy}
              >
                Resume conversation
              </button>
            )}
            {active && s.view?.status === "review" && s.connected && (
              <div className={styles.row}>
                <button
                  className={styles.secondary}
                  onClick={() =>
                    void client.enable().then((ok) => {
                      if (ok) client.continueCapture();
                    })
                  }
                >
                  Continue speaking
                </button>
                <button
                  className={styles.primary}
                  onClick={() => client.action("pending.send")}
                >
                  Send this thought <Send size={16} />
                </button>
              </div>
            )}
            {active && s.mode === "type" && !done && (
              <form
                className={styles.composer}
                onSubmit={(e) => {
                  e.preventDefault();
                  client.answer(draft);
                  setDraft("");
                }}
              >
                <textarea
                  aria-label="Your thought"
                  placeholder="What's on your mind?"
                  value={draft}
                  maxLength={4000}
                  onChange={(e) => setDraft(e.target.value)}
                />
                <button
                  className={styles.primary}
                  aria-label="Send thought"
                  disabled={!draft.trim() || !canAnswer}
                >
                  <Send size={18} />
                </button>
              </form>
            )}
            {done && !reveal && (
              <button
                className={styles.secondary}
                onClick={() => {
                  client.pause();
                  setScreen("landing");
                }}
              >
                Come back with another story <ArrowUpRight size={16} />
              </button>
            )}
          </section>
        )}
        {visibleError && screen !== "landing" && (
          <p className={styles.error} role="alert">
            {visibleError}
            {s.view?.status === "error" && s.connected && (
              <button
                className={styles.textButton}
                onClick={() => client.action("retry")}
              >
                Try again
              </button>
            )}
          </p>
        )}
      </main>
      {active && !done && !processing && (
        <footer className={styles.dock}>
          {s.mode !== "type" && (
            <button
              className={styles.dockButton}
              data-active={!s.muted}
              onClick={() => (s.muted ? void client.enable() : client.mute())}
              aria-pressed={s.muted}
            >
              {s.muted ? <MicOff size={18} /> : <Mic size={18} />}
              {s.muted ? "Enable mic" : "Mute"}
            </button>
          )}
          {s.mode === "tap" && (
            <button
              className={styles.primary}
              onClick={() =>
                s.presence === "user"
                  ? client.stopCapture(false)
                  : client.startCapture()
              }
              disabled={(s.presence !== "user" && !canAnswer) || s.muted}
            >
              {s.presence === "user" ? "Done speaking" : "Tap to talk"}
            </button>
          )}
          <button
            className={styles.dockButton}
            onClick={() => client.action("skip")}
            disabled={!canAnswer}
          >
            <SkipForward size={16} />
            Skip
          </button>
          <button
            className={styles.dockButton}
            onClick={() => client.action("finish")}
            disabled={!canAnswer}
          >
            <Check size={16} />
            Finish
          </button>
        </footer>
      )}
      {settings && (
        <Dialog
          title="Make yourself comfortable"
          onClose={() => setSettings(false)}
        >
          <div className={styles.settings}>
            <label>
              Conversation language
              <select
                aria-label="Conversation language"
                value={active ? s.view!.language : language}
                onChange={(e) => {
                  setLanguage(e.target.value as VoidLanguage);
                  client.defaultSpeechLanguage(e.target.value as VoidLanguage);
                }}
                disabled={!!active}
              >
                <option value="en">English</option>
                <option value="hi">Hindi</option>
                <option value="hinglish">Hinglish</option>
              </select>
            </label>
            <label>
              Your input
              <select
                aria-label="Your input"
                value={s.mode}
                onChange={(e) => client.setMode(e.target.value as VoiceMode)}
              >
                <option value="handsfree">Hands-free</option>
                <option value="tap">Tap to talk</option>
                <option value="type">Type</option>
              </select>
            </label>
            <label>
              Microphone language
              <select
                aria-label="Microphone language"
                value={s.speechLanguage}
                onChange={(e) =>
                  client.setSpeechLanguage(
                    e.target.value as typeof s.speechLanguage,
                  )
                }
              >
                <option value="en-IN">English</option>
                <option value="hi-IN">Hindi / Hinglish</option>
                <option value="te-IN">Telugu</option>
              </select>
            </label>
            <p>
              Voice turns are saved. Background listening stays on your device.
              You can delete conversations from your private history.
            </p>
            {active && s.view?.caption.audioId && (
              <button
                className={styles.secondary}
                onClick={() => {
                  setSettings(false);
                  client.replay();
                }}
              >
                <Volume2 size={16} />
                Replay AI voice
              </button>
            )}
            {me?.account && (
              <button
                className={styles.secondary}
                onClick={() => {
                  if (me.account?.kind === "guest") {
                    setSettings(false);
                    setLeaveGuest(true);
                    return;
                  }
                  void attempt(async () => {
                    client.pause();
                    await accountApi("/auth/logout", "POST", {});
                    setMe({ ...me, account: null });
                    setScreen("landing");
                    setSettings(false);
                  });
                }}
              >
                <LogOut size={16} />
                {me.account.kind === "guest"
                  ? "Leave guest profile"
                  : "Sign out"}
              </button>
            )}
          </div>
        </Dialog>
      )}
      {leaveGuest && (
        <Dialog
          title="Leave this guest profile?"
          onClose={() => setLeaveGuest(false)}
        >
          <p className={styles.notice}>
            This browser will forget your guest profile. You won&apos;t be able
            to reopen its saved conversations. To remove the saved data too,
            delete it from your history before leaving.
          </p>
          <button
            className={styles.secondary}
            onClick={() => setLeaveGuest(false)}
            disabled={busy}
          >
            Keep my profile
          </button>
          <button
            className={styles.primary}
            disabled={busy}
            onClick={() =>
              void attempt(async () => {
                client.pause();
                await api("/auth/guest/logout", "POST", {});
                setMe(await api<Me>("/me"));
                setScreen("landing");
                setLeaveGuest(false);
              })
            }
          >
            Leave guest profile
          </button>
        </Dialog>
      )}
      {correction && (
        <Dialog title="What did I miss?" onClose={() => setCorrection(false)}>
          <p className={styles.notice}>
            Tell me how to understand it better. Your original story stays
            unchanged.
          </p>
          <form
            className={styles.composer}
            onSubmit={(e) => {
              e.preventDefault();
              void attempt(async () => {
                const id = currentId;
                if (!id) return;
                if (s.view?.flowVersion === 1 && s.view.reflection) {
                  if (!s.connected) await client.connect(id);
                  client.correct(s.view.reflection.turnId, correctionText);
                } else {
                  await api(`/sessions/${id}/correction`, "POST", {
                    text: correctionText,
                  });
                  client.pause();
                  await showHistory();
                }
                setCorrection(false);
                setCorrectionText("");
              });
            }}
          >
            <textarea
              aria-label="Correct the reflection"
              maxLength={1000}
              value={correctionText}
              onChange={(e) => setCorrectionText(e.target.value)}
            />
            <button
              className={styles.primary}
              disabled={!correctionText.trim()}
            >
              Update interpretation
            </button>
          </form>
        </Dialog>
      )}
      {deleting && (
        <Dialog
          title={
            deleting === "all"
              ? "Delete all your Void data?"
              : "Let this conversation go?"
          }
          onClose={() => setDeleting(null)}
        >
          <p>
            Your recordings, transcripts, reflections and the memories derived
            from them will be removed.
          </p>
          <div className={styles.row}>
            <button
              className={styles.secondary}
              onClick={() => setDeleting(null)}
            >
              Keep it
            </button>
            <button
              className={styles.primary}
              disabled={busy}
              onClick={() =>
                void attempt(async () => {
                  client.pause();
                  await api(
                    deleting === "all" ? "/data" : `/sessions/${deleting}`,
                    "DELETE",
                  );
                  setDeleting(null);
                  await showHistory();
                })
              }
            >
              Delete
            </button>
          </div>
        </Dialog>
      )}
      {leave && (
        <Dialog
          title="Leave your space for now?"
          onClose={() => setLeave(null)}
        >
          <p>Your completed turns are saved. Your microphone will stop.</p>
          <div className={styles.row}>
            <button className={styles.secondary} onClick={() => setLeave(null)}>
              Stay here
            </button>
            <button
              className={styles.primary}
              onClick={() => {
                client.pause();
                setLeave(null);
                router.push(leave);
              }}
            >
              Leave
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
}

function Reveal({
  persona,
  feedback,
  onFeedback,
  onCorrect,
  onAgain,
}: {
  persona: Persona;
  feedback?: string;
  onFeedback: (value: string) => void;
  onCorrect?: () => void;
  onAgain: () => void;
}) {
  const [approved, setApproved] = useState(false),
    [file, setFile] = useState<File | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    if (approved)
      void prepareCard(persona)
        .then((f) => {
          if (active) setFile(f);
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    return () => {
      active = false;
    };
  }, [approved, persona]);
  const share = async () => {
    if (!file) return;
    try {
      if (navigator.canShare?.({ files: [file] }))
        await navigator.share({
          files: [file],
          title: "A little of me, reflected",
        });
      else downloadCard(file);
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError"))
        setError("Sharing isn't available here. You can download your card.");
    }
  };
  return (
    <section className={styles.reveal}>
      <div className={styles.revealMark}>
        <Eclipse state="reveal" />
      </div>
      <span className={styles.eyebrow}>A little of you, reflected</span>
      <h1 className={styles.quote}>{persona.quote}</h1>
      <p className={styles.attribution}>
        AI-written · Inspired by your stories
      </p>
      <article className={styles.persona}>
        <span className={styles.eyebrow}>You came through as</span>
        <h2>{persona.title}</h2>
        {persona.observations.map((o, i) => (
          <p key={i}>{o.text}</p>
        ))}
      </article>
      <div className={styles.feedback}>
        {[
          ["spot-on", "Spot on"],
          ["mostly", "Mostly"],
          ["not-me", "Not me"],
        ].map(([key, label]) => (
          <button
            className={styles.secondary}
            key={key}
            aria-pressed={feedback === key}
            onClick={() => onFeedback(key)}
          >
            {label}
          </button>
        ))}
        {onCorrect && (
          <button className={styles.textButton} onClick={onCorrect}>
            Make a correction
          </button>
        )}
      </div>
      <label className={styles.approval}>
        <input
          type="checkbox"
          checked={approved}
          onChange={(e) => {
            setApproved(e.target.checked);
            if (!e.target.checked) setFile(null);
          }}
        />
        I&apos;m happy to share this quote and title
      </label>
      <div className={styles.row}>
        <button
          className={styles.primary}
          disabled={!approved || !file}
          onClick={() => void share()}
        >
          <Share2 size={17} />
          Share card
        </button>
        <button
          className={styles.secondary}
          disabled={!approved || !file}
          onClick={() => file && downloadCard(file)}
        >
          <Download size={17} />
          Download
        </button>
      </div>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <button className={styles.textButton} onClick={onAgain}>
        <RotateCcw size={13} /> Another conversation
      </button>
    </section>
  );
}
