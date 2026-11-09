"use client";
import { Lobby } from "./lobby";
import { usePhaseDraft } from "../../session/phase-draft";
import { registerBackLayer } from "../../ui/back-layers";
import { uiCopy } from "../../content/ui.en";

import { useEffect, useState } from "react";
import { ArrowRight, Check, Fingerprint, LockKeyhole, X } from "lucide-react";
import { Avatar, Button, HostLine, Paper, Stamp } from "../../ui/primitives";
import {
  Heading,
  player,
  PlayerChoice,
  SecondaryActions,
  type ScreenProps,
} from "./shared";
import styles from "../game.module.css";
import type { FriendCard } from "@expose/shared/game/contracts";
import { ResultsShare } from "../results-share";
import { ActionDock } from "../../ui/action-dock";
export function Sync({ phase, snapshot, send }: ScreenProps) {
  const [selected, select] = usePhaseDraft<string | null>(
    `${snapshot.sessionId}:${snapshot.view.viewerId}:${snapshot.phaseEpoch}:prediction`,
    null,
  );
  if (phase.type !== "sync") return null;
  return (
    <>
      <Heading
        eyebrow="FINAL PREDICTION"
        description={
          phase.results
            ? "Your squad's picks."
            : "Choose one friend, then lock your prediction."
        }
      >
        {phase.question}
      </Heading>
      <div className={styles.choiceList}>
        {snapshot.players.map((p) =>
          phase.results ? (
            <div className={styles.predictionRow} key={p.id}>
              <Avatar
                name={p.name}
                variant={p.avatar}
                color={p.color}
                size={40}
              />
              <strong>{p.name}</strong>
              <span>
                {phase.results!.find((r) => r.playerId === p.id)?.count}
                {uiCopy.actThree.votes}
              </span>
            </div>
          ) : (
            <PlayerChoice
              key={p.id}
              p={p}
              selected={selected === p.id}
              onClick={() => select(p.id)}
              label={uiCopy.actThree.lockInYourPrediction}
            />
          ),
        )}
      </div>
      {!phase.results && (
        <ActionDock>
          <Button
            disabled={!selected}
            onClick={() =>
              selected && send({ type: "predict", playerId: selected })
            }
          >
            Lock prediction
          </Button>
        </ActionDock>
      )}
      {phase.results ? (
        <ActionDock>
          <Button onClick={() => send({ type: "next" })}>
            {uiCopy.actThree.hearHowTheNightEnds}
            <ArrowRight size={18} />
          </Button>
        </ActionDock>
      ) : (
        <SecondaryActions send={send} veto />
      )}
    </>
  );
}
export function Story({ phase, send }: ScreenProps) {
  if (phase.type !== "story") return null;
  return (
    <>
      <Heading
        eyebrow={uiCopy.actThree.basedOnYourSquadVeryLoosely}
        description={uiCopy.actThree.aScriptedTaleAssembledFromTonight}
      >
        {uiCopy.actThree.everySquad}
        <br />
        <em>{uiCopy.actThree.hasAStory}</em>
      </Heading>
      <Paper>
        <div className={styles.paperTop}>
          <span className={styles.paperLabel}>
            {uiCopy.actThree.hostelChroniclesVol01}
          </span>
          <Fingerprint size={22} />
        </div>
        <h2 className={styles.storyTitle}>{phase.title}</h2>
        <div className={styles.storyText}>
          {phase.paragraphs.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
        <div className={styles.paperRule} />
        <span className={styles.paperLabel}>
          {uiCopy.actThree.anyResemblanceToYourFriendsIs}
        </span>
      </Paper>
      <HostLine>
        {uiCopy.actThree.namesUnchangedDignitySlightlyAdjusted}
      </HostLine>
      <ActionDock>
        <Button onClick={() => send({ type: "next" })}>
          {uiCopy.actThree.bringInTheVerdict}
          <ArrowRight size={18} />
        </Button>
      </ActionDock>
    </>
  );
}
export function Verdict({ phase, snapshot, send }: ScreenProps) {
  if (phase.type !== "verdict") return null;
  const sorted = [...snapshot.players].sort((a, b) => b.score - a.score);
  return (
    <>
      <Heading
        eyebrow={uiCopy.actThree.theCourtOfQuestionableFriendships}
        description={
          phase.winners.length > 1
            ? uiCopy.actThree.aSharedCrownEquallySuspicious
            : uiCopy.actThree.oneFriendReadTheRoomBetter
        }
      >
        {uiCopy.actThree.theVerdict}
        <br />
        <em>{uiCopy.actThree.isIn}</em>
      </Heading>
      <div className={styles.winner}>
        <Avatar
          name={sorted[0].name}
          variant={sorted[0].avatar}
          color={sorted[0].color}
          size={110}
        />
        <Stamp dark>
          {phase.winners.length > 1
            ? uiCopy.actThree.jointWinners
            : uiCopy.actThree.chiefSuspect}
        </Stamp>
        <h2>
          {phase.winners.map((id) => player(snapshot, id).name).join(" & ")}
        </h2>
        <p>
          {phase.totalBluffs}
          {uiCopy.actThree.successfulBluffsPlentyOfEvidence}
        </p>
      </div>
      <div className={styles.scoreboard}>
        {sorted.map((p) => (
          <div key={p.id}>
            <span>{sorted.findIndex((x) => x.score === p.score) + 1}</span>
            <Avatar
              name={p.name}
              variant={p.avatar}
              color={p.color}
              size={37}
            />
            <strong>{p.name}</strong>
            <b>
              {p.score}
              <small>{uiCopy.actThree.pts}</small>
            </b>
          </div>
        ))}
      </div>
      <ActionDock>
        <Button onClick={() => send({ type: "next" })}>
          {uiCopy.actThree.openMyFriendDossier}
          <ArrowRight size={18} />
        </Button>
      </ActionDock>
    </>
  );
}

export function Dossier({ card }: { card: FriendCard }) {
  return (
    <Paper className={styles.dossier}>
      <div className={styles.paperTop}>
        <span className={styles.paperLabel}>
          {uiCopy.actThree.dossierSquadVerified}
        </span>
        <Fingerprint size={22} />
      </div>
      <div className={styles.dossierHero}>
        <div>
          <span className={styles.dossierName}>{card.name}</span>
          <p>
            {uiCopy.actThree.human}
            <br />
            {uiCopy.actThree.goodIntentions}
            <br />
            {uiCopy.actThree.questionableTiming}
          </p>
        </div>
        <Avatar
          name={card.name}
          variant={card.avatar}
          color={card.color}
          size={108}
        />
      </div>
      <h2 className={styles.dossierTitle}>{card.title}</h2>
      <div className={styles.dossierStats}>
        {card.traits.map((t) => (
          <div key={t.label}>
            <span>
              {t.label}
              <b>{t.value}%</b>
            </span>
            <div>
              <i style={{ width: `${t.value}%` }} />
            </div>
          </div>
        ))}
      </div>
      <blockquote>“{card.quote}”</blockquote>
      <div className={styles.dossierFoot}>
        <span>{card.caseId}</span>
        <Stamp>{uiCopy.actThree.onRecord}</Stamp>
      </div>
    </Paper>
  );
}
export function Card({ phase, send }: ScreenProps) {
  if (phase.type !== "card") return null;
  return (
    <>
      <Heading
        eyebrow={uiCopy.actThree.takeHomeTheReceipts}
        description={uiCopy.actThree.thisOneSAboutYouGive}
      >
        {uiCopy.actThree.yourOfficial}
        <br />
        <em>{uiCopy.actThree.unofficialRecord}</em>
      </Heading>
      <Dossier card={phase.card} />
      <div className={styles.spacer} />
      <ActionDock>
        <Button onClick={() => send({ type: "approve" })}>
          <Check size={18} />
          {uiCopy.actThree.approveMyCard}
        </Button>
      </ActionDock>
      <ActionDock>
        <Button variant="text" onClick={() => send({ type: "reject" })}>
          <X size={14} />
          {uiCopy.actThree.keepItPrivate}
        </Button>
      </ActionDock>
      <p className={styles.centerNote}>
        <LockKeyhole size={12} />
        {uiCopy.actThree.noPublicLinkOrUploadIs}
      </p>
    </>
  );
}
export function Summary(props: ScreenProps) {
  const { phase, audio } = props;
  const [inLobby, setInLobby] = useState(false);
  useEffect(() => {
    document.querySelector("#main")?.scrollTo({ top: 0 });
    if (inLobby) return registerBackLayer(() => setInLobby(false));
  }, [inLobby]);
  if (phase.type !== "summary") return null;
  if (inLobby) return <Lobby {...props} onResults={() => setInLobby(false)} />;
  return (
    <ResultsShare
      phase={phase}
      onLobby={() => {
        audio.cancelCapture();
        setInLobby(true);
      }}
    />
  );
}
