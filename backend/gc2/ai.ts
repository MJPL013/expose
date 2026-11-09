import { existsSync } from "node:fs";
import { z } from "zod";
import { ensure } from "../src/errors";
import type { Config } from "../src/config";
import type { Providers } from "../src/providers";
export class VoidAi {
  constructor(
    readonly config: Config,
    readonly providers: Providers,
  ) {}
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
  ): Promise<z.infer<S>> {
    ensure(
      this.configured(role),
      "VOID_AI_UNAVAILABLE",
      `${role === "analysis" ? "Background analysis" : "Conversation"} is not configured.`,
      503,
    );
    const controller = new AbortController(),
      timer = setTimeout(
        () => controller.abort(),
        role === "conversation" ? 5000 : 120000,
      );
    try {
      const call = this.providers.host(
        `${prompt}\nReturn one DATA OBJECT that validates against the following JSON Schema. Do not return the schema itself, wrap the result, or rename its properties. JSON Schema: ${JSON.stringify(z.toJSONSchema(schema))}`,
        JSON.stringify(data),
        controller.signal,
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
      const result = await Promise.race([
        call,
        new Promise<never>((_, reject) =>
          controller.signal.addEventListener(
            "abort",
            () => reject(new Error("Provider deadline")),
            { once: true },
          ),
        ),
      ]);
      return schema.parse(JSON.parse(result.text));
    } finally {
      clearTimeout(timer);
      controller.abort();
    }
  }
  async embed(text: string): Promise<number[]> {
    ensure(
      !existsSync(this.config.aiStopFile) &&
        this.config.aiEnabled &&
        this.config.GEMINI_API_KEY,
      "VOID_EMBEDDING_UNAVAILABLE",
      "Story similarity is not configured.",
      503,
    );
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.config.GC2_EMBEDDING_MODEL)}:embedContent`,
      {
        method: "POST",
        signal: AbortSignal.timeout(15000),
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
    ensure(
      response.ok,
      "VOID_EMBEDDING_FAILED",
      "Story similarity could not be prepared. Retry later.",
      502,
    );
    const body = await response.json();
    const values = z
      .array(z.number().finite())
      .length(768)
      .parse(body.embedding?.values);
    const norm = Math.sqrt(values.reduce((sum, v) => sum + v * v, 0));
    ensure(
      norm > 0,
      "VOID_EMBEDDING_EMPTY",
      "Story similarity was empty.",
      502,
    );
    return values.map((v) => v / norm);
  }
}
