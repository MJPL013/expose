import { z } from "zod";
import {
  GC2_PROTOCOL,
  VOID_LIMITS,
  VoidMessage,
  VoidLanguage,
} from "@expose/shared/gc2";
export const voidContract = {
  protocol: GC2_PROTOCOL,
  authentication: {
    cookie: "expose_account",
    guestCookie: "expose_void_guest",
    guestLifetimeDays: 180,
    independentOfGame1:
      "Guest Void profiles are separate; Google identity is shared.",
    socketOriginRequired: true,
    localTesting:
      "Legacy bypass disabled. Explicit browser-owned guests are enabled by GC2_GUEST_ENABLED; old local-test records remain unclaimed.",
  },
  routes: {
    "GET /api/gc2/v2/me":
      "VoidIdentityView: Google or guest identity kind, guestAvailable, provider/configuration availability; never credentials",

    "POST /api/gc2/v2/auth/guest":
      "Create/reuse browser guest after {version:1,accepted:true}; HttpOnly SameSite cookie, origin-checked, 12 requests/IP/hour; no Google or administrator privileges",
    "POST /api/gc2/v2/auth/guest/logout":
      "Revoke this browser's guest login, clear its cookie and close its Void sockets; stored data is not deleted",
    "POST /api/gc2/v2/onboarding":
      "Accept versioned retention disclosure for the current Google or guest Void identity",

    "GET /api/account/v1/auth/google":
      "Start Google authorization-code flow with PKCE/state/nonce",
    "GET /api/account/v1/auth/google/callback":
      "Consume login attempt and issue application session",
    "POST /api/account/v1/auth/logout":
      "Revoke current login and close active connections",
    "POST /api/gc2/v2/sessions": z.toJSONSchema(
      z.object({ language: VoidLanguage, storageConsent: z.literal(true) }),
    ),
    "GET /api/gc2/v2/graph":
      "Owner-only personal story graph with evidence references",
    "GET /api/gc2/v2/admin/graph":
      "Admin-only approved summaries; provenance synthetic by default, real or all explicitly",
    "GET /api/gc2/v2/comparisons": "Own current comparison-summary revisions",
    "PUT /api/gc2/v2/comparisons/:id":
      "Ownership/revision-checked edit and explicit approval or withdrawal",
    "POST /api/gc2/v2/sessions/:id/retry-analysis":
      "Explicit bounded retry of failed background analysis",
    "POST /api/gc2/v2/sessions/:id/retry-graph":
      "Explicit bounded retry of failed connection processing",
    "POST /api/gc2/v2/sessions/:id/correction":
      "Add a clarification, invalidate dependent graphs/approvals, reanalyse",
    "GET /api/gc2/v2/history":
      "Up to 100 recent conversations with date/status/persona, no raw content",
    "GET /api/gc2/v2/sessions/:id": "Owner-only projected state",
    "DELETE /api/gc2/v2/sessions/:id":
      "Immediately exclude conversation/memories, queue private media purge",
    "DELETE /api/gc2/v2/data":
      "Delete every conversation, paging beyond the history display limit",
    "POST /api/gc2/v2/sessions/:id/feedback": z.toJSONSchema(
      z.object({ feedback: z.enum(["spot-on", "mostly", "not-me"]) }),
    ),
    "GET /api/gc2/v2/sessions/:id/audio/:assetId":
      "Owner-only AI audio; player recordings cannot be fetched here",
  },
  socket: {
    path: "/api/gc2/v2/socket",
    client: z.toJSONSchema(VoidMessage),
    serverEvents: [
      "state",
      "capture.accepted",
      "capture.ready",
      "capture.cap",
      "error",
      "ownership.lost",
      "heartbeat",
    ],
    binary: {
      encoding: "PCM16LE",
      sampleRate: 16000,
      channels: 1,
      frameBytes: 1024,
      cadenceMs: 32,
      bufferSeconds: 2,
    },
    state:
      "VoidView in shared/src/gc2.ts: caption/audio metadata, reflection, persona, status, revision and remaining allowance. No raw transcript or recording URL.",
  },
  limits: {
    ...VOID_LIMITS,
    sessionsPerAccountPerUtcDay: 3,
    leaseSeconds: 45,
    llmDeadlineMs: 5000,
    legacyRevealDeadlineMs: 8000,
    analysisDeadlineMs: 120000,
    activeSeconds: 1800,
    graphAttempts: 8,
    ttsDeadlineMs: 8000,
  },
};
