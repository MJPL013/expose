"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { useRecovery, useServices } from "../session/provider";
import { closeTopLayer } from "../ui/back-layers";
import { Dialog } from "../ui/dialog";
import { Button } from "../ui/primitives";

const Context = createContext<(after?: () => void) => void>(() => {});
export const useMatchNavigation = () => useContext(Context);

/** All app exits use one confirmation; opening it does not discard an answer. */
export function MatchNavigation({ children }: { children: ReactNode }) {
  const { session, audio, feedback, awake } = useServices();
  const recovery = useRecovery();
  const snapshot = useSyncExternalStore(
    session.subscribe,
    session.getSnapshot,
    session.getSnapshot,
  );
  const pathname = usePathname();
  const router = useRouter();
  const [pending, setPending] = useState<{ after: () => void } | null>(null);
  const [ending, setEnding] = useState(false);
  const [error, setError] = useState("");
  const allowed = useRef(false);
  const active = recovery.active && !recovery.blocked && pathname !== "/void";
  const request = useCallback(
    (after = () => router.replace("/")) => {
      if (!active) {
        after();
        return;
      }
      setError("");
      setEnding(false);
      setPending({ after });
    },
    [active, router],
  );
  const requestRef = useRef(request);
  useEffect(() => {
    requestRef.current = request;
  }, [request]);
  useEffect(() => {
    if (!active) return;
    const click = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const link = (event.target as Element)?.closest<HTMLAnchorElement>(
        "a[href]",
      );
      if (!link || link.target || link.download) return;
      const url = new URL(link.href);
      if (url.origin !== location.origin || url.pathname === location.pathname)
        return;
      event.preventDefault();
      event.stopPropagation();
      requestRef.current(() =>
        router.push(url.pathname + url.search + url.hash),
      );
    };
    const reload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    document.addEventListener("click", click, true);
    window.addEventListener("beforeunload", reload);
    return () => {
      document.removeEventListener("click", click, true);
      window.removeEventListener("beforeunload", reload);
    };
  }, [active, router]);
  useEffect(() => {
    if (!active || !["/play", "/preview"].includes(pathname)) return;
    allowed.current = false;
    const url = location.href;
    // At most one extra history entry per match route, not one per phase.
    if (!history.state?.exposeMatchGuard)
      history.pushState({ ...history.state, exposeMatchGuard: true }, "", url);
    const back = () => {
      if (allowed.current) return;
      history.pushState({ ...history.state, exposeMatchGuard: true }, "", url);
      if (!closeTopLayer()) requestRef.current();
    };
    window.addEventListener("popstate", back);
    return () => window.removeEventListener("popstate", back);
  }, [active, pathname]);
  const leave = async () => {
    try {
      if (ending) await session.endMatch();
      allowed.current = true;
      audio.dispose();
      feedback.cancel();
      void awake.setActive(false);
      session.leaveForNow();
      const after = pending?.after;
      setPending(null);
      after?.();
    } catch {
      setError("Could not end the match. Check your connection and retry.");
    }
  };
  return (
    <Context.Provider value={request}>
      {children}
      {pending && (
        <Dialog
          title={ending ? "End this match?" : "Leave the game?"}
          onClose={() => setPending(null)}
        >
          <p>
            {ending
              ? "This ends the match for everyone. Your saved cards stay."
              : "Your seat and points stay saved. A stand-in may play until you return. Unsent answers are discarded."}
          </p>
          {error && <p role="alert">{error}</p>}
          <Button
            variant={ending ? "danger" : "primary"}
            onClick={() => void leave()}
          >
            {ending ? "End match" : "Leave for now"}
          </Button>
          {!ending &&
            snapshot.players.find((p) => p.id === snapshot.view.viewerId)
              ?.host && (
              <Button variant="danger" onClick={() => setEnding(true)}>
                End match for everyone
              </Button>
            )}
          <Button variant="ghost" onClick={() => setPending(null)}>
            Stay with the squad
          </Button>
        </Dialog>
      )}
    </Context.Provider>
  );
}
