import { chooseMidpoints } from "./helpers";
import { test, expect, type Page } from "@playwright/test";

async function create(page: Page) {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Create a room", exact: true })
    .click();
  const form = page.getByRole("dialog");
  await form.getByLabel("Your display name").fill("Asha");
  await form.getByLabel("Room size").selectOption("2");
  await form.getByRole("button", { name: "Create room", exact: true }).click();
  await expect(page.locator("main[data-step]")).toHaveAttribute(
    "data-step",
    "lobby",
  );
  return (await page
    .getByText("ROOM CODE", { exact: true })
    .locator("..")
    .locator("strong")
    .textContent())!;
}

test("duplicate tab stays quiet until explicit takeover and the old tab never reconnects", async ({
  context,
  page,
}) => {
  const sockets: string[] = [];
  page.on("websocket", (socket) => {
    if (socket.url().includes("/api/v1/")) sockets.push(socket.url());
  });
  await create(page);
  const duplicate = await context.newPage();
  const duplicateSockets: string[] = [];
  const calls: string[] = [];
  duplicate.on("websocket", (socket) => {
    if (socket.url().includes("/api/v1/")) duplicateSockets.push(socket.url());
  });
  duplicate.on("request", (request) => {
    if (request.url().includes("/api/v1/")) calls.push(request.url());
  });
  await duplicate.goto("/play");
  await expect(
    duplicate.getByRole("heading", {
      name: "Your game is open in another tab.",
    }),
  ).toBeVisible();
  await duplicate.waitForTimeout(800);
  expect(duplicateSockets).toHaveLength(0);
  expect(calls).toHaveLength(0);
  await duplicate.getByRole("button", { name: "Play here instead" }).click();
  await expect(duplicate.locator("main[data-step]")).toHaveAttribute(
    "data-step",
    "lobby",
  );
  await expect(
    page.getByRole("heading", { name: "Your game is open in another tab." }),
  ).toBeVisible();
  await page.bringToFront();
  await page.evaluate(() =>
    document.dispatchEvent(new Event("visibilitychange")),
  );
  await page.waitForTimeout(1300);
  expect(sockets).toHaveLength(1);
  expect(duplicateSockets).toHaveLength(1);
  await expect(duplicate.getByText("Asha", { exact: true })).toHaveCount(1);
  await duplicate.getByRole("button", { name: "How to play" }).click();
  await duplicate.evaluate(() => history.back());
  await expect(duplicate.getByRole("dialog")).toHaveCount(0);
  await duplicate.evaluate(() => history.back());
  await expect(
    duplicate.getByRole("dialog", { name: "Leave the game?" }),
  ).toBeVisible();
  await duplicate.getByRole("button", { name: "Stay with the squad" }).click();
  await expect(duplicate.locator("main[data-step]")).toHaveAttribute(
    "data-step",
    "lobby",
  );
  await duplicate.close();
});

test("refresh restores unfinished text, leave cancellation preserves it, acceptance clears it", async ({
  browser,
}) => {
  const contexts = await Promise.all([
    browser.newContext(),
    browser.newContext(),
  ]);
  const [host, guest] = await Promise.all(contexts.map((c) => c.newPage()));
  for (const page of [host, guest]) {
    page.on("dialog", (dialog) => void dialog.accept());
    await page.addInitScript(() =>
      Object.defineProperty(document, "hidden", { get: () => false }),
    );
  }
  try {
    const code = await create(host);
    await guest.goto("/");
    await guest.getByRole("button", { name: "Join with code" }).click();
    const form = guest.getByRole("dialog");
    await form.getByLabel("Your display name").fill("Bela");
    await form.getByLabel("Room code", { exact: true }).fill(code);
    await form.getByRole("button", { name: "Join room", exact: true }).click();
    for (const page of [host, guest])
      await page
        .getByRole("button", { name: "I’m ready", exact: true })
        .click();
    await host.getByRole("button", { name: "Play", exact: true }).click();
    for (const page of [host, guest]) {
      await chooseMidpoints(page);
      await page.getByRole("button", { name: /Now rate/ }).click();
      await chooseMidpoints(page);
      await page.getByRole("button", { name: "Submit both ratings" }).click();
    }
    for (let i = 1; i <= 2; i++) {
      for (const page of [host, guest])
        await expect(page.locator("main")).toHaveAttribute(
          "data-step",
          `nominate-${i}`,
        );
      for (const page of [host, guest]) {
        await page.locator("main fieldset button").first().click();
        await page.getByRole("button", { name: "Lock choice", exact: true }).click();
      }
    }
    await expect(host.locator("main")).toHaveAttribute(
      "data-step",
      "catchphrase",
    );
    await host.locator("main textarea").fill("Unfinished chai confession");
    await host.getByRole("button", { name: "Leave session" }).click();
    await host.getByRole("button", { name: "Stay with the squad" }).click();
    await expect(host.locator("main textarea")).toHaveValue(
      "Unfinished chai confession",
    );
    await host.reload();
    await host
      .getByRole("button", { name: "Resume game", exact: true })
      .click();
    await expect(host.locator("main textarea")).toHaveValue(
      "Unfinished chai confession",
    );
    await host.locator('[data-action-dock] button[type="submit"]').click();
    await expect
      .poll(() =>
        host.evaluate(() => sessionStorage.getItem("expose.answer-draft.v1")),
      )
      .toBeNull();
  } finally {
    await Promise.all(contexts.map((c) => c.close()));
  }
});

test("local pages share initialization and make no game requests while idle", async ({
  page,
}) => {
  const calls: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/api/v1/")) calls.push(new URL(r.url()).pathname);
  });
  await page.goto("/");
  await page
    .getByRole("navigation")
    .getByRole("link", { name: "Profile" })
    .click();
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await page.waitForTimeout(3000);
  expect(calls).toEqual(["/api/v1/resume"]);
});

test("idle owner sends only heartbeats and reconnects once after offline suspension", async ({
  context,
  page,
}) => {
  const { mkdir, writeFile } = await import("node:fs/promises");
  let measuring = false;
  const frames: { direction: string; type: string; bytes: number }[] = [];
  const requests: string[] = [];
  let sockets = 0;
  page.on("websocket", (socket) => {
    if (!socket.url().includes("/api/v1/realtime")) return;
    sockets++;
    const record = (direction: string, event: { payload: string | Buffer }) => {
      if (!measuring) return;
      const body = event.payload.toString();
      frames.push({
        direction,
        type: JSON.parse(body).type,
        bytes: Buffer.byteLength(body),
      });
    };
    socket.on("framesent", (event) => record("framesent", event));
    socket.on("framereceived", (event) => record("framereceived", event));
  });
  page.on("request", (r) => {
    if (measuring && r.url().includes("/api/v1/"))
      requests.push(new URL(r.url()).pathname);
  });
  await create(page);
  await page.waitForTimeout(500);
  measuring = true;
  await page.waitForTimeout(11000);
  measuring = false;
  expect(requests).toEqual([]);
  expect(frames.some((f) => f.type === "ping")).toBe(true);
  expect(frames.every((f) => ["ping", "pong"].includes(f.type))).toBe(true);
  await mkdir("../work-log/verification", { recursive: true });
  await writeFile(
    "../work-log/verification/idle-owner-traffic.json",
    JSON.stringify(
      {
        capturedAt: new Date().toISOString(),
        windowMs: 11000,
        httpRequests: requests.length,
        frames,
        note: "WebSocket application payload bytes only; excludes framing, TLS, assets and Next HMR",
      },
      null,
      2,
    ),
  );
  await context.setOffline(true);
  await expect(
    page.getByText(/Connection lost. Your seat is reserved/),
  ).toBeVisible();
  await page.waitForTimeout(1500);
  expect(sockets).toBe(1);
  await context.setOffline(false);
  await expect(
    page.getByRole("button", { name: "I’m ready", exact: true }),
  ).toBeEnabled();
  expect(sockets).toBe(2);
});

test("server conflict protects the seat when local coordination is unavailable", async ({
  context,
  page,
}) => {
  await context.addInitScript(() =>
    Object.defineProperty(window, "BroadcastChannel", { value: undefined }),
  );
  await create(page);
  const duplicate = await context.newPage();
  await duplicate.goto("/play");
  await duplicate
    .getByRole("button", { name: "Resume game", exact: true })
    .click();
  await expect(
    duplicate.getByRole("button", { name: "Play here instead" }),
  ).toBeVisible();
  await expect(page.locator("main[data-step]")).toHaveAttribute(
    "data-step",
    "lobby",
  );
  await duplicate.getByRole("button", { name: "Play here instead" }).click();
  await expect(duplicate.locator("main[data-step]")).toHaveAttribute(
    "data-step",
    "lobby",
  );
  await expect(
    page.getByRole("heading", { name: "Your game is open in another tab." }),
  ).toBeVisible();
  await duplicate.close();
});

test("simultaneous resume attempts retain one writer and one seat", async ({
  context,
  page,
}) => {
  await context.addInitScript(() =>
    Object.defineProperty(window, "BroadcastChannel", { value: undefined }),
  );
  await create(page);
  await page.close();
  const candidates = await Promise.all([context.newPage(), context.newPage()]);
  await Promise.all(candidates.map((p) => p.goto("/play")));
  await Promise.all(
    candidates.map((p) =>
      p.getByRole("button", { name: "Resume game", exact: true }).click(),
    ),
  );
  await expect
    .poll(async () =>
      (
        await Promise.all(
          candidates.map((p) => p.locator('main[data-step="lobby"]').count()),
        )
      ).reduce((a, b) => a + b, 0),
    )
    .toBe(1);
  await expect
    .poll(async () =>
      (
        await Promise.all(
          candidates.map((p) =>
            p.getByRole("button", { name: "Play here instead" }).count(),
          ),
        )
      ).reduce((a, b) => a + b, 0),
    )
    .toBe(1);
  const winner = (await candidates[0].locator("main[data-step]").count())
    ? candidates[0]
    : candidates[1];
  await expect(winner.getByText(/1 of 2 suspects joined/)).toBeVisible();
  await Promise.all(candidates.map((p) => p.close()));
});

test("a crashed tab can recover the existing seat", async ({
  context,
  page,
}) => {
  await create(page);
  const client = await context.newCDPSession(page);
  const crashed = page.waitForEvent("crash");
  void client.send("Page.crash").catch(() => {});
  await crashed;
  const replacement = await context.newPage();
  await replacement.goto("/play");
  await replacement
    .getByRole("button", { name: "Resume game", exact: true })
    .click();
  await expect(replacement.locator("main[data-step]")).toHaveAttribute(
    "data-step",
    "lobby",
  );
  await expect(replacement.getByText(/1 of 2 suspects joined/)).toBeVisible();
  await replacement.close();
});
