"use client";
import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { ArrowRight, Bug, Pause, Play, RotateCcw, WifiOff } from "lucide-react";
import { uiCopy } from "../../content/ui.en";
import { appCopy } from "../../content/app.en";
import {
  classicFlow,
  remixFlow,
  buildFlow,
} from "@expose/shared/game/definitions";
import { useDeveloperServices as useServices } from "../../session/provider";
import { Button } from "../../ui/primitives";
import { Game } from "../game";
import type { AudioFailure } from "../voice-input";
import styles from "./workbench.module.css";
const subscribeHydration = () => () => {};
const clientReady = () => true;
const serverReady = () => false;

export function DeveloperGame() {
  const [failure, setFailure] = useState<AudioFailure>("none");
  return (
    <Game
      failure={failure}
      developerTools={
        <Workbench failure={failure} onFailureChange={setFailure} />
      }
    />
  );
}

function Workbench({
  failure,
  onFailureChange,
}: {
  failure: AudioFailure;
  onFailureChange(value: AudioFailure): void;
}) {
  const { session, audio } = useServices();
  const flows = [
    classicFlow,
    remixFlow,
    ...[2, 3, 4, 5, 6, 7].flatMap((count) => [
      buildFlow("spotlight", count),
      buildFlow("bluff", count),
    ]),
    buildFlow("spotlight", 5, true),
  ];
  const snapshot = useSyncExternalStore(
    session.subscribe,
    session.getSnapshot,
    session.getSnapshot,
  );
  const hydrated = useSyncExternalStore(
    subscribeHydration,
    clientReady,
    serverReady,
  );
  return (
    <details
      open
      className={styles.panel}
      aria-label={uiCopy.game.developmentPreviewControls}
    >
      <summary className={styles.summary}>
        Design workbench <Bug size={16} />
      </summary>
      <div className={styles.content}>
        <Link href="/dev" className={styles.back}>
          Developer home <ArrowRight size={14} />
        </Link>
        <p>{uiCopy.game.inspectAnyPhaseTheseControlsNever}</p>
        <label>
          {uiCopy.game.flowVariant}
          <select
            aria-label={uiCopy.game.flowVariant}
            disabled={!hydrated}
            value={snapshot.flowId}
            onChange={(e) => {
              audio.dispose();
              session.setFlow(flows.find((f) => f.id === e.target.value)!);
            }}
          >
            <option value={classicFlow.id}>
              {uiCopy.game.classicThreeActs}
            </option>
            <option value={remixFlow.id}>
              {uiCopy.game.remixIncludesWildcard}
            </option>
            {flows.slice(2).map((flow) => (
              <option key={flow.id} value={flow.id}>
                {flow.id.replace("hostel-", "")}
              </option>
            ))}
          </select>
        </label>
        <label>
          {uiCopy.game.previewStep}
          <select
            aria-label={uiCopy.game.previewStep}
            disabled={!hydrated}
            value={snapshot.step.id}
            onChange={(e) => {
              const stepId = e.currentTarget.value;
              audio.cancelCapture();
              audio.discardUnsubmitted();
              session.jumpTo(stepId);
            }}
          >
            {session.getFlow().steps.map((s) => (
              <option key={s.id} value={s.id}>
                {s.act ? `${s.act} · ` : ""}
                {s.id} — {s.title}
              </option>
            ))}
          </select>
        </label>
        <label>
          {uiCopy.game.playerPerspective}
          <select
            aria-label={uiCopy.game.playerPerspective}
            disabled={!hydrated}
            value={snapshot.view.viewerId}
            onChange={(e) => {
              audio.cancelCapture();
              audio.discardUnsubmitted();
              audio.stopHighlight();
              session.setPerspective(e.target.value);
            }}
          >
            {snapshot.players.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          {appCopy.developer.layout}
          <select
            aria-label={appCopy.developer.layout}
            disabled={!hydrated}
            value={snapshot.setup.mode}
            onChange={(event) => {
              audio.dispose();
              session.createRoom({
                ...snapshot.setup,
                mode: event.currentTarget.value as "remote" | "same-room",
              });
            }}
          >
            <option value="remote">{appCopy.developer.standardLayout}</option>
            <option value="same-room">
              {appCopy.developer.sameRoomLayout}
            </option>
          </select>
        </label>
        <p>{appCopy.developer.layoutHint}</p>
        <label>
          {uiCopy.game.microphoneFixture}
          <select
            aria-label={uiCopy.game.microphoneFixture}
            disabled={!hydrated}
            value={failure}
            onChange={(e) => {
              audio.cancelCapture();
              audio.discardUnsubmitted();
              onFailureChange(e.target.value as AudioFailure);
            }}
          >
            <option value="none">{uiCopy.game.realLocalMicrophone}</option>
            <option value="denied">{uiCopy.game.permissionDenied}</option>
            <option value="unsupported">
              {uiCopy.game.unsupportedBrowser}
            </option>
          </select>
        </label>
        <div className={styles.buttons}>
          <Button
            variant="ghost"
            onClick={() => session.setPaused(!snapshot.paused)}
          >
            {snapshot.paused ? <Play size={14} /> : <Pause size={14} />}
            {snapshot.paused ? "Resume" : "Pause"}
          </Button>
          <Button variant="ghost" onClick={() => session.advancePreview()}>
            {uiCopy.game.advance}
            <ArrowRight size={14} />
          </Button>
        </div>
        <Button
          variant="ghost"
          onClick={() => {
            audio.cancelCapture();
            session.setInterrupted(!snapshot.interrupted);
          }}
        >
          <WifiOff size={14} />
          {snapshot.interrupted
            ? uiCopy.game.restoreConnection
            : uiCopy.game.simulateInterruption}
        </Button>
        <Button
          variant="text"
          onClick={() => {
            audio.dispose();
            session.restart();
          }}
        >
          <RotateCcw size={14} />
          {uiCopy.game.deterministicRestart}
        </Button>
        <span className={styles.meta}>
          {uiCopy.game.protocol}
          {snapshot.protocol_version}
          {uiCopy.game.revision}
          {snapshot.revision}
        </span>
        <div className={styles.buttons}>
          {snapshot.players.map((p) => (
            <Button
              key={p.id}
              variant="ghost"
              onClick={() => {
                audio.cancelCapture();
                if (p.connected) session.disconnectSeat(p.id);
                else session.reconnectSeat(p.id);
              }}
            >
              {p.connected ? "Disconnect" : "Rejoin"} {p.name}
            </Button>
          ))}
        </div>
        {snapshot.step.type === "lobby" &&
          snapshot.players.some((p) => p.id === "kabir") && (
            <label>
              <input
                type="checkbox"
                checked={snapshot.players.find((p) => p.id === "kabir")!.ready}
                onChange={(e) => session.setBotReady("kabir", e.target.checked)}
              />
              Kabir ready (fixture)
            </label>
          )}
      </div>
    </details>
  );
}
