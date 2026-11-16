"use client";
import { uiCopy } from "../../content/ui.en";
import { pack } from "@expose/shared/game/content";
import { ActionDock } from "../../ui/action-dock";
import { RatingTuner } from "../rating-tuner";

import { usePhaseDraft } from "../../session/phase-draft";
import { ArrowRight, Check } from "lucide-react";
import { Avatar, Button, Paper, Stamp } from "../../ui/primitives";
import {
  Heading,
  InputScreen,
  player,
  PlayerChoice,
  SecondaryActions,
  type ScreenProps,
} from "./shared";
import styles from "../game.module.css";
export function Traits(props: ScreenProps) {
  const { phase, snapshot, send } = props;
  const scope = `${snapshot.sessionId}:${snapshot.view.viewerId}:${snapshot.phaseEpoch}:traits`;
  const [self, setSelf] = usePhaseDraft<(number | null)[]>(scope + ":self", [
    null,
    null,
    null,
  ]);
  const [friend, setFriend] = usePhaseDraft<(number | null)[]>(
    scope + ":friend",
    [null, null, null],
  );
  const [tab, setTab] = usePhaseDraft<"self" | "friend">(
    scope + ":tab",
    "self",
  );
  if (phase.type !== "traits") return null;
  const target = player(snapshot, phase.friendId);
  const viewer = player(snapshot, snapshot.view.viewerId);
  const values = tab === "self" ? self : friend;
  return (
    <>
      <Heading
        eyebrow="GET TO KNOW THE SQUAD"
        description="0 is balanced. Move toward the side that fits; 5 is strongest."
      >
        You → Your friend
      </Heading>
      <div className={styles.segmented}>
        <button aria-pressed={tab === "self"} onClick={() => setTab("self")}>
          You · {self.filter((v) => v !== null).length}/3
        </button>
        <button
          aria-pressed={tab === "friend"}
          onClick={() => setTab("friend")}
        >
          Your friend · {friend.filter((v) => v !== null).length}/3
        </button>
      </div>
      <div className={styles.traitSubject}>
        <Avatar
          name={tab === "self" ? viewer.name : target.name}
          variant={tab === "self" ? viewer.avatar : target.avatar}
          color={tab === "self" ? viewer.color : target.color}
          size={68}
        />
        <div>
          <h3>
            {tab === "self"
              ? uiCopy.actOne.yourSideOfTheStory
              : `${target.name}, according to you`}
          </h3>
        </div>
      </div>
      <div className={styles.traitList}>
        {phase.traits.map((t, i) => (
          <RatingTuner
            key={`${tab}:${t.id}`}
            label={`${tab === "self" ? "Your" : target.name + "’s"} ${t.id} rating`}
            left={t.left}
            right={t.right}
            value={values[i] ?? null}
            onChange={(value) => {
              const next = [...values];
              next[i] = value;
              if (tab === "self") setSelf(next);
              else setFriend(next);
            }}
          />
        ))}
      </div>
      <ActionDock>
        {tab === "self" ? (
          <Button
            disabled={self.some((v) => v == null)}
            onClick={() => setTab("friend")}
          >
            {uiCopy.actOne.nowRate}
            {target.name} <ArrowRight size={18} />
          </Button>
        ) : (
          <Button
            disabled={[...self, ...friend].some((v) => v == null)}
            onClick={() =>
              send({
                type: "traits",
                self: self as number[],
                friend: friend as number[],
              })
            }
          >
            {uiCopy.actOne.submitBothRatings}
            <Check size={18} />
          </Button>
        )}
      </ActionDock>
      <SecondaryActions send={send} />
    </>
  );
}
export function Nomination({ phase, snapshot, send }: ScreenProps) {
  const [selected, select] = usePhaseDraft<string | null>(
    `${snapshot.sessionId}:${snapshot.view.viewerId}:${snapshot.phaseEpoch}:nomination`,
    null,
  );
  if (phase.type !== "nomination") return null;
  return (
    <>
      <Heading
        eyebrow="NOMINATE A FRIEND"
        description="Choose one friend, then lock your choice."
      >
        {phase.question}
      </Heading>
      <div className={styles.choiceList}>
        {snapshot.players.map((p) => (
          <PlayerChoice
            key={p.id}
            p={p}
            selected={selected === p.id}
            onClick={() => select(p.id)}
          />
        ))}
      </div>
      <ActionDock>
        <Button
          disabled={!selected}
          onClick={() =>
            selected && send({ type: "nominate", playerId: selected })
          }
        >
          Lock choice <Check size={18} />
        </Button>
      </ActionDock>
      <SecondaryActions send={send} veto />
    </>
  );
}
export function Callout(props: ScreenProps) {
  if (props.phase.type !== "callout") return null;
  const c = props.phase.callout;
  return (
    <>
      <Heading
        eyebrow={uiCopy.actOne.objectionTheMathIsnTMathing}
        description={props.phase.line}
      >
        {uiCopy.actOne.holdThat}
        <br />
        <em>{uiCopy.actOne.thought}</em>
      </Heading>
      <Paper>
        <div className={styles.paperTop}>
          <span className={styles.paperLabel}>{uiCopy.actOne.delusionGap}</span>
          <Stamp>{uiCopy.actOne.calledOut}</Stamp>
        </div>
        <h2 className={styles.gap}>
          {c.gap.toFixed(1)}
          <small> / 10</small>
        </h2>
        <p className={styles.paperCaption}>{c.trait}</p>
        <div className={styles.comparison}>
          <span>
            {uiCopy.actOne.yourVersion}
            <b>{c.self}</b>
          </span>
          <span>
            {uiCopy.actOne.squadSVersion}
            <b>{c.peers}</b>
          </span>
        </div>
      </Paper>
      <div className={styles.spacer} />
      <InputScreen
        {...props}
        sample={pack.defenseSample}
        label={uiCopy.actOne.anyWordsInYourDefense}
        submitLabel={uiCopy.actOne.enterMyDefense}
      />
    </>
  );
}
