"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { usePlayerPreferences, useServices } from "../session/provider";
import { Button, Avatar } from "../ui/primitives";
import { useMatchNavigation } from "./match-navigation";
import app from "./app.module.css";
import styles from "./entry.module.css";
type Invitation = {
  roomId: string;
  code: string;
  status: string;
  seats: number;
  capacity: number;
  spice: string;
  hostLanguage: string;
  guidedVoice: boolean;
};

export function JoinRoom({ code }: { code: string }) {
  const { onlineSession, chooseSession, sessionMode, audio } = useServices();
  const { profile } = usePlayerPreferences();
  const router = useRouter(),
    requestLeave = useMatchNavigation();
  const [room, setRoom] = useState<Invitation | null>(null),
    [error, setError] = useState("");
  const [busy, setBusy] = useState(false),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        if (!/^[A-Z0-9]{6}$/.test(code))
          throw new Error(
            "This invitation is not valid. Ask your friend for a new link.",
          );
        const value = await onlineSession.request<Invitation>(`/rooms/${code}`);
        if (!active) return;
        setRoom(value);
        setError("");
        const recovery = await onlineSession.refreshRecovery();
        const terminal = recovery?.notices.find(
          (n) => n.roomId === value.roomId,
        );
        if (terminal) {
          setRoom(null);
          throw new Error(terminal.message);
        }
        if (
          sessionMode === "online" &&
          (await onlineSession.resumeCode(code)) &&
          active
        )
          router.replace("/play");
      } catch (cause) {
        if (active)
          setError(
            cause instanceof Error
              ? cause.message
              : "Could not open this invitation.",
          );
      }
    })();
    return () => {
      active = false;
    };
  }, [code, onlineSession, router, sessionMode, retry]);
  const unavailable =
    room &&
    (room.status !== "lobby"
      ? "This match has already started. Returning players can reconnect; new players need the next lobby."
      : room.seats >= room.capacity
        ? "This room is full. Ask the host to free a seat."
        : "");
  return (
    <main id="main" className={app.scroll}>
      <section className={app.panel}>
        <p>EXPOSE · ROOM {code}</p>
        <h1>Join your friends.</h1>
        {room ? (
          <p>
            {room.seats}/{room.capacity} joined · {room.hostLanguage} ·{" "}
            {room.spice === "spicy" ? "Spicy · 18+" : room.spice}
          </p>
        ) : (
          !error && <p role="status">Opening your invitation…</p>
        )}
        {error && <p role="alert">{error}</p>}
        {unavailable && <p role="status">{unavailable}</p>}
        {room && !unavailable && (
          <form
            className={styles.form}
            onSubmit={(e) => {
              e.preventDefault();
              const form = new FormData(e.currentTarget),
                name = String(form.get("name")).trim();
              requestLeave(() => {
                void (async () => {
                  setBusy(true);
                  setError("");
                  try {
                    const selected = await chooseSession("online");
                    await selected.joinRoom(code, {
                      name,
                      avatar: profile.avatar,
                      color: profile.color,
                      spice: "medium",
                      adult: false,
                      mode: "remote",
                    });
                    audio.dispose();
                    router.replace("/play");
                  } catch (cause) {
                    setError(
                      cause instanceof Error
                        ? cause.message
                        : "Could not join this room.",
                    );
                  } finally {
                    setBusy(false);
                  }
                })();
              });
            }}
          >
            <fieldset disabled={busy} className={styles.fields}>
              <Avatar
                name={profile.name}
                variant={profile.avatar}
                color={profile.color}
              />
              <label>
                Your display name
                <input
                  name="name"
                  autoComplete="nickname"
                  required
                  maxLength={24}
                  defaultValue={profile.name === "You" ? "" : profile.name}
                />
              </label>
              <Button type="submit">{busy ? "Joining…" : "Join room"}</Button>
            </fieldset>
          </form>
        )}
        {(error || unavailable) && (
          <Button variant="ghost" onClick={() => setRetry((n) => n + 1)}>
            Retry invitation
          </Button>
        )}
        <p>
          <Link href="/">Back to home</Link>
        </p>
      </section>
    </main>
  );
}
