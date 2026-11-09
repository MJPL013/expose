"use client";
import { useState } from "react";
import type { HostLanguage } from "@expose/shared/game/host";
import type { Pace } from "@expose/shared/game/guided";
import { useRouter } from "next/navigation";
import { ArrowRight, KeyRound, Plus, Users } from "lucide-react";
import { Button } from "../ui/primitives";
import { Dialog } from "../ui/dialog";
import {
  usePlayerPreferences,
  useServices,
  useRecovery,
} from "../session/provider";
import { ActionDock } from "../ui/action-dock";
import {
  roomSizes,
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
  const [layout, setLayout] = useState<"remote" | "same-room">("remote");
  const [busy, setBusy] = useState(false);
  const { session, audio, chooseSession, sessionMode } = useServices();
  const { profile } = usePlayerPreferences();
  const router = useRouter();
  const recovery = useRecovery();
  const requestLeave = useMatchNavigation();
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
      setForm(next);
    });
  };
  return (
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
        {form && (
          <Dialog
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
                  : "Your friend sets the scene. Bring your name and the six-character room code."}
            </p>
            <form
              className={styles.form}
              onSubmit={async (event) => {
                event.preventDefault();
                if (busy) return;
                const data = new FormData(event.currentTarget);
                setBusy(true);
                setError("");
                try {
                  const selected = await chooseSession(
                    demo ? "demo" : "online",
                  );
                  const setup = {
                    name: String(data.get("name")).trim(),
                    avatar: profile.avatar,
                    color: profile.color,
                    spice: form === "create" ? spice : ("medium" as Spice),
                    mode: layout,
                    adult: data.get("adult") === "on",
                    gameMode,
                    hostLanguage,
                    pace,
                    guidedVoice,
                    seatCount,
                    packId,
                  };
                  if (form === "join")
                    await selected.joinRoom(String(data.get("code")), setup);
                  else await selected.createRoom(setup);
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
                <label>
                  Your display name
                  <input
                    name="name"
                    defaultValue={profile.name === "You" ? "" : profile.name}
                    placeholder="The usual suspect"
                    maxLength={24}
                    required
                    autoComplete="nickname"
                  />
                </label>
                {form === "join" ? (
                  <label>
                    Room code
                    <input
                      className={styles.codeInput}
                      name="code"
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
                    <label>
                      Game mode
                      <select
                        value={gameMode}
                        onChange={(e) =>
                          setGameMode(e.target.value as GameMode)
                        }
                      >
                        <option value="spotlight">
                          Spotlight · know your friends
                        </option>
                        <option value="bluff">
                          Bluff · find the real answer
                        </option>
                      </select>
                    </label>
                    <label>
                      Room size
                      <select
                        value={seatCount}
                        onChange={(e) => setSeatCount(Number(e.target.value))}
                      >
                        {roomSizes.map((count) => (
                          <option key={count} value={count}>
                            {count} players · including you
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Content pack
                      <select
                        value={packId}
                        onChange={(e) => setPackId(e.target.value as PackId)}
                      >
                        {packCatalog.map((pack) => (
                          <option key={pack.id} value={pack.id}>
                            {pack.name}
                          </option>
                        ))}
                      </select>
                      <small>
                        {
                          packCatalog.find((pack) => pack.id === packId)
                            ?.tagline
                        }
                      </small>
                    </label>
                    <label>
                      Room setting
                      <select
                        value={layout}
                        onChange={(e) =>
                          setLayout(e.target.value as "remote" | "same-room")
                        }
                      >
                        <option value="remote">Playing remotely</option>
                        <option value="same-room">Together in one room</option>
                      </select>
                    </label>
                    <label>
                      Pace
                      <select
                        value={pace}
                        onChange={(e) => setPace(e.target.value as Pace)}
                      >
                        <option value="quick">Quick · 30 sec answers</option>
                        <option value="normal">Normal · 45 sec answers</option>
                        <option value="relaxed">
                          Relaxed · 60 sec answers
                        </option>
                      </select>
                    </label>
                    <label className={styles.check}>
                      <input
                        type="checkbox"
                        checked={guidedVoice}
                        onChange={(e) => setGuidedVoice(e.target.checked)}
                      />
                      Guided voice · hear questions and say answers or choices
                    </label>
                    <label>
                      Spice level
                      <select
                        value={spice}
                        onChange={(e) => setSpice(e.target.value as Spice)}
                      >
                        <option value="mild">Mild · friendly banter</option>
                        <option value="medium">Medium · some receipts</option>
                        <option value="spicy">
                          Spicy · playful roast, 18+
                        </option>
                      </select>
                    </label>
                    <label>
                      Host and question language
                      <select
                        value={hostLanguage}
                        onChange={(e) =>
                          setHostLanguage(e.target.value as HostLanguage)
                        }
                      >
                        <option value="en">English</option>
                        <option value="hi">हिन्दी · Hindi</option>
                        <option value="hinglish">Hinglish</option>
                      </select>
                      <small>
                        Each friend chooses their own microphone language.
                      </small>
                    </label>
                    {spice === "spicy" && (
                      <label className={styles.check}>
                        <input type="checkbox" name="adult" required />
                        I’m 18 or older; this room is for adults.
                      </label>
                    )}
                    <p className={styles.brief}>
                      <Users size={18} aria-hidden="true" />
                      <span>
                        {seatCount} seats · about {minutes} minutes. Chat in the
                        lobby, get everyone ready, then start the case.
                      </span>
                    </p>
                  </>
                )}
                {error && (
                  <p className={styles.formError} role="alert">
                    {error}
                  </p>
                )}
                <Button type="submit">
                  {busy
                    ? "Connecting…"
                    : form === "join"
                      ? "Join room"
                      : "Create room"}
                  <ArrowRight size={18} aria-hidden="true" />
                </Button>
              </fieldset>
            </form>
          </Dialog>
        )}
      </div>
    </ActionDock>
  );
}
