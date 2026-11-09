import {
  AccountPreferencesSchema,
  SavedCardSchema,
} from "@expose/shared/account";
import { writeFile, mkdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { TranslationSchema } from "./translation";
import { voidContract } from "../gc2/contracts";
import {
  GuestSchema,
  RoomSchema,
  ConsentSchema,
  ErrorSchema,
  ClientMessageSchema,
  ServerMessageSchema,
  AudioStartSchema,
  AudioPrepareSchema,
  AudioServerMessageSchema,
  ClipUploadSchema,
  PlaybackSchema,
} from "@expose/shared/network";

const json = (schema: z.ZodType) =>
  z.toJSONSchema(schema, { target: "draft-2020-12" });
const operation = (summary: string, body?: z.ZodType, success = "200") => ({
  summary,
  security: [{ guestCookie: [] }],
  ...(body
    ? {
        requestBody: {
          required: true,
          content: { "application/json": { schema: json(body) } },
        },
      }
    : {}),
  responses: {
    [success]: { description: "Successful response" },
    default: {
      description: "Typed error",
      content: { "application/json": { schema: json(ErrorSchema) } },
    },
  },
});
const paths = {
  "/api/v1/health": {
    get: { ...operation("Service and provider availability"), security: [] },
  },
  "/api/v1/guests": {
    post: {
      ...operation(
        "Create or update this device's guest identity",
        GuestSchema,
      ),
      security: [],
    },
  },
  "/api/v1/rooms": { post: operation("Create a room", RoomSchema, "201") },
  "/api/v1/rooms/{roomId}/translate": {
    post: operation(
      "Prepare a private room-language gameplay answer",
      TranslationSchema,
    ),
  },
  "/api/v1/rooms/{code}": {
    get: {
      ...operation(
        "Read public invitation availability and settings; no roster or answers",
      ),
      security: [],
    },
  },
  "/api/v1/rooms/{code}/join": {
    post: operation(
      "Claim an available seat; inherit host settings",
      z.object({}).strict(),
    ),
  },
  "/api/v1/resume": { get: operation("List this device's resumable rooms") },
  "/api/v1/recovery": {
    get: operation(
      "List valid resumable memberships and definitive removal or expiry notices",
    ),
  },
  ...Object.fromEntries(
    ["resume", "leave", "end"].map((action) => [
      `/api/v1/rooms/{roomId}/${action}`,
      { post: operation(`${action} this room`) },
    ]),
  ),
  "/api/v1/media/{id}": {
    get: operation("Retrieve authorized audio"),
    delete: operation("Delete your recording", undefined, "204"),
  },
  "/api/v1/rooms/{roomId}/media": {
    get: operation("List consented clips after their reveal"),
    post: {
      ...operation("Retired player audio upload", ClipUploadSchema),
      deprecated: true,
      responses: {
        "410": {
          description:
            "PLAYER_AUDIO_DISABLED: new player audio uploads are retired",
        },
      },
    },
  },
  "/api/v1/media/{id}/consent": {
    put: operation("Grant or revoke your clip consent", ConsentSchema),
  },
  "/api/v1/media/{id}/playback": {
    post: operation(
      "Record a bounded, idempotent client playback measurement",
      PlaybackSchema,
    ),
  },
  "/api/v1/cards/{runId}/{seatId}": {
    get: operation("Retrieve an approved card"),
  },
  "/api/v1/webhooks/gnani/batch/{token}": {
    post: {
      ...operation(
        "Queue a batch notification for authenticated reconciliation",
        undefined,
        "202",
      ),
      security: [],
    },
  },
};
for (const [path, item] of Object.entries(paths)) {
  const parameters = [...path.matchAll(/\{([^}]+)\}/g)].map(([, name]) => ({
    name,
    in: "path",
    required: true,
    schema: { type: "string" },
  }));
  if (parameters.length) Object.assign(item, { parameters });
}
const openapi = {
  openapi: "3.1.0",
  info: { title: "Expose private playtest API", version: "6.0.0" },
  servers: [{ url: "/" }],
  paths,
  components: {
    securitySchemes: {
      guestCookie: { type: "apiKey", in: "cookie", name: "expose_guest" },
    },
  },
};
const sockets = {
  protocol_version: 6,
  realtime: {
    path: "/api/v1/realtime",
    client: json(ClientMessageSchema),
    server: json(ServerMessageSchema),
  },
  audio: {
    path: "/api/v1/audio",
    prepare: json(AudioPrepareSchema),
    start: json(AudioStartSchema),
    server: json(AudioServerMessageSchema),
    binary: {
      encoding: "PCM16LE",
      channels: 1,
      sampleRate: 16000,
      frameBytes: 1024,
      cadenceMs: 32,
    },
    control: ["stop", "cancel"],
    events: ["prepared", "ready", "accepted", "segment", "transcript", "error"],
  },
};
const accountContract = {
  protocol: 1,
  cookie: "expose_account",
  guestCookie: "expose_guest",
  googleSubjectIdentity: true,
  localBypass: false,
  routes: {
    "GET /api/account/v1/auth/google":
      "Google sign-in with whitelisted returnTo",
    "GET /api/account/v1/auth/google/callback":
      "Verified code exchange with state/nonce/PKCE",
    "POST /api/account/v1/auth/logout":
      "Revoke session and close owned sockets",
    "GET /api/account/v1/me":
      "Account, configuration, preferences and guest-link state",
    "PUT /api/account/v1/preferences": z.toJSONSchema(
      z.object({ accountId: z.uuid(), preferences: AccountPreferencesSchema }),
    ),
    "POST /api/account/v1/onboarding":
      "Explicit versioned retention acknowledgement",
    "POST /api/account/v1/link-guest":
      "Claim current authenticated guest without conflicting ownership/seats",
    "GET /api/account/v1/rooms": "Eligible linked-player room recovery",
    "POST /api/account/v1/player": "Select an owned linked player for recovery",
    "GET /api/account/v1/matches": "Server-generated result summaries",
    "GET /api/account/v1/cards":
      "Account saved cards with verified-match/local-import provenance",
    "POST /api/account/v1/cards/import": z.toJSONSchema(
      z.object({
        approved: z.literal(true),
        cards: z.array(SavedCardSchema).max(12),
      }),
    ),
    "DELETE /api/account/v1/cards/:id": "Owner-only card removal",
  },
};
const directory = fileURLToPath(new URL("../../docs/api/", import.meta.url));
await mkdir(directory, { recursive: true });
for (const [name, document] of [
  ["openapi.json", openapi],
  ["sockets.json", sockets],
  ["gc2.json", voidContract],
  ["account.json", accountContract],
] as const) {
  const value = JSON.stringify(document, null, 2) + "\n",
    file = `${directory}${name}`;
  if (process.argv.includes("--check")) {
    if ((await readFile(file, "utf8")) !== value)
      throw new Error(`${name} has drifted. Run npm run contracts.`);
  } else await writeFile(file, value);
}
