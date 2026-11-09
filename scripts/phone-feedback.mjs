import { chromium } from "../frontend/node_modules/playwright/index.mjs";
import { writeFile, mkdir } from "node:fs/promises";
const browser = await chromium.connectOverCDP("http://127.0.0.1:9223");
const context = browser.contexts()[0];
// Open only the app under test; do not inspect other tabs or phone content.
const page =
  context.pages().find((p) => p.url() === "http://localhost:3000/settings") ??
  (await context.newPage());
await page.goto("http://localhost:3000/settings");
await page.bringToFront();
await page
  .getByRole("button", { name: "Test vibration", exact: true })
  .waitFor();
await page
  .waitForFunction(
    () =>
      [...document.querySelectorAll("button")].some(
        (button) =>
          button.textContent.trim() === "Test vibration" && !button.disabled,
      ),
    { timeout: 5000 },
  )
  .catch(() => {});
const report = await page.evaluate(() => ({
  url: location.href,
  secureContext: isSecureContext,
  vibrationApi: typeof navigator.vibrate === "function",
  userAgent: navigator.userAgent,
  viewport: { width: innerWidth, height: innerHeight },
  visibility: document.visibilityState,
}));
const button = page.getByRole("button", {
  name: "Test vibration",
  exact: true,
});
report.enabled = await button.isEnabled();
if (report.enabled) {
  await button.click();
  report.notice = await page.getByRole("status").allTextContents();
}
await mkdir(new URL("../work-log/verification/", import.meta.url), {
  recursive: true,
});
if (report.viewport.width > 0)
  await page
    .screenshot({
      path: new URL(
        "../work-log/verification/android-feedback.png",
        import.meta.url,
      ).pathname.slice(1),
    })
    .catch(() => {});
await writeFile(
  new URL(
    "../work-log/verification/2026-10-31-android-feedback.json",
    import.meta.url,
  ),
  JSON.stringify({ ...report, physicalMotorConfirmed: false }, null, 2),
);
console.log(JSON.stringify(report, null, 2));
process.exit(0);
