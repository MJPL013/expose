import "./voice-assets.mjs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createProxy } from "./proxy.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const production = process.argv.includes("--production");
const children = [
  spawn(
    process.execPath,
    ["--env-file=.env", "--import", "tsx", "src/main.ts"],
    { cwd: path.join(root, "backend"), stdio: "inherit", windowsHide: true },
  ),
  spawn(
    process.execPath,
    [
      "node_modules/next/dist/bin/next",
      production ? "start" : "dev",
      "--hostname",
      "127.0.0.1",
      "--port",
      "3001",
    ],
    { cwd: path.join(root, "frontend"), stdio: "inherit", windowsHide: true },
  ),
];
const proxy = createProxy();
proxy.listen(3000, "127.0.0.1", () =>
  console.log("Expose: http://localhost:3000 — frontend + API + sockets"),
);
let stopping = false;
function stop() {
  if (stopping) return;
  stopping = true;
  proxy.close();
  children.forEach((child) => child.kill());
}
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
children.forEach((child) =>
  child.once("exit", (code) => {
    if (code && !stopping) {
      console.error(`A service exited (${code}).`);
      stop();
      process.exitCode = code;
    }
  }),
);
