"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogIn, LogOut, Network, RefreshCw } from "lucide-react";
import type { AccountView } from "@expose/shared/account";
import type { FriendCard } from "@expose/shared/game/contracts";
import { usePlayerPreferences, useServices } from "../session/provider";
import { pngArtifacts } from "../artifacts/png";
import { Dossier } from "../features/screens/act-three";
import { accountApi } from "./client";
import styles from "./account.module.css";
type Match = {
  runId: string;
  mode: string;
  points: number;
  placement: number;
  completedAt: string;
};
type Card = { id: string; card: FriendCard; origin: string; savedAt: string };
type LinkedPlayer = {
  playerId: string;
  recovery: { rooms: { roomId: string; code: string; status: string }[] };
};
export function AccountPanel({ cardsOnly = false }: { cardsOnly?: boolean }) {
  const router = useRouter();
  const { onlineSession } = useServices();
  const [me, setMe] = useState<AccountView | null>(null),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const [matches, setMatches] = useState<Match[]>([]),
    [cards, setCards] = useState<Card[]>([]),
    [players, setPlayers] = useState<LinkedPlayer[]>([]);
  const local = usePlayerPreferences();
  const refresh = async () => {
    const value = await accountApi<AccountView>("/me");
    setMe(value);
    if (value.account) {
      const [m, c, p] = await Promise.all([
        accountApi<{ matches: Match[] }>("/matches"),
        accountApi<{ cards: Card[] }>("/cards"),
        accountApi<{ players: LinkedPlayer[] }>("/rooms"),
      ]);
      setMatches(m.matches);
      setCards(c.cards);
      setPlayers(p.players);
    }
  };
  useEffect(() => {
    let active = true;
    void accountApi<AccountView>("/me")
      .then(async (value) => {
        if (!active) return;
        setMe(value);
        if (value.account) {
          const [m, c, p] = await Promise.all([
            accountApi<{ matches: Match[] }>("/matches"),
            accountApi<{ cards: Card[] }>("/cards"),
            accountApi<{ players: LinkedPlayer[] }>("/rooms"),
          ]);
          if (active) {
            setMatches(m.matches);
            setCards(c.cards);
            setPlayers(p.players);
          }
        }
      })
      .catch(() => {
        if (active)
          setNotice("Account unavailable. You can still play as a guest.");
      });
    const sync = (event: Event) =>
      setNotice((event as CustomEvent<string>).detail);
    window.addEventListener("expose-account-sync", sync);
    return () => {
      active = false;
      window.removeEventListener("expose-account-sync", sync);
    };
  }, []);
  const attempt = async (work: () => Promise<void>) => {
    setBusy(true);
    setNotice("");
    try {
      await work();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className={styles.panel} aria-label="Your Expose account">
      <div className={styles.heading}>
        <div>
          <span className={styles.eyebrow}>
            {cardsOnly ? "Across your devices" : "Your Expose account"}
          </span>
          <h2>{me?.account ? me.account.name : "Make this space yours"}</h2>
        </div>
        {me?.account && (
          <button
            aria-label="Refresh account"
            disabled={busy}
            onClick={() => void attempt(refresh)}
          >
            <RefreshCw size={18} />
          </button>
        )}
      </div>
      {!me?.account ? (
        <>
          <p>
            Play with friends as a guest. Sign in to save your results and enter
            The Void.
          </p>
          {me?.configured ? (
            <a
              className={styles.primary}
              href={`/api/account/v1/auth/google?returnTo=${cardsOnly ? "/profile/cards" : "/profile"}`}
            >
              <LogIn size={17} /> Continue with Google
            </a>
          ) : (
            <p role="status">
              {me
                ? "Google sign-in is not configured yet."
                : "Checking your account…"}
            </p>
          )}
        </>
      ) : (
        <>
          {!cardsOnly && (
            <>
              <p>Your profile and preferences sync to this account.</p>
              <div className={styles.actions}>
                {!me.guestLinked && (
                  <button
                    disabled={busy}
                    onClick={() =>
                      void attempt(async () => {
                        await accountApi("/link-guest", "POST", {});
                        location.reload();
                      })
                    }
                  >
                    Link this browser’s guest games
                  </button>
                )}
                <button
                  onClick={() =>
                    void attempt(async () => {
                      await accountApi("/auth/logout", "POST", {});
                      await refresh();
                      window.dispatchEvent(new Event("expose-auth-change"));
                      router.replace("/profile");
                      router.refresh();
                    })
                  }
                >
                  <LogOut size={16} /> Sign out
                </button>
                {me.account.role === "admin" && (
                  <Link href="/void/explorer">
                    <Network size={16} /> Story explorer
                  </Link>
                )}
              </div>
              {players.flatMap((p) =>
                p.recovery.rooms.map((r) => (
                  <button
                    key={`${p.playerId}:${r.roomId}`}
                    className={styles.resume}
                    onClick={() =>
                      void attempt(async () => {
                        onlineSession.leaveForNow(true);
                        await accountApi("/player", "POST", {
                          playerId: p.playerId,
                        });
                        router.push(`/join/${r.code}`);
                        router.refresh();
                      })
                    }
                  >
                    Return to room {r.code}
                  </button>
                )),
              )}
              <details>
                <summary>Match results · {matches.length}</summary>
                {matches.length ? (
                  <ul className={styles.results}>
                    {matches.map((m) => (
                      <li key={m.runId}>
                        <span>
                          {m.mode} ·{" "}
                          {new Date(m.completedAt).toLocaleDateString()}
                        </span>
                        <strong>
                          #{m.placement} · {m.points} points
                        </strong>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>Completed matches from linked players will appear here.</p>
                )}
              </details>
            </>
          )}
          {cardsOnly && (
            <>
              <div className={styles.actions}>
                {local.cards.length > 0 && (
                  <button
                    disabled={busy}
                    onClick={() =>
                      void attempt(async () => {
                        await accountApi("/cards/import", "POST", {
                          approved: true,
                          cards: local.cards.map((c) => c.card),
                        });
                        await refresh();
                        setNotice(
                          "Approved browser cards saved as local imports.",
                        );
                      })
                    }
                  >
                    Save approved browser cards to account
                  </button>
                )}
              </div>
              <div className={styles.cards}>
                {cards.map((c) => (
                  <article key={c.id}>
                    <Dossier card={c.card} />
                    <p>
                      {c.origin === "verified-match"
                        ? "From your match"
                        : "Imported from this browser"}
                    </p>
                    <div className={styles.actions}>
                      <button
                        onClick={() =>
                          void attempt(async () => {
                            await pngArtifacts.downloadCard(c.card, true);
                          })
                        }
                      >
                        Download
                      </button>
                      <button
                        onClick={() =>
                          void attempt(async () => {
                            await accountApi(`/cards/${c.id}`, "DELETE");
                            await refresh();
                          })
                        }
                      >
                        Remove from account
                      </button>
                    </div>
                  </article>
                ))}
              </div>
              {!cards.length && <p>No cards saved to your account yet.</p>}
            </>
          )}
        </>
      )}
      {notice && (
        <p role="status" className={styles.notice}>
          {notice}
        </p>
      )}
    </section>
  );
}
