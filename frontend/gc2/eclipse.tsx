"use client";
import { useEffect, useRef } from "react";
import type { Presence } from "./client";
import styles from "./void.module.css";

/** Audio amplitude is sampled in the drawing loop, never pushed through React. */
export function Eclipse({
  state = "idle",
  sample,
}: {
  state?: Presence;
  sample?: () => number;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const live = useRef({ state, sample });
  useEffect(() => {
    live.current = { state, sample };
  }, [state, sample]);
  useEffect(() => {
    const el = canvas.current,
      ctx = el?.getContext("2d", { alpha: true });
    if (!el || !ctx) return;
    let width = 0,
      height = 0,
      raf = 0,
      previous = 0,
      level = 0;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    const resize = () => {
      const rect = el.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      const dpr = Math.min(devicePixelRatio || 1, 2);
      el.width = width * dpr;
      el.height = height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(el);
    resize();
    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      if (document.hidden || now - previous < (width < 500 ? 32 : 16)) return;
      previous = now;
      const reduce =
        reduced.matches ||
        document.documentElement.dataset.reduceMotion === "true";
      const mode = live.current.state,
        speaking = mode === "user" || mode === "speaking";
      const target = speaking ? (live.current.sample?.() ?? 0) : 0;
      level += (target - level) * (target > level ? 0.28 : 0.1);
      const t =
        reduce || mode === "paused" || mode === "review" ? 0 : now / 1000;
      const radius = Math.min(width, height) * 0.32;
      const cx = width / 2,
        cy = height / 2;
      ctx.clearRect(0, 0, width, height);
      const halo = ctx.createRadialGradient(
        cx,
        cy,
        radius * 0.85,
        cx,
        cy,
        radius * 1.55,
      );
      halo.addColorStop(0, "rgba(225,141,27,0)");
      halo.addColorStop(0.36, `rgba(226,145,34,${0.055 + level * 0.05})`);
      halo.addColorStop(1, "rgba(225,141,27,0)");
      ctx.fillStyle = halo;
      ctx.fillRect(0, 0, width, height);
      const disc = ctx.createRadialGradient(
        cx - radius * 0.3,
        cy - radius * 0.5,
        0,
        cx,
        cy,
        radius,
      );
      disc.addColorStop(0, "#18151a");
      disc.addColorStop(0.7, "#0c0b10");
      disc.addColorStop(1, "#100e13");
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fillStyle = disc;
      ctx.fill();
      for (let layer = 3; layer >= 0; layer--) {
        ctx.beginPath();
        for (let i = 0; i <= 240; i++) {
          const angle = (i / 240) * Math.PI * 2;
          const amplitude = reduce
            ? 0
            : speaking
              ? (mode === "user" ? 5 : 9) * level
              : 1.3;
          const wave =
            Math.sin(
              angle * (mode === "user" ? 9 : 3) + t * 1.4 + layer * 0.5,
            ) *
              amplitude +
            Math.sin(angle * 5 - t * 0.7) * amplitude * 0.32;
          const r = radius + layer * 1.6 + wave;
          const x = cx + Math.cos(angle) * r,
            y = cy + Math.sin(angle) * r;
          if (!i) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
        const rotation = t * (mode === "thinking" ? 0.55 : 0.12);
        const gradient = ctx.createConicGradient(rotation, cx, cy);
        gradient.addColorStop(0, "rgba(255,207,126,.9)");
        gradient.addColorStop(0.15, "rgba(207,114,19,.38)");
        gradient.addColorStop(0.42, "rgba(182,102,32,.12)");
        gradient.addColorStop(0.66, "rgba(255,173,48,.85)");
        gradient.addColorStop(0.85, "rgba(255,225,173,.95)");
        gradient.addColorStop(1, "rgba(255,207,126,.9)");
        ctx.strokeStyle = gradient;
        ctx.lineWidth = layer === 0 ? 1.4 : 0.8;
        ctx.globalAlpha = mode === "paused" ? 0.35 : 1 / (1 + layer * 0.9);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      // A single subtle point gives the otherwise dark centre a sense of depth.
      ctx.fillStyle = "rgba(255,212,141,.32)";
      ctx.beginPath();
      ctx.arc(cx, cy, 1.4, 0, Math.PI * 2);
      ctx.fill();
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, []);
  return <canvas ref={canvas} className={styles.eclipse} aria-hidden="true" />;
}
