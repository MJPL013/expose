import { test, expect } from "@playwright/test";

test("modular character persists across sizes and carries into a real room", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/profile");
  const builder = page.getByRole("region", { name: "Character builder" });
  const parts = builder.getByRole("group", { name: "Character parts" });
  await page.getByLabel("Display name", { exact: true }).fill("Sky suspect");
  await page.getByLabel("A little about you").fill("Chai and alibis.");
  let previous = await builder
    .getByRole("img", { name: "Sky suspect's avatar" })
    .innerHTML();
  for (let click = 0; click < 3; click++) {
    await builder
      .getByRole("button", { name: "Randomise", exact: true })
      .click();
    const next = await builder
      .getByRole("img", { name: "Sky suspect's avatar" })
      .innerHTML();
    expect(next).not.toBe(previous);
    previous = next;
  }
  await expect(page.getByLabel("Display name", { exact: true })).toHaveValue(
    "Sky suspect",
  );
  await expect(page.getByLabel("A little about you")).toHaveValue(
    "Chai and alibis.",
  );
  for (const [part, value] of [
    ["Style", "Female"],
    ["Body", "Hoodie"],
    ["Eyes", "Wink"],
    ["Mouth", "Grin"],
    ["Hair", "Spiky"],
    ["Glasses", "Goofy"],
    ["Earrings", "Big hoops"],
    ["Necklace", "Pendant"],
  ]) {
    await parts.getByRole("button", { name: part, exact: true }).click();
    await builder.getByRole("button", { name: value, exact: true }).click();
    await expect(
      builder.getByRole("button", { name: value, exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
  }
  await builder.getByRole("button", { name: "Sky", exact: true }).click();
  await page.getByLabel("Display name", { exact: true }).fill("Sky suspect");
  const appearance = await builder
    .getByRole("img", { name: "Sky suspect's avatar" })
    .innerHTML();
  for (const width of [320, 375, 430, 820, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await builder.scrollIntoViewIfNeeded();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
    const targets = await builder.locator("button").evaluateAll((buttons) =>
      buttons.map((button) => {
        const r = button.getBoundingClientRect();
        return [r.width, r.height];
      }),
    );
    expect(targets.every(([w, h]) => w >= 44 && h >= 44)).toBe(true);
    await page.screenshot({ path: `test-results/character-${width}.png` });
  }
  await page.getByRole("button", { name: "Save my character" }).click();
  await expect(page.getByRole("status")).toContainText("Character saved");
  await page.reload();
  await expect(
    builder.getByRole("img", { name: "Sky suspect's avatar" }),
  ).toHaveJSProperty("innerHTML", appearance);
  await expect(
    builder.getByRole("button", { name: "Sky", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.goto("/");
  await page
    .getByRole("button", { name: "Create a room", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Create room", exact: true })
    .click();
  await expect(page).toHaveURL(/\/play$/);
  await expect(
    page
      .getByRole("main")
      .getByRole("img", { name: "Sky suspect's avatar" })
      .first(),
  ).toHaveJSProperty("innerHTML", appearance);
  expect(errors).toEqual([]);
});
