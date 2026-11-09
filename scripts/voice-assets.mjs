import { createRequire } from "node:module";
import { mkdir, copyFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(root, "frontend/package.json"));
const vad = path.dirname(require.resolve("@ricky0123/vad-web"));
const ort = path.dirname(require.resolve("onnxruntime-web/wasm"));
const target = path.join(root, "frontend/public/audio/vad");
await mkdir(target, { recursive: true });
for (const name of ["silero_vad_v5.onnx", "vad.worklet.bundle.min.js"])
  await copyFile(path.join(vad, name), path.join(target, name));
for (const name of [
  "ort-wasm-simd-threaded.wasm",
  "ort-wasm-simd-threaded.mjs",
])
  await copyFile(path.join(ort, name), path.join(target, name));
