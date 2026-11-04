import { test, expect } from "@playwright/test";

test("adaptive panes preserve the same answer and compact preference across sizes", async ({
  page,
}) => {
  await page.goto("/preview");
  await page.getByLabel("Preview step").selectOption("catchphrase");
  const input = page.locator("main textarea");
  await input.fill("Still my unfinished answer");
  await input.evaluate((node) =>
    node.setAttribute("data-original-input", "yes"),
  );
  for (const width of [320, 375, 430, 768, 820, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(input).toHaveValue("Still my unfinished answer");
    await expect(input).toHaveAttribute("data-original-input", "yes");
    const frame = await page.locator("[data-app-frame]").boundingBox();
    expect(frame!.width).toBe(Math.min(width, 1200));
    await expect(
      page.getByRole("navigation", { name: "App navigation" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("complementary", { name: "Squad progress" }),
    ).toBeVisible({ visible: width >= 768 });
    const dock = await page.locator("[data-action-dock]").last().boundingBox();
    expect(dock!.y + dock!.height).toBeLessThanOrEqual(901);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.getByRole("button", { name: "How to play" }).click();
  await page.getByRole("button", { name: "Sound & feel", exact: true }).click();
  await page.getByLabel("App layout").selectOption("compact");
  await expect(page.locator("[data-app-frame]")).toHaveAttribute(
    "data-layout",
    "compact",
  );
  await page.keyboard.press("Escape");
  expect((await page.locator("[data-app-frame]").boundingBox())!.width).toBe(
    430,
  );
  await expect(input).toHaveValue("Still my unfinished answer");
  await page.setViewportSize({ width: 820, height: 420 });
  await expect(
    page.getByRole("complementary", { name: "Squad progress" }),
  ).not.toBeVisible();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "24px";
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
