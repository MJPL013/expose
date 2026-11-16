import { createHash } from "node:crypto";
import { ProviderAdmission, providerScope } from "./admission";
import type { Database } from "../src/db/client";
import { AppError } from "../src/errors";
import { existsSync } from "node:fs";
import { z } from "zod";
import { ensure } from "../src/errors";
import type { Config } from "../src/config";
import type { Providers } from "../src/providers";
export class VoidAi {
  readonly admission: ProviderAdmission;
  constructor(
    readonly config: Config,
    readonly providers: Providers,
    db: Database,
  ) {
    this.admission = new ProviderAdmission(db, config);
  }
  configured(role: "conversation" | "analysis") {
    const p =
      role === "conversation"
        ? this.config.GC2_CONVERSATION_PROVIDER
        : this.config.GC2_ANALYSIS_PROVIDER;
    return (
      !existsSync(this.config.aiStopFile) &&
      this.config.aiEnabled &&
      !!(p === "gemini"
        ? this.config.GEMINI_API_KEY
        : this.config.DEEPSEEK_API_KEY)
    );
  }
  async generate<S extends z.ZodType>(
    role: "conversation" | "analysis",
    schema: S,
    prompt: string,
    data: unknown,
    analysisKind: "analysis" | "review" = "analysis",
  ): Promise<z.infer<S>> {
    ensure(
      this.configured(role),
      "VOID_AI_UNAVAILABLE",
      `${role === "analysis" ? "Background analysis" : "Conversation"} is not configured.`,
      503,
    );
    const provider =
      role === "conversation"
        ? this.config.GC2_CONVERSATION_PROVIDER
        : this.config.GC2_ANALYSIS_PROVIDER;
    const kind = role === "conversation" ? "live" : analysisKind;
    return this.admission.run(
      kind,
      `${provider}:${kind === "review" ? "analysis" : kind}`,
      "generate",
      role === "conversation" ? 5000 : 120000,
      async (signal) => {
        const result = await this.providers.host(
          `${prompt}\nReturn one DATA OBJECT that validates against the following JSON Schema. Do not return the schema itself, wrap the result, or rename its properties. JSON Schema: ${JSON.stringify(z.toJSONSchema(schema))}`,
          JSON.stringify(data),
          signal,
          {
            json: true,
            schema: z.toJSONSchema(schema),
            provider:
              role === "conversation"
                ? this.config.GC2_CONVERSATION_PROVIDER
                : this.config.GC2_ANALYSIS_PROVIDER,
            model:
              role === "conversation"
                ? this.config.GC2_CONVERSATION_MODEL
                : this.config.GC2_ANALYSIS_MODEL,
            thinking: role === "analysis",
            maxOutputTokens: role === "analysis" ? 16000 : 512,
          },
        );
        try {
          return schema.parse(JSON.parse(result.text));
        } catch {
          throw new AppError(
            "VOID_OUTPUT_INVALID",
            "The response couldn't be validated. Your conversation is saved.",
            502,
          );
        }
      },
    );
  }
  async embed(text: string, recall = false): Promise<number[]> {
    ensure(
      !existsSync(this.config.aiStopFile) &&
        this.config.aiEnabled &&
        this.config.GEMINI_API_KEY,
      "VOID_EMBEDDING_UNAVAILABLE",
      "Story similarity is not configured.",
      503,
    );
    const scope = providerScope.getStore();
    const key = `${recall ? "recall" : "embedding"}:${text}`;
    const cache = scope
      ? (scope.vectors ??= new Map<string, Promise<number[]>>())
      : undefined;
    if (cache?.has(key)) return cache.get(key)!;
    const operation = this.admission.run(
      recall ? "recall" : "embedding",
      "gemini:embedding",
      createHash("sha256").update(text).digest("hex").slice(0, 24),
      15000,
      async (signal) => {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.config.GC2_EMBEDDING_MODEL)}:embedContent`,
          {
            method: "POST",
            signal,
            headers: {
              "Content-Type": "application/json",
              "x-goog-api-key": this.config.GEMINI_API_KEY,
            },
            body: JSON.stringify({
              model: `models/${this.config.GC2_EMBEDDING_MODEL}`,
              content: {
                parts: [
                  {
                    text: `Represent the meaning of this story description for multilingual semantic similarity, not personal identity: ${text}`,
                  },
                ],
              },
              outputDimensionality: 768,
            }),
          },
        );
        if (!response.ok) {
          const error = new AppError(
            "VOID_EMBEDDING_FAILED",
            "Story similarity could not be prepared. Retry later.",
            response.status,
          );
          error.rejected = true;
          const retry = response.headers.get("retry-after");
          error.retryAfterSeconds = retry
            ? Math.max(
                0,
                Number(retry) || (Date.parse(retry) - Date.now()) / 1000 || 0,
              )
            : undefined;
          throw error;
        }
        const body = await response.json();
        const parsed = z
          .array(z.number().finite())
          .length(768)
          .safeParse(body.embedding?.values);
        ensure(
          parsed.success,
          "VOID_OUTPUT_INVALID",
          "Story similarity returned invalid data.",
          502,
        );
        const values = parsed.data;
        const norm = Math.sqrt(values.reduce((sum, v) => sum + v * v, 0));
        ensure(
          norm > 0,
          "VOID_EMBEDDING_EMPTY",
          "Story similarity was empty.",
          502,
        );
        return values.map((v) => v / norm);
      },
    );
    cache?.set(key, operation);
    return operation;
  }
}
