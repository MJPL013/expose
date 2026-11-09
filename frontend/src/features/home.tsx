"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  AudioLines,
  ChevronRight,
  Clock3,
  Fingerprint,
  Mic,
  ShieldCheck,
  Smartphone,
  Users,
} from "lucide-react";
import { appCopy } from "../content/app.en";
import { usePlayerPreferences, useServices } from "../session/provider";
import { Avatar, Stamp } from "../ui/primitives";
import { ActionDockContext } from "../ui/action-dock";
import { EntryActions } from "./entry";
import { InstallButton } from "./pwa";
import app from "./app.module.css";
import styles from "./home.module.css";
import { NetworkSession } from "../session/network-session";

export function HomeExperience({ demo = false }: { demo?: boolean }) {
  const { profile } = usePlayerPreferences();
  const { sounds, session } = useServices();
  useEffect(() => {
    if (demo || !(session instanceof NetworkSession)) return;
    const refresh = () => {
      if (!document.hidden) void session.refreshRecovery();
    };
    refresh();
    const interval = setInterval(refresh, 15000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [demo, session]);
  const [dock, setDock] = useState<HTMLDivElement | null>(null);
  const stampPlayed = useRef(false);
  useEffect(() => {
    if (document.documentElement.dataset.homeVisited === "true") return;
    let active = true;
    const playStamp = async () => {
      if (!active || stampPlayed.current) return;
      if (await sounds.playStamp()) stampPlayed.current = true;
    };
    const timer = window.setTimeout(() => void playStamp(), 180);
    const unlockAndPlay = () => void sounds.unlock().then(playStamp);
    document.addEventListener("pointerdown", unlockAndPlay, { once: true });
    document.addEventListener("keydown", unlockAndPlay, { once: true });
    return () => {
      active = false;
      window.clearTimeout(timer);
      document.removeEventListener("pointerdown", unlockAndPlay);
      document.removeEventListener("keydown", unlockAndPlay);
    };
  }, [sounds]);
  return (
    <ActionDockContext.Provider value={dock}>
      <div className={app.page}>
        <main id="main" className={`${app.scroll} ${styles.homeScroll}`}>
          <section
            className={styles.pack}
            aria-labelledby="case-title"
            data-case-file
          >
            <div className={styles.packTop}>
              <div>
                <span>
                  <span className={styles.liveDot} />
                  {appCopy.home.packLabel}
                </span>
                <h1 id="case-title">{appCopy.home.packTitle}</h1>
              </div>
              <Fingerprint size={20} />
            </div>
            <div className={styles.packArt}>
              <div className={styles.backFile} aria-hidden="true">
                <span>{appCopy.home.confidential}</span>
                <AudioLines size={38} />
              </div>
              <div className={styles.frontFile} aria-hidden="true">
                <span>{appCopy.home.dossier}</span>
                <div className={styles.portraits}>
                  <Avatar name="Manoj" color="#b5b2d8" variant={1} size={76} />
                  <Avatar
                    name={profile.name}
                    color={profile.color}
                    variant={profile.avatar}
                    size={84}
                  />
                  <Avatar name="Ananya" color="#dca58d" variant={2} size={70} />
                </div>
                <strong>{appCopy.home.dossierTitle}</strong>
                <span>{appCopy.home.dossierCaption}</span>
              </div>
              <div className={styles.stamp}>
                <Stamp>{appCopy.home.suspect}</Stamp>
              </div>
            </div>
            <div className={styles.packInfo}>
              <p>{appCopy.home.packDescription}</p>
              <div className={styles.chips}>
                <span>
                  <Users size={14} />
                  {appCopy.home.squad}
                </span>
                <span>
                  <Clock3 size={14} />
                  {appCopy.home.duration}
                </span>
                <span>
                  <Mic size={14} />
                  {appCopy.home.voice}
                </span>
              </div>
            </div>
          </section>
          <Link className={styles.characterLink} href="/profile">
            <Avatar
              name={profile.name}
              color={profile.color}
              variant={profile.avatar}
              size={34}
            />
            <span>
              <strong>
                {profile.name === "You" ? appCopy.home.suspect : profile.name}
              </strong>
              <small>{appCopy.home.character}</small>
            </span>
            <ChevronRight size={18} />
          </Link>
          <div className={app.sectionTitle}>
            <h2>{appCopy.home.how}</h2>
            <span>{appCopy.home.actsLabel}</span>
          </div>
          <div className={styles.acts}>
            {appCopy.home.acts.map(([n, title, description]) => (
              <div key={n}>
                <span>{n}</span>
                <div>
                  <h3>{title}</h3>
                  <p>{description}</p>
                </div>
              </div>
            ))}
          </div>
          <section className={styles.install}>
            <Smartphone size={25} />
            <div>
              <h2>{appCopy.home.installTitle}</h2>
              <p>{appCopy.home.installText}</p>
            </div>
            <InstallButton compact />
          </section>
          <p className={styles.privacy}>
            <ShieldCheck size={13} />
            {appCopy.home.privacy}
          </p>
        </main>
        <EntryActions demo={demo} />
        <div
          ref={setDock}
          className={app.dock}
          data-action-dock
          aria-label="Play actions"
        />
      </div>
    </ActionDockContext.Provider>
  );
}
