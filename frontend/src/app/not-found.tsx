import { uiCopy } from "../content/ui.en";
import Link from "next/link";
export default function NotFound() {
  return (
    <main
      id="main"
      style={{
        maxWidth: 430,
        margin: uiCopy.notFound.text80pxAuto,
        padding: 24,
      }}
    >
      <h1>{uiCopy.notFound.caseNotFound}</h1>
      <p style={{ margin: uiCopy.notFound.text24px0 }}>
        {uiCopy.notFound.thisPageIsnTInOur}
      </p>
      <Link href="/">{uiCopy.notFound.backToTheDemo}</Link>
    </main>
  );
}
