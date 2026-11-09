import { chooseMidpoints } from "./helpers";
import { test, expect, type Page } from "@playwright/test";
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem("expose.playMode", "demo"),
  );
});

async function create(page: Page, mode = "spotlight", count = "3") {
  await page.goto("/demo");
  await page
    .getByRole("button", { name: "Create a room", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Your display name").fill("Riya");
  await dialog.getByLabel("Game mode").selectOption(mode);
  await dialog.getByLabel("Room size").selectOption(count);
  await dialog
    .getByRole("button", { name: "Create room", exact: true })
    .click();
  await page.getByRole("button", { name: "I’m ready", exact: true }).click();
  await page
    .getByRole("button", { name: "Play", exact: true })
    .click();
}
async function playToCard(page: Page) {
  const seen = new Set<string>();
  for (let i = 0; i < 120; i++) {
    const main = page.locator("main[data-step]");
    const step = await main.getAttribute("data-step");
    if (step === "card") return seen;
    seen.add(step!);
    const pending = (await main.getAttribute("data-action-pending")) === "true";
    if (pending) {
      if (step === "traits") {
        await chooseMidpoints(page);
        await page.getByRole("button", { name: /Now rate/ }).click();
        await chooseMidpoints(page);
        await page.getByRole("button", { name: "Submit both ratings" }).click();
      } else if (step?.startsWith("nominate")) {
        await main.getByRole("button").first().click();
        await page.getByRole("button", { name: "Lock choice", exact: true }).click();
      } else if (step?.startsWith("judge") || step?.startsWith("vote")) {
        await page
          .getByRole("group", { name: "Anonymous answers" })
          .locator("button:enabled")
          .first()
          .click();
        await page
          .getByRole("button", { name: /Lock (my pick|in my vote)/ })
          .click();
      } else if (step === "sync") {
        await main.getByRole("button").first().click();
        await page.getByRole("button", { name: "Lock prediction", exact: true }).click();
      } else if (await main.locator("textarea:enabled").count()) {
        await main
          .locator("textarea:enabled")
          .fill(
            step?.startsWith("secret") || step?.startsWith("guess")
              ? "Blue"
              : "Chai first. Planning later.",
          );
        await page.locator('[data-action-dock] button[type="submit"]').click();
      }
    } else {
      const next = page.locator("[data-action-dock] button:enabled").first();
      if (await next.count()) await next.click();
    }
    await page.clock.fastForward(3000);
  }
  throw new Error("Session failed to reach its card");
}

for (const mode of ["spotlight", "bluff"])
  test(`${mode} player journey, approval, download, and rematch`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.clock.install();
    await create(page, mode);
    const seen = await playToCard(page);
    expect(
      [...seen].some((step) =>
        step.startsWith(mode === "spotlight" ? "judge" : "vote"),
      ),
    ).toBe(true);
    await expect(
      page.getByRole("button", { name: "Download Friend Card" }),
    ).toHaveCount(0);
    await page.getByRole("button", { name: "Approve my card" }).click();
    for (const name of ["Download Friend Card", "Download rap sheet"]) {
      const result = page.waitForEvent("download");
      await page.getByRole("button", { name, exact: true }).click();
      expect((await result).suggestedFilename()).toMatch(/\.png$/);
    }
    await page.getByRole("button", { name: "Back to lobby" }).click();
  await page.getByRole("button", { name: "Run it back" }).click();
    await expect(
      page.getByRole("button", { name: "I’m ready", exact: true }),
    ).toBeVisible();
    expect(errors).toEqual([]);
  });

test("refresh and reopen preserve seat, scores, and submitted text; another tab cannot control it", async ({
  page,
  context,
}) => {
  await create(page);
  await chooseMidpoints(page);
  await page.getByRole("button", { name: /Now rate/ }).click();
  await chooseMidpoints(page);
  await page.getByRole("button", { name: "Submit both ratings" }).click();
  const before = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("gnani.session.v2")!),
  );
  await page.reload();
  await page.getByRole("button", { name: "Resume game", exact: true }).click();
  await expect(page.locator("main[data-step]")).toBeVisible();
  const after = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("gnani.session.v2")!),
  );
  expect(after.seatToken).toBe(before.seatToken);
  expect(after.state.self).toEqual(before.state.self);
  expect(after.state.sessionId).toBe(before.state.sessionId);
  const other = await context.newPage();
  await other.goto("/demo");
  await expect(
    other.getByRole("button", { name: "Create a room", exact: true }),
  ).toBeDisabled();
  await expect(
    other.getByText(/This game is open in another tab/),
  ).toBeVisible();
  await page.close();
  await other.getByRole("button", { name: "retry here" }).click();
  await other.getByRole("button", { name: "Resume game", exact: true }).click();
  await expect(other.locator("main[data-step]")).toBeVisible();
  const reopened = await other.evaluate(() =>
    JSON.parse(localStorage.getItem("gnani.session.v2")!),
  );
  expect(reopened.seatToken).toBe(before.seatToken);
  await other.close();
});

test("storage failures recover clearly and settings preserve reduced motion", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem("gnani.session.v2", "{invalid"),
  );
  await page.goto("/");
  await expect(
    page.getByText(/Saved match could not be restored/),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Create a room", exact: true }),
  ).toBeEnabled();
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await page.getByRole("switch", { name: /^Reduce motion/ }).check();
  await expect(page.locator("html")).toHaveAttribute(
    "data-reduce-motion",
    "true",
  );
  await page.reload();
  await expect(
    page.getByRole("switch", { name: /^Reduce motion/ }),
  ).toBeChecked();
});

test("responsive Spotlight controls and standings stay inside the game canvas", async ({
  page,
}) => {
  await page.goto("/preview");
  await page.getByLabel("Flow variant").selectOption("hostel-spotlight-5");
  for (const width of [320, 375, 430, 1440]) {
    await page.setViewportSize({ width, height: 812 });
    await page.getByLabel("Preview step").selectOption("guess-0");
    const main = page.locator("main[data-step]");
    await expect(main).toHaveAttribute("data-step", "guess-0");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const dock = page.locator("[data-action-dock]");
    const bounds = await dock.boundingBox();
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(812);
    await page.screenshot({
      path: `test-results/spotlight-${width}.png`,
      animations: "disabled",
    });
    await page.getByLabel("Preview step").selectOption("spotlight-reveal-0");
    await expect(
      main.getByRole("region", { name: "Squad standings" }),
    ).toBeVisible();
    expect(
      await main.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
    ).toBe(true);
  }
});

test("pending-action timer vibrates, and unsupported devices retain useful controls", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const calls: (number | number[])[] = [];
    Object.assign(window, { vibrationCalls: calls });
    Object.defineProperty(navigator, "vibrate", {
      configurable: true,
      value: (pattern: number | number[]) => {
        calls.push(pattern);
        return true;
      },
    });
  });
  await page.clock.install();
  await page.goto("/preview");
  await page.getByLabel("Flow variant").selectOption("hostel-spotlight-5");
  await page.getByLabel("Preview step").selectOption("guess-0");
  await page.getByRole("button", { name: "Resume", exact: true }).click();
  await page.clock.fastForward(13000);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { vibrationCalls: unknown[] }).vibrationCalls,
      ),
    )
    .toContain(40);
  await page.locator("main textarea").fill("Blue");
  await page
    .getByRole("button", { name: "Lock my answer", exact: true })
    .click();
  await expect(page.locator("main[data-step]")).toHaveAttribute(
    "data-step",
    "spotlight-reveal-0",
  );
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await page.evaluate(() => {
    (window as unknown as { vibrationCalls: unknown[] }).vibrationCalls.length =
      0;
  });
  await page.clock.fastForward(4000);
  expect(
    await page.evaluate(() =>
      (
        window as unknown as { vibrationCalls: unknown[] }
      ).vibrationCalls.filter((p) => p !== 0),
    ),
  ).toEqual([]);
  await page.evaluate(() =>
    Object.defineProperty(navigator, "vibrate", {
      configurable: true,
      value: undefined,
    }),
  );
  await page.goto("/settings");
  // Init script provides the API on navigation; remove it before mounting the settings component.
  await page.evaluate(() =>
    Object.defineProperty(navigator, "vibrate", {
      configurable: true,
      value: undefined,
    }),
  );
  await page
    .getByRole("navigation")
    .getByRole("link", { name: "Profile", exact: true })
    .click();
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Test vibration" }),
  ).toBeDisabled();
  await expect(
    page.getByText(/This browser does not support vibration/),
  ).toBeVisible();
});

test("blocked checkpoint storage permits play and makes the missing resume capability explicit", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key: string, value: string) {
      if (key === "gnani.session.v2")
        throw new DOMException("Blocked", "QuotaExceededError");
      original.call(this, key, value);
    };
  });
  await create(page);
  await expect(page.getByText(/Match could not be saved/)).toBeVisible();
  await chooseMidpoints(page);
  await expect(page.getByRole("button", { name: /Now rate/ })).toBeEnabled();
});
