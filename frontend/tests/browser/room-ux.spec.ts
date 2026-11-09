import { test, expect } from "@playwright/test";

test("warm theme persists and home actions remain separated at enlarged text", async ({
  page,
}) => {
  await page.goto("/settings");
  await page.getByRole("button", { name: "Switch to light mode" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  for (const width of [320, 499, 820, 1440]) {
    await page.setViewportSize({ width, height: 716 });
    await page.goto("/");
    await page.evaluate(
      () => (document.documentElement.style.fontSize = "20px"),
    );
    const create = await page
      .getByRole("button", { name: "Create a room", exact: true })
      .boundingBox();
    const join = await page
      .getByRole("button", { name: "Join with code", exact: true })
      .boundingBox();
    expect(join!.y - (create!.y + create!.height)).toBeGreaterThanOrEqual(12);
    expect(join!.y + join!.height).toBeLessThan(716);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
    await page.screenshot({ path: `test-results/light-home-${width}.png` });
  }
  await page.goto("/profile");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.getByRole("button", { name: "Randomise" })).toBeVisible();
  await page.screenshot({ path: "test-results/light-profile.png" });
  await page.goto("/settings");
  await page.getByRole("button", { name: "Switch to dark mode" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

test("empty and short chat let the phone page scroll under the pointer", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 716 });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Create a room", exact: true })
    .click();
  await page.getByLabel("Your display name").fill("Scroll tester");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Create room", exact: true })
    .click();
  await expect(page).toHaveURL(/\/play$/);
  for (let count = 0; count < 2; count++) {
    const log = page.getByRole("log");
    await log.scrollIntoViewIfNeeded();
    expect(await log.evaluate((el) => el.scrollHeight <= el.clientHeight)).toBe(
      true,
    );
    const before = await page.locator("main").evaluate((el) => el.scrollTop);
    expect(before).toBeGreaterThan(0);
    await log.hover();
    await page.mouse.wheel(0, -150);
    await expect
      .poll(() => page.locator("main").evaluate((el) => el.scrollTop))
      .toBeLessThan(before);
    if (count === 0) {
      await page.getByLabel("Message the squad").fill("Hello squad");
      await page.getByRole("button", { name: "Send message" }).click();
      await expect(log).toContainText("Hello squad");
    }
  }
});
