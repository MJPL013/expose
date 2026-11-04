import type { GameSnapshot } from "@expose/shared/game/contracts";
const storageKey = "expose.answer-draft.v1";
type Draft = { key: string; text: string; expires: number };
export const draftKey = (s: GameSnapshot) =>
  `${s.sessionId}:${s.view.viewerId}:${s.step.id}:${s.phaseEpoch}`;
const eligible = (s: GameSnapshot) =>
  s.online &&
  s.connection === "connected" &&
  s.view.actionPending &&
  !s.view.submitted;
export function clearAnswerDraft() {
  try {
    sessionStorage.removeItem(storageKey);
  } catch {
    /* Typing remains usable. */
  }
}
export function readAnswerDraft(s: GameSnapshot): string {
  if (!eligible(s)) return "";
  try {
    const draft: Draft | null = JSON.parse(
      sessionStorage.getItem(storageKey) ?? "null",
    );
    if (
      draft &&
      draft.key === draftKey(s) &&
      draft.expires > Date.now() &&
      typeof draft.text === "string"
    )
      return draft.text.slice(0, 240);
  } catch {
    /* Invalid or blocked storage is disposable. */
  }
  clearAnswerDraft();
  return "";
}
export function saveAnswerDraft(s: GameSnapshot, text: string) {
  if (!eligible(s)) return;
  if (!text) {
    clearAnswerDraft();
    return;
  }
  try {
    sessionStorage.setItem(
      storageKey,
      JSON.stringify({
        key: draftKey(s),
        text: text.slice(0, 240),
        expires: Date.now() + 2 * 60 * 60 * 1000,
      } satisfies Draft),
    );
  } catch {
    /* Storage is an enhancement, never an input dependency. */
  }
}
export function reconcileAnswerDraft(s: GameSnapshot) {
  if (!eligible(s)) clearAnswerDraft();
  else readAnswerDraft(s);
}
