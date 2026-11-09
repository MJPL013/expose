import { chooseMidpoints } from "./helpers";
import { expect, test } from "@playwright/test";

test.use({
  permissions: ["microphone"],
  launchOptions: {
    args: [
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
    ],
  },
});

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const streams: MediaStream[] = [];
    Object.defineProperty(window, "__testStreams", { value: streams });
    const original = navigator.mediaDevices.getUserMedia.bind(
      navigator.mediaDevices,
    );
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      const stream = await original(constraints);
      streams.push(stream);
      return stream;
    };
  });
});

test("real MediaRecorder pipeline, explicit consent, highlight and cleanup", async ({
  page,
}) => {
  const writes: string[] = [];
  page.on("request", (request) => {
    if (["POST", "PUT", "PATCH"].includes(request.method()))
      writes.push(request.url());
  });
  await page.goto("/preview");
  await page.getByLabel("Preview step").selectOption("catchphrase");
  await page.getByRole("button", { name: "Say it" }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { __testStreams: MediaStream[] }).__testStreams
            .length,
      ),
    )
    .toBe(0);
  await page.getByRole("button", { name: "Enable microphone" }).click();
  await page.getByRole("button", { name: "Start recording", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Stop recording" }),
  ).toBeVisible();
  await page.setViewportSize({ width: 820, height: 1000 });
  await page.setViewportSize({ width: 1024, height: 768 });
  await expect(page.getByRole("button", { name: "Stop recording" })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __testStreams: MediaStream[] }).__testStreams.length)).toBe(2);
  // A short synthetic device capture exercises the actual browser recorder and Blob playback.
  await page.waitForTimeout(600);
  await page.getByRole("button", { name: "Stop recording" }).click();
  await expect(
    page.getByText("Sample transcript · not speech recognition", {
      exact: false,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "That’s my line" }),
  ).toBeEnabled();
  await expect(
    page.getByRole("checkbox", { name: /Include this clip/ }),
  ).not.toBeChecked();
  await expect
    .poll(() =>
      page.evaluate(() =>
        (
          window as unknown as { __testStreams: MediaStream[] }
        ).__testStreams.every((stream) =>
          stream.getTracks().every((t) => t.readyState === "ended"),
        ),
      ),
    )
    .toBe(true);
  const clipUrl = await page.locator("audio").getAttribute("src");
  expect(clipUrl).toMatch(/^blob:/);
  await page
    .getByLabel("Edit your sample transcript")
    .fill("My typed correction is the actual answer.");
  await page.getByRole("checkbox", { name: /Include this clip/ }).check();
  await expect(
    page.getByRole("button", { name: "That’s my line" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "That’s my line" }).click();
  await page.getByLabel("Preview step").selectOption("card");
  await page.getByRole("button", { name: "Approve my card" }).click();
  await expect(
    page.getByRole("checkbox", { name: /Include clip 1/ }),
  ).toBeChecked();
  await page.getByRole("button", { name: "Play my highlight" }).click();
  await expect(
    page.getByRole("button", { name: "Play my highlight" }),
  ).toBeVisible({ timeout: 5000 });
  await page.getByRole("checkbox", { name: /Include clip 1/ }).uncheck();
  await expect(
    page.getByRole("button", { name: "Play my highlight" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Back to lobby" }).click();
  await page.getByRole("button", { name: "Run it back" }).click();
  expect(
    await page.evaluate(async (url) => {
      try {
        await fetch(url!);
        return true;
      } catch {
        return false;
      }
    }, clipUrl),
  ).toBe(false);
  expect(
    await page.evaluate(() => ({
      local: localStorage.length,
      session: sessionStorage.length,
    })),
  ).toMatchObject({ local: 0 });
  expect(writes).toEqual([]);
});

test("switching perspective stops capture and discards the private draft", async ({
  page,
}) => {
  await page.goto("/preview");
  await page.getByLabel("Preview step").selectOption("answer-0");
  await page.getByRole("button", { name: "Say it" }).click();
  await page.getByRole("button", { name: "Enable microphone" }).click();
  await page.getByRole("button", { name: "Start recording", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Stop recording" }),
  ).toBeVisible();
  await page.getByLabel("Player perspective").selectOption("manoj");
  await expect(
    page.getByRole("heading", { name: "Tell it like you would." }),
  ).toBeVisible();
  await expect(page.locator("audio")).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(() =>
        (
          window as unknown as { __testStreams: MediaStream[] }
        ).__testStreams.every((stream) =>
          stream.getTracks().every((t) => t.readyState === "ended"),
        ),
      ),
    )
    .toBe(true);
});

test("ignored permission can be cancelled and typing remains available", async ({
  page,
}) => {
  await page.goto("/preview");
  await page.getByLabel("Preview step").selectOption("catchphrase");
  await page.evaluate(() => {
    navigator.mediaDevices.getUserMedia = () => new Promise(() => {});
  });
  await page.getByRole("button", { name: "Say it" }).click();
  await page.getByRole("button", { name: "Enable microphone" }).click();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByLabel("Your signature line").fill("No microphone needed.");
  await page.getByRole("button", { name: "That’s my line" }).click();
  await expect(
    page.getByRole("heading", { name: "Can you pass for Manoj?" }),
  ).toBeVisible();
});

test("a complete Spotlight session uses recorded free-text answers", async ({
  page,
}) => {
  test.setTimeout(150_000);
  await page.goto("/demo");
  await page
    .getByRole("button", { name: "Create a room", exact: true })
    .click();
  await page.getByLabel("Your display name").fill("Riya");
  await page.getByLabel("Room size").selectOption("3");
  await page.getByRole("button", { name: "Create room", exact: true }).click();
  await page.getByRole("button", { name: "I’m ready", exact: true }).click();
  await page
    .getByRole("button", { name: "Play", exact: true })
    .click();
  let captures = 0;
  for (let i = 0; i < 70; i++) {
    const main = page.locator("main[data-step]");
    const step = await main.getAttribute("data-step");
    if (step === "card") break;
    const pending = (await main.getAttribute("data-action-pending")) === "true";
    if (pending && step === "traits") {
      await chooseMidpoints(page);
      await page.getByRole("button", { name: /Now rate/ }).click();
      await chooseMidpoints(page);
      await page.getByRole("button", { name: "Submit both ratings" }).click();
    } else if (pending && (step?.startsWith("nominate") || step === "sync")) {
      await main.getByRole("button").first().click();
      await page.getByRole("button", { name: step === "sync" ? "Lock prediction" : "Lock choice", exact: true }).click();
    } else if (pending && step?.startsWith("judge")) {
      await page
        .getByRole("group", { name: "Anonymous answers" })
        .locator("button")
        .first()
        .click();
      await page.getByRole("button", { name: "Lock my pick" }).click();
    } else if (pending && (await main.locator("textarea").count())) {
      await page.getByRole("button", { name: "Say it" }).click();
      await page.getByRole("button", { name: "Enable microphone" }).click();
  await page.getByRole("button", { name: "Start recording", exact: true }).click();
      await expect(
        page.getByRole("button", { name: "Stop recording" }),
      ).toBeVisible();
      await page.waitForTimeout(400);
      await page.getByRole("button", { name: "Stop recording" }).click();
      await page.getByLabel("Edit your sample transcript").fill("Blue");
      await page.getByRole("checkbox", { name: /Include this clip/ }).check();
      const submit = page.locator('[data-action-dock] button[type="submit"]');
      await expect(submit).toBeEnabled();
      await submit.click();
      captures++;
    } else {
      const next = page.locator("[data-action-dock] button:enabled").first();
      if (await next.count()) await next.click();
    }
    await expect
      .poll(() => main.getAttribute("data-step"), { timeout: 30000 })
      .not.toBe(step);
  }
  await expect(
    page.getByRole("button", { name: "Approve my card" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Approve my card" }).click();
  expect(captures).toBeGreaterThanOrEqual(6);
  await expect(
    page.getByRole("checkbox", { name: /Include clip/ }),
  ).toHaveCount(captures);
  await page.getByRole("button", { name: "Play my highlight" }).click();
  await expect(
    page.getByRole("button", { name: "Play my highlight" }),
  ).toBeVisible({ timeout: 20000 });
  expect(
    await page.evaluate(() =>
      (
        window as unknown as { __testStreams: MediaStream[] }
      ).__testStreams.every((s) =>
        s.getTracks().every((t) => t.readyState === "ended"),
      ),
    ),
  ).toBe(true);
  const saved = await page.evaluate(() =>
    localStorage.getItem("gnani.session.v2"),
  );
  expect(saved).not.toMatch(/blob:|audio\/webm|data:audio/);
});
