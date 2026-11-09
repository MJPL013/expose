"use client";
import { useState } from "react";
import type { GameSnapshot } from "@expose/shared/game/contracts";
import type { Pace } from "@expose/shared/game/guided";
import type { HostLanguage } from "@expose/shared/game/host";
import type { ScreenProps } from "./screens/shared";
import { Button } from "../ui/primitives";
import styles from "./entry.module.css";

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
          <label>
            Pace
            <select
              value={settings.pace}
              onChange={(e) =>
                setSettings({ ...settings, pace: e.target.value as Pace })
              }
            >
              <option value="quick">Quick · 30 sec answers</option>
              <option value="normal">Normal · 45 sec answers</option>
              <option value="relaxed">Relaxed · 60 sec answers</option>
            </select>
          </label>
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
              <option value="en">English</option>
              <option value="hi">हिन्दी · Hindi</option>
              <option value="hinglish">Hinglish</option>
            </select>
          </label>
          <label>
            Spice level
            <select
              value={settings.spice}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  spice: e.target.value as typeof settings.spice,
                })
              }
            >
              <option value="mild">Mild · warm teasing</option>
              <option value="medium">Medium · sharp banter</option>
              <option value="spicy">Spicy · adult party humour, 18+</option>
            </select>
          </label>
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
