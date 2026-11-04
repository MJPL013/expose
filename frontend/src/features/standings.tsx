"use client";
import { useLayoutEffect, useRef } from "react";
import type { Player, ScoreEvent } from "@expose/shared/game/contracts";
import { Avatar } from "../ui/primitives";
import { usePlayerPreferences } from "../session/provider";
import { competitiveCopy as c } from "../content/competitive.en";
import styles from "./competitive.module.css";

export function Standings({
  players,
  events = [],
  animate = true,
  viewerId,
}: {
  players: Player[];
  events?: ScoreEvent[];
  animate?: boolean;
  viewerId?: string;
}) {
  const root = useRef<HTMLDivElement>(null);
  const { feedback } = usePlayerPreferences();
  const ordered = [...players].sort((a, b) => b.score - a.score);
  const deltas = Object.fromEntries(
    players.map((p) => [
      p.id,
      events
        .filter((e) => e.playerId === p.id)
        .reduce((sum, e) => sum + e.points, 0),
    ]),
  );
  const previous = [...players].sort(
    (a, b) => b.score - deltas[b.id] - (a.score - deltas[a.id]),
  );
  const animationKey = JSON.stringify([
    players.map((p) => [p.id, p.score]),
    deltas,
  ]);
  useLayoutEffect(() => {
    if (
      !animate ||
      feedback.reduceMotion ||
      matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return;
    const rows = [
      ...root.current!.querySelectorAll<HTMLElement>("[data-seat]"),
    ];
    const animations: Animation[] = [];
    for (const row of rows) {
      const oldIndex = previous.findIndex((p) => p.id === row.dataset.seat);
      const from = (rows[oldIndex]?.offsetTop ?? row.offsetTop) - row.offsetTop;
      if (from)
        animations.push(
          row.animate(
            [
              { transform: `translateY(${from}px)` },
              { transform: "translateY(0)" },
            ],
            { duration: 650, easing: "cubic-bezier(.2,.8,.2,1)" },
          ),
        );
    }
    const start = performance.now();
    root.current
      ?.querySelectorAll<HTMLElement>("[data-score]")
      .forEach((node) => {
        const p = players.find((p) => p.id === node.dataset.score)!;
        node.textContent = String(p.score - deltas[p.id]);
      });
    let frame = 0;
    const count = (now: number) => {
      const progress = Math.min(1, (now - start) / 650);
      root.current
        ?.querySelectorAll<HTMLElement>("[data-score]")
        .forEach((node) => {
          const p = players.find((p) => p.id === node.dataset.score)!;
          node.textContent = String(
            Math.round(p.score - deltas[p.id] * (1 - progress) ** 3),
          );
        });
      if (progress < 1) frame = requestAnimationFrame(count);
    };
    frame = requestAnimationFrame(count);
    return () => {
      cancelAnimationFrame(frame);
      animations.forEach((a) => a.cancel());
    };
    // The serialized scores identify a reveal; timer renders must not replay it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animationKey, animate, feedback.reduceMotion]);
  return (
    <section className={styles.standings} aria-label={c.standings}>
      <h2>{c.standings}</h2>
      <div ref={root} className={styles.rows}>
        {ordered.map((p) => (
          <div key={p.id} data-seat={p.id} className={styles.row}>
            <span className={styles.rank}>
              {ordered.findIndex((other) => other.score === p.score) + 1}
            </span>
            <Avatar
              name={p.name}
              color={p.color}
              variant={p.avatar}
              size={32}
            />
            <div className={styles.identity}>
              <strong>{p.name}</strong>
              <small>
                {p.controller === "ai"
                  ? "AI playing"
                  : p.controller === "simulated"
                    ? "Simulated player"
                    : p.id === viewerId
                      ? "You"
                      : p.connected
                        ? "Connected"
                        : "Seat reserved"}
                {p.aiPoints !== 0
                  ? ` · AI ${p.aiPoints > 0 ? "+" : ""}${p.aiPoints}`
                  : ""}
              </small>
            </div>
            <div
              className={styles.points}
              aria-label={`${p.score} points${deltas[p.id] ? `, ${deltas[p.id]} this question` : ""}`}
            >
              <b aria-hidden="true" data-score={p.id}>
                {p.score}
              </b>
              {deltas[p.id] !== 0 && (
                <small className={styles.delta} aria-hidden="true">
                  {deltas[p.id] > 0 ? "+" : ""}
                  {deltas[p.id]}
                </small>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
