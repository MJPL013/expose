import { writeFile, mkdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { TranslationSchema } from "./translation";
import {
  GuestSchema,
  RoomSchema,
  ConsentSchema,
  ErrorSchema,
  ClientMessageSchema,
  ServerMessageSchema,
  AudioStartSchema,
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
    post: operation(
      "Share your accepted answer clip with explicit consent",
      ClipUploadSchema,
    ),
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
  info: { title: "Expose private playtest API", version: "5.0.0" },
  servers: [{ url: "/" }],
  paths,
  components: {
    securitySchemes: {
      guestCookie: { type: "apiKey", in: "cookie", name: "expose_guest" },
    },
  },
};
const sockets = {
  protocol_version: 5,
  realtime: {
    path: "/api/v1/realtime",
    client: json(ClientMessageSchema),
    server: json(ServerMessageSchema),
  },
  audio: {
    path: "/api/v1/audio",
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
    events: ["ready", "segment", "transcript", "error"],
  },
};
const directory = fileURLToPath(new URL("../../docs/api/", import.meta.url));
await mkdir(directory, { recursive: true });
for (const [name, document] of [
  ["openapi.json", openapi],
  ["sockets.json", sockets],
] as const) {
  const value = JSON.stringify(document, null, 2) + "\n",
    file = `${directory}${name}`;
  if (process.argv.includes("--check")) {
    if ((await readFile(file, "utf8")) !== value)
      throw new Error(`${name} has drifted. Run npm run contracts.`);
  } else await writeFile(file, value);
}
