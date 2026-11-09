"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Bug, Gamepad2 } from "lucide-react";
import { usePlayerPreferences, useDeveloperServices as useServices } from "../../session/provider";
import { defaultSetup } from "@expose/shared/game/engine";
import { classicFlow } from "@expose/shared/game/definitions";
import { Button, Badge } from "../../ui/primitives";
import { appCopy } from "../../content/app.en";
import { PageHeading } from "../app-shell";
import styles from "../app.module.css";

export function DeveloperHome() {
  const { session, audio } = useServices();
  const { profile } = usePlayerPreferences();
  const router = useRouter();
  const start = () => {
    audio.dispose();
    session.setFlow(classicFlow);
    session.createRoom({ ...defaultSetup, ...profile });
    router.push("/preview");
  };
  return (
    <main id="main" className={styles.scroll}>
      <Badge gold>{appCopy.developer.badge}</Badge>
      <PageHeading
        eyebrow={appCopy.developer.eyebrow}
        title={appCopy.developer.title}
      />
      <section className={styles.panel}>
        <Bug size={25} color="var(--primary)" />
        <h2>{appCopy.developer.workbench}</h2>
        <p>{appCopy.developer.description}</p>
        <Button onClick={start}>
          <Gamepad2 size={19} />
          {appCopy.developer.start}
          <ArrowRight size={18} />
        </Button>
        <Link href="/preview" className={styles.backLink}>
          {appCopy.developer.resume}
          <ArrowRight size={17} />
        </Link>
        <p>{appCopy.developer.isolated}</p>
      </section>
      <section className={styles.panel}>
        <h2>{appCopy.developer.playerTitle}</h2>
        <p>{appCopy.developer.playerDescription}</p>
        <Link href="/" className={styles.backLink}>
          {appCopy.developer.playerAction}
          <ArrowRight size={17} />
        </Link>
        <Link href="/demo" className={styles.backLink}>Open offline practice<ArrowRight size={17} /></Link>
      </section>
    </main>
  );
}
