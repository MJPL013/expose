import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import net from "node:net";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const executable = path.join(
  root,
  ".tools",
  process.platform === "win32" ? "cloudflared.exe" : "cloudflared",
);
if (!existsSync(executable))
  throw new Error(
    "Download the official cloudflared binary to .tools first. See docs/SETUP.md.",
  );
if (!existsSync(path.join(root, "frontend/.next/BUILD_ID")))
  throw new Error("Run npm run build before the phone playtest.");
await new Promise((resolve, reject) => {
  const check = net.createServer();
  check.once("error", () =>
    reject(
      new Error(
        "Stop the existing server on port 3000 before starting the playtest.",
      ),
    ),
  );
  check.listen(3000, "127.0.0.1", () => check.close(resolve));
});
const tunnel = spawn(
  executable,
  ["tunnel", "--no-autoupdate", "--url", "http://127.0.0.1:3000"],
  { cwd: root, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
);
let app,
  started = false,
  stopped = false,
  buffer = "";
const timeout = setTimeout(() => {
  console.error(
    "Tunnel did not become ready. Check network access, then retry.",
  );
  stop();
  process.exitCode = 1;
}, 60000);
function stop() {
  if (stopped) return;
  stopped = true;
  clearTimeout(timeout);
  app?.kill();
  tunnel.kill();
}
async function output(chunk) {
  buffer = (buffer + chunk.toString()).slice(-16000);
  const origin = buffer.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/)?.[0];
  if (!origin || started) return;
  started = true;
  clearTimeout(timeout);
  const voice = process.argv.includes("--voice");
  const profile = process.argv.includes("--full-match") ? "full-match" : "smoke";
  app = spawn(process.execPath, ["scripts/dev.mjs", "--production"], {
    cwd: root,
    windowsHide: true,
    stdio: "inherit",
    env: {
      ...process.env,
      PUBLIC_ORIGIN: origin,
      ALLOWED_ORIGINS: `${origin},http://localhost:3000,http://127.0.0.1:3000`,
      COOKIE_SECURE: "true",
      AI_ENABLED: voice ? "true" : "false",
      AI_PROFILE: profile,
    },
  });
  app.once("exit", (code) => {
    process.exitCode = code ?? 0;
    stop();
  });
  await mkdir(path.join(root, ".data"), { recursive: true });
  await writeFile(
    path.join(root, ".data/playtest.json"),
    JSON.stringify(
      { origin, voice, profile, createdAt: new Date().toISOString() },
      null,
      2,
    ),
  );
  console.log(
    `Playtest: ${origin}\nCreate a room to get its shareable code.\nLive voice: ${voice ? "enabled with configured per-match caps" : "off (typing + scripted captions)"}\nThe URL lasts while this process runs. Changing it creates a new browser identity.`,
  );
}
tunnel.stdout.on(
  "data",
  (chunk) =>
    void output(chunk).catch((error) => {
      console.error(error.message);
      stop();
    }),
);
tunnel.stderr.on(
  "data",
  (chunk) =>
    void output(chunk).catch((error) => {
      console.error(error.message);
      stop();
    }),
);
tunnel.once("error", (error) => {
  console.error(error.message);
  stop();
  process.exitCode = 1;
});
tunnel.once("exit", (code) => {
  if (!stopped) {
    console.error(`Tunnel exited (${code}).`);
    stop();
    process.exitCode = code ?? 1;
  }
});
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
