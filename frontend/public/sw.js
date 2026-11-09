/* Public app shell only. Never records requests containing session, profile, or audio data. */
const CACHE = "gnani-public-shell-v18-accounts-void-graph";
const PAGES = ["/", "/friends", "/demo", "/play", "/profile", "/profile/cards", "/settings"];
const ASSETS = [
  "/brand/expose-logo.png",
  "/brand/expose-lockup.png",
  "/manifest.webmanifest",
  "/icons/icon-192.png?v=yellow-1",
  "/icons/icon-512.png?v=yellow-1",
  "/icons/icon-maskable.png?v=yellow-1",
  "/icons/apple-touch-icon.png?v=yellow-1",
];
async function cachePublic(cache, path) {
  const response = await fetch(path, { cache: "reload" });
  if (!response.ok) throw new Error("Shell unavailable");
  await cache.put(path, response.clone());
  return response;
}
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      const assets = new Set(ASSETS);
      // Cache documents plus the exact build's scripts, styles, and bundled fonts.
      for (const path of PAGES) {
        const response = await cachePublic(cache, path);
        // Cache a full public route payload, not a router-state-specific patch.
        // Offline client navigation must preserve the in-memory session/audio.
        const route = await fetch(path, {
          cache: "reload",
          headers: { RSC: "1" },
        });
        if (!route.ok || !route.headers.get("content-type")?.includes("text/x-component"))
          throw new Error("Offline route unavailable");
        await cache.put(`${path}?__shell_rsc=1`, route);
        const html = await response.text();
        for (const match of html.matchAll(
          /(?:src|href)="(\/_next\/static\/[^"?]+(?:\?[^" ]*)?)"/g,
        ))
          assets.add(match[1]);
      }
      await Promise.all(
        [...assets].map(async (path) => {
          const response = await cachePublic(cache, path);
          if (path.includes(".css")) {
            const css = await response.text();
            const fonts = new Set(
              [
                ...css.matchAll(
                  /url\(\s*(?:"([^"]*)"|'([^']*)'|([^\s)]+))\s*\)/g,
                ),
              ]
                .map(
                  (match) =>
                    new URL(
                      match[1] ?? match[2] ?? match[3],
                      new URL(path, self.location.origin),
                    ),
                )
                .filter(
                  (url) =>
                    url.origin === self.location.origin &&
                    url.pathname.startsWith("/_next/static/"),
                )
                .map((url) => url.pathname),
            );
            await Promise.all(
              [...fonts].map((font) => cachePublic(cache, font)),
            );
          }
        }),
      );
    })(),
  );
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter(
            (key) => key.startsWith("gnani-public-shell-") && key !== CACHE,
          )
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});
self.addEventListener("message", (event) => {
  if (event.data?.type === "ACTIVATE_UPDATE") self.skipWaiting();
});
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (
    request.method !== "GET" ||
    url.origin !== self.location.origin ||
    url.pathname === "/preview" ||
    url.pathname.startsWith("/void") ||
    url.pathname === "/dev"
  )
    return;
  if (request.headers.has("rsc")) {
    if (PAGES.includes(url.pathname)) {
      event.respondWith(
        fetch(request).catch(async () => {
          const cache = await caches.open(CACHE);
          return (await cache.match(`${url.pathname}?__shell_rsc=1`)) || Response.error();
        }),
      );
    }
    return;
  }
  if (request.mode === "navigate" && PAGES.includes(url.pathname)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        try {
          const response = await fetch(request);
          if (response.ok) await cache.put(url.pathname, response.clone());
          return response;
        } catch {
          return (
            (await cache.match(url.pathname)) ||
            (await cache.match("/")) ||
            Response.error()
          );
        }
      })(),
    );
  } else if (
    url.pathname.startsWith("/_next/static/") ||
    ASSETS.includes(url.pathname)
  ) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        const cached = await cache.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        if (response.ok) await cache.put(request, response.clone());
        return response;
      })(),
    );
  }
});
