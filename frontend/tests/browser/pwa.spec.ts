import { createPlayerRoom } from "./helpers";
import { expect, test } from "@playwright/test";

test.skip(
  process.env.PLAYWRIGHT_PRODUCTION !== "1",
  "Service workers are intentionally disabled in development.",
);
test.use({ viewport: { width: 390, height: 844 } });

test("production app has install metadata and can start a local game offline", async ({
  page,
  context,
  request,
}) => {
  const manifest = await request.get("/manifest.webmanifest");
  const metadata = await manifest.json();
  expect(metadata.display).toBe("standalone");
  expect(metadata.name).toBe("Expose — Your squad, exposed");
  expect(metadata.start_url).toBe("/");
  for (const icon of metadata.icons) {
    const response = await request.get(icon.src);
    expect(response.ok()).toBe(true);
    const bytes = await response.body();
    expect(bytes.subarray(1, 4).toString()).toBe("PNG");
  }
  await page.goto("/");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await expect
    .poll(() =>
      page.evaluate(() => Boolean(navigator.serviceWorker.controller)),
    )
    .toBe(true);
  const cached = await page.evaluate(async () => {
    const cache = await caches.open("gnani-public-shell-v12-host4");
    return (await cache.keys()).map((key) => key.url);
  });
  expect(cached.some((url) => url.endsWith("/play"))).toBe(true);
  expect(cached.some((url) => url.endsWith("/brand/expose-lockup.png"))).toBe(true);
  expect(cached.some((url) => url.includes("/_next/static/"))).toBe(true);
  expect(
    cached.some((url) => /blob:|\/preview|\/dev(?:$|\/)|data:audio/.test(url)),
  ).toBe(false);
  await context.setOffline(true);
  await page.goto("/profile");
  await expect(page.getByLabel("Display name", { exact: true })).toBeVisible();
  await page.getByLabel("Display name", { exact: true }).fill("Offline Riya");
  await page.getByRole("button", { name: "Save my character" }).click();
  await page.goto("/");
  await createPlayerRoom(page);
  await page.getByRole("button", { name: "I’m ready", exact: true }).click();
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "How well do you know the squad?" }),
  ).toBeVisible();
  await expect(
    page.getByText("You’re offline. The local demo still works."),
  ).toBeVisible();
  await context.setOffline(false);
  await page.screenshot({
    path: "test-results/pwa-offline-play.png",
    animations: "disabled",
  });
});

test("production exposes player mode and excludes developer routes", async ({
  page,
  request,
}) => {
  for (const route of ["/dev", "/preview"]) {
    const response = await request.get(route);
    expect(response.status()).toBe(404);
  }
  await page.goto("/");
  await expect(page.locator("[data-case-file]")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Meet your demo squad" }),
  ).toHaveCount(0);
  await page.goto("/settings");
  await expect(
    page.getByRole("link", { name: "Open developer mode" }),
  ).toHaveCount(0);
});

test("browser installation event is used instead of a fake install action", async ({
  page,
}) => {
  await page.goto("/settings");
  // Engage with the hydrated app before emulating the browser's install offer.
  await page
    .getByRole("button", { name: "Mute sound effects", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Enable sound effects", exact: true }),
  ).toBeVisible();
  await page.evaluate(() => {
    const event = new Event("beforeinstallprompt", { cancelable: true });
    Object.defineProperties(event, {
      prompt: {
        value: async () => {
          document.documentElement.dataset.installPrompted = "true";
        },
      },
      userChoice: { value: Promise.resolve({ outcome: "accepted" }) },
    });
    window.dispatchEvent(event);
  });
  await page
    .getByRole("button", { name: "Install Expose", exact: true })
    .click();
  await expect(page.locator("html")).toHaveAttribute(
    "data-install-prompted",
    "true",
  );
  await expect(page.getByRole("status")).toContainText(
    "Installation requested",
  );
  await page.evaluate(() => window.dispatchEvent(new Event("appinstalled")));
  await expect(page.getByText("You’re playing in app mode.")).toBeVisible();
});

test("waiting update UI and activation are deferred until leaving a match", async ({
  page,
}) => {
  // Simulates a waiting worker; actual install/cache/offline behavior is covered above.
  await page.addInitScript(() => {
    const worker = new EventTarget();
    Object.assign(worker, {
      state: "installed",
      postMessage: () => {
        document.documentElement.dataset.updateActivated = "true";
      },
    });
    const registration = Object.assign(new EventTarget(), {
      waiting: null as unknown,
      installing: null as unknown,
    });
    Object.defineProperty(navigator.serviceWorker, "controller", {
      get: () => ({}),
    });
    navigator.serviceWorker.register = async () =>
      registration as unknown as ServiceWorkerRegistration;
    Object.assign(window, {
      offerTestUpdate: () => {
        registration.waiting = worker;
        registration.installing = worker;
        registration.dispatchEvent(new Event("updatefound"));
        worker.dispatchEvent(new Event("statechange"));
      },
    });
  });
  await page.goto("/");
  await createPlayerRoom(page);
  await page.evaluate(() =>
    (window as unknown as { offerTestUpdate(): void }).offerTestUpdate(),
  );
  await expect(
    page.getByText("An update is ready", { exact: true }),
  ).toHaveCount(0);
  expect(
    await page.locator("html").getAttribute("data-update-activated"),
  ).toBeNull();
  await page.getByRole("button", { name: "Leave session" }).click();
  await page.getByRole("button", { name: "Leave for now" }).click();
  await expect(
    page.getByText("An update is ready", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Update app", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Update app", exact: true })
    .click();
  await expect(page.locator("html")).toHaveAttribute(
    "data-update-activated",
    "true",
  );
});
