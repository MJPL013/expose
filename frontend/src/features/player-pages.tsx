"use client";
import { AccountPanel } from "../account/panel";
import { FeedbackSettings } from "./feedback-settings";
import Link from "next/link";
import { useState } from "react";
import {
  Bug,
  CheckCircle2,
  ChevronRight,
  CreditCard,
  Download,
  Fingerprint,
  LockKeyhole,
  Save,
  ShieldCheck,
  Smartphone,
  Trash2,
  UserRound,
} from "lucide-react";
import { appCopy } from "../content/app.en";
import { usePlayerPreferences, useServices } from "../session/provider";
import { type PlayerProfile } from "../player/preferences";
import { Button, IconButton } from "../ui/primitives";
import { Dialog } from "../ui/dialog";
import { Dossier } from "./screens/act-three";
import { PageHeading } from "./app-shell";
import { InstallButton } from "./pwa";
import { pngArtifacts } from "../artifacts/png";
import styles from "./app.module.css";
import { CharacterBuilder } from "./character-builder";

function ProfileSections({
  cardsSelected = false,
}: {
  cardsSelected?: boolean;
}) {
  const { cards } = usePlayerPreferences();
  return (
    <nav className={styles.profileSections} aria-label="Profile sections">
      <Link href="/profile" aria-current={!cardsSelected ? "page" : undefined}>
        <UserRound size={17} /> Character
      </Link>
      <Link
        href="/profile/cards"
        aria-current={cardsSelected ? "page" : undefined}
      >
        <CreditCard size={17} /> My cards <small>({cards.length})</small>
      </Link>
    </nav>
  );
}

export function ProfilePage() {
  const value = usePlayerPreferences();
  const [notice, setNotice] = useState("");
  return (
    <ProfileEditor
      key={JSON.stringify(value.profile)}
      initial={value.profile}
      notice={notice}
      setNotice={setNotice}
    />
  );
}
function ProfileEditor({
  initial,
  notice,
  setNotice,
}: {
  initial: PlayerProfile;
  notice: string;
  setNotice: (value: string) => void;
}) {
  const { preferences, feedback } = useServices();
  const { cards } = usePlayerPreferences();
  const [profile, setProfile] = useState(initial);
  const latest = cards[0];
  return (
    <div className={styles.page}>
      <main id="main" className={styles.scroll}>
        <PageHeading
          eyebrow={appCopy.profile.eyebrow}
          title={appCopy.profile.title}
          accent={appCopy.profile.accent}
        />
        <ProfileSections />
        <AccountPanel />
        <form
          id="profile-form"
          className={styles.form}
          onSubmit={(event) => {
            event.preventDefault();
            try {
              const persisted = preferences.saveProfile({
                ...profile,
                name: profile.name.trim(),
              });
              setNotice(
                persisted ? appCopy.profile.saved : appCopy.profile.temporary,
              );
              feedback.emit("save");
            } catch {
              setNotice("Enter a display name to save your character.");
            }
          }}
        >
          <CharacterBuilder
            profile={profile}
            onChange={(value) => {
              setProfile(value);
              setNotice("");
            }}
          />
          <label>
            {appCopy.profile.name}
            <input
              name="name"
              value={profile.name}
              onChange={(e) => {
                setProfile({ ...profile, name: e.target.value });
                setNotice("");
              }}
              maxLength={24}
              required
              autoComplete="nickname"
            />
          </label>
          <label>
            {appCopy.profile.bio}
            <textarea
              value={profile.bio}
              onChange={(e) => {
                setProfile({ ...profile, bio: e.target.value });
                setNotice("");
              }}
              maxLength={120}
              rows={3}
              placeholder="Usually late. Always brings the snacks."
            />
            <small>{appCopy.profile.bioHint}</small>
          </label>
        </form>
        {notice && (
          <p className={styles.notice} role="status">
            <CheckCircle2 size={18} />
            {notice}
          </p>
        )}
        <div className={styles.sectionTitle}>
          <h2>{appCopy.profile.characteristics}</h2>
          <Fingerprint size={20} />
        </div>
        {latest ? (
          <div className={styles.panel}>
            <h2>{latest.card.title}</h2>
            <p>“{latest.card.quote}”</p>
            {latest.card.traits.map((trait) => (
              <label key={trait.label} className={styles.volume}>
                {trait.label}
                <span>{trait.value}%</span>
                <meter
                  min={0}
                  max={100}
                  value={trait.value}
                  style={{ width: "100%", accentColor: "var(--primary)" }}
                >
                  {trait.value}%
                </meter>
              </label>
            ))}
            <Link className={styles.textLink} href="/profile/cards">
              {appCopy.profile.collection}
              <ChevronRight size={16} />
            </Link>
          </div>
        ) : (
          <div className={styles.panel}>
            <p>{appCopy.profile.empty}</p>
          </div>
        )}
        <p className={styles.muted}>
          <LockKeyhole size={13} /> {appCopy.profile.local}
        </p>
      </main>
      <div className={styles.dock}>
        <Button type="submit" form="profile-form">
          <Save size={18} />
          {appCopy.profile.save}
        </Button>
      </div>
    </div>
  );
}

export function CollectionPage() {
  const { cards } = usePlayerPreferences();
  const { preferences, feedback } = useServices();
  const [remove, setRemove] = useState<string | null>(null);
  const [error, setError] = useState("");
  return (
    <div className={styles.page}>
      <main id="main" className={styles.scroll}>
        <PageHeading
          eyebrow={appCopy.collection.eyebrow}
          title={appCopy.collection.title}
        />
        <ProfileSections cardsSelected />
        <AccountPanel cardsOnly />
        {!cards.length ? (
          <div className={styles.empty}>
            <CreditCard size={44} strokeWidth={1.4} />
            <h2>{appCopy.collection.emptyTitle}</h2>
            <p>{appCopy.collection.empty}</p>
            <Link className={styles.primaryLink} href="/">
              {appCopy.collection.play}
              <ChevronRight size={18} />
            </Link>
          </div>
        ) : (
          <>
            <div className={styles.sectionTitle}>
              <h2>
                {cards.length} {cards.length === 1 ? "card" : "cards"}
              </h2>
              <span>{appCopy.collection.count}</span>
            </div>
            <div className={styles.cardList}>
              {cards.map(({ id, card, savedAt }) => (
                <article className={styles.savedCard} key={id}>
                  <p>
                    HOSTEL 2 AM ·{" "}
                    {new Date(savedAt).toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </p>
                  <Dossier card={card} />
                  <div className={styles.cardActions}>
                    <Button
                      variant="ghost"
                      onClick={async () => {
                        try {
                          await pngArtifacts.downloadCard(card, true);
                          feedback.emit("save");
                        } catch {
                          setError("Image download failed. Please try again.");
                        }
                      }}
                    >
                      <Download size={17} />
                      {appCopy.collection.download}
                    </Button>
                    <IconButton
                      aria-label={appCopy.collection.remove}
                      onClick={() => setRemove(id)}
                    >
                      <Trash2 size={18} />
                    </IconButton>
                  </div>
                </article>
              ))}
            </div>
            <p className={styles.muted} style={{ marginTop: 24 }}>
              {appCopy.collection.limit}
            </p>
          </>
        )}
        {error && (
          <p role="alert" className={styles.notice}>
            {error}
          </p>
        )}
      </main>
      {remove && (
        <Dialog title="Remove this saved card?" onClose={() => setRemove(null)}>
          <p>
            This removes the card and its saved characteristics from this
            device.
          </p>
          <Button
            variant="danger"
            onClick={() => {
              preferences.removeCard(remove);
              setRemove(null);
            }}
          >
            Remove card
          </Button>
          <Button variant="ghost" onClick={() => setRemove(null)}>
            Keep card
          </Button>
        </Dialog>
      )}
    </div>
  );
}

export function SettingsPage() {
  const { preferences, feedback } = useServices();
  const [clear, setClear] = useState(false);
  return (
    <div className={styles.page}>
      <main id="main" className={styles.scroll}>
        <PageHeading
          eyebrow={appCopy.settings.eyebrow}
          title={appCopy.settings.title}
          accent={appCopy.settings.accent}
        />
        <section className={styles.panel}>
          <h2>Sound & feel</h2>
          <FeedbackSettings />
        </section>
        <section className={`${styles.panel} ${styles.installPanel}`}>
          <div className={styles.installRow}>
            <Smartphone size={24} />
            <h2>{appCopy.settings.install}</h2>
          </div>
          <p>{appCopy.settings.installHint}</p>
          <InstallButton />
        </section>
        <section className={styles.panel}>
          <div className={styles.installRow}>
            <ShieldCheck size={22} />
            <h2>{appCopy.settings.privacyTitle}</h2>
          </div>
          <p>{appCopy.settings.privacy}</p>
          <Button variant="text" onClick={() => setClear(true)}>
            <Trash2 size={16} />
            {appCopy.settings.clear}
          </Button>
        </section>
        {process.env.NODE_ENV === "development" && (
          <section className={styles.panel}>
            <div className={styles.installRow}>
              <Bug size={22} />
              <h2>{appCopy.developer.settingsTitle}</h2>
            </div>
            <p>{appCopy.developer.settingsDescription}</p>
            <Link href="/dev" className={styles.backLink}>
              {appCopy.developer.settingsAction}
              <ChevronRight size={17} />
            </Link>
          </section>
        )}
      </main>
      {clear && (
        <Dialog
          title={appCopy.settings.clearTitle}
          onClose={() => setClear(false)}
        >
          <p>{appCopy.settings.clearText}</p>
          <Button
            variant="danger"
            onClick={() => {
              preferences.clear();
              feedback.cancel();
              setClear(false);
            }}
          >
            {appCopy.settings.confirmClear}
          </Button>
          <Button variant="ghost" onClick={() => setClear(false)}>
            {appCopy.settings.cancel}
          </Button>
        </Dialog>
      )}
    </div>
  );
}
