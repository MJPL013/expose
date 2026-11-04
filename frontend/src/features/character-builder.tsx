"use client";
import { useState } from "react";
import { Check, Shuffle } from "lucide-react";
import {
  appearanceOptions,
  appearanceParts,
  decodeAppearance,
  encodeAppearance,
  avatarColors,
  avatarColorNames,
  MAX_AVATAR_ID,
  type AppearancePart,
} from "@expose/shared/game/appearance";
import { Avatar } from "../ui/primitives";
import type { PlayerProfile } from "../player/preferences";
import styles from "./character-builder.module.css";

const labels: Record<AppearancePart, string> = {
  style: "Style",
  skin: "Skin tone",
  body: "Body",
  eyes: "Eyes",
  mouth: "Mouth",
  hair: "Hair",
  glasses: "Glasses",
  earrings: "Earrings",
  necklace: "Necklace",
};
export function CharacterBuilder({
  profile,
  onChange,
}: {
  profile: PlayerProfile;
  onChange: (profile: PlayerProfile) => void;
}) {
  const [part, setPart] = useState<AppearancePart>("hair");
  const appearance = decodeAppearance(profile.avatar);
  return (
    <section className={styles.builder} aria-label="Character builder">
      <div className={styles.preview}>
        <Avatar
          name={profile.name || "You"}
          variant={profile.avatar}
          color={profile.color}
          size={132}
        />
        <div>
          <h2>Your usual suspect</h2>
          <p>Make a face your squad will recognise.</p>
          <small>Mix every detail. Save when it feels like you.</small>
          <button
            className={styles.randomise}
            type="button"
            onClick={() => {
              // Choose a complete valid combination; never repeat the current character.
              const candidate =
                4 + Math.floor(Math.random() * (MAX_AVATAR_ID - 3));
              const avatar =
                candidate === encodeAppearance(appearance)
                  ? 4 + ((candidate - 3) % (MAX_AVATAR_ID - 3))
                  : candidate;
              onChange({
                ...profile,
                avatar,
                color:
                  avatarColors[Math.floor(Math.random() * avatarColors.length)],
              });
            }}
          >
            <Shuffle size={17} aria-hidden="true" />
            Randomise
          </button>
        </div>
      </div>
      <div className={styles.parts} role="group" aria-label="Character parts">
        {appearanceParts.map((key) => (
          <button
            type="button"
            key={key}
            aria-pressed={part === key}
            onClick={() => setPart(key)}
          >
            {labels[key]}
          </button>
        ))}
      </div>
      <fieldset className={styles.options}>
        <legend>{labels[part]}</legend>
        <div className={styles.grid}>
          {appearanceOptions[part].map((label, index) => {
            const avatar = encodeAppearance({ ...appearance, [part]: index });
            const selected = appearance[part] === index;
            return (
              <button
                type="button"
                key={`${part}-${index}`}
                aria-label={label}
                aria-pressed={selected}
                onClick={() => onChange({ ...profile, avatar })}
              >
                <span aria-hidden="true">
                  <Avatar
                    name="Preview"
                    color={profile.color}
                    variant={avatar}
                    size={48}
                  />
                </span>
                <span>{label}</span>
                {selected && (
                  <Check
                    className={styles.check}
                    size={14}
                    aria-hidden="true"
                  />
                )}
              </button>
            );
          })}
        </div>
      </fieldset>
      <fieldset className={styles.backgrounds}>
        <legend>Background</legend>
        <div>
          {avatarColors.map((color, index) => (
            <button
              type="button"
              key={color}
              aria-label={avatarColorNames[index]}
              aria-pressed={profile.color === color}
              style={{ backgroundColor: color }}
              onClick={() => onChange({ ...profile, color })}
            >
              {profile.color === color && (
                <Check size={20} aria-hidden="true" />
              )}
            </button>
          ))}
        </div>
      </fieldset>
    </section>
  );
}
