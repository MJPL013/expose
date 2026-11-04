"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import {
  ArrowLeft,
  CreditCard,
  Gamepad2,
  Settings2,
  UserRound,
  Volume2,
  VolumeX,
} from "lucide-react";
import { usePlayerPreferences, useServices } from "../session/provider";
import { appCopy } from "../content/app.en";
import { Avatar, IconButton } from "../ui/primitives";
import { useMatchNavigation } from "./match-navigation";
import { PwaManager } from "./pwa";
import { Logo } from "../ui/logo";
import styles from "./app.module.css";

export function SoundToggle() {
  const value = usePlayerPreferences();
  const { preferences, feedback } = useServices();
  return (
    <IconButton
      aria-label={
        value.sound.enabled ? appCopy.shell.soundOn : appCopy.shell.soundOff
      }
      aria-pressed={value.sound.enabled}
      onClick={() => {
        preferences.saveSound({
          ...value.sound,
          enabled: !value.sound.enabled,
        });
        if (!value.sound.enabled)
          void feedback.unlock().then(() => feedback.emit("ready"));
      }}
    >
      {value.sound.enabled ? <Volume2 size={19} /> : <VolumeX size={19} />}
    </IconButton>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { profile, layout } = usePlayerPreferences();
  const requestLeave = useMatchNavigation();
  const playing = pathname === "/play" || pathname === "/preview";
  useEffect(() => {
    const viewport = window.visualViewport;
    const resize = () => {
      // Pinch zoom keeps its own viewport; never shrink the app when the user zooms.
      if (viewport && viewport.scale === 1) {
        document.documentElement.style.setProperty(
          "--app-height",
          `${viewport.height}px`,
        );
        document.documentElement.style.setProperty(
          "--app-offset",
          `${viewport.offsetTop}px`,
        );
        document.documentElement.dataset.keyboard = String(
          window.innerHeight - viewport.height > 140,
        );
      }
    };
    resize();
    viewport?.addEventListener("resize", resize);
    viewport?.addEventListener("scroll", resize);
    window.addEventListener("resize", resize);
    return () => {
      viewport?.removeEventListener("resize", resize);
      viewport?.removeEventListener("scroll", resize);
      window.removeEventListener("resize", resize);
    };
  }, []);
  const tabs = [
    { href: "/", label: appCopy.nav.play, Icon: Gamepad2 },
    { href: "/collection", label: appCopy.nav.collection, Icon: CreditCard },
    { href: "/profile", label: appCopy.nav.profile, Icon: UserRound },
  ];
  return (
    <div
      className={styles.appFrame}
      data-app-frame
      data-layout={layout}
      data-playing={playing}
    >
      {!playing && (
        <header className={styles.appHeader}>
          <Link href="/" className={styles.wordmark} aria-label="Expose home">
            <Logo />
          </Link>
          <div className={styles.headerActions}>
            <SoundToggle />
            <Link
              href="/settings"
              className={styles.iconLink}
              aria-label={appCopy.nav.settings}
              aria-current={pathname === "/settings" ? "page" : undefined}
            >
              <Settings2 size={20} />
            </Link>
            <Link
              href="/profile"
              className={styles.profileLink}
              aria-label="Edit your character"
            >
              <Avatar
                name={profile.name}
                color={profile.color}
                variant={profile.avatar}
                size={36}
              />
            </Link>
          </div>
        </header>
      )}
      <div className={styles.routeViewport}>{children}</div>
      {!playing && (
        <nav className={styles.bottomNav} aria-label="App navigation">
          {tabs.map(({ href, label, Icon }) => {
            const active =
              href === "/" ? pathname === "/" || playing : pathname === href;
            return (
              <Link
                key={href}
                href={playing && href === "/" ? "/play" : href}
                className={styles.navItem}
                aria-current={active ? "page" : undefined}
                onClick={(event) => {
                  event.preventDefault();
                  requestLeave(() => router.push(href));
                }}
              >
                <Icon size={22} strokeWidth={active ? 2.2 : 1.8} />
                <span>{label}</span>
                {active && <i />}
              </Link>
            );
          })}
        </nav>
      )}
      <PwaManager />
    </div>
  );
}

export function PageHeading({
  eyebrow,
  title,
  accent,
}: {
  eyebrow: string;
  title: string;
  accent?: string;
}) {
  return (
    <div className={styles.pageHeading}>
      <span className={styles.eyebrow}>{eyebrow}</span>
      <h1 tabIndex={-1}>
        {title}
        {accent && (
          <>
            <br />
            <em>{accent}</em>
          </>
        )}
      </h1>
    </div>
  );
}
export function BackLink() {
  return (
    <Link href="/" className={styles.backLink}>
      <ArrowLeft size={17} /> Back to play
    </Link>
  );
}
