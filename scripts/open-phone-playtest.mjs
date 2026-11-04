import { chromium } from "../frontend/node_modules/playwright/index.mjs";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const { origin } = JSON.parse(
  await readFile(new URL("../.data/playtest.json", import.meta.url), "utf8"),
);
const previous = await readFile(
  new URL("../.data/current-room.json", import.meta.url),
  "utf8",
)
  .then(JSON.parse)
  .catch(() => null);
const pc = await chromium.launchPersistentContext(
  fileURLToPath(new URL("../.data/pc-playtest", import.meta.url)),
  {
    channel: "chrome",
    headless: false,
    viewport: { width: 1280, height: 900 },
  },
);
const desktop = pc.pages()[0] ?? (await pc.newPage());
await desktop.goto(origin);
await desktop
  .getByRole("button", { name: "Create a room", exact: true })
  .click();
const create = desktop.getByRole("dialog");
await create.getByLabel("Your display name").fill("PC Player");
await create.getByLabel("Room size").selectOption("2");
await create.getByLabel("Content pack").selectOption("goa-trip");
await create.getByRole("button", { name: "Create room", exact: true }).click();
await desktop.waitForURL("**/play");
const code = (
  await desktop
    .getByText("ROOM CODE", { exact: true })
    .locator("..")
    .locator("strong")
    .textContent()
).trim();

const device = await chromium.connectOverCDP("http://127.0.0.1:9223");
const context = device.contexts()[0];
const phone =
  context
    .pages()
    .find(
      (page) =>
        page.url().startsWith("http://localhost:3000/") ||
        (previous?.origin && page.url().startsWith(`${previous.origin}/`)),
    ) ?? (await context.newPage());
await phone.goto(origin);
await phone.bringToFront();
await phone
  .getByRole("button", { name: "Join with code", exact: true })
  .click();
const join = phone.getByRole("dialog");
await join.getByLabel("Your display name").fill("Phone Player");
await join.getByLabel("Room code", { exact: true }).fill(code);
await join.getByRole("button", { name: "Join room", exact: true }).click();
await phone.waitForURL("**/play");
await desktop.getByText("Phone Player", { exact: true }).waitFor();
await desktop
  .getByLabel("Message the squad")
  .fill("Welcome to the case. Ready when you are!");
await desktop
  .getByRole("button", { name: "Send message", exact: true })
  .click();
await phone
  .getByRole("log")
  .getByText("Welcome to the case. Ready when you are!", { exact: true })
  .waitFor();
await desktop.getByRole("button", { name: "Play", exact: true }).waitFor();
await phone
  .screenshot({
    path: fileURLToPath(
      new URL(
        "../work-log/verification/android-lobby-controls.png",
        import.meta.url,
      ),
    ),
  })
  .catch(() => {});
await desktop.screenshot({
  path: fileURLToPath(
    new URL("../work-log/verification/pc-lobby-controls.png", import.meta.url),
  ),
});
const result = {
  origin,
  code,
  pack: "goa-trip",
  seats: 2,
  physicalAndroidJoined: true,
  chatDelivered: true,
  pcReady: false,
  matchStarted: false,
};
await writeFile(
  new URL("../.data/current-room.json", import.meta.url),
  JSON.stringify(result, null, 2),
);
console.log(JSON.stringify(result, null, 2));
console.log(
  "Both players are in the lobby. Tap I’m ready on each device, then Play on the PC. Leave this window open during the test.",
);
await new Promise((resolve) => pc.on("close", resolve));
process.exit(0);
