import { chooseMidpoints } from "./helpers";
import { test, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";

for (const setup of [
  {
    label: "two players on desktop and phone",
    widths: [1440, 375],
    pack: "goa-trip",
  },
  { label: "three phone players", widths: [320, 375, 430], pack: "hostel-2am" },
])
  test(`${setup.label} join, chat, play Spotlight, approve individual cards and resume`, async ({
    browser,
  }) => {
    test.setTimeout(180000);
    const contexts = await Promise.all(
      setup.widths.map((width) =>
        browser.newContext({ viewport: { width, height: 850 } }),
      ),
    );
    const pages = await Promise.all(
      contexts.map((context) => context.newPage()),
    );
    const errors: string[] = [];
    pages.forEach((page) =>
      page.on("pageerror", (e) => errors.push(e.message)),
    );
    // Three visible browser documents are needed; focus switching must not simulate phone backgrounding.
    for (const page of pages)
      await page.addInitScript(() => {
        Object.defineProperty(document, "hidden", { get: () => false });
        const vibrations: (number | number[])[] = [];
        Object.defineProperty(window, "__vibrations", { value: vibrations });
        Object.defineProperty(navigator, "vibrate", {
          value: (pattern: number | number[]) => {
            vibrations.push(pattern);
            return true;
          },
        });
        const notes: number[] = [];
        Object.defineProperty(window, "__soundNotes", { value: notes });
        const create = AudioContext.prototype.createOscillator;
        AudioContext.prototype.createOscillator = function () {
          const oscillator = create.call(this);
          const start = oscillator.start.bind(oscillator);
          oscillator.start = (when) => {
            notes.push(oscillator.frequency.value);
            start(when);
          };
          return oscillator;
        };
      });
    try {
      await pages[0].goto("/");
      await pages[0]
        .getByRole("button", { name: "Create a room", exact: true })
        .click();
      let dialog = pages[0].getByRole("dialog");
      await expect(dialog.getByLabel("Play with")).toHaveCount(0);
      await expect(dialog.getByLabel(/Playtest access/)).toHaveCount(0);
      await dialog.getByLabel("Your display name").fill("Asha");
      await dialog.getByLabel("Room size").selectOption(String(pages.length));
      await dialog.getByLabel("Content pack").selectOption(setup.pack);
      await dialog
        .getByRole("button", { name: "Create room", exact: true })
        .click();
      await expect(pages[0]).toHaveURL(/\/play$/);
      const code = (await pages[0]
        .locator("main")
        .getByText("ROOM CODE", { exact: true })
        .locator("..")
        .locator("strong")
        .textContent())!;
      await pages[0]
        .getByLabel("Message the squad")
        .fill("The squad is gathering!");
      await pages[0]
        .getByRole("button", { name: "Send message", exact: true })
        .click();
      for (let i = 1; i < pages.length; i++) {
        await pages[i].goto("/");
        await pages[i].getByRole("button", { name: "Join with code" }).click();
        dialog = pages[i].getByRole("dialog");
        await expect(dialog.getByRole("combobox")).toHaveCount(0);
        await expect(dialog.getByLabel(/Playtest access/)).toHaveCount(0);
        await dialog
          .getByLabel("Your display name")
          .fill(i === 1 ? "Bela" : "Chirag");
        await dialog.getByLabel("Room code", { exact: true }).fill(code);
        await dialog
          .getByRole("button", { name: "Join room", exact: true })
          .click();
        await expect(pages[i]).toHaveURL(/\/play$/);
        await expect(pages[i].getByRole("log")).toContainText(
          "The squad is gathering!",
        );
        await expect(
          pages[i].getByRole("button", { name: "Play", exact: true }),
        ).toHaveCount(0);
      }
      await pages[1]
        .getByLabel("Message the squad")
        .fill("Ready for the receipts.");
      await pages[1]
        .getByRole("button", { name: "Send message", exact: true })
        .click();
      await expect(pages[0].getByRole("log")).toContainText(
        "Ready for the receipts.",
      );
      await pages[0].screenshot({
        path: `test-results/lobby-host-${pages.length}.png`,
      });
      await pages[1].screenshot({
        path: `test-results/lobby-guest-${pages.length}.png`,
      });
      await expect(
        pages[0].getByRole("button", { name: "I’m ready", exact: true }),
      ).toBeEnabled();
      await expect(
        pages[0].getByRole("button", { name: "Play", exact: true }),
      ).toBeDisabled();
      await Promise.all(
        pages
          .slice(1)
          .map((page) =>
            page
              .getByRole("button", { name: "I’m ready", exact: true })
              .click(),
          ),
      );
      await expect(
        pages[0].getByRole("button", { name: "I’m ready", exact: true }),
      ).toBeEnabled();
      await expect(
        pages[0].getByRole("button", { name: "Play", exact: true }),
      ).toBeDisabled();
      await pages[0]
        .getByRole("button", { name: "I’m ready", exact: true })
        .click();
      await expect(
        pages[0].getByRole("button", { name: "Play", exact: true }),
      ).toBeEnabled();
      await pages[1]
        .getByRole("button", { name: "Undo ready", exact: true })
        .click();
      await expect(
        pages[0].getByRole("button", { name: "Play", exact: true }),
      ).toBeDisabled();
      await pages[1]
        .getByRole("button", { name: "I’m ready", exact: true })
        .click();
      for (const page of pages)
        await expect
          .poll(() =>
            page.evaluate(() =>
              (
                window as unknown as { __vibrations: (number | number[])[] }
              ).__vibrations.includes(40),
            ),
          )
          .toBe(true);
      // Closing the host exchange must release Play immediately, including on mobile.
      for (const dismiss of ["outside", "escape", "close"] as const) {
        if (!await pages[1].getByRole("button", { name: "Tap to ask" }).count()) break;
        await pages[1].getByRole("button", { name: "Tap to ask" }).click();
        const ask = pages[1].getByRole("dialog", { name: "Ask the host" });
        await expect(ask).toBeVisible();
        await expect(
          pages[0].getByRole("button", { name: "Play", exact: true }),
        ).toBeDisabled();
        if (dismiss === "outside") await pages[1].mouse.click(3, 3);
        else if (dismiss === "escape") await pages[1].keyboard.press("Escape");
        else await ask.getByRole("button", { name: "Close dialog" }).click();
        await expect(ask).toHaveCount(0);
        await expect(
          pages[1].getByRole("button", { name: "Tap to ask" }),
        ).toBeFocused();
        await expect(
          pages[0].getByRole("button", { name: "Play", exact: true }),
        ).toBeEnabled();
      }
      for (const page of pages)
        await page.evaluate(() => {
          (
            window as unknown as { __soundNotes: number[] }
          ).__soundNotes.length = 0;
        });
      await pages[0].getByRole("button", { name: "Play", exact: true }).click();
      await Promise.all(
        pages.map((page) =>
          expect(page.locator("main[data-step]")).toHaveAttribute(
            "data-step",
            "traits",
          ),
        ),
      );
      for (const page of pages) {
        await expect(page.getByRole("slider")).toHaveCount(3);
        await expect
          .poll(() =>
            page.evaluate(() =>
              (
                window as unknown as { __soundNotes: number[] }
              ).__soundNotes.includes(784),
            ),
          )
          .toBe(true);
      }
      let iterations = 0;
      const seen = new Set<string>();
      while (++iterations < 90) {
        const step = await pages[0]
          .locator("main[data-step]")
          .getAttribute("data-step");
        if (step === "card") break;
        seen.add(step!);
        await Promise.all(
          pages.map((page) =>
            expect(page.locator("main[data-step]")).toHaveAttribute(
              "data-step",
              step!,
            ),
          ),
        );
        const pending = await Promise.all(
          pages.map((page) =>
            page.locator("main[data-step]").getAttribute("data-action-pending"),
          ),
        );
        await Promise.all(
          pages.map(async (page, index) => {
            const main = page.locator("main[data-step]");
            if (pending[index] !== "true") return;
            if (step === "traits") {
              await chooseMidpoints(page);
              await page.getByRole("button", { name: /Now rate/ }).click();
              await chooseMidpoints(page);
              await page
                .getByRole("button", { name: "Submit both ratings" })
                .click();
            } else if (step?.startsWith("nominate") || step === "sync") {
              await main.locator("fieldset button").first().click();
              await page.getByRole("button", { name: step === "sync" ? "Lock prediction" : "Lock choice", exact: true }).click();
            } else if (step?.startsWith("judge")) {
              await page
                .getByRole("group", { name: "Anonymous answers" })
                .getByRole("button")
                .filter({ hasText: "Blue" })
                .click();
              await page.getByRole("button", { name: "Lock my pick" }).click();
            } else if (await main.locator("textarea:enabled").count()) {
              await main.locator("textarea:enabled").fill("Blue");
              await page
                .locator('[data-action-dock] button[type="submit"]')
                .click();
            }
          }),
        );
        if (
          pending.every((value) => value !== "true") &&
          (await pages[0]
            .locator("main[data-step]")
            .getAttribute("data-step")) === step
        ) {
          const next = pages[0]
            .locator("[data-action-dock] button:enabled")
            .first();
          if (await next.count())
            await next.click({ timeout: 2000 }).catch(async (error) => {
              // A real server deadline may advance the passive phase during the click.
              if (
                (await pages[0]
                  .locator("main[data-step]")
                  .getAttribute("data-step")) === step
              )
                throw error;
            });
        }
        await expect(pages[0].locator("main[data-step]")).not.toHaveAttribute(
          "data-step",
          step!,
          { timeout: 22000 },
        );
      }
      expect(iterations).toBeLessThan(90);
      expect([...seen].some((s) => s.startsWith("judge"))).toBe(true);
      await expect(
        pages[0].getByRole("button", { name: "Download Friend Card" }),
      ).toHaveCount(0);
      await pages[0].getByRole("button", { name: "Approve my card" }).click();
      await expect(
        pages[0].getByRole("button", { name: "Locked", exact: true }),
      ).toBeVisible();
      await Promise.all(
        pages
          .slice(1)
          .map((page) =>
            page.getByRole("button", { name: "Approve my card" }).click(),
          ),
      );
      for (const page of pages)
        await expect(page.locator("main[data-step]")).toHaveAttribute(
          "data-step",
          "summary",
        );
      const download = pages[0].waitForEvent("download");
      await pages[0]
        .getByRole("button", { name: "Download Friend Card", exact: true })
        .click();
      expect((await download).suggestedFilename()).toMatch(/\.png$/);
      if (process.env.TRAFFIC_CAPTURE) {
        const requests: { path: string; bytes: number }[] = [];
        const meter = async (response: import("@playwright/test").Response) => {
          if (!response.url().includes("/api/v1/")) return;
          const size = await response
            .request()
            .sizes()
            .catch(() => null);
          requests.push({
            path: new URL(response.url()).pathname.replace(
              /[0-9a-f]{8}-[0-9a-f-]{27}/g,
              ":id",
            ),
            bytes: size
              ? size.requestBodySize +
                size.requestHeadersSize +
                size.responseBodySize +
                size.responseHeadersSize
              : 0,
          });
        };
        pages[0].on("response", meter);
        await pages[0].waitForTimeout(11000);
        pages[0].off("response", meter);
        await mkdir("../work-log/verification", { recursive: true });
        await writeFile(
          `../work-log/verification/traffic-${process.env.TRAFFIC_CAPTURE}.json`,
          JSON.stringify(
            {
              capturedAt: new Date().toISOString(),
              scenario:
                "Visible idle summary, one real browser client; HTTP request+response bytes including headers, excludes WebSocket frames and public assets",
              windowMs: 11000,
              requests,
              count: requests.length,
              bytes: requests.reduce((sum, r) => sum + r.bytes, 0),
            },
            null,
            2,
          ),
        );
      }
      await pages[1].reload();
      await pages[1]
        .getByRole("button", { name: "Resume game", exact: true })
        .click();
      await expect(pages[1].locator("main[data-step]")).toHaveAttribute(
        "data-step",
        "summary",
      );
      await pages[1].getByRole("button", { name: "Back to lobby" }).click();
      await expect(pages[1].getByRole("heading", { name: "Squad chat" })).toBeVisible();
      await expect(pages[1].getByRole("button", { name: "Run it back" })).toHaveCount(0);
      await pages[1].getByLabel("Message the squad").fill("Good game, same squad!");
      await pages[1].getByRole("button", { name: "Send message" }).click();
      await pages[0].getByRole("button", { name: "Back to lobby" }).click();
      await expect(pages[0].getByRole("log")).toContainText("Good game, same squad!");
      await pages[0].getByRole("button", { name: "Run it back" }).click();
      await expect(pages[1].locator("main[data-step]")).toHaveAttribute("data-step", "lobby");
      await expect(pages[1].getByRole("log")).toContainText("Good game, same squad!");
      for (const page of pages) {
        const dimensions = await page.evaluate(() => ({
          width: document.documentElement.clientWidth,
          scroll: document.documentElement.scrollWidth,
        }));
        expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.width);
      }
      expect(errors).toEqual([]);
    } finally {
      await Promise.all(contexts.map((context) => context.close()));
    }
  });
