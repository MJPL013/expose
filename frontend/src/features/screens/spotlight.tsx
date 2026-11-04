"use client";
import { ClipPlayer } from "../clip-player";
import { usePhaseDraft } from "../../session/phase-draft";
import { Check, ArrowRight } from "lucide-react";
import { competitiveCopy as c } from "../../content/competitive.en";
import { Button, Paper, Stamp } from "../../ui/primitives";
import { ActionDock } from "../../ui/action-dock";
import { Heading, player, type ScreenProps } from "./shared";
import { VoiceInput } from "../voice-input";
import { Standings } from "../standings";
import styles from "../game.module.css";
import ux from "../competitive.module.css";

export function LockedState({ snapshot }: Pick<ScreenProps, "snapshot">) {
  return (
    <div className={ux.waiting} role="status">
      <Heading eyebrow="ANSWER SEALED" description={c.waiting}>
        {c.locked}
      </Heading>
      <div className={ux.counter}>
        {snapshot.view.completed} / {snapshot.view.required}
      </div>
      <p>Players finished</p>
      <ActionDock>
        <Button disabled>
          <Check size={18} /> Locked
        </Button>
      </ActionDock>
    </div>
  );
}
export function Spotlight(props: ScreenProps) {
  const { phase, snapshot, send, audio, failure } = props;
  const [selected, setSelected] = usePhaseDraft<string | null>(
    `${snapshot.sessionId}:${snapshot.view.viewerId}:${snapshot.phaseEpoch}:choice`,
    null,
  );
  if (
    phase.type !== "secret" &&
    phase.type !== "guess" &&
    phase.type !== "judge"
  )
    return null;
  const target = player(snapshot, phase.targetId);
  const pending = snapshot.view.actionPending;
  return (
    <>
      <Heading
        eyebrow={`${phase.kind === "fact" ? c.facts : c.favourites} / ${phase.round + 1} OF ${snapshot.roundCount}`}
        description={
          phase.type === "secret"
            ? pending
              ? "Keep your answer secret."
              : c.waitSecret
            : phase.type === "judge"
              ? c.waitJudge
              : phase.kind === "fact"
                ? `Guess ${target.name}'s answer.`
                : `Write an answer ${target.name} will choose.`
        }
      >
        {phase.prompt}
      </Heading>
      <details className={styles.resultDetails}>
        <summary>How points work</summary>
        <p className={styles.paperCaption}>
          +
          {phase.kind === "fact"
            ? snapshot.scoring.factMatch
            : snapshot.scoring.favourite}{" "}
          points{" "}
          {phase.kind === "fact"
            ? "for every matching answer"
            : "for the chosen answer"}
        </p>
      </details>
      {phase.standIn && <p className={ux.status}>{c.standIn}</p>}
      {pending && phase.type !== "judge" ? (
        <>
          <VoiceInput
            key={`${snapshot.step.id}:${snapshot.phaseEpoch}`}
            audio={audio}
            ownerId={snapshot.view.viewerId}
            stepId={snapshot.step.id}
            sample={phase.sample}
            failure={failure}
            maxLength={80}
            maxRecordingSeconds={
              phase.type === "secret" ? (snapshot.online ? 5 : 3) : 8
            }
            submitLabel={c.lock}
            onSubmit={(text, source) =>
              send({ type: "submit", text, ...source })
            }
          />
          <ActionDock>
            <div className={styles.secondaryActions}>
              <Button variant="text" onClick={() => send({ type: "veto" })}>
                Replace question
              </Button>
              <Button variant="text" onClick={() => send({ type: "skip" })}>
                {c.pass}
              </Button>
            </div>
          </ActionDock>
        </>
      ) : pending ? (
        <>
          <div
            className={styles.options}
            role="group"
            aria-label="Anonymous answers"
          >
            {phase.options.map((o, i) => (
              <button
                key={o.id}
                className={`${styles.option} ${selected === o.id ? styles.optionSelected : ""}`}
                aria-pressed={selected === o.id}
                onClick={() => setSelected(o.id)}
              >
                <span className={styles.optionLetter}>
                  {String.fromCharCode(65 + i)}
                </span>
                <span className={styles.optionText}>{o.text}</span>
                <span className={styles.optionRadio}>
                  {selected === o.id && <Check size={12} />}
                </span>
              </button>
            ))}
          </div>
          <ActionDock>
            <Button
              disabled={!selected}
              onClick={() =>
                selected && send({ type: "vote", optionId: selected })
              }
            >
              {c.pick}
              <Check size={18} />
            </Button>
            <Button variant="text" onClick={() => send({ type: "skip" })}>
              {c.none}
            </Button>
          </ActionDock>
        </>
      ) : (
        <div className={ux.waiting} role="status">
          <p>
            {phase.type === "guess"
              ? c.targetWait
              : phase.type === "secret"
                ? c.waitSecret
                : c.waitJudge}
          </p>
          <span className={ux.counter}>
            {snapshot.view.completed} / {snapshot.view.required}
          </span>
          <ActionDock>
            <Button disabled>Waiting for the squad</Button>
          </ActionDock>
        </div>
      )}
    </>
  );
}
export function SpotlightReveal({ phase, snapshot, send, audio }: ScreenProps) {
  if (phase.type !== "spotlight-reveal") return null;
  const points = phase.scoreEvents
    .filter((e) => e.playerId === snapshot.view.viewerId)
    .reduce((total, e) => total + e.points, 0);
  const target = player(snapshot, phase.targetId);
  const clip = audio
    .getClips()
    .find(
      (c) =>
        c.ownerId === snapshot.view.viewerId &&
        (c.stepId === `guess-${phase.round}` ||
          c.stepId === `secret-${phase.round}`) &&
        c.submitted &&
        c.consent,
    );
  return (
    <>
      <Heading
        eyebrow={`REVEAL / ${phase.round + 1} OF ${snapshot.roundCount}`}
        description={phase.prompt}
      >
        {c.reveal}
      </Heading>
      <Paper>
        <div className={styles.paperTop}>
          <span className={styles.paperLabel}>
            {target.name}’s{" "}
            {phase.kind === "fact" ? "locked answer" : "favourite"}
          </span>
          <Stamp>{phase.answer ? "ON RECORD" : "PASSED"}</Stamp>
        </div>
        <h2 className={styles.truthQuote}>{phase.answer ?? c.noWinner}</h2>
        {phase.standIn && <p className={styles.paperCaption}>{c.standIn}</p>}
      </Paper>
      <div className={styles.scoreGain}>
        <span>Your round</span>
        <strong>
          +{points} <small>pts</small>
        </strong>
      </div>
      <details className={styles.resultDetails}>
        <summary>Answers and standings</summary>
        <Standings
          viewerId={snapshot.view.viewerId}
          players={snapshot.players}
          events={phase.scoreEvents}
          animate={snapshot.animateTransition}
        />
        <div className={styles.revealList}>
          {phase.options.map((o) => (
            <div key={o.id}>
              <span className={styles.revealMark}>
                {o.selected && <Check size={18} />}
              </span>
              <div>
                <strong>
                  {o.authors
                    .map((id) => player(snapshot, id).name)
                    .join(" & ") || "AI bait"}
                  {o.isAI && o.authors.length > 0
                    ? " · also matched AI bait"
                    : ""}
                </strong>
                <p>{o.text}</p>
              </div>
            </div>
          ))}
        </div>
      </details>
      {clip && (
        <ClipPlayer
          src={clip.url}
          controls
          aria-label="Your opted-in recording"
        />
      )}
      <ActionDock>
        <Button onClick={() => send({ type: "next" })}>
          {phase.round + 1 === snapshot.roundCount
            ? "Continue to the aftermath"
            : c.next}
          <ArrowRight size={18} />
        </Button>
      </ActionDock>
    </>
  );
}
