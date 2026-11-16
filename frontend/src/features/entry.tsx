"use client";
import { useEffect, useState } from "react";
import type { HostLanguage } from "@expose/shared/game/host";
import type { Pace } from "@expose/shared/game/guided";
import { useRouter } from "next/navigation";
import { ArrowRight, KeyRound, Plus } from "lucide-react";
import { Button } from "../ui/primitives";
import { Dialog } from "../ui/dialog";
import {
  usePlayerPreferences,
  useServices,
  useRecovery,
} from "../session/provider";
import { ActionDock } from "../ui/action-dock";
import {
  type Spice,
  type GameMode,
  type PackId,
} from "@expose/shared/game/contracts";
import {
  buildFlow,
  buildNetworkFlow,
  seatIds,
} from "@expose/shared/game/definitions";
import { packCatalog } from "@expose/shared/game/packs";
import { previewQuestion } from "@expose/shared/game/catalog";
import { roomLanguageOptions } from "@expose/shared/game/host";
import {
  ChoiceCards,
  PacePicker,
  ProfileIdentity,
  SquadPicker,
} from "./room-setup";
import {
  clearRoomDraft,
  readRoomDraft,
  saveRoomDraft,
  hasProfile,
  setProfileReturn,
} from "../session/room-entry";
import { uiCopy } from "../content/ui.en";
import { useMatchNavigation } from "./match-navigation";
import styles from "./entry.module.css";

/** Player setup is host-only. The isolated /demo route retains local practice. */
export function EntryActions({ demo = false }: { demo?: boolean }) {
  const [form, setForm] = useState<"create" | "join" | null>(null);
  const [error, setError] = useState("");
  const [spice, setSpice] = useState<Spice>("medium");
  const [hostLanguage, setHostLanguage] = useState<HostLanguage>("hinglish");
  const [pace, setPace] = useState<Pace>("normal");
  const [guidedVoice, setGuidedVoice] = useState(true);
  const [gameMode, setGameMode] = useState<GameMode>("spotlight");
  const [packId, setPackId] = useState<PackId>("hostel-2am");
  const [seatCount, setSeatCount] = useState(demo ? 5 : 2);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const { session, audio, chooseSession, sessionMode } = useServices();
  const preferences = usePlayerPreferences();
  const { profile } = preferences;
  const router = useRouter();
  const recovery = useRecovery();
  const requestLeave = useMatchNavigation();
  useEffect(() => {
    const saved = readRoomDraft();
    if (!saved || saved.demo !== demo) return;
    clearRoomDraft();
    queueMicrotask(() => {
      setForm(saved.form);
      setCode(saved.code);
      setSpice(saved.spice);
      setHostLanguage(saved.hostLanguage);
      setPace(saved.pace);
      setGuidedVoice(saved.guidedVoice);
      setGameMode(saved.gameMode);
      setPackId(saved.packId);
      setSeatCount(saved.seatCount);
    });
  }, [demo]);
  const editProfile = (next = form ?? "create") => {
    saveRoomDraft({
      form: next,
      code,
      spice,
      hostLanguage,
      pace,
      guidedVoice,
      gameMode,
      packId,
      seatCount,
      demo,
    });
    setProfileReturn(
      demo
        ? "/demo"
        : window.location.pathname === "/friends"
          ? "/friends"
          : "/",
    );
    router.push("/profile");
  };
  const flow = demo
    ? buildFlow(gameMode, seatCount, false, undefined, undefined, packId, pace)
    : buildNetworkFlow(
        gameMode,
        seatIds.slice(0, seatCount),
        "estimate",
        packId,
        pace,
      );
  const minutes = Math.ceil(
    flow.steps.reduce((sum, step) => sum + step.durationMs, 0) / 60000,
  );
  const open = (next: "create" | "join") => {
    if (recovery.blocked) {
      router.push("/play");
      return;
    }
    requestLeave(() => {
      setError("");
      if (!hasProfile(preferences)) {
        editProfile(next);
        return;
      }
      setForm(next);
    });
  };
  return (
    <>
      <ActionDock>
        <div className={styles.entry}>
          {recovery.resumable &&
            !recovery.blocked &&
            sessionMode === (demo ? "demo" : "online") && (
              <Button
                onClick={async () => {
                  if (await session.resume()) router.push("/play");
                }}
              >
                Resume game
              </Button>
            )}
          {recovery.notice && <p role="status">{recovery.notice}</p>}
          {!demo && recovery.blocked && (
            <p role="status">
              Your game is open in another tab.{" "}
              <button onClick={() => router.push("/play")}>
                View game options
              </button>
            </p>
          )}
          {demo && recovery.blocked && (
            <p role="status">
              This game is open in another tab. Close it, then{" "}
              <button onClick={() => void session.initialize()}>
                retry here
              </button>
              .
            </p>
          )}
          <Button
            disabled={demo && recovery.blocked}
            onClick={() => open("create")}
          >
            <Plus size={19} aria-hidden="true" />
            Create a room
          </Button>
          <Button
            variant="text"
            disabled={demo && recovery.blocked}
            onClick={() => open("join")}
          >
            <KeyRound size={17} aria-hidden="true" />
            Join with code
          </Button>
        </div>
      </ActionDock>
      {form && (
        <Dialog
          className={styles.setupDialog}
          title={
            form === "create"
              ? uiCopy.entry.openANewCase
              : uiCopy.entry.joinTheLineup
          }
          onClose={() => {
            if (!busy) setForm(null);
          }}
        >
          <p>
            {demo
              ? "Offline practice with a fictional squad. This room cannot be joined from another device."
              : form === "create"
                ? "Set the scene. We’ll give you a room code to share with your friends."
                : "Your friend sets the scene. Enter their six-character room code."}
          </p>
          <form
            className={styles.form}
            onSubmit={async (event) => {
              event.preventDefault();
              if (busy) return;
              if (!hasProfile(preferences)) {
                editProfile();
                return;
              }
              const data = new FormData(event.currentTarget);
              setBusy(true);
              setError("");
              try {
                const selected = await chooseSession(demo ? "demo" : "online");
                const setup = {
                  name: profile.name.trim(),
                  avatar: profile.avatar,
                  color: profile.color,
                  spice: form === "create" ? spice : ("medium" as Spice),
                  mode: "remote" as const,
                  adult: data.get("adult") === "on",
                  gameMode,
                  hostLanguage,
                  pace,
                  guidedVoice,
                  seatCount,
                  packId,
                };
                if (form === "join") await selected.joinRoom(code, setup);
                else await selected.createRoom(setup);
                clearRoomDraft();
                audio.dispose();
                router.push("/play");
              } catch (cause) {
                setError(
                  cause instanceof Error
                    ? cause.message.startsWith("[")
                      ? "Check your name and room settings."
                      : cause.message
                    : "Could not connect. Please try again.",
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            <fieldset className={styles.fields} disabled={busy}>
              <ProfileIdentity profile={profile} onEdit={() => editProfile()} />
              {form === "join" ? (
                <label>
                  Room code
                  <input
                    className={styles.codeInput}
                    name="code"
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    aria-label="Room code"
                    placeholder={demo ? "DEMO42" : "A1B2C3"}
                    autoCapitalize="characters"
                    autoCorrect="off"
                    spellCheck={false}
                    autoComplete="off"
                    pattern="[A-Za-z0-9]{6}"
                    minLength={6}
                    maxLength={6}
                    required
                    aria-describedby="code-hint"
                  />
                  <small id="code-hint">
                    Ask your friend for the code shown in their lobby.
                  </small>
                </label>
              ) : (
                <>
                  <ChoiceCards<GameMode>
                    label="Game mode"
                    value={gameMode}
                    onChange={setGameMode}
                    options={[
                      {
                        value: "spotlight",
                        title: "Spotlight",
                        detail:
                          "Guess your friend's answer. Win their favourite.",
                      },
                      {
                        value: "bluff",
                        title: "Bluff",
                        detail:
                          "Write a believable fake. Find the real answer.",
                      },
                    ]}
                  />
                  <ChoiceCards<PackId>
                    label="Setting"
                    value={packId}
                    onChange={setPackId}
                    options={packCatalog.map((p) => ({
                      value: p.id as PackId,
                      title: p.name,
                      detail:
                        p.id === "goa-trip"
                          ? "Beach plans, budgets and group-trip chaos."
                          : "Roommates, midnight snacks and missed classes.",
                    }))}
                  />
                  <ChoiceCards<Spice>
                    label="Spice"
                    value={spice}
                    onChange={setSpice}
                    options={[
                      {
                        value: "mild",
                        title: "Mild",
                        detail: "Warm, everyday teasing",
                      },
                      {
                        value: "medium",
                        title: "Medium",
                        detail: "Sharper banter and awkward excuses",
                      },
                      {
                        value: "spicy",
                        title: "Spicy · 18+",
                        detail: "Dating, flirting and adult party humour",
                      },
                    ]}
                  />
                  <p className={styles.preview}>
                    <span>A taste of your round</span>
                    {previewQuestion(packId, spice, hostLanguage).replaceAll(
                      "{name}",
                      profile.name,
                    )}
                  </p>
                  <PacePicker value={pace} onChange={setPace} />
                  <label>
                    Room language
                    <select
                      aria-label="Room language"
                      value={hostLanguage}
                      onChange={(e) =>
                        setHostLanguage(e.target.value as HostLanguage)
                      }
                    >
                      {roomLanguageOptions.map((l) => (
                        <option key={l.value} value={l.value}>
                          {l.label}
                        </option>
                      ))}
                    </select>
                    <small>
                      Questions and the host use this language. Each friend
                      chooses their mic language.
                    </small>
                  </label>
                  <label className={styles.check}>
                    <input
                      type="checkbox"
                      checked={guidedVoice}
                      onChange={(e) => setGuidedVoice(e.target.checked)}
                    />
                    Read questions aloud
                  </label>
                  {spice === "spicy" && (
                    <label className={styles.check}>
                      <input type="checkbox" name="adult" required />
                      I’m 18 or older; this room is for adults.
                    </label>
                  )}
                  <SquadPicker
                    count={seatCount}
                    onChange={setSeatCount}
                    profile={profile}
                    minutes={minutes}
                  />
                </>
              )}
              {error && (
                <p className={styles.formError} role="alert">
                  {error}
                </p>
              )}
            </fieldset>
            <div className={styles.createDock}>
              <Button type="submit" disabled={busy}>
                {busy
                  ? "Connecting…"
                  : form === "join"
                    ? "Join room"
                    : "Create room"}
                <ArrowRight size={18} aria-hidden="true" />
              </Button>
            </div>
          </form>
        </Dialog>
      )}
    </>
  );
}
