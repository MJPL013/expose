"use client";
import { useEffect, useId, useRef, type AudioHTMLAttributes } from "react";
import { useServices } from "../session/provider";

/** Release detached media elements as well as their feedback suppression lease. */
export function ClipPlayer(
  props: Omit<AudioHTMLAttributes<HTMLAudioElement>, "src"> & { src: string },
) {
  const ref = useRef<HTMLAudioElement>(null);
  const id = useId();
  const { feedback, audio } = useServices();
  useEffect(() => {
    const node = ref.current;
    if (node && props.src) node.src = props.src;
    return () => {
      node?.pause();
      node?.removeAttribute("src");
      node?.load();
      feedback.suppress(id, false);
    };
  }, [id, feedback, props.src]);
  useEffect(() => {
    const node = ref.current;
    if (!node || !/^\/api\/v1\/media\/[a-f0-9-]+$/.test(props.src)) return;
    let began: number | null = null;
    const start = () => {
      if (began === null) began = performance.now();
    };
    const finish = () => {
      if (began === null) return;
      const milliseconds = Math.min(
        60000,
        Math.round(performance.now() - began),
      );
      began = null;
      if (milliseconds < 1) return;
      void fetch(`${props.src}/playback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: crypto.randomUUID(), milliseconds }),
        keepalive: true,
      }).catch(() => {});
    };
    node.addEventListener("playing", start);
    node.addEventListener("pause", finish);
    node.addEventListener("ended", finish);
    node.addEventListener("waiting", finish);
    return () => {
      finish();
      node.removeEventListener("playing", start);
      node.removeEventListener("pause", finish);
      node.removeEventListener("ended", finish);
      node.removeEventListener("waiting", finish);
    };
  }, [props.src]);
  return (
    <audio
      {...props}
      ref={ref}
      onPlay={(event) => {
        if (audio.isCapturing()) {
          event.currentTarget.pause();
          return;
        }
        feedback.suppress(id, true);
        props.onPlay?.(event);
      }}
      onPause={(event) => {
        feedback.suppress(id, false);
        props.onPause?.(event);
      }}
      onEnded={(event) => {
        feedback.suppress(id, false);
        props.onEnded?.(event);
      }}
    />
  );
}
