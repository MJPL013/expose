import { chooseMidpoints } from "./helpers";
import { createPlayerRoom } from "./helpers";
import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

async function preview(page: Page, step: string) {
  await page.goto("/preview");
  await page.getByLabel("Preview step").selectOption(step);
}

test("legacy fixture journey, approval and both PNG downloads", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/dev");
  await page.getByRole("button", { name: "Meet your demo squad" }).click();
  await page.getByRole("button", { name: "I’m ready", exact: true }).click();
  await page
    .getByRole("button", { name: "Play", exact: true })
    .click();
  await chooseMidpoints(page);
  await page.getByRole("button", { name: "Now rate Manoj" }).click();
  await chooseMidpoints(page);
  await page.getByRole("button", { name: "Submit both ratings" }).click();
  await page.getByRole("button", { name: /Manoj.*usual suspect/ }).click();
  await page.getByRole("button", { name: "Lock choice", exact: true }).click();
  await page.getByRole("button", { name: /Ananya.*usual suspect/ }).click();
  await page.getByRole("button", { name: "Lock choice", exact: true }).click();
  await page
    .getByLabel("Any words in your defense?")
    .fill("My calendar is in another timezone.");
  await page.getByRole("button", { name: "Enter my defense" }).click();
  await page
    .getByLabel("Your signature line")
    .fill("Chai first. Everything else later.");
  await page.getByRole("button", { name: "That’s my line" }).click();
  await page
    .getByLabel("Your answer", { exact: true })
    .fill("I already booked the auto. In my imagination.");
  await page.getByRole("button", { name: "Seal my answer" }).click();
  await page.getByRole("button", { name: "Continue to the vote" }).click();
  const options = page.getByRole("group", { name: "Anonymous answers" });
  await expect(options).not.toContainText("AI decoy");
  await expect(
    options.getByRole("button", { name: /Your answer/ }),
  ).toBeDisabled();
  await options.locator("button:enabled").first().click();
  await page.getByRole("button", { name: "Lock in my vote" }).click();
  await expect(page.getByText("AI decoy · decoy")).toBeVisible();
  await page.getByRole("button", { name: "One more round" }).click();
  await page
    .getByLabel("Your answer", { exact: true })
    .fill("The slides are done. Please do not open them.");
  await page.getByRole("button", { name: "Seal my answer" }).click();
  await page.getByRole("button", { name: "Continue to the vote" }).click();
  await expect(
    page.getByText("You’re the target this round.", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "See how the squad voted" }).click();
  await page.getByRole("button", { name: "Proceed to the aftermath" }).click();
  await page
    .getByRole("button", { name: /Kabir.*Lock in your prediction/ })
    .click();
  await page.getByRole("button", { name: "Lock prediction", exact: true }).click();
  await page.getByRole("button", { name: "Hear how the night ends" }).click();
  await expect(
    page.getByText(/Chai first. Everything else later./),
  ).toBeVisible();
  await page.getByRole("button", { name: "Bring in the verdict" }).click();
  await page.getByRole("button", { name: "Open my friend dossier" }).click();
  await expect(
    page.getByRole("button", { name: "Download Friend Card" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Approve my card" }).click();
  for (const button of ["Download Friend Card", "Download rap sheet"]) {
    const pending = page.waitForEvent("download");
    await page.getByRole("button", { name: button }).click();
    const download = await pending;
    const file = await download.path();
    expect(file).toBeTruthy();
    const bytes = await readFile(file!);
    expect(bytes.subarray(1, 4).toString()).toBe("PNG");
    expect(bytes.readUInt32BE(16)).toBe(1080);
    expect(bytes.readUInt32BE(20)).toBe(1600);
    await download.saveAs(`test-results/${download.suggestedFilename()}`);
  }
  await page.getByRole("button", { name: "Back to lobby" }).click();
  await page.getByRole("button", { name: "Run it back" }).click();
  await expect(
    page.getByRole("button", { name: "Play", exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("veto, private artifacts, interruption and alternate flow", async ({
  page,
}) => {
  await preview(page, "answer-0");
  const original = await page.locator("main h2").textContent();
  await page.getByRole("button", { name: "Veto question" }).click();
  await expect(page.locator("main h2")).not.toHaveText(original!);
  await page.getByRole("button", { name: "Simulate interruption" }).click();
  await expect(
    page.getByRole("button", { name: "Seal my answer" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Reconnect demo" }).click();
  await page.getByLabel("Preview step").selectOption("card");
  await page.getByRole("button", { name: "Keep it private" }).click();
  await expect(
    page.getByText("You kept your card private.", { exact: false }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /Download/ })).toHaveCount(0);
  await page.getByLabel("Flow variant").selectOption("hostel-remix");
  await page.getByLabel("Preview step").selectOption("wildcard");
  await page
    .getByLabel("Your answer", { exact: true })
    .fill("My homework went out for chai.");
  await page.getByRole("button", { name: "Submit my remix" }).click();
  await expect(
    page.getByRole("heading", { name: "On the count of three." }),
  ).toBeVisible();
});

test("denied microphone remains playable by typing", async ({ page }) => {
  await preview(page, "catchphrase");
  await page.getByLabel("Microphone fixture").selectOption("denied");
  await page.getByRole("button", { name: "Say it" }).click();
  await page.getByRole("button", { name: "Enable microphone" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "type",
  );
  await page.getByRole("button", { name: "Type it" }).click();
  await page
    .getByLabel("Your signature line")
    .fill("Still here, still typing.");
  await page.getByRole("button", { name: "That’s my line" }).click();
  await expect(
    page.getByRole("heading", { name: "Can you pass for Manoj?" }),
  ).toBeVisible();
});

test("small and large layouts reflow without horizontal overflow", async ({
  page,
}) => {
  for (const width of [320, 375, 430, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `test-results/home-${width}.png`,
      fullPage: true,
      animations: "disabled",
    });
    await preview(page, "vote-0");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `test-results/vote-${width}.png`,
      fullPage: true,
      animations: "disabled",
    });
    await page.getByLabel("Preview step").selectOption("card");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `test-results/card-${width}.png`,
      fullPage: true,
      animations: "disabled",
    });
  }
});

test("keyboard dialog focus and reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await createPlayerRoom(page);
  await page.getByRole("button", { name: "How to play" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "How to play" })).toBeFocused();
  await page.addStyleTag({
    content:
      "html { font-size: 200%; } body { letter-spacing: .12em; word-spacing: .16em; }",
  });
  for (const width of [320, 375, 430, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const overflowing = await page.evaluate(() =>
      [...document.querySelectorAll("main *")]
        .filter(
          (element) => element.getBoundingClientRect().right > innerWidth + 1,
        )
        .map((element) => `${element.tagName}.${element.className}`),
    );
    expect(overflowing, `200% text at ${width}px`).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
});
