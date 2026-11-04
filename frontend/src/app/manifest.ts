import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Expose — Your squad, exposed",
    short_name: "Expose",
    description:
      "Read the room. Sell the bluff. A voice-first party game for your squad.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#0e0d12",
    theme_color: "#0e0d12",
    lang: "en",
    categories: ["games", "entertainment"],
    icons: [
      {
        src: "/icons/icon-192.png?v=yellow-1",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png?v=yellow-1",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-maskable.png?v=yellow-1",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      {
        name: "My character",
        url: "/profile",
        icons: [{ src: "/icons/icon-192.png?v=yellow-1", sizes: "192x192" }],
      },
      {
        name: "My cards",
        url: "/collection",
        icons: [{ src: "/icons/icon-192.png?v=yellow-1", sizes: "192x192" }],
      },
    ],
  };
}
