"use client";

import { useId, type CSSProperties } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import styles from "./rating-tuner.module.css";

/** The wire/draft value stays 0–10. The tuner displays distance from its centre. */
export function RatingTuner({
  label,
  left,
  right,
  value,
  onChange,
}: {
  label: string;
  left: string;
  right: string;
  value: number | null;
  onChange(value: number): void;
}) {
  const id = useId();
  const position = value ?? 5;
  const strength = Math.abs(position - 5);
  const selected = value !== null;
  const direction = position < 5 ? left : right;
  const description = !selected
    ? "Not answered. Choose a side or choose 0 for balanced."
    : position === 5
      ? "0, balanced between both sides"
      : `${strength} toward ${direction}`;
  const move = (step: number) =>
    onChange(Math.max(0, Math.min(10, position + step)));

  return (
    <div
      className={styles.tuner}
      role="group"
      aria-label={label}
      data-answered={selected}
    >
      <div className={styles.endpoints} aria-hidden="true">
        <span data-active={selected && position < 5}>{left}</span>
        <span data-active={selected && position > 5}>{right}</span>
      </div>
      <div className={styles.dial} data-answered={selected}>
        <div className={styles.ruler} aria-hidden="true">
          {Array.from({ length: 41 }, (_, i) => (
            <span
              key={i}
              className={styles.tick}
              style={{ left: `${i * 2.5}%` }}
              data-major={i % 4 === 0}
              data-centre={i === 20}
            >
              {i % 4 === 0 && (
                <b data-current={selected && position === i / 4}>
                  {Math.abs(i / 4 - 5)}
                </b>
              )}
            </span>
          ))}
          <span
            className={styles.needle}
            style={{ "--position": `${position * 10}%` } as CSSProperties}
          />
        </div>
        <input
          id={id}
          className={styles.input}
          type="range"
          min={-5}
          max={5}
          step={1}
          value={position - 5}
          aria-label={`${label}: ${left} to ${right}`}
          aria-valuetext={description}
          onChange={(e) => onChange(Number(e.currentTarget.value) + 5)}
          onPointerUp={(e) => {
            // A centre tap is deliberate even when the native range value hasn't moved.
            if (!selected) onChange(Number(e.currentTarget.value) + 5);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onChange(position);
            }
          }}
        />
      </div>
      <output className={styles.readout} htmlFor={id} aria-live="off">
        {!selected
          ? "Choose a side, or stay balanced"
          : position === 5
            ? "0 · Balanced"
            : `${strength} · ${direction}`}
      </output>
      <div className={styles.adjustments}>
        <button
          type="button"
          aria-label={`${label}: move toward ${left}`}
          onClick={() => move(-1)}
          disabled={value === 0}
        >
          <ChevronLeft size={19} aria-hidden="true" />
        </button>
        <button
          type="button"
          className={styles.balance}
          aria-label={`${label}: choose 0, balanced`}
          aria-pressed={value === 5}
          onClick={() => onChange(5)}
        >
          <b>0</b>
          <span>Balanced</span>
        </button>
        <button
          type="button"
          aria-label={`${label}: move toward ${right}`}
          onClick={() => move(1)}
          disabled={value === 10}
        >
          <ChevronRight size={19} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
