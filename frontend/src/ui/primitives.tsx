import { uiCopy } from "../content/ui.en";
import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from "react";
import { Sparkles } from "lucide-react";
import { avatarSvg } from "@expose/shared/game/appearance";
import { Logo } from "./logo";
import styles from "./ui.module.css";

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "danger" | "text";
}) {
  return (
    <button
      {...props}
      className={`${styles.button} ${variant !== "primary" ? styles[variant] : ""} ${className}`}
    />
  );
}
export function IconButton({
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button {...props} className={styles.iconButton}>
      {children}
    </button>
  );
}
export function Brand() {
  return <Logo />;
}
export function Badge({
  children,
  gold = false,
}: {
  children: ReactNode;
  gold?: boolean;
}) {
  return (
    <span className={`${styles.badge} ${gold ? styles.badgeGold : ""}`}>
      {children}
    </span>
  );
}
export function Stamp({
  children,
  dark = false,
}: {
  children: ReactNode;
  dark?: boolean;
}) {
  return (
    <span className={`${styles.stamp} ${dark ? styles.stampDark : ""}`}>
      {children}
    </span>
  );
}
export function Paper({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`${styles.paper} ${className}`}>{children}</div>;
}
export function Avatar({
  name,
  color = "#ffb020",
  variant = 0,
  size = 52,
}: {
  name: string;
  color?: string;
  variant?: number;
  size?: number;
}) {
  return (
    <span
      className={styles.avatar}
      style={
        {
          "--avatar-size": `${size}px`,
          "--avatar-color": color,
        } as CSSProperties
      }
      role="img"
      aria-label={`${name}'s avatar`}
      dangerouslySetInnerHTML={{ __html: avatarSvg(variant, color) }}
    />
  );
}
export function HostLine({ children }: { children: ReactNode }) {
  return (
    <div className={styles.host}>
      <span className={styles.hostGlyph}>
        <Sparkles size={16} aria-hidden="true" />
      </span>
      <div>
        <span className={styles.hostLabel}>{uiCopy.primitives.hostLabel}</span>
        <p>{children}</p>
      </div>
    </div>
  );
}
