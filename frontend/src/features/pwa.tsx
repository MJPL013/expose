"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { Check, Download, RefreshCw, Share2, WifiOff } from "lucide-react";
import { appCopy } from "../content/app.en";
import { Button } from "../ui/primitives";
import { Dialog } from "../ui/dialog";
import styles from "./app.module.css";
import { useRecovery } from "../session/provider";

type InstallEvent = Event & {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};
type PwaState = {
  prompt: InstallEvent | null;
  installed: boolean;
  offline: boolean;
  worker: ServiceWorker | null;
  clearPrompt(): void;
};
const Context = createContext<PwaState>({
  prompt: null,
  installed: false,
  offline: false,
  worker: null,
  clearPrompt() {},
});
export function PwaProvider({ children }: { children: ReactNode }) {
  const [prompt, setPrompt] = useState<InstallEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [offline, setOffline] = useState(false);
  const [worker, setWorker] = useState<ServiceWorker | null>(null);
  useEffect(() => {
    const display = matchMedia("(display-mode: standalone)");
    const refresh = () => {
      setInstalled(
        display.matches ||
          (navigator as Navigator & { standalone?: boolean }).standalone ===
            true,
      );
      setOffline(!navigator.onLine);
    };
    queueMicrotask(refresh);
    const beforeInstall = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallEvent);
    };
    const installedEvent = () => {
      setInstalled(true);
      setPrompt(null);
    };
    window.addEventListener("beforeinstallprompt", beforeInstall);
    window.addEventListener("appinstalled", installedEvent);
    window.addEventListener("online", refresh);
    window.addEventListener("offline", refresh);
    display.addEventListener("change", refresh);
    let live = true;
    let registered: ServiceWorkerRegistration | undefined;
    let installing: ServiceWorker | null = null;
    const changed = () => {
      if (
        live &&
        installing?.state === "installed" &&
        navigator.serviceWorker.controller
      )
        setWorker(registered?.waiting ?? installing);
    };
    const found = () => {
      installing = registered?.installing ?? null;
      installing?.addEventListener("statechange", changed);
    };
    if ("serviceWorker" in navigator) {
      if (process.env.NODE_ENV === "production") {
        void navigator.serviceWorker
          .register("/sw.js", { scope: "/", updateViaCache: "none" })
          .then((registration) => {
            registered = registration;
            if (live && registration.waiting) setWorker(registration.waiting);
            registration.addEventListener("updatefound", found);
          })
          .catch(() => {
            /* Installation remains optional if a browser blocks service workers. */
          });
      } else {
        // A previous production worker must never serve stale HTML during local design work.
        void navigator.serviceWorker
          .getRegistrations()
          .then((registrations) =>
            Promise.all(
              registrations
                .filter((registration) =>
                  registration.active?.scriptURL.endsWith("/sw.js"),
                )
                .map((registration) => registration.unregister()),
            ),
          );
      }
    }
    return () => {
      live = false;
      registered?.removeEventListener("updatefound", found);
      installing?.removeEventListener("statechange", changed);
      window.removeEventListener("beforeinstallprompt", beforeInstall);
      window.removeEventListener("appinstalled", installedEvent);
      window.removeEventListener("online", refresh);
      window.removeEventListener("offline", refresh);
      display.removeEventListener("change", refresh);
    };
  }, []);
  return (
    <Context.Provider
      value={{
        prompt,
        installed,
        offline,
        worker,
        clearPrompt: () => setPrompt(null),
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function InstallButton({ compact = false }: { compact?: boolean }) {
  const { installed, prompt, clearPrompt } = useContext(Context);
  const [help, setHelp] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const install = async () => {
    if (!prompt) {
      setHelp(true);
      return;
    }
    setBusy(true);
    try {
      await prompt.prompt();
      const result = await prompt.userChoice;
      setMessage(
        result.outcome === "accepted"
          ? "Installation requested. Your browser will finish setting up Expose."
          : "You can install later from Settings.",
      );
      clearPrompt();
    } catch {
      setHelp(true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      {installed ? (
        <p className={styles.notice}>
          <Check size={16} />
          {appCopy.settings.installed}
        </p>
      ) : (
        <Button variant="ghost" onClick={() => void install()} disabled={busy}>
          <Download size={17} />
          {compact ? appCopy.shell.install : appCopy.settings.install}
        </Button>
      )}
      {message && (
        <p className={styles.muted} role="status">
          {message}
        </p>
      )}
      {help && (
        <Dialog title={appCopy.settings.install} onClose={() => setHelp(false)}>
          <Share2 size={28} color="var(--primary)" />
          <p>{appCopy.settings.ios}</p>
          <p>{appCopy.settings.manual}</p>
          <Button onClick={() => setHelp(false)}>Got it</Button>
        </Dialog>
      )}
    </>
  );
}
export function PwaManager() {
  const recovery = useRecovery();
  const pathname = usePathname();
  const inMatch = recovery.active || recovery.blocked || pathname === "/void";
  const { offline, worker } = useContext(Context);
  const [dismissed, setDismissed] = useState(false);
  const [confirm, setConfirm] = useState(false);
  return (
    <>
      {offline && (
        <div className={styles.offline} role="status">
          <WifiOff size={13} /> {appCopy.shell.offline}{" "}
          <Link href="/demo">Open offline practice</Link>
        </div>
      )}
      {worker && !dismissed && !inMatch && (
        <div className={styles.updateBanner}>
          <p>{appCopy.shell.update}</p>
          <Button variant="ghost" onClick={() => setConfirm(true)}>
            <RefreshCw size={16} />
            {appCopy.shell.updateAction}
          </Button>
          <Button variant="text" onClick={() => setDismissed(true)}>
            {appCopy.shell.later}
          </Button>
        </div>
      )}
      {confirm && !inMatch && (
        <Dialog title={appCopy.shell.update} onClose={() => setConfirm(false)}>
          <p>{appCopy.shell.reloadWarning}</p>
          <Button
            onClick={() => {
              if (inMatch) return;
              navigator.serviceWorker.addEventListener(
                "controllerchange",
                () => window.location.reload(),
                { once: true },
              );
              worker?.postMessage({ type: "ACTIVATE_UPDATE" });
            }}
          >
            {appCopy.shell.updateAction}
          </Button>
          <Button variant="ghost" onClick={() => setConfirm(false)}>
            {appCopy.shell.later}
          </Button>
        </Dialog>
      )}
    </>
  );
}
