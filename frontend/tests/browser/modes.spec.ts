import { expect, test } from "@playwright/test";
import { createPlayerRoom } from "./helpers";

test("player opens on the case file and suspect stamp, with no demo launch", async ({
  page,
}) => {
  for (const [width, height] of [
    [320, 568],
    [375, 812],
    [430, 932],
  ]) {
    await page.setViewportSize({ width, height });
    await page.goto("/");
    const card = page.locator("[data-case-file]");
    const stamp = card.getByText("SUSPECT", { exact: true });
    await expect(page.locator("main > :first-child")).toHaveAttribute(
      "data-case-file",
      "true",
    );
    await expect(
      card.getByRole("heading", { name: "Hostel 2 AM" }),
    ).toBeVisible();
    await expect(stamp).toBeVisible();
    await expect(stamp.locator("..")).toHaveCSS(
      "animation-name",
      /stampImpact/,
    );
    // Finish the opening animation before measuring its resting position.
    await stamp
      .locator("..")
      .evaluate((element) =>
        Promise.all(
          element.getAnimations().map((animation) => animation.finished),
        ),
      );
    const bounds = await stamp.boundingBox();
    const actions = await page.locator("[data-action-dock]").boundingBox();
    expect(bounds!.y).toBeGreaterThan(0);
    expect(bounds!.y + bounds!.height).toBeLessThan(actions!.y);
    await expect(
      page.getByRole("button", { name: "Meet your demo squad" }),
    ).toHaveCount(0);
    await expect(page.getByLabel("Development preview controls")).toHaveCount(
      0,
    );
    await expect(
      page.getByRole("button", { name: "Create a room", exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: `test-results/player-home-${width}.png`,
      animations: "disabled",
    });
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload();
  const stamp = page
    .locator("[data-case-file]")
    .getByText("SUSPECT", { exact: true });
  await expect(stamp).toBeVisible();
  await expect(stamp.locator("..")).toHaveCSS("animation-name", "none");
});

test("join uses a room form and recovers from an invalid local code", async ({
  page,
}) => {
  await page.goto("/demo");
  await page
    .getByRole("button", { name: "Join with code", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Your display name").fill("Aditi");
  await dialog.getByLabel("Room code", { exact: true }).fill("WRONG1");
  await dialog.getByRole("button", { name: "Join room", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("DEMO42");
  await dialog.getByLabel("Room code", { exact: true }).fill("DEMO42");
  await dialog.getByRole("button", { name: "Join room", exact: true }).click();
  await expect(page).toHaveURL(/\/play$/);
  await expect(
    page.getByRole("main").getByText("Aditi", { exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Development preview controls")).toHaveCount(0);
});

test("developer controls use a separate session from player mode", async ({
  page,
}) => {
  await page.goto("/dev");
  await page.getByRole("button", { name: "Meet your demo squad" }).click();
  await expect(page).toHaveURL(/\/preview$/);
  await page.getByLabel("Flow variant").selectOption("hostel-remix");
  await page.getByLabel("Kabir ready (fixture)").uncheck();
  await page.getByLabel("Player perspective").selectOption("kabir");
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await page.getByRole("link", { name: "Developer home" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Leave for now" }).click();
  await page.getByRole("link", { name: "Open offline practice" }).click();
  await expect(page).toHaveURL(/\/demo$/);
  await createPlayerRoom(page);
  await expect(page.getByText("4/5 READY", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "I’m ready", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Play", exact: true }),
  ).toBeEnabled();
  await expect(page.getByLabel("Development preview controls")).toHaveCount(0);
  await page.getByRole("button", { name: "Leave session", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Leave for now", exact: true })
    .click();
  await page.getByRole("navigation").getByRole("link", { name: "Profile", exact: true }).click();
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await page.getByRole("link", { name: "Open developer mode" }).click();
  await page.getByRole("link", { name: "Resume workbench" }).click();
  await expect(page.getByLabel("Flow variant")).toHaveValue("hostel-remix");
  await expect(page.getByLabel("Player perspective")).toHaveValue("kabir");
  await expect(page.getByLabel("Kabir ready (fixture)")).not.toBeChecked();
  await expect(
    page.getByRole("button", { name: "Resume", exact: true }),
  ).toBeVisible();
});
