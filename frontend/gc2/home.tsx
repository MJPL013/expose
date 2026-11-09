"use client";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Avatar } from "../src/ui/primitives";
import { Eclipse } from "./eclipse";
import styles from "./void.module.css";
import app from "../src/features/app.module.css";

export function ExperienceHome() {
  return (
    <main id="main" className={app.scroll}>
      <div className={styles.homeChoices}>
        <span className={styles.eyebrow}>Good company. Different stories.</span>
        <h1>Who&apos;s on the other side?</h1>
        <div className={styles.cards}>
          <Link className={styles.choiceCard} href="/friends">
            <span className={styles.eyebrow}>01 / The squad</span>
            <div className={styles.friendsArt} aria-hidden="true">
              <Avatar name="Riya" color="#dca58d" variant={2} size={80} />
              <Avatar name="Manoj" color="#b5b2d8" variant={1} size={90} />
              <Avatar name="Ananya" color="#b6c7a7" variant={3} size={80} />
            </div>
            <h2>Play with friends</h2>
            <p>
              A few truths. Some very confident lies. Your friends, exposed.
            </p>
            <footer>
              <span>2–7 players · Spotlight & Bluff</span>
              <ArrowUpRight size={18} />
            </footer>
          </Link>
          <Link className={styles.choiceCard} href="/void">
            <span className={styles.eyebrow}>02 / Just you</span>
            <div className={styles.cardOrb}>
              <Eclipse />
            </div>
            <h2>The Void</h2>
            <p>A little conversation. A different way to see yourself.</p>
            <footer>
              <span>Solo · An AI that listens</span>
              <ArrowUpRight size={18} />
            </footer>
          </Link>
        </div>
      </div>
    </main>
  );
}
