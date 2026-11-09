"use client";
import { createContext, useContext, type ReactNode } from "react";
import { createPortal } from "react-dom";

export const ActionDockContext = createContext<HTMLElement | null>(null);
/** Keeps phase actions outside the scroll pane while preserving their React state. */
export function ActionDock({ children }: { children: ReactNode }) {
  const target = useContext(ActionDockContext);
  return target ? (
    createPortal(children, target)
  ) : (
    <fieldset
      disabled
      aria-busy="true"
      data-inline-dock
      style={{ display: "contents" }}
    >
      {children}
    </fieldset>
  );
}
