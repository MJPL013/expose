import { expect, test, type Page } from "@playwright/test";
import { chooseMidpoints } from "./helpers";
test.use({
  permissions: ["microphone"],
  launchOptions: {
    args: [
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
    ],
  },
});
async function preview(page: Page, step: string) {
  await page.goto("/preview");
  await page.getByLabel("Preview step").selectOption(step);
}
async function enable(page: Page) {
  await page.getByRole("button", { name: "Say it", exact: true }).click();
  await page
    .getByRole("button", { name: "Enable microphone", exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Hold to speak, release to review",
      exact: true,
    }),
  ).toBeVisible();
}
test("ratings need explicit choices and keep progress across resize with large touch controls", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 850 });
  await preview(page, "traits");
  await expect(page.getByRole("button", { name: /Now rate/ })).toBeDisabled();
  await expect(page.getByText("Choose a rating", { exact: true })).toHaveCount(
    3,
  );
  const midpoints = page.getByRole("button", { name: "Choose midpoint · 5" });
  await midpoints.nth(0).click();
  await page.setViewportSize({ width: 1024, height: 768 });
  await expect(page.getByText("Choose a rating", { exact: true })).toHaveCount(
    2,
  );
  await midpoints.nth(1).click();
  await midpoints.nth(2).click();
  await page.getByRole("button", { name: /Now rate/ }).click();
  await expect(
    page.getByRole("button", { name: "Submit both ratings" }),
  ).toBeDisabled();
  await page.getByRole("slider").first().focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByText("6 / 10", { exact: true })).toBeVisible();
  await midpoints.nth(1).click();
  await midpoints.nth(2).click();
  await expect(
    page.getByRole("button", { name: "Submit both ratings" }),
  ).toBeEnabled();
  for (const width of [320, 1440]) {
    await page.setViewportSize({ width, height: 850 });
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "20px";
      document.documentElement.dataset.theme = "light";
      document.documentElement.dataset.reduceMotion = "true";
    });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
    for (const box of await page
      .getByRole("slider")
      .evaluateAll((nodes) =>
        nodes.map((n) => n.getBoundingClientRect().height),
      ))
      expect(box).toBeGreaterThanOrEqual(44);
  }
  await page.screenshot({
    path: "test-results/interactive-ratings.png",
    fullPage: true,
  });
});
test("hold release stops every track, keeps editable review, and permits only one re-record", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const streams: MediaStream[] = [];
    Object.defineProperty(window, "__streams", { value: streams });
    const get = navigator.mediaDevices.getUserMedia.bind(
      navigator.mediaDevices,
    );
    navigator.mediaDevices.getUserMedia = async (c) => {
      const stream = await get(c);
      streams.push(stream);
      return stream;
    };
  });
  await preview(page, "catchphrase");
  await enable(page);
  const hold = page.getByRole("button", {
    name: "Hold to speak, release to review",
    exact: true,
  });
  await hold.hover();
  await page.mouse.down();
  await expect(page.getByText(/Listening ·/)).toBeVisible();
  await page.waitForTimeout(250);
  await page.mouse.up();
  await expect(page.getByLabel("Edit your sample transcript")).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as unknown as { __streams: MediaStream[] }).__streams.every(
          (s) => s.getTracks().every((t) => t.readyState === "ended"),
        ),
      ),
    )
    .toBe(true);
  await page
    .getByLabel("Edit your sample transcript")
    .fill("Reviewed and corrected.");
  await expect(
    page.getByRole("button", { name: "That’s my line" }),
  ).toBeEnabled();
  await page.getByLabel("Mic / answer language").selectOption("te-IN");
  await page
    .getByRole("button", { name: "Start recording", exact: true })
    .click();
  await expect(page.getByText(/Listening ·/)).toBeVisible();
  await page.waitForTimeout(250);
  await page
    .getByRole("button", { name: "Stop recording", exact: true })
    .click();
  await expect(hold).toBeDisabled();
  await page.getByLabel("Mic / answer language").selectOption("hi-IN");
  await expect(hold).toBeDisabled();
  await page.getByLabel("Edit your sample transcript").fill("चाय तैयार है");
  await expect(
    page.getByRole("button", { name: "That’s my line" }),
  ).toBeEnabled();
});
test("cancelled permission never starts a late microphone", async ({
  page,
}) => {
  await preview(page, "catchphrase");
  await page.evaluate(() => {
    navigator.mediaDevices.getUserMedia = () => new Promise(() => {});
  });
  await page.getByRole("button", { name: "Say it", exact: true }).click();
  await page
    .getByRole("button", { name: "Enable microphone", exact: true })
    .click();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByText(/2 recordings left/)).toBeVisible();
  await page
    .getByLabel("Your signature line")
    .fill("Typing works while permission is ignored.");
  await expect(
    page.getByRole("button", { name: "That’s my line" }),
  ).toBeEnabled();
});

test("release during capture setup cancels the late stream without consuming a recording", async ({
  page,
}) => {
  await preview(page, "catchphrase");
  await enable(page);
  await page.evaluate(() => {
    const get = navigator.mediaDevices.getUserMedia.bind(
      navigator.mediaDevices,
    );
    navigator.mediaDevices.getUserMedia = async (c) => {
      const stream = await get(c);
      Object.assign(window, { __lateStream: stream });
      await new Promise((resolve) =>
        Object.assign(window, { __releasePermission: resolve }),
      );
      return stream;
    };
  });
  const hold = page.getByRole("button", {
    name: "Hold to speak, release to review",
    exact: true,
  });
  await hold.hover();
  await page.mouse.down();
  await expect(page.getByText("Connecting… release to cancel")).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() =>
        Boolean(
          (window as unknown as { __releasePermission: unknown })
            .__releasePermission,
        ),
      ),
    )
    .toBe(true);
  await page.mouse.up();
  await page.evaluate(() =>
    (
      window as unknown as { __releasePermission: () => void }
    ).__releasePermission(),
  );
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as unknown as { __lateStream: MediaStream }).__lateStream
          .getTracks()
          .every((t) => t.readyState === "ended"),
      ),
    )
    .toBe(true);
  await expect(page.getByText(/2 recordings left/)).toBeVisible();
  await expect(page.getByText(/Listening ·/)).toHaveCount(0);
});

test("online segments stay private, empty STT has no sample, and translations require review", async ({
  browser,
}) => {
  test.setTimeout(90000);
  const contexts = await Promise.all([
    browser.newContext({ permissions: ["microphone"] }),
    browser.newContext(),
  ]);
  const [host, guest] = await Promise.all(contexts.map((c) => c.newPage()));
  let recording = 0,
    translations = 0;
  for (const page of [host, guest])
    await page.addInitScript(() =>
      Object.defineProperty(document, "hidden", { get: () => false }),
    );
  await host.routeWebSocket("**/api/v1/realtime", (socket) => {
    const server = socket.connectToServer();
    server.onMessage((raw) => {
      const message = JSON.parse(String(raw));
      if (message.type === "state") message.snapshot.liveVoice = true;
      socket.send(JSON.stringify(message));
    });
  });
  await host.routeWebSocket("**/api/v1/audio", (socket) => {
    let captureId = "";
    socket.onMessage((raw) => {
      if (typeof raw !== "string") return;
      const message = JSON.parse(raw);
      if (message.type === "start") {
        captureId = message.captureId;
        recording++;
        socket.send(
          JSON.stringify({
            type: "ready",
            sampleRate: 16000,
            frameBytes: 1024,
            maxSeconds: 8,
            sessionId: crypto.randomUUID(),
          }),
        );
        if (recording === 1)
          socket.send(
            JSON.stringify({
              type: "segment",
              id: "segment-1",
              text: "रवि के साथ चाय",
              audioMs: 200,
            }),
          );
      }
      if (message.type === "stop")
        socket.send(
          JSON.stringify({
            type: "transcript",
            text: recording === 1 ? "रवि के साथ चाय" : "",
            final: true,
            captureId,
          }),
        );
    });
  });
  await host.route("**/api/v1/rooms/*/translate", async (route) => {
    translations++;
    if (translations === 1)
      await route.fulfill({
        status: 503,
        json: { message: "Synthetic translation failure" },
      });
    else {
      await new Promise((r) => setTimeout(r, 600));
      await route.fulfill({ json: { text: "Tea with Ravi", language: "en" } });
    }
  });
  try {
    await host.goto("/");
    await host
      .getByRole("button", { name: "Create a room", exact: true })
      .click();
    const form = host.getByRole("dialog");
    await form.getByLabel("Your display name").fill("Asha");
    await form.getByLabel("Room size").selectOption("2");
    await form.getByLabel("Host and question language").selectOption("en");
    await form
      .getByRole("button", { name: "Create room", exact: true })
      .click();
    const code = await host
      .getByText("ROOM CODE", { exact: true })
      .locator("..")
      .locator("strong")
      .textContent();
    await guest.goto("/");
    await guest.getByRole("button", { name: "Join with code" }).click();
    await guest.getByLabel("Your display name").fill("Bela");
    await guest.getByLabel("Room code", { exact: true }).fill(code!);
    await guest.getByRole("button", { name: "Join room", exact: true }).click();
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
    for (let round = 0; round < 2; round++)
      for (const page of [host, guest]) {
        await page.locator("main fieldset button").first().click();
        await page
          .getByRole("button", { name: "Lock choice", exact: true })
          .click();
      }
    await expect(host.locator("main")).toHaveAttribute(
      "data-step",
      "catchphrase",
    );
    await host.getByLabel("Mic / answer language").selectOption("hi-IN");
    await enable(host);
    await host
      .getByRole("button", { name: "Start recording", exact: true })
      .click();
    await expect(
      host.getByText("रवि के साथ चाय", { exact: true }),
    ).toBeVisible();
    await expect(
      guest.getByText("रवि के साथ चाय", { exact: true }),
    ).toHaveCount(0);
    await host
      .getByRole("button", { name: "Stop recording", exact: true })
      .click();
    await expect(host.getByText(/Translation could not finish/)).toBeVisible();
    await expect(host.getByLabel("Original answer")).toHaveValue(
      "रवि के साथ चाय",
    );
    const send = host.getByRole("button", { name: "That’s my line" });
    await expect(send).toBeDisabled();
    await host.getByLabel(/Gameplay answer/).fill("Tea with Ravi");
    await expect(send).toBeEnabled();
    await host.getByRole("button", { name: "Review in English" }).click();
    await host.getByLabel("Original answer").fill("बदला हुआ जवाब");
    await host.waitForTimeout(800);
    await expect(host.getByLabel(/Gameplay answer/)).toHaveValue("");
    await expect(send).toBeDisabled();
    expect(translations).toBe(2);
    await host
      .getByRole("button", { name: "Start recording", exact: true })
      .click();
    await expect(host.getByText(/Listening ·/)).toBeVisible();
    await host
      .getByRole("button", { name: "Stop recording", exact: true })
      .click();
    await expect(host.getByText(/No speech was recognised/)).toBeVisible();
    await expect(host.getByLabel("Original answer")).toHaveValue("");
    await host.reload();
    await host
      .getByRole("button", { name: "Resume game", exact: true })
      .click();
    await host.getByRole("button", { name: "Say it", exact: true }).click();
    await expect(host.getByText(/0 recordings left/)).toBeVisible();
  } finally {
    await Promise.all(contexts.map((c) => c.close()));
  }
});
test("nominations select first and lock explicitly", async ({ page }) => {
  await preview(page, "nominate-1");
  await expect(
    page.getByRole("button", { name: "Lock choice", exact: true }),
  ).toBeDisabled();
  await page.locator('main [aria-pressed="false"]').first().click();
  await expect(page.locator('main [aria-pressed="true"]')).toHaveCount(1);
  await expect(page.locator("main")).toHaveAttribute("data-step", "nominate-1");
  await page.getByRole("button", { name: "Lock choice", exact: true }).click();
  await expect(page.locator("main")).not.toHaveAttribute(
    "data-step",
    "nominate-1",
  );
});
