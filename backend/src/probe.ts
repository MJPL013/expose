import { mkdir, writeFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { loadConfig, selectedHostLlm } from "./config";
import { createDatabase } from "./db/client";
import { Rooms } from "./rooms";
import { UsageLedger } from "./usage";
import { GnaniProviders } from "./providers";
import { AppError } from "./errors";

const config = loadConfig({ ...process.env, AI_ENABLED: "true" }),
  { db, pool } = createDatabase(config.DATABASE_URL),
  rooms = new Rooms(db),
  usage = new UsageLedger(db, config),
  provider = new GnaniProviders(config);
const results: Record<string, unknown> = {
  date: new Date().toISOString(),
  scope:
    "Endpoint/configuration probe, synthetic silence; not speech accuracy or physical phone verification",
  hostLlm: { ...selectedHostLlm(config), liveVerified: false },
};
try {
  const guest = await rooms.guest({
    name: "Provider probe",
    avatar: 0,
    color: "#ffb020",
  });
  const room = await rooms.create(guest.playerId, {
    name: "Provider probe",
    spice: "mild",
    mode: "remote",
    adult: false,
    seatCount: 3,
    gameMode: "spotlight",
  });
  for (const task of (process.argv.includes("--stt-only")
    ? ["stt"]
    : ["stt", "tts"]) as ("stt" | "tts")[]) {
    const operation = await usage.reserve(
      room.runId,
      "probe",
      0,
      `probe-${task}`,
      `probe-${task}`,
      task === "stt" ? { sttSeconds: 3 } : { ttsCharacters: 7 },
    );
    const finish = await usage.begin(
      operation,
      "gnani",
      task === "stt" ? config.GNANI_STT_MODEL : config.GNANI_TTS_MODEL,
    );
    try {
      if (task === "stt") {
        const stream = provider.stt([], () => {});
        try {
          await stream.ready;
          for (let i = 0; i < 32; i++) {
            stream.push(Buffer.alloc(1024));
            await delay(32);
          }
          const result = await stream.finish();
          results.stt = {
            status: "connected",
            requestedModel: config.GNANI_STT_MODEL,
            effectiveModel: stream.configuration?.model ?? null,
            configuration: stream.configuration,
            transmittedSeconds: result.transmittedSeconds,
            speechSeconds: result.speechSeconds,
          };
          await finish({
            status: "completed",
            usage: {
              captureSeconds: 1.024,
              transmittedSeconds: result.transmittedSeconds,
              speechSeconds: result.speechSeconds,
            },
            usageSource: "measured",
            effectiveModel: stream.configuration?.model,
          });
        } finally {
          stream.cancel();
        }
      } else {
        const result = await provider.tts(
          "Namaste",
          AbortSignal.timeout(15000),
        );
        results.tts = {
          status: "generated",
          requestedModel: config.GNANI_TTS_MODEL,
          effectiveModel: result.effectiveModel ?? null,
          voice: config.GNANI_TTS_VOICE,
          audioBytes: result.audio.length,
          seconds: result.seconds,
        };
        await finish({
          status: "completed",
          usage: { ttsCharacters: 7, generatedAudioSeconds: result.seconds },
          usageSource: "measured",
          effectiveModel: result.effectiveModel,
        });
      }
    } catch (error) {
      const code = error instanceof AppError ? error.code : "PROVIDER_ERROR";
      results[task] = {
        status: "failed",
        code,
        reason: error instanceof AppError ? error.providerReason : undefined,
      };
      await finish({
        status: "failed",
        usage: {},
        usageSource: "unknown",
        errorCode: code,
      });
    }
  }
  results.runId = room.runId;
  results.cost = await usage.runReport(room.runId);
  await mkdir("../work-log/verification", { recursive: true });
  await writeFile(
    `../work-log/verification/provider-probe-${room.runId}.json`,
    JSON.stringify(results, null, 2),
  );
  console.log(
    JSON.stringify(
      {
        runId: room.runId,
        stt: results.stt,
        tts: results.tts,
        hostLlm: results.hostLlm,
      },
      null,
      2,
    ),
  );
} finally {
  await pool.end();
}
