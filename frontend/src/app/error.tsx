"use client";
import { uiCopy } from "../content/ui.en";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main
      id="main"
      style={{ maxWidth: 430, margin: uiCopy.error.text80pxAuto, padding: 24 }}
    >
      <h1>{uiCopy.error.aLittleInterruption}</h1>
      <p style={{ margin: uiCopy.error.text24px0 }}>
        {uiCopy.error.theDemoHitASnagTry}
      </p>
      <button onClick={reset}>{uiCopy.error.tryAgain}</button>
    </main>
  );
}
