import { createPlayerRoom } from "./helpers";
import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 375, height: 812 } });

test("character editing persists and is used in the lobby", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("navigation", { name: "App navigation" })
    .getByRole("link", { name: "Profile" })
    .click();
  await page.getByRole("button", { name: "Straight", exact: true }).click();
  await page.getByRole("button", { name: "Sage", exact: true }).click();
  await page.getByLabel("Display name", { exact: true }).fill("Riya");
  await page
    .getByLabel("A little about you")
    .fill("Usually late. Always brings snacks.");
  await page.getByRole("button", { name: "Save my character" }).click();
  await expect(page.getByRole("status")).toContainText("Character saved");
  await page.reload();
  await expect(page.getByLabel("Display name", { exact: true })).toHaveValue(
    "Riya",
  );
  await expect(
    page.getByRole("button", { name: "Straight", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page
    .getByRole("navigation")
    .getByRole("link", { name: "Play", exact: true })
    .click();
  await createPlayerRoom(page);
  await expect(
    page.getByRole("main").getByText("Riya", { exact: true }),
  ).toBeVisible();
  const start = page.getByRole("button", {
    name: "Play",
    exact: true,
  });
  await expect(start).toBeDisabled();
  await page.getByRole("button", { name: "I’m ready", exact: true }).click();
  await expect(start).toBeEnabled();
  const box = await start.boundingBox();
  expect(box!.y + box!.height).toBeLessThan(812);
  const before = box!.y;
  await page.getByRole("main").evaluate((main) => {
    main.scrollTop = main.scrollHeight;
  });
  expect((await start.boundingBox())!.y).toBe(before);
  await expect(page.getByRole("navigation", { name: "App navigation" })).toHaveCount(0);
  await page.getByRole("button", { name: "Leave session" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Stay with the squad", exact: true }).click();
  await expect(page).toHaveURL(/\/play$/);
});

test("readiness gates the host and approved cards enter the local collection", async ({
  page,
}) => {
  await page.goto("/preview");
  await page.getByLabel("Kabir ready (fixture)").uncheck();
  await page.getByRole("button", { name: "I’m ready", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Play", exact: true }),
  ).toBeDisabled();
  await page.getByLabel("Kabir ready (fixture)").check();
  await expect(
    page.getByRole("button", { name: "Play", exact: true }),
  ).toBeEnabled();
  await page.getByLabel("Preview step").selectOption("card");
  await page.getByRole("button", { name: "Approve my card" }).click();
  await page.getByRole("button", { name: "Save to my cards" }).click();
  await page.getByRole("button", { name: "Leave session" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Leave for now", exact: true }).click();
  await page.getByRole("navigation").getByRole("link", { name: "My cards" }).click();
  await expect(page.getByRole("article")).toHaveCount(1);
  await page.reload();
  await expect(page.getByRole("article")).toHaveCount(1);
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download card", exact: true })
    .click();
  expect((await download).suggestedFilename()).toBe("expose-friend-card.png");
  await page
    .getByRole("navigation")
    .getByRole("link", { name: "Profile" })
    .click();
  await expect(
    page.getByText("THE LAST-MINUTE LEGEND", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("navigation")
    .getByRole("link", { name: "My cards" })
    .click();
  await page.getByRole("button", { name: "Remove saved card" }).click();
  await page.getByRole("button", { name: "Remove card", exact: true }).click();
  await expect(page.getByRole("article")).toHaveCount(0);
});

test("sound mute persists and installation has a usable fallback", async ({
  page,
}) => {
  await page.goto("/settings");
  await page
    .getByRole("switch", { name: "Sound effects", exact: false })
    .uncheck();
  await expect(
    page.getByRole("button", { name: "Preview sound" }),
  ).toBeDisabled();
  await page.reload();
  await expect(
    page.getByRole("switch", { name: "Sound effects", exact: false }),
  ).not.toBeChecked();
  await page
    .getByRole("button", { name: "Install Expose", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("Add to Home Screen");
  await page.getByRole("button", { name: "Got it", exact: true }).click();
  await page
    .getByRole("switch", { name: "Sound effects", exact: false })
    .check();
  await page.getByRole("button", { name: "Preview sound" }).click();
  await page.getByRole("button", { name: "Reset saved data" }).click();
  await page
    .getByRole("button", { name: "Clear saved data", exact: true })
    .click();
  expect(
    await page.evaluate(() => localStorage.getItem("gnani.player.v1")),
  ).toBeNull();
});

test("mobile app panes and icons reflow across screen sizes", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const [width, height] of [
    [320, 568],
    [375, 812],
    [430, 932],
    [844, 390],
    [1440, 900],
  ]) {
    await page.setViewportSize({ width, height });
    for (const route of [
      "/",
      "/play",
      "/profile",
      "/collection",
      "/settings",
    ]) {
      await page.goto(route);
      await expect(
        page.getByRole("navigation", { name: "App navigation" }),
      ).toBeVisible({ visible: route !== "/play" });
      const geometry = await page.evaluate(() => {
        const frame = document
          .querySelector("[data-app-frame]")!
          .getBoundingClientRect();
        return {
          width: document.documentElement.scrollWidth,
          height: frame.height,
          viewport: innerHeight,
          hiddenIcons: [
            ...document.querySelectorAll("header button svg, nav a svg"),
          ].filter((icon) => {
            const rect = icon.getBoundingClientRect();
            return (
              rect.width < 16 ||
              rect.height < 16 ||
              rect.left < frame.left ||
              rect.right > frame.right ||
              rect.bottom > innerHeight
            );
          }).length,
        };
      });
      expect(geometry.width).toBeLessThanOrEqual(width);
      expect(geometry.height).toBeLessThanOrEqual(height + 1);
      expect(geometry.hiddenIcons).toBe(0);
      if (width === 375)
        await page.screenshot({
          path: `test-results/app-${route === "/" ? "home" : route.slice(1)}-375.png`,
          animations: "disabled",
        });
    }
  }
});

test("voice input action stays visible in a keyboard-sized viewport", async ({
  page,
}) => {
  await page.goto("/preview");
  await page.getByLabel("Preview step").selectOption("answer-0");
  await expect(
    page.getByRole("heading", { name: "Can you pass for Manoj?" }),
  ).toBeVisible();
  await page.locator("summary").click();
  await expect(
    page.getByRole("heading", { name: "Can you pass for Manoj?" }),
  ).toBeVisible();
  await page.setViewportSize({ width: 375, height: 480 });
  await page
    .getByLabel("Your answer", { exact: true })
    .fill("The plan is chai. The rest is improvisation.");
  const action = page.getByRole("button", { name: "Seal my answer" });
  await expect(action).toBeEnabled();
  const bounds = await action.boundingBox();
  expect(bounds!.y).toBeGreaterThanOrEqual(0);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(480);
  await action.click();
  await expect(
    page.getByRole("heading", { name: "A moment of suspense." }),
  ).toBeVisible();
});

test("effects wait for a gesture and mute prevents further scheduled sound", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const meter = { scheduled: 0 };
    Object.defineProperty(window, "__sfxMeter", { value: meter });
    const original = AudioContext.prototype.createOscillator;
    AudioContext.prototype.createOscillator = function () {
      meter.scheduled++;
      return original.call(this);
    };
  });
  const count = () =>
    page.evaluate(
      () =>
        (window as unknown as { __sfxMeter: { scheduled: number } }).__sfxMeter
          .scheduled,
    );
  await page.goto("/settings");
  expect(await count()).toBe(0);
  await page.getByRole("button", { name: "Preview sound" }).click();
  await expect.poll(count).toBeGreaterThanOrEqual(4);
  await page
    .getByRole("switch", { name: "Sound effects", exact: false })
    .uncheck();
  await page
    .getByRole("navigation")
    .getByRole("link", { name: "Play", exact: true })
    .click();
  await createPlayerRoom(page);
  await page.getByRole("button", { name: "I’m ready", exact: true }).click();
  expect(await count()).toBe(0);
  await page.getByRole("button", { name: "Enable sound effects" }).click();
  await expect.poll(count).toBeGreaterThan(0);
});
