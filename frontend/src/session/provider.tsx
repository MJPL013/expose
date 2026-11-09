"use client";
import { AccountSync } from "../account/sync";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useRef,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import { MockSession } from "./mock-session";
import { NetworkSession, type Recovery } from "./network-session";
import { NetworkAudio } from "../media/network-audio";
import { PlayModeStore } from "./play-mode";
import { LocalAudioService } from "../media/local-audio";
import { PlayerPreferencesStore } from "../player/preferences";
import { SoundEffects } from "../media/sound-effects";
import { FeedbackController } from "../media/feedback";
import { ScreenAwake } from "../media/wake-lock";
import { classicFlow } from "@expose/shared/game/definitions";
import { useSyncExternalStore } from "react";

type Services = {
  session: MockSession | NetworkSession;
  onlineSession: NetworkSession;
  chooseSession: (
    mode: "online" | "demo",
  ) => Promise<MockSession | NetworkSession>;
  sessionMode: "online" | "demo";
  audio: LocalAudioService;
  preferences: PlayerPreferencesStore;
  sounds: SoundEffects;
  feedback: FeedbackController;
  awake: ScreenAwake;
};
const Context = createContext<Services | null>(null);
export function SessionProvider({ children }: { children: ReactNode }) {
  const [services] = useState(() => {
    const preferences = new PlayerPreferencesStore();
    const sounds = new SoundEffects(preferences);
    const onlineSession = new NetworkSession();
    return {
      mode: new PlayModeStore(),
      onlineSession,
      networkAudio: new NetworkAudio(onlineSession),
      offlineSession: new MockSession(undefined, undefined, Date.now, true),
      developerSession:
        process.env.NODE_ENV === "development"
          ? new MockSession(classicFlow)
          : null,
      audio: new LocalAudioService(),
      preferences,
      sounds,
      feedback: new FeedbackController(sounds, preferences),
      awake: new ScreenAwake(),
    };
  });
  const sessionMode = useSyncExternalStore(
    services.mode.subscribe,
    services.mode.getSnapshot,
    services.mode.getServerSnapshot,
  );
  const activeSession =
    sessionMode === "online" ? services.onlineSession : services.offlineSession;
  useEffect(() => {
    const mode = services.mode.load();
    void (
      mode === "online" ? services.onlineSession : services.offlineSession
    ).initialize();
  }, [services]);
  useEffect(() => {
    services.preferences.load();
    document.documentElement.dataset.theme =
      services.preferences.getSnapshot().theme;
    document.documentElement.dataset.reduceMotion = String(
      services.preferences.getSnapshot().feedback.reduceMotion,
    );
    const unlock = () => {
      void services.sounds.unlock();
    };
    const visibility = () => {
      if (document.hidden) {
        services.feedback.cancel();
        services.audio.suspend();
        // Switching tabs silences media; an open socket still owns its online seat.
        // Actual disconnects and expired heartbeats remain server-owned.
        if (activeSession instanceof MockSession) activeSession.leaveForNow();
      } else if (window.location.pathname === "/play")
        activeSession.reconnectSeat("you");
    };
    const pagehide = () => {
      if (activeSession instanceof NetworkSession)
        activeSession.leaveForNow(true);
      else activeSession.leaveForNow();
      services.audio.suspend();
      services.feedback.cancel();
      void services.awake.setActive(false);
    };
    const mute = services.preferences.subscribe(() => {
      document.documentElement.dataset.theme =
        services.preferences.getSnapshot().theme;
      if (
        !services.preferences.getSnapshot().sound.enabled ||
        services.preferences.getSnapshot().sound.volume === 0
      )
        services.sounds.silence();
      else services.sounds.syncPreferences();
      if (!services.preferences.getSnapshot().feedback.vibration)
        services.feedback.cancel();
      document.documentElement.dataset.reduceMotion = String(
        services.preferences.getSnapshot().feedback.reduceMotion,
      );
    });
    const ownership = services.onlineSession.subscribe(() => {
      const recovery = services.onlineSession.getRecoverySnapshot();
      if (!recovery.blocked && recovery.status !== "ended") return;
      services.audio.dispose();
      services.feedback.cancel();
      void services.awake.setActive(false);
    });
    document.addEventListener("pointerdown", unlock, { passive: true });
    document.addEventListener("keydown", unlock);
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("pagehide", pagehide);
    return () => {
      document.removeEventListener("pointerdown", unlock);
      document.removeEventListener("keydown", unlock);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("pagehide", pagehide);
      mute();
      ownership();
    };
  }, [services, activeSession]);
  const pathname = usePathname();
  const previousPath = useRef(pathname);
  useEffect(() => {
    if (previousPath.current === "/" && pathname !== "/")
      document.documentElement.dataset.homeVisited = "true";
    previousPath.current = pathname;
  }, [pathname]);
  const developer = pathname === "/dev" || pathname === "/preview";
  useEffect(() => {
    services.audio.setCaptureAdapter(
      !developer && sessionMode === "online" ? services.networkAudio : null,
    );
    services.audio.setRemoteMedia(
      !developer && sessionMode === "online"
        ? {
            consent: (id, value) =>
              services.onlineSession.clipConsent(id, value),
            remove: (id) => services.onlineSession.removeClip(id),
          }
        : null,
    );
  }, [developer, sessionMode, services]);
  const value = useMemo(
    () => ({
      session:
        developer && services.developerSession
          ? services.developerSession
          : activeSession,
      onlineSession: services.onlineSession,
      sessionMode,
      chooseSession: async (mode: "online" | "demo") => {
        const selected =
          mode === "online" ? services.onlineSession : services.offlineSession;
        if (selected !== activeSession) activeSession.leaveForNow();
        await selected.initialize();
        services.mode.set(mode);
        return selected;
      },
      audio: services.audio,
      preferences: services.preferences,
      sounds: services.sounds,
      feedback: services.feedback,
      awake: services.awake,
    }),
    [developer, services, sessionMode, activeSession],
  );
  useEffect(() => {
    if (pathname !== "/play" && pathname !== "/preview") {
      services.audio.dispose();
      services.feedback.cancel();
    }
    services.sounds.setAmbient(
      pathname !== "/play" && pathname !== "/preview" && pathname !== "/void",
    );
    return () => {
      services.audio.dispose();
      services.feedback.cancel();
      services.feedback.suppress("playback", false);
      void services.awake.setActive(false);
    };
  }, [pathname, services]);
  useEffect(
    () => () => {
      services.onlineSession.dispose();
      services.offlineSession.dispose();
      services.developerSession?.dispose();
      services.audio.dispose();
      services.sounds.dispose();
      services.feedback.dispose();
      void services.awake.setActive(false);
    },
    [services],
  );
  return (
    <Context.Provider value={value}>
      <AccountSync />
      {children}
    </Context.Provider>
  );
}
export function useServices() {
  const context = useContext(Context);
  if (!context) throw new Error("SessionProvider is missing.");
  return context;
}
export function useDeveloperServices() {
  const services = useServices();
  if (!(services.session instanceof MockSession))
    throw new Error("Developer tools require a mock session.");
  return { ...services, session: services.session };
}
export function usePlayerPreferences() {
  const { preferences } = useServices();
  return useSyncExternalStore(
    preferences.subscribe,
    preferences.getSnapshot,
    preferences.getServerSnapshot,
  );
}
export function useRecovery() {
  const { session } = useServices();
  return useSyncExternalStore<Recovery>(
    session.subscribe,
    session.getRecoverySnapshot,
    session.getRecoverySnapshot,
  );
}
