import { z } from "zod";
import path from "node:path";
import { gc2Environment } from "../gc2/config";
const schema = z.object({
  ...gc2Environment,
  DATABASE_URL: z
    .string()
    .default("postgres://expose:expose_local_only@127.0.0.1:5433/expose"),
  PORT: z.coerce.number().default(4000),
  PUBLIC_ORIGIN: z.string().url().default("http://localhost:3000"),
  ALLOWED_ORIGINS: z
    .string()
    .default("http://localhost:3000,http://127.0.0.1:3000"),
  COOKIE_SECURE: z.string().default("false"),
  TRUST_PROXY_LOOPBACK: z.enum(["true", "false"]).default("false"),
  MEDIA_ROOT: z.string().default(".data/media"),
  AI_ENABLED: z.string().default("false"),
  AI_STOP_FILE: z.string().default(".data/ai-stopped"),
  GNANI_API_KEY: z.string().default(""),
  GNANI_STT_URL: z.string().default("wss://api.vachana.ai/stt/v3/stream"),
  GNANI_STT_MODEL: z.string().default("prisma-v3.0"),
  GNANI_STT_LANGUAGES: z.string().default("hi-IN"),
  GNANI_TTS_URL: z.string().default("wss://api.vachana.ai/api/v1/tts"),
  GNANI_TTS_MODEL: z.string().default("timbre-v3.0"),
  GNANI_TTS_VOICE: z.string().default("Avinash"),
  HOST_LLM_PROVIDER: z
    .enum(["scripted", "deepseek", "gemini"])
    .default("scripted"),
  HOST_DIRECTOR_ENABLED: z.string().default("true"),
  AI_PROFILE: z.enum(["smoke", "full-match"]).default("smoke"),
  GNANI_STT_COMMIT: z.string().default("false"),
  MAX_TRANSLATION_CALLS: z.coerce.number().positive().default(12),
  DEEPSEEK_API_KEY: z.string().default(""),
  DEEPSEEK_MODEL: z.string().trim().min(1).default("deepseek-flash"),
  GEMINI_API_KEY: z.string().default(""),
  GEMINI_MODEL: z.string().trim().min(1).default("gemini-3.5-flash-lite"),
  GNANI_BATCH_URL: z
    .string()
    .default("https://api.vachana.ai/stt/v3/batch/jobs"),
  MAX_AUDIO_SECONDS: z.coerce.number().positive().default(60),
  MAX_TTS_CHARACTERS: z.coerce.number().positive().default(1000),
  MAX_LLM_CALLS: z.coerce.number().positive().default(4),
  MAX_DIAGNOSTIC_SECONDS: z.coerce.number().positive().default(60),
});
export function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  const c = schema.parse(env);
  return {
    ...c,
    mediaRoot: path.resolve(c.MEDIA_ROOT),
    aiStopFile: path.resolve(c.AI_STOP_FILE),
    allowedOrigins: new Set(c.ALLOWED_ORIGINS.split(",").map((x) => x.trim())),
    secureCookie:
      c.COOKIE_SECURE === "true" || c.PUBLIC_ORIGIN.startsWith("https://"),
    aiEnabled: c.AI_ENABLED === "true",
  };
}
export type Config = ReturnType<typeof loadConfig>;
export function selectedHostLlm(config: Config) {
  switch (config.HOST_LLM_PROVIDER) {
    case "deepseek":
      return {
        provider: "deepseek",
        model: config.DEEPSEEK_MODEL,
        configured: Boolean(config.DEEPSEEK_API_KEY.trim()),
      } as const;
    case "gemini":
      return {
        provider: "gemini",
        model: config.GEMINI_MODEL,
        configured: Boolean(config.GEMINI_API_KEY.trim()),
      } as const;
    default:
      return {
        provider: "scripted",
        model: "scripted",
        configured: false,
      } as const;
  }
}
