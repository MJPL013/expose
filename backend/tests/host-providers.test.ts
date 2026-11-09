import { afterEach, expect, it, vi } from "vitest";
import { loadConfig } from "../src/config";
import { GnaniProviders } from "../src/providers";

afterEach(() => vi.unstubAllGlobals());

it("rejects blank DeepSeek JSON content without falling back to Gemini", async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValue(
      new Response(
        JSON.stringify({ choices: [{ message: { content: "   " } }] }),
        { status: 200 },
      ),
    );
  vi.stubGlobal("fetch", fetchMock);
  const providers = new GnaniProviders(
    loadConfig({
      AI_ENABLED: "true",
      HOST_LLM_PROVIDER: "deepseek",
      DEEPSEEK_API_KEY: "test",
      GEMINI_API_KEY: "unused-test",
    }),
  );
  await expect(
    providers.host(
      "Return JSON",
      "Synthetic context",
      new AbortController().signal,
      { json: true },
    ),
  ).rejects.toMatchObject({ code: "HOST_LLM_PROTOCOL" });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fetchMock.mock.calls[0][0]).toBe(
    "https://api.deepseek.com/chat/completions",
  );
});

it("surfaces a DeepSeek API failure without retrying a paid provider", async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValue(new Response("", { status: 429 }));
  vi.stubGlobal("fetch", fetchMock);
  const providers = new GnaniProviders(
    loadConfig({
      AI_ENABLED: "true",
      HOST_LLM_PROVIDER: "deepseek",
      DEEPSEEK_API_KEY: "test",
      GEMINI_API_KEY: "unused-test",
    }),
  );
  await expect(
    providers.host(
      "Return JSON",
      "Synthetic translation",
      new AbortController().signal,
      { json: true },
    ),
  ).rejects.toMatchObject({ code: "HOST_LLM_FAILED" });
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it("sends a bounded non-streaming DeepSeek request with only its selected key", async () => {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        id: "ds-request",
        model: "deepseek-flash",
        choices: [{ message: { content: "The squad chose chaos." } }],
        usage: { prompt_tokens: 24, completion_tokens: 9 },
      }),
      { status: 200 },
    ),
  );
  vi.stubGlobal("fetch", fetchMock);
  const providers = new GnaniProviders(
    loadConfig({
      AI_ENABLED: "true",
      HOST_LLM_PROVIDER: "deepseek",
      DEEPSEEK_API_KEY: "deepseek-test-key",
      GEMINI_API_KEY: "gemini-test-key",
    }),
  );
  const result = await providers.host(
    "Public scores only",
    "What happened?",
    new AbortController().signal,
  );
  const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
  expect(url).toBe("https://api.deepseek.com/chat/completions");
  expect(init.headers).toMatchObject({
    Authorization: "Bearer deepseek-test-key",
  });
  expect(JSON.stringify(init)).not.toContain("gemini-test-key");
  expect(JSON.parse(init.body as string)).toMatchObject({
    model: "deepseek-flash",
    stream: false,
    thinking: { type: "disabled" },
    messages: [
      { role: "system", content: "Public scores only" },
      { role: "user", content: "What happened?" },
    ],
  });
  expect(result).toMatchObject({
    text: "The squad chose chaos.",
    model: "deepseek-flash",
    inputTokens: 24,
    outputTokens: 9,
    requestId: "ds-request",
  });
});

it("sends Gemini a server-side system instruction and records returned token usage", async () => {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        modelVersion: "gemini-3.5-flash-lite",
        candidates: [
          {
            content: {
              parts: [
                { text: "Secret thought", thought: true },
                { text: "Your votes have range." },
              ],
            },
          },
        ],
        usageMetadata: {
          promptTokenCount: 31,
          candidatesTokenCount: 8,
          thoughtsTokenCount: 3,
        },
      }),
      { status: 200, headers: { "x-request-id": "gemini-request" } },
    ),
  );
  vi.stubGlobal("fetch", fetchMock);
  const providers = new GnaniProviders(
    loadConfig({
      AI_ENABLED: "true",
      HOST_LLM_PROVIDER: "gemini",
      GEMINI_API_KEY: "gemini-test-key",
      DEEPSEEK_API_KEY: "deepseek-test-key",
    }),
  );
  const result = await providers.host(
    "Public scores only",
    "What happened?",
    new AbortController().signal,
  );
  const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
  expect(url).toBe(
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent",
  );
  expect(init.headers).toMatchObject({ "x-goog-api-key": "gemini-test-key" });
  expect(JSON.stringify(init)).not.toContain("deepseek-test-key");
  expect(JSON.parse(init.body as string)).toMatchObject({
    systemInstruction: { parts: [{ text: "Public scores only" }] },
    contents: [{ role: "user", parts: [{ text: "What happened?" }] }],
  });
  expect(result).toMatchObject({
    text: "Your votes have range.",
    model: "gemini-3.5-flash-lite",
    inputTokens: 31,
    outputTokens: 11,
    requestId: "gemini-request",
  });
});

it("does not contact a model when the selected provider has no key", async () => {
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  const providers = new GnaniProviders(
    loadConfig({
      AI_ENABLED: "true",
      HOST_LLM_PROVIDER: "gemini",
      DEEPSEEK_API_KEY: "other-key",
    }),
  );
  await expect(
    providers.host("context", "question", new AbortController().signal),
  ).rejects.toMatchObject({ code: "HOST_LLM_UNCONFIGURED" });
  expect(fetchMock).not.toHaveBeenCalled();
});

it("rejects a Gemini response without visible text instead of publishing thoughts", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [
            { content: { parts: [{ text: "hidden", thought: true }] } },
          ],
        }),
        { status: 200 },
      ),
    ),
  );
  const providers = new GnaniProviders(
    loadConfig({
      AI_ENABLED: "true",
      HOST_LLM_PROVIDER: "gemini",
      GEMINI_API_KEY: "test-key",
    }),
  );
  await expect(
    providers.host("context", "question", new AbortController().signal),
  ).rejects.toMatchObject({ code: "HOST_LLM_PROTOCOL" });
});

it.each(["gemini", "deepseek"] as const)(
  "uses %s JSON facilities for the same validated host contract",
  async (provider) => {
    const text = JSON.stringify({
      decision: "wait",
      text: "",
      evidenceIds: [],
      inviteSeat: null,
      memory: null,
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify(
            provider === "gemini"
              ? { candidates: [{ content: { parts: [{ text }] } }] }
              : { choices: [{ message: { content: text } }] },
          ),
          { status: 200 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    const providers = new GnaniProviders(
      loadConfig({
        AI_ENABLED: "true",
        HOST_LLM_PROVIDER: provider,
        GEMINI_API_KEY: "test",
        DEEPSEEK_API_KEY: "test",
      }),
    );
    const schema = {
      type: "object",
      properties: { decision: { type: "string" } },
    };
    expect(
      (
        await providers.host(
          "Return JSON",
          "context",
          new AbortController().signal,
          { json: true, schema },
        )
      ).text,
    ).toBe(text);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    if (provider === "gemini")
      expect(body.generationConfig).toMatchObject({
        responseMimeType: "application/json",
        responseJsonSchema: schema,
        thinkingConfig: { thinkingLevel: "MINIMAL" },
      });
    else
      expect(body).toMatchObject({
        response_format: { type: "json_object" },
        thinking: { type: "disabled" },
      });
  },
);
