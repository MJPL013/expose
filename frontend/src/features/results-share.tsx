"use client";
import Image from "next/image";
import { useEffect, useState } from "react";
import { Download, Share2, Check } from "lucide-react";
import type { PhaseView } from "@expose/shared/game/contracts";
import { pngArtifacts, downloadArtifact } from "../artifacts/png";
import { useServices } from "../session/provider";
import { ActionDock } from "../ui/action-dock";
import { Button } from "../ui/primitives";
import styles from "./game.module.css";
type SummaryPhase = Extract<PhaseView, { type: "summary" }>;

export function ResultsShare({
  phase,
  onLobby,
}: {
  phase: SummaryPhase;
  onLobby: () => void;
}) {
  const { preferences, feedback } = useServices();
  const [kind, setKind] = useState<"card" | "rap">("card");
  const [prepared, setPrepared] = useState<{
    key: string;
    file: File;
    url: string;
    shareable: boolean;
  } | null>(null);
  const [notice, setNotice] = useState(""),
    [sharing, setSharing] = useState(false);
  const [retry, setRetry] = useState(0);
  const key = JSON.stringify([kind, phase.card, phase.scores, phase.approved]);
  useEffect(() => {
    const [selected, card, scores, approved] = JSON.parse(key) as [
      "card" | "rap",
      SummaryPhase["card"],
      SummaryPhase["scores"],
      boolean,
    ];
    if (!approved) return;
    let active = true,
      url: string | undefined;
    void (
      selected === "card"
        ? pngArtifacts.prepareCard(card, approved)
        : pngArtifacts.prepareRapSheet(card, scores, approved)
    )
      .then((file) => {
        if (!active) return;
        url = URL.createObjectURL(file);
        setPrepared({
          key,
          file,
          url,
          shareable: Boolean(navigator.canShare?.({ files: [file] })),
        });
      })
      .catch(() => {
        if (active) setNotice("Could not prepare the image. Please retry.");
      });
    return () => {
      active = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [key, retry]);
  const ready = prepared?.key === key ? prepared : null;
  return (
    <>
      <div className={styles.heading}>
        <span className={styles.eyebrow}>CASE CLOSED</span>
        <h1>Your squad. Your receipts.</h1>
      </div>
      <div className={styles.segmented} role="group" aria-label="Result image">
        <button aria-pressed={kind === "card"} onClick={() => setKind("card")}>
          My card
        </button>
        <button aria-pressed={kind === "rap"} onClick={() => setKind("rap")}>
          Rap sheet
        </button>
      </div>
      {phase.approved ? (
        <>
          {ready ? (
            <Image
              className={styles.resultPreview}
              src={ready.url}
              width={1080}
              height={1600}
              unoptimized
              alt={
                kind === "card"
                  ? `${phase.card.name}'s friend card`
                  : "Squad final standings"
              }
            />
          ) : (
            <p role="status">Preparing your image…</p>
          )}
          <Button
            variant="text"
            onClick={() => {
              try {
                const saved = preferences.saveCard(phase.card, true);
                setNotice(
                  saved ? "Saved to My cards." : "Saved for this session.",
                );
                feedback.emit("save");
              } catch {
                setNotice("Could not save this card.");
              }
            }}
          >
            <Check size={16} />
            Save to My cards
          </Button>
        </>
      ) : (
        <p>You kept your card private. Your results are still yours.</p>
      )}

      {notice && <p role="status">{notice}</p>}
      {notice.startsWith("Could not prepare") && (
        <Button
          variant="ghost"
          onClick={() => {
            setNotice("");
            setRetry((n) => n + 1);
          }}
        >
          Retry image
        </Button>
      )}
      <ActionDock>
        <div className={styles.resultActions}>
          {phase.approved && (
            <>
              {ready?.shareable && (
                <Button
                  disabled={sharing}
                  onClick={async () => {
                    setSharing(true);
                    setNotice("");
                    try {
                      await navigator.share({
                        files: [ready.file],
                        title:
                          kind === "card"
                            ? "My Expose friend card"
                            : "Expose rap sheet",
                      });
                    } catch (error) {
                      if (!(
                        error instanceof Error && error.name === "AbortError"
                      ))
                        setNotice(
                          "Sharing is unavailable here. Download the image instead.",
                        );
                    } finally {
                      setSharing(false);
                    }
                  }}
                >
                  <Share2 size={18} />
                  Share {kind === "card" ? "card" : "rap sheet"}
                </Button>
              )}
              <Button
                variant={ready?.shareable ? "ghost" : "primary"}
                disabled={!ready || sharing}
                onClick={() => {
                  if (ready) downloadArtifact(ready.file);
                }}
              >
                <Download size={18} />
                Download {kind === "card" ? "card" : "rap sheet"}
              </Button>
            </>
          )}
        </div>
        <Button variant="text" onClick={onLobby}>
          Back to lobby
        </Button>
      </ActionDock>
    </>
  );
}
