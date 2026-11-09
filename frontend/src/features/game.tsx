"use client";
import { Logo } from "../ui/logo";
import { uiCopy } from "../content/ui.en";

import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, CircleHelp, WifiOff } from "lucide-react";
import {
  useServices,
  usePlayerPreferences,
  useRecovery,
} from "../session/provider";
import {
  classicFlow,
  remixFlow,
  validateFlow,
} from "@expose/shared/game/definitions";
import type {
  GameSnapshot,
  IntentAction,
  StepType,
} from "@expose/shared/game/contracts";
import { copy } from "@expose/shared/game/content";
import { SoundToggle } from "./app-shell";
import { ActionDockContext } from "../ui/action-dock";
import app from "./app.module.css";
import { rendererRegistry } from "./screens";
import { Badge, Button, IconButton } from "../ui/primitives";
import { Dialog } from "../ui/dialog";
import type { AudioFailure } from "./voice-input";
import styles from "./game.module.css";
import ui from "../ui/ui.module.css";
import ux from "./competitive.module.css";
import { FeedbackSettings } from "./feedback-settings";
import { LockedState } from "./screens/spotlight";
import { NetworkSession } from "../session/network-session";
import { HostConversation } from "./host-conversation";
import { HostMoment, RevealedOriginals } from "./host-moment";
import { useMatchNavigation } from "./match-navigation";
import { Standings } from "./standings";
import {
  HostVoiceToggle,
  MicrophoneControl,
  QuestionSpeech,
  SpokenChoices,
} from "./question-speech";

validateFlow(classicFlow, new Set(Object.keys(rendererRegistry) as StepType[]));
validateFlow(remixFlow, new Set(Object.keys(rendererRegistry) as StepType[]));

function Countdown({ snapshot }: { snapshot: GameSnapshot }) {
  const { feedback } = useServices();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (snapshot.paused || snapshot.interrupted) return;
    const timer = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(timer);
  }, [snapshot.paused, snapshot.interrupted]);
  const seconds = snapshot.deadline
    ? Math.max(
        0,
        Math.ceil(
          (snapshot.deadline -
            (now || snapshot.deadline - snapshot.step.durationMs)) /
            1000,
        ),
      )
    : null;
  const fraction =
    seconds === null
      ? 1
      : Math.min(1, seconds / (snapshot.step.durationMs / 1000));
  const pending =
    snapshot.view.actionPending &&
    !snapshot.paused &&
    !snapshot.interrupted &&
    !snapshot.submitting &&
    (!snapshot.online || snapshot.connection === "connected");
  const timerId = `${snapshot.sessionId}:${snapshot.step.id}:${snapshot.phaseEpoch}:${snapshot.view.viewerId}`;
  useEffect(() => {
    if (seconds !== null) feedback.timer(timerId, seconds, pending);
    return () => feedback.cancelTimer();
  }, [seconds, pending, timerId, feedback]);
  if (
    snapshot.narration?.epoch === snapshot.phaseEpoch &&
    snapshot.narration.status !== "done"
  )
    return <Badge>LISTEN</Badge>;
  return seconds === null ? (
    <Badge>
      {snapshot.step.act === 0 ? uiCopy.game.lobbyLabel : uiCopy.game.noRush}
    </Badge>
  ) : (
    <span
      className={`${ui.timer} ${seconds <= 5 && pending ? ui.timerUrgent : ""}`}
      aria-label={`${seconds} seconds remaining${snapshot.paused ? uiCopy.game.paused : ""}`}
    >
      <svg width="23" height="23" viewBox="0 0 24 24" aria-hidden="true">
        <circle
          cx="12"
          cy="12"
          r="9"
          fill="none"
          stroke="var(--border)"
          strokeWidth="2"
        />
        <circle
          cx="12"
          cy="12"
          r="9"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeDasharray={`${56.55 * fraction} 56.55`}
          strokeLinecap="round"
        />
      </svg>
      {snapshot.paused
        ? "PAUSED"
        : `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`}
    </span>
  );
}

export function Game({
  developerTools,
  failure = "none",
}: {
  developerTools?: ReactNode;
  failure?: AudioFailure;
}) {
  const { session, audio, feedback, awake } = useServices();
  const preferences = usePlayerPreferences();
  const recovery = useRecovery();
  const requestLeave = useMatchNavigation();
  const [dock, setDock] = useState<HTMLFieldSetElement | null>(null);
  const snapshot = useSyncExternalStore(
    session.subscribe,
    session.getSnapshot,
    session.getSnapshot,
  );
  const [dialog, setDialog] = useState<"help" | "feedback" | "squad" | null>(
    null,
  );
  const router = useRouter();
  const viewer = snapshot.players.find((p) => p.id === snapshot.view.viewerId)!;
  const waitingForHost =
    snapshot.online &&
    !viewer.host &&
    [
      "waiting",
      "reveal",
      "spotlight-reveal",
      "sync-revealed",
      "story",
      "verdict",
    ].includes(snapshot.step.type);
  const identity = `${snapshot.sessionId}:${snapshot.step.id}:${snapshot.phaseEpoch}:${snapshot.view.viewerId}:${snapshot.interrupted}:${viewer.connected}:${viewer.controller}`;
  const previousIdentity = useRef(identity);
  const previousSnapshot = useRef(snapshot);
  useEffect(() => {
    if (previousIdentity.current === identity) {
      previousSnapshot.current = snapshot;
      return;
    }
    audio.cancelCapture();
    if (
      previousSnapshot.current.sessionId !== snapshot.sessionId ||
      (previousSnapshot.current.step.type === "summary" &&
        snapshot.step.type === "lobby")
    )
      audio.dispose();
    audio.discardUnsubmitted();
    audio.stopHighlight();
    feedback.cancel();
    // Announce transitions without stealing a user's focus during initial hydration.
    if (previousIdentity.current !== identity) {
      document
        .querySelector<HTMLElement>(uiCopy.game.mainH1)
        ?.focus({ preventScroll: true });
      document
        .querySelector("#main")
        ?.scrollTo({ top: 0, behavior: "instant" });
      const prior = previousSnapshot.current;
      if (
        snapshot.animateTransition &&
        snapshot.sessionId === prior.sessionId &&
        snapshot.view.viewerId === prior.view.viewerId
      ) {
        if (
          prior.view.actionPending &&
          prior.deadline !== null &&
          Date.now() >= prior.deadline &&
          snapshot.step.id !== prior.step.id
        )
          feedback.timer(
            `${prior.sessionId}:${prior.step.id}:${prior.phaseEpoch}:${prior.view.viewerId}`,
            0,
            true,
          );
        else if (snapshot.step.type === "traits")
          feedback.emit("start", `${identity}:start`);
        else if (
          snapshot.view.phase.type === "reveal" ||
          snapshot.view.phase.type === "spotlight-reveal"
        ) {
          const gain = snapshot.view.phase.scoreEvents
            .filter((e) => e.playerId === snapshot.view.viewerId)
            .reduce((sum, e) => sum + e.points, 0);
          feedback.emit(gain > 0 ? "win" : "reveal", `${identity}:reveal`);
        } else if (snapshot.view.actionPending)
          feedback.emit("turn", `${identity}:turn`);
        else if (snapshot.step.id === prior.step.id)
          feedback.emit("connection", `${identity}:connection`);
      }
    }
    previousIdentity.current = identity;
    previousSnapshot.current = snapshot;
  }, [identity, audio, feedback, snapshot]);
  useEffect(() => {
    const update = () =>
      void awake.setActive(
        recovery.active &&
          !recovery.blocked &&
          snapshot.step.act > 0 &&
          !["card", "summary"].includes(snapshot.step.type) &&
          preferences.feedback.keepAwake &&
          !document.hidden,
      );
    update();
    document.addEventListener("visibilitychange", update);
    return () => {
      document.removeEventListener("visibilitychange", update);
      void awake.setActive(false);
    };
  }, [
    awake,
    recovery.active,
    recovery.blocked,
    snapshot.step.act,
    snapshot.step.type,
    preferences.feedback.keepAwake,
  ]);
  useEffect(
    () => () => {
      audio.cancelCapture();
      audio.discardUnsubmitted();
      audio.stopHighlight();
      feedback.cancel();
    },
    [audio, feedback],
  );
  const send = async (action: IntentAction) => {
    try {
      await session.sendIntent({
        ...action,
        cid: crypto.randomUUID(),
        stepId: snapshot.step.id,
        phaseEpoch: snapshot.phaseEpoch,
      });
    } catch {
      return false;
    }
    const next = session.getSnapshot();
    if (
      !next.notice &&
      next.revision > snapshot.revision &&
      next.step.id === snapshot.step.id
    ) {
      if (action.type === "ready")
        feedback.emit("ready", `${identity}:${next.revision}:ready`);
      else if (next.view.submitted && !snapshot.view.submitted)
        feedback.emit("commit", `${identity}:commit`);
    }
    return true;
  };
  const Renderer = rendererRegistry[snapshot.view.phase.type];
  if (!developerTools && recovery.updateRequired)
    return (
      <main id="main" className={app.scroll}>
        <h1>Refresh for the new game.</h1>
        <p role="status">{recovery.notice}</p>
        <Button
          onClick={async () => {
            try {
              const registration =
                await navigator.serviceWorker?.getRegistration();
              await registration?.update();
              if (registration?.waiting) {
                navigator.serviceWorker.addEventListener(
                  "controllerchange",
                  () => window.location.reload(),
                  { once: true },
                );
                registration.waiting.postMessage({ type: "ACTIVATE_UPDATE" });
                return;
              }
            } catch {
              /* A normal refresh remains available. */
            }
            window.location.reload();
          }}
        >
          Refresh Expose
        </Button>
      </main>
    );
  if (
    !developerTools &&
    (!recovery.ready ||
      (snapshot.online && recovery.active && snapshot.protocol_version !== 6))
  )
    return (
      <main id="main" className={app.scroll}>
        <h1>Opening your case…</h1>
        <p role="status">
          {snapshot.notice ?? "Connecting to your room. Your seat stays yours."}
        </p>
        <Button variant="ghost" onClick={() => requestLeave()}>
          Back to home
        </Button>
      </main>
    );
  if (!developerTools && (!recovery.active || recovery.blocked))
    return (
      <main id="main" className={app.scroll}>
        <h1>
          {recovery.blocked
            ? "Your game is open in another tab."
            : recovery.resumable
              ? "Your case is still here."
              : "Ready for a new case?"}
        </h1>
        <p role="status">
          {recovery.blocked
            ? "Your locked answers and points are safe. Return to the original tab manually, or move play here. Unfinished text and recordings stay in the original tab and are discarded when control moves."
            : (recovery.notice ??
              "Your submitted answers and points can be restored.")}
        </p>
        {recovery.resumable && !recovery.blocked && (
          <Button onClick={() => void session.resume()}>Resume game</Button>
        )}
        {recovery.blocked && (
          <Button
            onClick={() => {
              if (session instanceof NetworkSession)
                void session.takeover().catch(() => {});
              else void session.initialize();
            }}
          >
            {snapshot.online ? "Play here instead" : "Retry connection"}
          </Button>
        )}
        <Button variant="ghost" onClick={() => router.push("/")}>
          Back to home
        </Button>
      </main>
    );
  return (
    <ActionDockContext.Provider value={dock}>
      {developerTools}
      <div className={styles.gameShell}>
        <header className={styles.topbar}>
          <div className={styles.topLeft}>
            <Button
              variant="text"
              aria-label="Leave game"
              onClick={() => requestLeave()}
            >
              <ArrowLeft size={16} /> Leave game
            </Button>
            <div>
              <span className={styles.topBrand}>
                <Logo compact />
              </span>
              <span className={styles.roomLabel}>
                {snapshot.roomCode}
                {uiCopy.game.local}
              </span>
            </div>
          </div>
          <SoundToggle />
          <HostVoiceToggle />
          <MicrophoneControl />
          <IconButton
            aria-label={uiCopy.game.howToPlay}
            onClick={() => setDialog("help")}
          >
            <CircleHelp size={18} />
          </IconButton>
        </header>
        <div className={styles.sessionStatus}>
          <span>ROOM {snapshot.roomCode}</span>
          {snapshot.step.type !== "lobby" && (
            <button
              className={styles.squadButton}
              onClick={() => setDialog("squad")}
            >
              Squad & scores
            </button>
          )}
          <Countdown
            key={`${snapshot.step.id}:${snapshot.phaseEpoch}`}
            snapshot={snapshot}
          />
        </div>
        <div
          className={styles.actProgress}
          aria-label={`Act ${snapshot.step.act} of 3`}
        >
          {[
            uiCopy.game.theLineup,
            snapshot.flowId.includes("spotlight")
              ? "The Spotlight"
              : uiCopy.game.theBluff,
            uiCopy.game.theVerdict,
          ].map((name, i) => (
            <div
              key={name}
              className={
                snapshot.step.act === i + 1
                  ? styles.currentAct
                  : snapshot.step.act > i + 1
                    ? styles.completeAct
                    : ""
              }
            >
              <span>
                {snapshot.step.act > i + 1 ? <Check size={11} /> : `0${i + 1}`}
              </span>
              {name}
            </div>
          ))}
        </div>
        <div
          className={styles.workspace}
          data-lobby={snapshot.step.type === "lobby"}
        >
          <div className={styles.questionPane}>
            <main
              id="main"
              data-step={snapshot.step.id}
              data-action-pending={snapshot.view.actionPending}
              className={styles.arena}
              key={`${snapshot.sessionId}:${snapshot.step.id}:${snapshot.phaseEpoch}:${snapshot.view.viewerId}:${failure}`}
            >
              {snapshot.online && snapshot.connection !== "connected" && (
                <p className={ux.status} role="status">
                  Connection lost. Your seat is reserved; answers will lock
                  after reconnecting.
                </p>
              )}
              {snapshot.online &&
                (snapshot.hostFlowVersion === 2 ? (
                  <HostMoment snapshot={snapshot} />
                ) : (
                  <HostConversation snapshot={snapshot} />
                ))}
              {snapshot.online && <QuestionSpeech snapshot={snapshot} />}
              {recovery.notice && (
                <p className={ux.status} role="status">
                  {recovery.notice}
                </p>
              )}
              {snapshot.players.some(
                (p) => !p.connected || p.controller === "ai",
              ) && (
                <div className={ux.status} role="status">
                  {snapshot.players
                    .filter((p) => !p.connected || p.controller === "ai")
                    .map((p) => (
                      <p key={p.id}>
                        <strong>{p.name}</strong> ·{" "}
                        {p.controller === "ai"
                          ? p.connected
                            ? "AI has locked this question. You take over next question."
                            : "AI playing · points stay with this seat"
                          : "Disconnected · seat reserved"}
                        {p.aiPoints !== 0 ? ` · AI points ${p.aiPoints}` : ""}
                      </p>
                    ))}
                  {!viewer.connected && (
                    <Button
                      variant="ghost"
                      onClick={() => session.reconnectSeat(viewer.id)}
                    >
                      Rejoin my seat
                    </Button>
                  )}
                </div>
              )}
              {snapshot.interrupted && (
                <div className={styles.interruption} role="alert">
                  <WifiOff size={20} />
                  <p>{copy.interruption}</p>
                  <Button
                    variant="ghost"
                    onClick={() => session.setInterrupted(false)}
                  >
                    {uiCopy.game.reconnectDemo}
                  </Button>
                </div>
              )}
              {snapshot.notice && (
                <p className={styles.notice} role="status">
                  {snapshot.notice}
                </p>
              )}
              <fieldset
                disabled={
                  snapshot.interrupted ||
                  (snapshot.narration?.epoch === snapshot.phaseEpoch &&
                    snapshot.narration.status !== "done") ||
                  (snapshot.online &&
                    (snapshot.connection !== "connected" ||
                      snapshot.submitting)) ||
                  (!["lobby", "summary"].includes(snapshot.step.type) &&
                    Boolean(snapshot.host?.deadline)) ||
                  !viewer.connected ||
                  viewer.controller === "ai"
                }
                className={styles.screenFieldset}
              >
                {snapshot.hostFlowVersion === 2 &&
                ((snapshot.hostBeat && snapshot.hostBeat.status !== "done") ||
                  ["callout", "story"].includes(
                    snapshot.step.type,
                  )) ? null : snapshot.view.submitted &&
                  (snapshot.view.required > 0 ||
                    (snapshot.online && snapshot.step.type === "card")) ? (
                  <LockedState snapshot={snapshot} />
                ) : (
                  <>
                    <Renderer
                      snapshot={snapshot}
                      phase={snapshot.view.phase}
                      send={send}
                      audio={audio}
                      failure={failure}
                    />
                    <SpokenChoices
                      snapshot={snapshot}
                      phase={snapshot.view.phase}
                      send={send}
                      audio={audio}
                      failure={failure}
                    />
                  </>
                )}
              </fieldset>

              <RevealedOriginals snapshot={snapshot} />
            </main>
            <div
              className={app.dock}
              data-action-dock
              aria-label="Session actions"
            >
              {waitingForHost && (
                <p role="status">Waiting for the host to continue.</p>
              )}
              <fieldset
                ref={setDock}
                disabled={
                  waitingForHost ||
                  (snapshot.narration?.epoch === snapshot.phaseEpoch &&
                    snapshot.narration.status !== "done") ||
                  snapshot.interrupted ||
                  (snapshot.online &&
                    (snapshot.connection !== "connected" ||
                      snapshot.submitting)) ||
                  (!["lobby", "summary"].includes(snapshot.step.type) &&
                    Boolean(snapshot.host?.deadline)) ||
                  !viewer.connected ||
                  viewer.controller === "ai"
                }
              />
            </div>
          </div>
          {snapshot.step.type !== "lobby" && (
            <aside className={styles.squadPane} aria-label="Squad progress">
              <p className={styles.note}>
                {snapshot.view.completed} of {snapshot.view.required} actions
                locked
              </p>
              <Standings
                players={snapshot.players}
                viewerId={snapshot.view.viewerId}
                animate={false}
              />
              <p className={styles.note}>
                Scores from the last committed result. Answers stay private
                until reveal.
              </p>
            </aside>
          )}
        </div>
      </div>
      {dialog === "squad" && (
        <Dialog title="Squad & scores" onClose={() => setDialog(null)}>
          <Standings
            players={snapshot.players}
            viewerId={snapshot.view.viewerId}
            animate={false}
          />
        </Dialog>
      )}
      {dialog === "feedback" && (
        <Dialog title="Sound & feel" onClose={() => setDialog(null)}>
          <FeedbackSettings />
        </Dialog>
      )}
      {dialog === "help" && (
        <Dialog
          title={uiCopy.game.aQuickBriefing}
          onClose={() => setDialog(null)}
        >
          <p>{uiCopy.game.rateTheSquadThenFindThe}</p>
          <p>
            {snapshot.flowId.includes("spotlight")
              ? `One private fact and one favourite pick per player. Matching facts earn ${snapshot.scoring.factMatch} points; a chosen favourite earns ${snapshot.scoring.favourite}. Ties share rank.`
              : uiCopy.game.scoring(snapshot.scoring)}
          </p>
          <p>{uiCopy.game.skipOrVetoAnyPromptSpeak}</p>
          <p>{uiCopy.game.allOtherPlayersAndTheHost}</p>
          <Button variant="ghost" onClick={() => setDialog("feedback")}>
            Sound & feel
          </Button>
          <Button onClick={() => setDialog(null)}>
            {uiCopy.game.gotIt}
            <Check size={17} />
          </Button>
        </Dialog>
      )}
    </ActionDockContext.Provider>
  );
}
