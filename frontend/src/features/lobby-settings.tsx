"use client";
import { useState } from "react";
import type { GameSnapshot } from "@expose/shared/game/contracts";
import type { Pace } from "@expose/shared/game/guided";
import {
  roomLanguageOptions,
  type HostLanguage,
} from "@expose/shared/game/host";
import type { ScreenProps } from "./screens/shared";
import { Button } from "../ui/primitives";
import styles from "./entry.module.css";
import { PacePicker, ChoiceCards } from "./room-setup";

export function LobbySettings({
  snapshot,
  send,
}: {
  snapshot: GameSnapshot;
  send: ScreenProps["send"];
}) {
  const [settings, setSettings] = useState({
    pace: snapshot.setup.pace ?? "normal",
    hostLanguage: snapshot.setup.hostLanguage ?? "hinglish",
    spice: snapshot.setup.spice,
    adult: snapshot.setup.adult,
    guidedVoice: snapshot.setup.guidedVoice ?? false,
  });
  const [saving, setSaving] = useState(false);
  return (
    <details className={styles.settings}>
      <summary>Game settings · {settings.pace} pace</summary>
      <form
        className={styles.form}
        onSubmit={(e) => {
          e.preventDefault();
          setSaving(true);
          void Promise.resolve(
            send({ type: "settings.update", ...settings }),
          ).finally(() => setSaving(false));
        }}
      >
        <fieldset className={styles.fields} disabled={saving}>
          <PacePicker
            value={settings.pace as Pace}
            onChange={(pace) => setSettings({ ...settings, pace })}
          />
          <label>
            Host and question language
            <select
              value={settings.hostLanguage}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  hostLanguage: e.target.value as HostLanguage,
                })
              }
            >
              {roomLanguageOptions.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>
          <ChoiceCards<GameSnapshot["setup"]["spice"]>
            label="Spice"
            value={settings.spice}
            onChange={(spice) => setSettings({ ...settings, spice })}
            options={[
              { value: "mild", title: "Mild" },
              { value: "medium", title: "Medium" },
              { value: "spicy", title: "Spicy · 18+" },
            ]}
          />
          {settings.spice === "spicy" && (
            <label className={styles.check}>
              <input
                type="checkbox"
                required
                checked={settings.adult}
                onChange={(e) =>
                  setSettings({ ...settings, adult: e.target.checked })
                }
              />
              I’m 18 or older
            </label>
          )}
          <label className={styles.check}>
            <input
              type="checkbox"
              checked={settings.guidedVoice}
              onChange={(e) =>
                setSettings({ ...settings, guidedVoice: e.target.checked })
              }
            />
            Guided voice · questions and spoken choices
          </label>
          <Button type="submit">{saving ? "Saving…" : "Save settings"}</Button>
          <small>Everyone gets ready again after settings change.</small>
        </fieldset>
      </form>
    </details>
  );
}
