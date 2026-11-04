import { uiCopy } from "../content/ui.en";
import type { Metadata, Viewport } from "next";
import { SessionProvider } from "../session/provider";
import { AppShell } from "../features/app-shell";
import { PwaProvider } from "../features/pwa";
import { MatchNavigation } from "../features/match-navigation";
import "./globals.css";

export const metadata: Metadata = {
  title: uiCopy.layout.exposeYourFriendsUnderOath,
  description: uiCopy.layout.aVoiceFirstPartyGameFor,
  robots: { index: false, follow: false },
  applicationName: "Expose",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Expose",
  },
  icons: { apple: "/icons/apple-touch-icon.png?v=yellow-1" },
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0e0d12",
  interactiveWidget: "resizes-content",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{const p=JSON.parse(localStorage.getItem('gnani.player.v1')||'{}');document.documentElement.dataset.theme=p.theme==='light'?'light':'dark'}catch{}`,
          }}
        />
      </head>
      <body>
        <a className="skip-link" href="#main">
          {uiCopy.layout.skipToContent}
        </a>
        <SessionProvider>
          <PwaProvider>
            <MatchNavigation>
              <AppShell>{children}</AppShell>
            </MatchNavigation>
          </PwaProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
