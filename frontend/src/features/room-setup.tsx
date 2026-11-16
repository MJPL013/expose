"use client";
import { useId } from "react";
import { Avatar } from "../ui/primitives";
import { avatarSvg } from "@expose/shared/game/appearance";
import { paceTimes, type Pace } from "@expose/shared/game/guided";
import { roomSizes } from "@expose/shared/game/contracts";
import type { PlayerProfile } from "../player/preferences";
import styles from "./entry.module.css";

export function ChoiceCards<T extends string>({
  label,
  value,
  options,
  onChange,
  scroll = false,
}: {
  label: string;
  value: T;
  options: { value: T; title: string; detail?: string }[];
  onChange(value: T): void;
  scroll?: boolean;
}) {
  const name = useId();
  return (
    <fieldset className={styles.optionGroup}>
      <legend>{label}</legend>
      <div className={scroll ? styles.timerRail : styles.choices}>
        {options.map((o) => (
          <label
            className={styles.choice}
            data-selected={value === o.value}
            key={o.value}
          >
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={value === o.value}
              onChange={() => onChange(o.value)}
              onFocus={(e) =>
                e.currentTarget.parentElement?.scrollIntoView({
                  block: "nearest",
                  inline: "nearest",
                })
              }
            />
            <strong>{o.title}</strong>
            {o.detail && <span>{o.detail}</span>}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
export function PacePicker({
  value,
  onChange,
}: {
  value: Pace;
  onChange(v: Pace): void;
}) {
  const p = paceTimes[value];
  return (
    <div>
      <ChoiceCards
        label="Answer time"
        value={value}
        onChange={onChange}
        scroll
        options={(
          [
            ["quick", "Quick"],
            ["normal", "Normal"],
            ["relaxed", "Relaxed"],
          ] as const
        ).map(([value, detail]) => ({
          value,
          title: `${paceTimes[value].answer} sec`,
          detail,
        }))}
      />
      <small className={styles.timingDetail}>
        {p.ratings}s ratings · {p.choice}s votes · {p.reveal}s reveals
      </small>
    </div>
  );
}
export function ProfileIdentity({
  profile,
  onEdit,
}: {
  profile: PlayerProfile;
  onEdit(): void;
}) {
  return (
    <div className={styles.identity}>
      <Avatar
        name={profile.name}
        variant={profile.avatar}
        color={profile.color}
        size={42}
      />
      <div>
        <small>Playing as</small>
        <strong>{profile.name}</strong>
      </div>
      <button type="button" onClick={onEdit}>
        Edit profile
      </button>
    </div>
  );
}
const vehicles = [
  "Tandem bicycle",
  "Auto-rickshaw",
  "Compact car",
  "Squad car",
  "SUV",
  "Van",
];
export function SquadPicker({
  count,
  onChange,
  profile,
  minutes,
}: {
  count: number;
  onChange(n: number): void;
  profile: PlayerProfile;
  minutes: number;
}) {
  const label = useId();
  const body = {
    3: "M65 140V65Q65 46 85 46H285L375 110V140Z",
    4: "M55 140V112Q55 100 77 96L107 61Q120 48 140 48H280L320 94 365 109V140Z",
    5: "M38 140V112L65 97 94 58Q107 46 129 46H306L350 96 393 111V140Z",
    6: "M28 140V82L49 45Q55 35 70 35H330L379 87 408 102V140Z",
    7: "M24 140V53Q24 32 46 32H343Q365 32 375 53L411 102V140Z",
  }[count];
  // Seat centres follow the saddles/windows, not uniform spacing across the chassis.
  const seating = {
    2: { centres: [145, 260], size: 52, y: 31 },
    3: { centres: [115, 195, 315], size: 48, y: 62 },
    4: { centres: [120, 176, 232, 288], size: 44, y: 66 },
    5: { centres: [102, 153, 204, 255, 306], size: 44, y: 65 },
    6: { centres: [88, 136, 184, 232, 280, 328], size: 43, y: 58 },
    7: { centres: [65, 113, 161, 209, 257, 305, 353], size: 43, y: 61 },
  }[count as 2 | 3 | 4 | 5 | 6 | 7];
  return (
    <section className={styles.squad} aria-labelledby={label}>
      <div className={styles.squadHeading}>
        <h3 id={label}>Who’s coming?</h3>
        <span>{vehicles[count - 2]}</span>
      </div>
      <svg
        key={count}
        className={styles.vehicle}
        viewBox="0 0 440 190"
        role="img"
        aria-label={`${vehicles[count - 2]} with ${count} characters, including ${profile.name}`}
      >
        <ellipse
          cx="220"
          cy="165"
          rx="190"
          ry="9"
          fill="currentColor"
          opacity=".07"
        />
        {count === 2 ? (
          <g
            fill="none"
            stroke="currentColor"
            strokeWidth="5"
            strokeLinejoin="round"
          >
            <circle cx="75" cy="135" r="30" />
            <circle cx="365" cy="135" r="30" />
            <path
              d="M75 135L145 83 195 135H75M145 83H260L310 135H195L260 83M310 135L335 85 365 135M133 83H157M248 83H272M335 85V65H350"
              stroke="var(--accent-text)"
            />
          </g>
        ) : (
          <g>
            <path
              d={body}
              fill="var(--accent-text)"
              fillOpacity=".22"
              stroke="var(--accent-text)"
              strokeWidth="3"
            />
            <path
              d={
                count === 3
                  ? "M68 110H370"
                  : count === 4
                    ? "M62 112H357"
                    : "M44 112H392"
              }
              stroke="var(--accent-text)"
              strokeWidth="2"
            />
            {count >= 6 && (
              <path
                d={
                  count === 7
                    ? "M42 39H340M49 120H370"
                    : "M62 26H320M75 26V35M306 26V35"
                }
                stroke="var(--accent-text)"
                strokeWidth="3"
              />
            )}
            <path
              d={
                count === 3
                  ? "M76 126H91M350 125H365"
                  : "M76 126H91M349 125H365"
              }
              stroke="var(--text)"
              strokeWidth="4"
              strokeLinecap="round"
            />
            <circle cx="100" cy="145" r="22" fill="var(--text)" />
            <circle cx="335" cy="145" r="22" fill="var(--text)" />
            <circle cx="100" cy="145" r="9" fill="var(--surface)" />
            <circle cx="335" cy="145" r="9" fill="var(--surface)" />
            {count === 3 && (
              <path
                d="M285 48V110H367"
                fill="none"
                stroke="var(--accent-text)"
                strokeWidth="4"
              />
            )}
          </g>
        )}
        {seating.centres.map((centre, i) => {
          // The auto's sloping windscreen has a smaller, lower front seat.
          const driver = count === 3 && i === 2;
          const size = driver ? 40 : seating.size;
          const y = driver ? 70 : seating.y;
          const x = centre - size / 2;
          return (
            <g
              key={i}
              data-passenger={i}
              transform={`translate(${x} ${y})`}
            >
              <svg
                width={size}
                height={size}
                viewBox="0 0 100 100"
                dangerouslySetInnerHTML={{
                  __html: avatarSvg(
                    i === 0 ? profile.avatar : i + 1,
                    i === 0
                      ? profile.color
                      : ["#ffb020", "#e77757", "#7ebdae"][i % 3],
                  )
                    .replace(/^<svg[^>]*>/, "")
                    .replace(/<path fill="[^"]+" d="M0 0h100v100H0z"\/>/, "")
                    .replace(/<\/svg>$/, ""),
                }}
              />
            </g>
          );
        })}
      </svg>
      <fieldset className={styles.seats}>
        <legend className={styles.srOnly}>Number of players</legend>
        {roomSizes.map((n) => (
          <label data-selected={n === count} key={n}>
            <input
              type="radio"
              name="room-seats"
              value={n}
              checked={n === count}
              onChange={() => onChange(n)}
            />
            <span>{n}</span>
          </label>
        ))}
      </fieldset>
      <p>
        <strong>{count} players, including you</strong>
        <span>About {minutes} minutes · everyone joins before you start</span>
      </p>
    </section>
  );
}
