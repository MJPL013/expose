"use client";
import { uiCopy } from "../content/ui.en";

import { useEffect, useRef, useId, type ReactNode } from "react";
import { X } from "lucide-react";
import { IconButton } from "./primitives";
import styles from "./ui.module.css";
import { registerBackLayer } from "./back-layers";

export function Dialog({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const backdropDown = useRef(false);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);
  useEffect(() => registerBackLayer(() => closeRef.current()), []);
  useEffect(() => {
    const dialog = ref.current;
    const previous = document.activeElement as HTMLElement;
    dialog?.showModal();
    return () => {
      dialog?.close();
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      aria-labelledby={titleId}
      onCancel={onClose}
      onPointerDown={(e) => {
        const box = e.currentTarget.getBoundingClientRect();
        backdropDown.current =
          e.target === e.currentTarget &&
          (e.clientX < box.left ||
            e.clientX > box.right ||
            e.clientY < box.top ||
            e.clientY > box.bottom);
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && backdropDown.current) onClose();
        backdropDown.current = false;
      }}
    >
      <div className={styles.dialogHeader}>
        <h2 id={titleId}>{title}</h2>
        <IconButton onClick={onClose} aria-label={uiCopy.dialog.closeDialog}>
          <X size={20} />
        </IconButton>
      </div>
      <div className={styles.dialogContent}>{children}</div>
    </dialog>
  );
}
