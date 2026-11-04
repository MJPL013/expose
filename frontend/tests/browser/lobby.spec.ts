import { expect, test } from "@playwright/test";

test("host moderation, small-screen chat and backgrounding preserve a usable lobby", async ({
  browser,
}) => {
  const contexts = await Promise.all(
    [320, 375, 430].map((width) =>
      browser.newContext({ viewport: { width, height: 850 } }),
    ),
  );
  const pages = await Promise.all(contexts.map((context) => context.newPage()));
  const [owner, friend, removed] = pages;
  const closes: number[] = [];
  owner.on("websocket", (socket) => socket.on("close", () => closes.push(1)));
  try {
    await owner.goto("/");
    await owner
      .getByRole("button", { name: "Create a room", exact: true })
      .click();
    const create = owner.getByRole("dialog");
    await create.getByLabel("Your display name").fill("Asha");
    await create.getByLabel("Room size").selectOption("3");
    await create
      .getByRole("button", { name: "Create room", exact: true })
      .click();
    await expect(owner).toHaveURL(/\/play$/);
    const code = (await owner
      .getByText("ROOM CODE", { exact: true })
      .locator("..")
      .locator("strong")
      .textContent())!;
    for (const [index, page] of [friend, removed].entries()) {
      await page.goto("/");
      await page.getByRole("button", { name: "Join with code" }).click();
      const join = page.getByRole("dialog");
      await join
        .getByLabel("Your display name")
        .fill(index ? "Chirag" : "Bela With A Longer Name");
      await join.getByLabel("Room code", { exact: true }).fill(code);
      await join
        .getByRole("button", { name: "Join room", exact: true })
        .click();
      await expect(page).toHaveURL(/\/play$/);
      await expect(
        page.getByRole("button", { name: /Remove .* from room/ }),
      ).toHaveCount(0);
    }
    await friend
      .getByLabel("Message the squad")
      .fill(
        "Long names should sit neatly above the message, even on a small phone.",
      );
    await friend.getByRole("button", { name: "Send message" }).click();
    const log = owner.getByRole("log");
    await expect(log).toContainText("Long names should sit neatly");
    for (const width of [320, 375, 430, 1440]) {
      await owner.setViewportSize({ width, height: 850 });
      await log.scrollIntoViewIfNeeded();
      const layout = await owner.evaluate(() => {
        const log = document.querySelector('[role="log"]')!;
        const sender = log.querySelector("span")!;
        const message = log.querySelector("p")!;
        const input = document
          .querySelector('input[placeholder="Say something…"]')!
          .getBoundingClientRect();
        const send = document
          .querySelector('button[aria-label="Send message"]')!
          .getBoundingClientRect();
        return {
          scrollWidth: document.documentElement.scrollWidth,
          senderSize: parseFloat(getComputedStyle(sender).fontSize),
          messageSize: parseFloat(getComputedStyle(message).fontSize),
          leftDifference: Math.abs(
            sender.getBoundingClientRect().left -
              message.getBoundingClientRect().left,
          ),
          centerDifference: Math.abs(
            input.y + input.height / 2 - send.y - send.height / 2,
          ),
          targetHeight: send.height,
        };
      });
      expect(layout.scrollWidth).toBeLessThanOrEqual(width);
      expect(layout.senderSize).toBeLessThan(layout.messageSize);
      expect(layout.leftDifference).toBeLessThan(1);
      expect(layout.centerDifference).toBeLessThan(1);
      expect(layout.targetHeight).toBeGreaterThanOrEqual(44);
      await owner.screenshot({
        path: `test-results/lobby-refined-${width}.png`,
        animations: "disabled",
      });
    }
    await owner.setViewportSize({ width: 320, height: 850 });
    await owner.emulateMedia({ reducedMotion: "reduce" });
    await owner.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
    await log.scrollIntoViewIfNeeded();
    const play = await owner.getByRole("button", { name: "Play", exact: true }).boundingBox();
    expect(play!.x).toBeGreaterThanOrEqual(0);
    expect(play!.x + play!.width).toBeLessThanOrEqual(320);
    expect(play!.y + play!.height).toBeLessThanOrEqual(850);
    expect(await owner.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
    await owner.screenshot({ path: "test-results/lobby-refined-enlarged.png", animations: "disabled" });
    await owner.evaluate(() => { document.documentElement.style.fontSize = ""; });
    // Tab backgrounding stops media but must not voluntarily relinquish a healthy socket.
    closes.length = 0;
    await owner.evaluate(() => {
      Object.defineProperty(document, "hidden", {
        configurable: true,
        get: () => true,
      });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await friend
      .getByLabel("Message the squad")
      .fill("Still connected while you switch tabs.");
    await friend.getByRole("button", { name: "Send message" }).click();
    await expect(log).toContainText("Still connected while you switch tabs.");
    await owner.evaluate(() => {
      delete (document as unknown as { hidden?: boolean }).hidden;
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(closes).toEqual([]);
    await expect(
      owner.getByRole("button", { name: "Play", exact: true }),
    ).toBeVisible();
    await owner
      .getByRole("button", { name: "Remove Chirag from room" })
      .click();
    await owner
      .getByRole("dialog")
      .getByRole("button", { name: "Remove player", exact: true })
      .click();
    await expect(
      owner.getByRole("button", { name: "Remove Chirag from room" }),
    ).toHaveCount(0);
    await expect(removed.getByRole("status")).toContainText(
      "no longer have a seat",
    );
    await expect(
      removed.getByRole("button", { name: "Resume game" }),
    ).toHaveCount(0);
    await expect(
      removed.getByRole("button", { name: "Back to home" }),
    ).toBeVisible();
    await expect(
      owner.getByRole("button", { name: "Play", exact: true }),
    ).toBeDisabled();
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
});
