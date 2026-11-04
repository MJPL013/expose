import { afterEach, expect, it, vi } from "vitest";
import { ClipFeed } from "../src/session/clip-feed";
import {
  readAnswerDraft,
  saveAnswerDraft,
  reconcileAnswerDraft,
  clearAnswerDraft,
} from "../src/session/answer-draft";
import { initialState, project } from "@expose/shared/game/engine";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
it("restores only the same pending question and discards submitted, expired, vetoed and blocked-storage drafts", () => {
  const data = new Map<string, string>();
  vi.stubGlobal("sessionStorage", {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => data.set(k, v),
    removeItem: (k: string) => data.delete(k),
  });
  const snapshot = {
    ...project(initialState()),
    online: true,
    connection: "connected" as const,
  };
  snapshot.view.actionPending = true;
  saveAnswerDraft(snapshot, "An unfinished answer");
  expect(readAnswerDraft(snapshot)).toBe("An unfinished answer");
  expect(
    readAnswerDraft({ ...snapshot, phaseEpoch: snapshot.phaseEpoch + 1 }),
  ).toBe("");
  saveAnswerDraft(snapshot, "Answer");
  reconcileAnswerDraft({
    ...snapshot,
    view: { ...snapshot.view, submitted: true },
  });
  expect(readAnswerDraft(snapshot)).toBe("");
  saveAnswerDraft(snapshot, "Old");
  vi.spyOn(Date, "now").mockReturnValue(Date.now() + 7200001);
  expect(readAnswerDraft(snapshot)).toBe("");
  vi.restoreAllMocks();
  vi.stubGlobal("sessionStorage", {
    getItem: () => {
      throw new Error("Blocked");
    },
    setItem: () => {
      throw new Error("Blocked");
    },
    removeItem: () => {
      throw new Error("Blocked");
    },
  });
  expect(() => saveAnswerDraft(snapshot, "Still usable")).not.toThrow();
  expect(readAnswerDraft(snapshot)).toBe("");
  expect(clearAnswerDraft).not.toThrow();
});

it("coalesces media invalidations, never overlaps fetches and cancels inactive work", async () => {
  vi.useFakeTimers();
  const pending: ((clips: []) => void)[] = [];
  const signals: AbortSignal[] = [];
  const fetcher = vi.fn((signal: AbortSignal) => {
    signals.push(signal);
    return new Promise<[]>((resolve) => pending.push(resolve));
  });
  const feed = new ClipFeed(fetcher);
  feed.activate("run:1");
  feed.invalidate("run");
  feed.invalidate("run");
  await vi.advanceTimersByTimeAsync(100);
  expect(fetcher).toHaveBeenCalledTimes(1);
  feed.invalidate("run");
  feed.invalidate("run");
  await vi.advanceTimersByTimeAsync(500);
  expect(fetcher).toHaveBeenCalledTimes(1);
  pending.shift()!([]);
  await vi.advanceTimersByTimeAsync(100);
  expect(fetcher).toHaveBeenCalledTimes(2);
  feed.activate(null);
  expect(signals[1].aborted).toBe(true);
  pending.shift()!([]);
  feed.invalidate("run");
  await vi.advanceTimersByTimeAsync(11000);
  expect(fetcher).toHaveBeenCalledTimes(2);
  feed.activate("run:2");
  await vi.advanceTimersByTimeAsync(100);
  pending.shift()!([]);
  await vi.advanceTimersByTimeAsync(11000);
  expect(fetcher).toHaveBeenCalledTimes(3);
  feed.dispose();
});
