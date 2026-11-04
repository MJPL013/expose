"use client";
import { uiCopy } from "../../content/ui.en";

import { useState } from "react";
import {
  ArrowRight,
  Check,
  CheckCircle2,
  Fingerprint,
  ShieldCheck,
  Share2,
  Play,
  UserRoundMinus,
} from "lucide-react";
import { Avatar, Button, IconButton } from "../../ui/primitives";
import { Dialog } from "../../ui/dialog";
import { Heading, player, type ScreenProps } from "./shared";
import styles from "../game.module.css";
import { getPack } from "@expose/shared/game/packs";
import { LobbyChat } from "../lobby-chat";
import lobbyStyles from "../lobby.module.css";
import { appCopy } from "../../content/app.en";
import { ActionDock } from "../../ui/action-dock";
import { CharacterBuilder } from "../character-builder";
import { useServices, usePlayerPreferences } from "../../session/provider";
import { LobbySettings } from "../lobby-settings";
export function Lobby({
  snapshot,
  send,
  onResults,
}: ScreenProps & { onResults?: () => void }) {
  const postMatch = snapshot.step.type === "summary";
  const { preferences, audio } = useServices();
  const { profile } = usePlayerPreferences();
  const [editing, setEditing] = useState(false),
    [saving, setSaving] = useState(false);
  const [appearance, setAppearance] = useState(profile);
  const [micReady, setMicReady] = useState(audio.microphoneReady),
    [micMessage, setMicMessage] = useState("");
  const [copied, setCopied] = useState(false);
  const [shareStatus, setShareStatus] = useState("");
  const [removeId, setRemoveId] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState("");
  const pack = getPack(snapshot.setup.packId);
  const viewer = player(snapshot, snapshot.view.viewerId);
  const removePlayer = snapshot.players.find((p) => p.id === removeId);
  const allReady =
    snapshot.players.every((p) => p.ready && p.connected) &&
    (!snapshot.online ||
      snapshot.players.length === (snapshot.setup.seatCount ?? 5));
  return (
    <>
      <div className={lobbyStyles.layout}>
        <div className={lobbyStyles.details}>
          <Heading
            eyebrow={uiCopy.lobby.caseFile001}
            description={
              postMatch
                ? "The case is closed. Stay and chat while the host prepares another game."
                : snapshot.online
                  ? `${snapshot.players.length} of ${snapshot.setup.seatCount ?? 5} friends joined.`
                  : uiCopy.lobby.theUsualSuspectsAreAllHere
            }
          >
            The squad’s
            <br />
            <em>
              {postMatch
                ? "back together."
                : allReady
                  ? "ready to play."
                  : "gathering."}
            </em>
          </Heading>
          <div className={styles.roomCode}>
            <div>
              <span>
                {snapshot.online ? "ROOM CODE" : uiCopy.lobby.localRoomCode}
              </span>
              <strong>{snapshot.roomCode}</strong>
            </div>
            <button
              aria-label={uiCopy.lobby.copyRoomCode}
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(snapshot.roomCode);
                  setCopied(true);
                } catch {
                  setCopied(false);
                }
              }}
            >
              {copied ? <Check size={19} /> : <Fingerprint size={24} />}
              <span>{copied ? "COPIED" : "COPY"}</span>
            </button>
          </div>
          {snapshot.online && (
            <Button
              variant="ghost"
              className={lobbyStyles.share}
              onClick={async () => {
                const url =
                  snapshot.inviteUrl ??
                  `${location.origin}/join/${snapshot.roomCode}`;
                const text = "Join my Expose squad.";
                try {
                  if (navigator.share)
                    await navigator.share({
                      title: "Join my Expose squad",
                      text,
                      url,
                    });
                  else await navigator.clipboard.writeText(url);
                  setShareStatus(
                    typeof navigator.share === "function"
                      ? "Invite shared."
                      : "Invite copied. Send it to your friends.",
                  );
                } catch (error) {
                  if (!(error instanceof Error && error.name === "AbortError"))
                    setShareStatus(
                      "Share the room code above and this app’s address with your friends.",
                    );
                }
              }}
            >
              <Share2 size={18} aria-hidden="true" />
              Invite friends
            </Button>
          )}
          {shareStatus && (
            <p role="status" className={styles.note}>
              {shareStatus}
            </p>
          )}
          <div className={styles.rosterHeader}>
            <span>{uiCopy.lobby.theLineup}</span>
            <span role="status">
              {appCopy.lobby.readyCount(
                snapshot.players.filter((p) => p.ready).length,
                snapshot.players.length,
              )}
            </span>
          </div>
          <div className={styles.roster}>
            {snapshot.players.map((p) => (
              <div key={p.id} className={lobbyStyles.playerRow}>
                {p.id === viewer.id ? (
                  <button
                    className={lobbyStyles.editAvatar}
                    aria-label="Edit your character"
                    onClick={() => {
                      setAppearance({
                        ...profile,
                        avatar: p.avatar,
                        color: p.color as typeof profile.color,
                      });
                      setEditing(true);
                    }}
                  >
                    <Avatar name={p.name} color={p.color} variant={p.avatar} />
                    <small>Edit</small>
                  </button>
                ) : (
                  <Avatar name={p.name} color={p.color} variant={p.avatar} />
                )}
                <div className={lobbyStyles.playerInfo}>
                  <strong>{p.name}</strong>
                  <span>
                    {snapshot.online
                      ? `${p.id === snapshot.view.viewerId ? "You · " : ""}${p.host ? "Room host" : p.connected ? "Connected" : "Seat reserved"}`
                      : p.id === "you"
                        ? uiCopy.lobby.thatSYouRoomHost
                        : uiCopy.lobby.simulatedPlayer}
                  </span>
                  <span
                    className={`${lobbyStyles.readiness} ${p.ready ? lobbyStyles.isReady : ""}`}
                  >
                    <CheckCircle2 size={14} aria-hidden="true" />
                    {postMatch
                      ? `${p.score} points`
                      : p.ready
                        ? "Ready"
                        : "Waiting"}
                  </span>
                </div>
                {!postMatch &&
                  snapshot.online &&
                  viewer.host &&
                  p.id !== viewer.id && (
                    <IconButton
                      aria-label={`Remove ${p.name} from room`}
                      onClick={() => {
                        setRemoveError("");
                        setRemoveId(p.id);
                      }}
                    >
                      <UserRoundMinus size={18} aria-hidden="true" />
                    </IconButton>
                  )}
              </div>
            ))}
          </div>
          <div className={styles.settingsStrip}>
            <div>
              <span>{uiCopy.lobby.thePack}</span>
              <strong>{pack.name}</strong>
            </div>
            <div>
              <span>{uiCopy.lobby.theHeat}</span>
              <strong>{snapshot.setup.spice}</strong>
            </div>
            <div>
              <span>{uiCopy.lobby.theClock}</span>
              <strong>~{snapshot.durationMinutes} min</strong>
            </div>
          </div>
          {!postMatch && viewer.host && (
            <LobbySettings
              key={`${snapshot.setup.pace}:${snapshot.setup.spice}:${snapshot.setup.hostLanguage}:${snapshot.setup.guidedVoice}`}
              snapshot={snapshot}
              send={send}
            />
          )}
          {!postMatch && snapshot.setup.spice === "spicy" && (
            <div className={styles.note}>
              <strong>Spicy · 18+ adult party humour</strong>
              {!viewer.adultConfirmed && (
                <Button
                  variant="ghost"
                  onClick={() => send({ type: "adult.confirm" })}
                >
                  I’m 18 or older
                </Button>
              )}
            </div>
          )}
          {!postMatch && snapshot.setup.guidedVoice && (
            <div className={styles.note}>
              <Button
                variant="ghost"
                onClick={async () => {
                  try {
                    await audio.prepareMicrophone();
                    setMicReady(true);
                    setMicMessage(
                      "Microphone ready. Hold to speak during your turn.",
                    );
                  } catch {
                    setMicMessage(
                      "Microphone unavailable. You can type and tap choices.",
                    );
                  }
                }}
              >
                {micReady ? "Check microphone" : "Enable microphone"}
              </Button>
              {micMessage && <p role="status">{micMessage}</p>}
            </div>
          )}
        </div>
        {snapshot.online && <LobbyChat snapshot={snapshot} send={send} />}
      </div>
      {snapshot.setup.mode === "same-room" && (
        <p className={styles.note}>
          {snapshot.online
            ? "One host playback device. Type secret answers—friends nearby can hear anything you say."
            : uiCopy.lobby.sameRoomLayoutPreviewAudioJammer}
        </p>
      )}
      <ActionDock>
        {postMatch ? (
          <>
            <p className={styles.readyMessage}>
              {viewer.host
                ? "Prepare the next game when the squad is ready. Chat stays here."
                : "Stay and chat. Your host can prepare the next game."}
            </p>
            <div className={lobbyStyles.hostControls}>
              <Button variant="ghost" onClick={onResults}>
                View results
              </Button>
              {viewer.host && (
                <Button
                  disabled={Boolean(snapshot.host?.deadline)}
                  onClick={() => send({ type: "restart" })}
                >
                  Run it back
                </Button>
              )}
            </div>
          </>
        ) : (
          <>
            <p
              id="lobby-ready-status"
              className={lobbyStyles.readyStatus}
              role="status"
            >
              {snapshot.host?.deadline
                ? "The host is answering. Play unlocks when the conversation closes."
                : !viewer.ready
                  ? viewer.host
                    ? "Waiting for the squad."
                    : appCopy.lobby.waiting
                  : !viewer.host
                    ? "You’re ready. The room host will start when the squad is ready."
                    : allReady
                      ? appCopy.lobby.allReady
                      : appCopy.lobby.needsReady}
            </p>
            <div
              className={
                viewer.host
                  ? lobbyStyles.hostControls
                  : lobbyStyles.guestControls
              }
            >
              <Button
                variant={viewer.host ? "ghost" : "primary"}
                disabled={
                  snapshot.setup.spice === "spicy" && !viewer.adultConfirmed
                }
                aria-pressed={viewer.ready}
                aria-label={viewer.ready ? "Undo ready" : "I’m ready"}
                aria-describedby="lobby-ready-status"
                onClick={() => send({ type: "ready", ready: !viewer.ready })}
              >
                {viewer.ready ? (
                  <CheckCircle2 size={18} aria-hidden="true" />
                ) : (
                  <Check size={18} aria-hidden="true" />
                )}
                {viewer.ready ? "Ready" : "I’m ready"}
              </Button>
              {viewer.host && (
                <Button
                  aria-describedby="lobby-ready-status"
                  disabled={!allReady || Boolean(snapshot.host?.deadline)}
                  onClick={() => send({ type: "start" })}
                >
                  <Play size={18} aria-hidden="true" />
                  {uiCopy.lobby.play}
                  <ArrowRight size={18} aria-hidden="true" />
                </Button>
              )}
            </div>
          </>
        )}
      </ActionDock>
      {editing && (
        <Dialog
          title="Your character"
          onClose={() => {
            if (!saving) setEditing(false);
          }}
        >
          <CharacterBuilder profile={appearance} onChange={setAppearance} />
          <Button
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              try {
                const accepted = await send({
                  type: "appearance.update",
                  avatar: appearance.avatar,
                  color: appearance.color,
                });
                if (accepted !== false) {
                  preferences.saveProfile({
                    ...profile,
                    avatar: appearance.avatar,
                    color: appearance.color,
                  });
                  setEditing(false);
                }
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? "Saving…" : "Save character"}
          </Button>
        </Dialog>
      )}
      {removePlayer && (
        <Dialog
          title={`Remove ${removePlayer.name}?`}
          onClose={() => {
            if (!removing) setRemoveId(null);
          }}
        >
          <p>
            This frees their seat for another friend. They cannot rejoin this
            room from the same guest identity.
          </p>
          {removeError && <p role="alert">{removeError}</p>}
          <Button
            variant="danger"
            disabled={removing}
            onClick={async () => {
              setRemoving(true);
              if (await send({ type: "kick", playerId: removePlayer.id }))
                setRemoveId(null);
              else
                setRemoveError(
                  "Could not remove this player. Check the room state and retry.",
                );
              setRemoving(false);
            }}
          >
            {removing ? "Removing…" : "Remove player"}
          </Button>
          <Button
            variant="ghost"
            disabled={removing}
            onClick={() => setRemoveId(null)}
          >
            Keep in room
          </Button>
        </Dialog>
      )}
      <p className={styles.centerNote}>
        <ShieldCheck size={12} />
        {snapshot.online
          ? `${snapshot.players.length}/${snapshot.setup.seatCount ?? 5} real seats · resume for two hours. Voice is sent privately for transcription only when you record.`
          : "Fictional squad · submitted text is saved here for up to two hours. Recordings stay in memory."}
      </p>
    </>
  );
}
