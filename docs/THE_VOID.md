# The Void — Game 2

## Current revision — 9 November 2026, B069

Read [Shared accounts and story graphs](ACCOUNTS_AND_STORY_GRAPHS.md) for current behavior. Google login is required locally; B065's shortcut is disabled. Version-2 conversations use optional follow-ups, up to 30 active minutes, and post-Finish background analysis/graphs. GC2 REST/socket paths are `/api/gc2/v2/*`, shared OAuth is `/api/account/v1/auth/google/callback`, and remembered onboarding replaces repeated checkboxes. Stored version-1 Google-owned sessions retain their old behavior. All B064/B065 text below describes historical implementation, not the new-session flow.

**B066 navigation revision, 7 November:** The Void is now the middle main-navigation item between Play and Profile. Play goes directly to the friends-game entry; saved Friend Cards are inside Profile. The old two-card home described in B064 below is historical. The Void keeps its immersive header, with shared navigation and confirmation before leaving an unfinished conversation.

Implemented on `v2`, 7 November 2026, B064. This is a separate solo experience alongside Spotlight and Bluff. The accepted plan supersedes the working draft's anonymous account and transient-recording assumptions. Live Google sign-in, real-provider speech quality and physical-device acceptance are still open.

**B065 revision, 7 November:** localhost now opens consent and microphone setup without Google sign-in. `GC2_LOCAL_TESTING=true` is the default and only works with a loopback `PUBLIC_ORIGIN`. First entry creates an isolated browser identity; history and deletion remain available. Clearing cookies or leaving the local session loses access to that identity. The configured Gnani and reasoning providers remain live. Public origins retain Google sign-in. This supersedes the Google-first localhost flow described in B064 below.

## Product and interface

The home page offers **Play with friends** and **The Void**. The friends landing is now `/friends`; room invitations, `/play` and `/demo` keep their existing behaviour. `/void` has its own header, microphone controller, immersive canvas and private history. Main feature code is in `backend/gc2` and `frontend/gc2`, with neutral contracts in `shared/src/gc2.ts` and thin framework/server registration points.

The amber eclipse uses Canvas 2D, actual microphone/AI playback amplitude, four narrow gradient strokes and a restrained halo. Listening, speech, thinking, paused and reveal states have distinct motion and visible text. Rendering runs outside React updates, caps pixel density at two, reduces frame rate for small canvases, skips drawing while hidden and respects system/app reduced motion. The warm light theme retains a dark eclipse against parchment.

The flow is Google sign-in → explicit storage agreement → microphone enable or typing → topic and a natural conversation → quote/persona → private history. Navigation remains English; conversation language is English, Hindi or Hinglish. Recognition language is independently English, Hindi or Telugu; Hinglish initially selects Hindi recognition.

During conversation, show the current AI caption, a status and Mute/Skip/Finish. Input and language controls live in settings. A short processed reflection can be corrected; raw transcripts and player audio playback are absent. The reveal contains an AI-written quote inspired by the stories, a tentative title and one or two evidence-backed observations. Feedback and correction remain available. Sharing requires approving the quote/title and preparing a PNG before opening native file sharing; unsupported browsers download it, and cancellation leaves the reveal intact.

## Conversation, evidence and memory

The host aims for four to six meaningful user turns including the topic, with an eight-turn hard ceiling. Once four turns and at least three evidence dimensions exist, the next accepted answer can trigger a reveal; six turns forces wrap. The user can skip or finish sooner. Empty recognition and technical failure do not become evidence.

Question types rotate through story, detail, contrast, a single playful dilemma, lighten and bridge. Short versioned prompts ask for one grounded, natural question, respect refused topics and treat user text as data. Gemini and DeepSeek share the same structured-output contract and schema instructions. There is no automatic switch between paid providers.

Conversation and analysis are separate durable jobs. Analysis extracts a brief reflection and evidence across crisis, awkwardness, rules, planning, battery and headHeart. Each item retains its source turns and distinguishes lived, hypothetical and self-described material. The app does not invent STT confidence or expose psychological certainty. Missing evidence produces a modest closing without a fabricated persona.

The conversation model receives the last two turns, current evidence and at most 12 memories selected from the account's 20 most recent other conversations. Selection combines topic-word overlap and recency. Persona synthesis uses current evidence, including recorded dependencies on remembered material. Corrections preserve original text and replace its interpretation. These are playful reflections, not assessments or diagnoses.

## Voice and recovery

Hands-free starts only after a microphone-enabling action. The existing prepared microphone and pinned Silero v5/ONNX assets are reused through a separate GC2 controller. Local silence never opens a paid STT session. Confirmed speech starts a bounded capture, retains a short pre-roll and sends 1,024-byte PCM16 frames at 32 ms intervals. Both transport buffering and backend provider delivery are bounded and paced. The provider's existing qualified finalisation behaviour is retained.

Each utterance permits 60 seconds; a session permits 480 seconds of captured speech. At the cap, the completed chunk is held privately for Continue or Send. Normal speech-end finalisation automatically submits the turn. Tap-to-talk has explicit start/stop; typing is always available. There is no Game 1 two-attempt rule or two-second review countdown.

Recognition pauses during AI playback and resumes after a 300 ms settling interval. One browser device owns the conversation under a 45-second lease, refreshed every 15 seconds. Claiming it elsewhere revokes the earlier connection. Mute, backgrounding, navigation, logout and loss of ownership stop capture; resuming requires an explicit action. Reconnecting marks the current caption as already handled, preventing automatic audio replay. TTS failure offers captions and explicit continuation.

Provider budgets are independent of Game 1: 12 conversation calls, 12 analysis calls, three reveal calls, 12,000 TTS characters and eight minutes of speech per session. Account creation is capped at 12 sessions per UTC day; deleting history does not reset that counter. Conversation/analysis calls have a five-second deadline; reveal and TTS calls have eight seconds. Accepted operations and jobs are deduplicated. Ambiguous crashed provider work fails for explicit retry instead of being automatically billed again.

## Accounts, storage and deletion

Google authorization-code sign-in uses PKCE, one-use state, nonce verification and Google's Node verification library. Accounts use Google's stable subject identifier. The application cookie is HttpOnly/SameSite=Lax and Secure on HTTPS; sessions expire after 30 days, with Google sign-in restoring the same account. Google access/refresh tokens are not retained. Game 1 guest identities remain separate. OAuth query strings and provider errors are redacted from request logs.

Local testing uses the same owner-checked cookie, with a random `local-test:` subject distinct from Google subjects. `/api/gc2/auth/local` requires the local-testing setting, a loopback public origin, a loopback request hostname and an allowed loopback Origin. Local cookies are rejected when local testing is disabled or the public origin becomes non-loopback. There is no shared test account or client-selected account ID. This identity does not follow the user across devices.

PostgreSQL tables are `gc2_accounts`, `gc2_logins`, `gc2_oauth`, `gc2_sessions`, `gc2_assets` and `gc2_jobs`. Session JSON holds original accepted text, recording references, processed evidence, captions, persona versions, operation identifiers and usage. Private recording/AI audio files live under `GC2_MEDIA_ROOT`, default `.data/gc2`. Only owner-authorized AI audio is served; no public recording URLs exist. No raw text, audio or credentials are written to logs.

Completed speaking turns, transcripts and processed information remain until deletion. Background listening and cancelled partial captures are not archived. Deployment requires private persistent storage; an ephemeral application filesystem cannot fulfil this retention policy. Storage is not end-to-end encryption, and third-party provider retention is separate from application deletion.

Deletion immediately tombstones a conversation, revokes access and excludes its evidence from memory. Dependent interpretations and persona versions in other sessions are invalidated. Durable jobs remove files and database records. Per-account transaction locks and source checks prevent an in-flight generation from restoring deleted evidence. Unreferenced files older than an hour are swept to recover crashes between filesystem and database writes. Delete all pages through all conversations rather than stopping at the history display limit. Basic sign-in identity and non-content usage counters remain for subsequent login and abuse limits.

## API and runtime

GC2 has independent protocol **1** at `/api/gc2/socket`; Game 1 stays on protocol **6**. REST handles sign-in, account availability, session creation/history, owner-only state, feedback and deletion. WebSocket messages handle claim/heartbeat, capture start/end/cancel, typed answer, pending Send, skip/finish/retry and correction. The public projection excludes raw text and recording locations. See generated [GC2 contract](api/gc2.json).

The existing pg-boss process dispatches `gc2-work` from the durable database job table. Provider calls never hold a transaction. Compare-and-set job claims prevent duplicate invocation, generation IDs reject stale work and accepted publication clears active generation ownership atomically. Recovery runs every 30 seconds and marks interrupted paid work for explicit retry. The PWA excludes `/void` and all private API data from offline caching, updates its shell version and defers refresh offers throughout `/void`.

## Setup and acceptance

Run `npm install`, `npm run db:migrate`, `npm run build`, then `npm start`. Open `http://localhost:3000/void`, accept the storage disclosure and choose **Enable microphone**. Google configuration is optional for this localhost test path; configured live providers and usage budgets remain active.

To test Google locally, set `GC2_LOCAL_TESTING=false`. Configure a Google **Web application** OAuth client, enable its consent screen/test users as applicable, and register the exact redirect URI:

```text
http://localhost:3000/api/gc2/auth/google/callback
```

For a public HTTPS origin, register that origin's equivalent callback and set `PUBLIC_ORIGIN`, `ALLOWED_ORIGINS` and secure cookies accordingly. Google values belong only in `backend/.env`: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`. Also set `GC2_MEDIA_ROOT` to private persistent storage. The existing `AI_ENABLED`, configured Gemini/DeepSeek selection and Gnani configuration are reused. Unconfigured authentication/AI has an explicit unavailable state; there is no production authentication bypass.

### Evidence — 7 November 2026

- Final production build, workspace type checks, frontend lint, generated-contract drift and Git whitespace checks passed. Existing test sources are unchanged.
- Inline PostgreSQL diagnostics against `expose_test`, with synthetic accounts and mocked providers, passed four-turn reveal, duplicate accepted answers/jobs, account isolation, capture reservation/refund and concurrency, ownership takeover, returning memory, provider failure/retry, deletion/purge, empty recognition, capped speech requiring Send, raw-recording access rejection, Hindi recording metadata and speech-budget exhaustion. No test files or folders were added.
- Three additional live-socket checks with synthetic providers passed STT startup reservation refund, cancellation during finalisation followed by a new capture, and rejection of a late failure from the cancelled capture. The finalisation diagnostic initially omitted the required protocol field; correcting the diagnostic message produced the passing run.
- Browser checks exercised the desktop landing, typed conversation, reveal, approved PNG download, simulated share cancellation, history reopening and a 390-pixel light/dark layout without horizontal overflow. No page errors were reported in those runs.
- Final production-browser checks passed both home cards, `/friends`, `/void`, 320/390-pixel entry layouts, reduced-motion configuration and keyboard focus, with no page errors. The current local API reports Google sign-in unconfigured and AI/voice configured; configuration is not live-provider acceptance.
- A synthetic Windows speech file passed through the real browser Silero model, actual GC2 socket and mocked STT/LLM/TTS. One observed turn sent 242 frames, first browser transport frame 32 ms after start and median frame spacing 32 ms. Confirmed turn arrived 1,499 ms after capture-end; host caption arrived after 2,722 ms. These are local mocked-provider measurements, not phone, real STT or AI audio latency claims.
- Existing regression suites: frontend 60 passed / 3 failed; backend 25 passed / 37 failed. Known failures are the outdated preference-key expectation and protocol-4 socket fixtures; current Game 1 uses protocol 6. No test fixtures were changed or hidden.
- Still required: real Google consent/callback and cross-device login, live Gemini/DeepSeek/Gnani quality and latency, physical PC/phone microphone/echo/background-noise checks, native mobile sharing, multilingual speech and whether the conversation feels personal. Cohort maps, comparisons and voice chat are not implemented.
