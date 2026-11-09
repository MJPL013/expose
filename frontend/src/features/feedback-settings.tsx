"use client";
import { useState, useSyncExternalStore } from "react";
import { usePlayerPreferences, useServices } from "../session/provider";
import { Button } from "../ui/primitives";
import { appCopy } from "../content/app.en";
import styles from "./competitive.module.css";
import { ThemeToggle } from "./theme-toggle";
const subscribe = () => () => {};
export function FeedbackSettings() {
  const value = usePlayerPreferences();
  const { preferences, feedback } = useServices();
  const [notice, setNotice] = useState("");
  const supported = useSyncExternalStore(
    subscribe,
    () => feedback.supported(),
    () => false,
  );
  const saved = (success: boolean) => {
    if (!success) setNotice(appCopy.profile.temporary);
  };
  return (
    <div className={styles.controls}>
      <ThemeToggle />
      <label>
        App layout
        <select
          value={value.layout}
          onChange={(e) =>
            saved(
              preferences.saveLayout(e.target.value as "adaptive" | "compact"),
            )
          }
        >
          <option value="adaptive">Adaptive · use available space</option>
          <option value="compact">Compact · phone-sized view</option>
        </select>
      </label>
      <label className={styles.toggle}>
        <span>
          <b>{appCopy.settings.sound}</b>
          <small>{appCopy.settings.soundHint}</small>
        </span>
        <input
          type="checkbox"
          role="switch"
          checked={value.sound.enabled}
          onChange={(e) => {
            saved(
              preferences.saveSound({
                ...value.sound,
                enabled: e.target.checked,
              }),
            );
            if (e.target.checked)
              void feedback.unlock().then(() => feedback.emit("ready"));
          }}
        />
      </label>
      <label className={styles.toggle}>
        <span>
          <b>{appCopy.settings.timer}</b>
          <small>Only while your answer or choice is still needed.</small>
        </span>
        <input
          type="checkbox"
          role="switch"
          checked={value.sound.timer}
          onChange={(e) =>
            saved(
              preferences.saveSound({
                ...value.sound,
                timer: e.target.checked,
              }),
            )
          }
        />
      </label>
      <label>
        {appCopy.settings.volume} · {Math.round(value.sound.volume * 100)}%
        <input
          type="range"
          min={0}
          max={100}
          value={value.sound.volume * 100}
          onChange={(e) =>
            saved(
              preferences.saveSound({
                ...value.sound,
                volume: Number(e.target.value) / 100,
              }),
            )
          }
        />
      </label>
      <Button
        variant="ghost"
        disabled={!value.sound.enabled || !value.sound.volume}
        onClick={() =>
          void feedback.unlock().then(() => feedback.emit("reveal"))
        }
      >
        {appCopy.settings.test}
      </Button>
      {(
        [
          [
            "vibration",
            "Vibration",
            "Short confirmations and turn alerts on supported phones.",
          ],
          [
            "timerVibration",
            "Timer vibration",
            "Pulses build in the last five seconds while your action is pending.",
          ],
          [
            "reduceMotion",
            "Reduce motion",
            "Stable reveals and immediate score updates. System settings also apply.",
          ],
          [
            "keepAwake",
            "Keep screen awake during play",
            "While the match is visible; your phone may override this to save power.",
          ],
        ] as const
      ).map(([key, title, description]) => (
        <label key={key} className={styles.toggle}>
          <span>
            <b>{title}</b>
            <small>{description}</small>
          </span>
          <input
            type="checkbox"
            role="switch"
            checked={value.feedback[key]}
            onChange={(e) =>
              saved(
                preferences.saveFeedback({
                  ...value.feedback,
                  [key]: e.target.checked,
                }),
              )
            }
          />
        </label>
      ))}
      <Button
        variant="ghost"
        disabled={!supported || !value.feedback.vibration}
        onClick={() => {
          const result = feedback.testVibration();
          setNotice(
            {
              unsupported:
                "This browser has no vibration API. Sound and visual cues remain available.",
              disabled: "Turn on Vibration to try the test.",
              suppressed:
                "Stop recording or audio playback, then tap Test vibration again.",
              blocked:
                "Chrome rejected the vibration request. Open the game directly in a browser tab and try again.",
              requested:
                "Two pulses requested. If you felt nothing, check Android vibration settings and turn off Silent or Do Not Disturb. A browser cannot confirm that the motor moved.",
            }[result],
          );
        }}
      >
        Test vibration
      </Button>
      <p className={styles.notice}>
        {supported
          ? "Vibration depends on your device and its system settings."
          : "This browser does not support vibration. Visual cues and enabled sound still work."}
      </p>
      {notice && <p role="status">{notice}</p>}
    </div>
  );
}
