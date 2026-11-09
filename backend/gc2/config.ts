import { z } from "zod";
export const gc2Environment = {
  GC2_ENABLED: z.string().default("true"),
  GC2_GUEST_ENABLED: z.enum(["true", "false"]).default("true"),
  GC2_LOCAL_TESTING: z.enum(["true", "false"]).default("false"),
  GOOGLE_CLIENT_ID: z.string().default(""),
  GOOGLE_CLIENT_SECRET: z.string().default(""),
  GC2_CONVERSATION_PROVIDER: z.enum(["gemini", "deepseek"]).default("gemini"),
  GC2_CONVERSATION_MODEL: z.string().default("gemini-3.5-flash-lite"),
  GC2_ANALYSIS_PROVIDER: z.enum(["gemini", "deepseek"]).default("deepseek"),
  GC2_ANALYSIS_MODEL: z.string().default("deepseek-v4-pro"),
  GC2_EMBEDDING_MODEL: z.string().default("gemini-embedding-2"),
  GC2_VECTOR_STORE: z.enum(["array", "pgvector"]).default("array"),
  GC2_ACTIVE_SECONDS: z.coerce.number().int().min(60).max(3600).default(1800),
  GC2_SPEECH_SECONDS: z.coerce.number().int().min(60).max(3600).default(1200),
  GC2_HOST_CALLS: z.coerce.number().int().min(1).max(160).default(80),
  GC2_TTS_CHARACTERS: z.coerce
    .number()
    .int()
    .positive()
    .max(120000)
    .default(60000),
  GC2_DAILY_SESSIONS: z.coerce.number().int().min(1).max(12).default(3),
  GC2_MEDIA_ROOT: z.string().default(".data/gc2"),
};
