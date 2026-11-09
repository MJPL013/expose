"use client";
import { useEffect, useRef, useState } from "react";
import { MessageCircle, Send } from "lucide-react";
import type { ScreenProps } from "./screens/shared";
import styles from "./lobby.module.css";

export function LobbyChat({
  snapshot,
  send,
}: Pick<ScreenProps, "snapshot" | "send">) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const log = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);
  const messages = snapshot.lobbyChat ?? [];
  const lastMessageId = messages.at(-1)?.id;
  useEffect(() => {
    if (pinned.current && log.current)
      log.current.scrollTop = log.current.scrollHeight;
  }, [messages.length, lastMessageId]);
  return (
    <section className={styles.chat} aria-labelledby="lobby-chat-title">
      <div className={styles.chatHeader}>
        <h2 id="lobby-chat-title">
          <MessageCircle size={18} aria-hidden="true" />
          Squad chat
        </h2>
        <span className={styles.chatBadge}>{snapshot.step.type === "summary" ? "After the game" : "Room conversation"}</span>
      </div>
      <div
        className={styles.messages}
        ref={log}
        role="log"
        aria-label="Squad messages"
        aria-live="polite"
        aria-relevant="additions"
        tabIndex={0}
        onScroll={(event) => {
          const el = event.currentTarget;
          pinned.current =
            el.scrollHeight - el.scrollTop - el.clientHeight < 40;
        }}
      >
        {messages.length ? (
          messages.map((message) => (
            <div
              key={message.id}
              className={
                message.seatId === snapshot.view.viewerId
                  ? styles.own
                  : styles.message
              }
            >
              <span className={styles.sender}>
                {message.seatId === snapshot.view.viewerId
                  ? "You"
                  : message.name}
              </span>
              <p className={styles.messageText}>{message.text}</p>
            </div>
          ))
        ) : (
          <p className={styles.empty}>
            The squad’s gathering. Say hello before the evidence comes out.
          </p>
        )}
      </div>
      <form
        className={styles.composer}
        onSubmit={async (event) => {
          event.preventDefault();
          if (sending || !text.trim()) return;
          setSending(true);
          setError("");
          try {
            if (await send({ type: "chat", text: text.trim() })) {
              setText("");
              pinned.current = true;
            } else
              setError("Message not sent. Check your connection, then retry.");
          } finally {
            setSending(false);
          }
        }}
      >
        <label className={styles.messageField}>
          <span className={styles.srOnly}>Message the squad</span>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Say something…"
            maxLength={240}
            autoComplete="off"
            enterKeyHint="send"
            disabled={sending}
          />
        </label>
        <button
          type="submit"
          aria-label="Send message"
          disabled={
            sending || !text.trim() || snapshot.connection !== "connected"
          }
        >
          <Send size={19} aria-hidden="true" />
        </button>
      </form>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
