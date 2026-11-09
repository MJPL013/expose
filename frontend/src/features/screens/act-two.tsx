"use client";
import { Standings } from "../standings";
import { uiCopy } from "../../content/ui.en";

import { usePhaseDraft } from "../../session/phase-draft";
import { ActionDock } from "../../ui/action-dock";
import {
  ArrowRight,
  Check,
  CheckCheck,
  Fingerprint,
  LockKeyhole,
  Shuffle,
  Sparkles,
  Users,
} from "lucide-react";
import { Avatar, Button, Paper, Stamp } from "../../ui/primitives";
import {
  Heading,
  InputScreen,
  player,
  SecondaryActions,
  type ScreenProps,
} from "./shared";
import styles from "../game.module.css";
export function Catchphrase(props: ScreenProps) {
  if (props.phase.type !== "catchphrase") return null;
  return (
    <>
      <Heading
        eyebrow="YOUR SIGNATURE LINE"
        description="One line your friends will recognise."
      >
        {props.phase.prompt}
      </Heading>
      <InputScreen
        {...props}
        sample={props.phase.sample}
        label={uiCopy.actTwo.yourSignatureLine}
        submitLabel={uiCopy.actTwo.thatSMyLine}
      />
    </>
  );
}
export function Answer(props: ScreenProps) {
  const { phase, snapshot } = props;
  if (phase.type !== "answer") return null;
  const target = player(snapshot, phase.targetId);
  return (
    <>
      <Heading
        eyebrow={`BLUFF / ${phase.round + 1} OF ${snapshot.roundCount}`}
        description={
          phase.isTarget
            ? "Keep your answer secret."
            : `Bluff as ${target.name}.`
        }
      >
        {phase.prompt}
      </Heading>
      <InputScreen {...props} sample={phase.sample} />
    </>
  );
}
export function Waiting({ snapshot, send }: ScreenProps) {
  return (
    <div className={styles.waiting}>
      <div className={styles.waitingIcon}>
        <LockKeyhole size={42} strokeWidth={1.3} />
      </div>
      <Heading
        eyebrow={uiCopy.actTwo.evidenceSealed}
        description={uiCopy.actTwo.theSquadIsFinishingTheirStories}
      >
        {uiCopy.actTwo.aMoment}
        <br />
        <em>{uiCopy.actTwo.ofSuspense}</em>
      </Heading>
      <div className={styles.avatarStack}>
        {snapshot.players.map((p) => (
          <Avatar
            key={p.id}
            name={p.name}
            variant={p.avatar}
            color={p.color}
            size={46}
          />
        ))}
      </div>
      <span className={styles.tiny}>{uiCopy.actTwo.shufflingTheAnswers}</span>
      <ActionDock>
        <Button variant="ghost" onClick={() => send({ type: "next" })}>
          {uiCopy.actTwo.continueToTheVote}
          <ArrowRight size={17} />
        </Button>
      </ActionDock>
    </div>
  );
}
export function Vote({ phase, snapshot, send }: ScreenProps) {
  const [selected, setSelected] = usePhaseDraft<string | null>(
    `${snapshot.sessionId}:${snapshot.view.viewerId}:${snapshot.phaseEpoch}:vote`,
    phase.type === "vote" ? phase.selected : null,
  );
  if (phase.type !== "vote") return null;
  const target = player(snapshot, phase.targetId);
  const isTarget = phase.targetId === snapshot.view.viewerId;
  return (
    <>
      <Heading
        eyebrow={`BLUFF / ${phase.round + 1} OF ${snapshot.roundCount}`}
        description={
          phase.canVote
            ? `Pick ${target.name}'s real answer.`
            : isTarget
              ? uiCopy.actTwo.youReTheTargetThisRound
              : uiCopy.actTwo.yourVoteIsLockedTheSquad
        }
      >
        {phase.prompt}
      </Heading>
      <div
        className={styles.options}
        role="group"
        aria-label={uiCopy.actTwo.anonymousAnswers}
      >
        {phase.options.map((o, i) => (
          <button
            key={o.id}
            className={`${styles.option} ${selected === o.id ? styles.optionSelected : ""}`}
            onClick={() => setSelected(o.id)}
            disabled={!phase.canVote || o.isOwn}
            aria-pressed={selected === o.id}
          >
            <span className={styles.optionLetter}>
              {String.fromCharCode(65 + i)}
            </span>
            <span className={styles.optionText}>
              “{o.text}”
              {o.isOwn && <small>{uiCopy.actTwo.yourAnswerCannotVote}</small>}
            </span>
            <span className={styles.optionRadio}>
              {selected === o.id && <Check size={12} />}
            </span>
          </button>
        ))}
      </div>
      <div className={styles.voteFoot}>
        <LockKeyhole size={13} />
        <span>{uiCopy.actTwo.identitiesStayHiddenUntilTheReveal}</span>
      </div>
      <ActionDock>
        {phase.canVote ? (
          <Button
            disabled={!selected}
            onClick={() =>
              selected && send({ type: "vote", optionId: selected })
            }
          >
            {uiCopy.actTwo.lockInMyVote}
            <Fingerprint size={19} />
          </Button>
        ) : (
          <Button
            disabled={
              snapshot.flowId !== "hostel-classic" &&
              snapshot.flowId !== "hostel-remix"
            }
            onClick={() => send({ type: "next" })}
          >
            {isTarget
              ? uiCopy.actTwo.seeHowTheSquadVoted
              : uiCopy.actTwo.continueToReveal}{" "}
            <ArrowRight size={18} />
          </Button>
        )}
      </ActionDock>
      <SecondaryActions send={send} />
    </>
  );
}
export function Reveal({ phase, snapshot, send }: ScreenProps) {
  if (phase.type !== "reveal") return null;
  const truth = phase.options.find((o) => o.isTruth)!;
  const target = player(snapshot, phase.targetId);
  const mine = phase.scoreEvents
    .filter((e) => e.playerId === snapshot.view.viewerId)
    .reduce((sum, e) => sum + e.points, 0);
  return (
    <>
      <Heading
        eyebrow={`REVEAL / ROUND ${phase.round + 1}`}
        description={`Your round: +${mine} points`}
      >
        {target.name}’s real answer
      </Heading>
      <Paper>
        <div className={styles.paperTop}>
          <span className={styles.paperLabel}>
            {uiCopy.actTwo.theRealAnswer}
          </span>
          <Stamp>{uiCopy.actTwo.verified}</Stamp>
        </div>
        <div className={styles.truthAvatar}>
          <Avatar
            name={target.name}
            variant={target.avatar}
            color={target.color}
            size={72}
          />
        </div>
        <h2 className={styles.truthQuote}>“{truth.text}”</h2>
        <p className={styles.paperCaption}>
          {target.name}
          {uiCopy.actTwo.theOriginal}
        </p>
      </Paper>
      <div className={styles.scoreGain}>
        <span>{uiCopy.actTwo.yourRound}</span>
        <strong>
          {mine >= 0 ? "+" : ""}
          {mine} <small>{uiCopy.actTwo.pts}</small>
        </strong>
      </div>
      <details className={styles.resultDetails}>
        <summary>Votes and standings</summary>
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
                {o.isTruth ? (
                  <CheckCheck size={16} />
                ) : o.isAI ? (
                  <Sparkles size={16} />
                ) : (
                  <Users size={16} />
                )}
              </span>
              <div>
                <strong>
                  {o.authorName}
                  {o.isTruth
                    ? uiCopy.actTwo.realAnswer
                    : o.isAI
                      ? uiCopy.actTwo.decoy
                      : uiCopy.actTwo.bluff}
                </strong>
                <p>{o.text}</p>
                <small>
                  {o.voters.length
                    ? `Picked by ${o.voters.map((id) => player(snapshot, id).name).join(", ")}`
                    : uiCopy.actTwo.noVotes}
                </small>
              </div>
            </div>
          ))}
        </div>
      </details>

      <ActionDock>
        <Button onClick={() => send({ type: "next" })}>
          {phase.round + 1 < snapshot.roundCount
            ? uiCopy.actTwo.oneMoreRound
            : uiCopy.actTwo.proceedToTheAftermath}
          <ArrowRight size={18} />
        </Button>
      </ActionDock>
    </>
  );
}
export function Wildcard(props: ScreenProps) {
  if (props.phase.type !== "wildcard") return null;
  return (
    <>
      <Heading
        eyebrow={uiCopy.actTwo.optionalRoundWildcard}
        description={props.phase.prompt}
      >
        {uiCopy.actTwo.sameLine}
        <br />
        <em>{uiCopy.actTwo.worseExcuse}</em>
      </Heading>
      <div className={styles.wildcardIcon}>
        <Shuffle size={60} strokeWidth={1.2} />
      </div>
      <InputScreen
        {...props}
        sample={props.phase.sample}
        submitLabel={uiCopy.actTwo.submitMyRemix}
      />
    </>
  );
}
