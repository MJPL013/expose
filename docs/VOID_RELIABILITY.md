# The Void: reliable voice and story matching

15 November 2026 — B077, revising B069/B071. Implemented on `v2`; not yet deployed. Guest access and optional Google login are unchanged.

## Conversation and voice

The entry/resume gesture prepares the microphone and warms the local Silero v5 model without opening Gnani STT. “Listening” requires a running audio context, recent PCM frames and an active detector. A 20-second detector deadline offers tap-to-speak or typing. Worklet loading and audio-context resumption also have eight/three-second deadlines. Track interruption/context suspension stops capture and asks for an explicit resume. Recognition pauses during AI audio and rearms after 300 ms.

The compact states are Getting ready, Listening, Hearing you, Transcribing, Replying and AI speaking. Private segment receipts and the latest accepted text support the optional “What I heard” detail. This is transcript review, never recording playback. Capture, accepted turn and reply share a logical operation ID; each paid attempt has a distinct durable identity. Transcript acceptance and reply enqueue happen in one transaction.

STT remains scoped to speech, using the two-second buffer and paced 1,024-byte/32-ms frames. Keep the 60-second cap with Continue/Send, 20-minute wrap suggestion and 30-minute active-session ceiling. Capture cancellation, backgrounding and ownership loss release the microphone. Empty recognition is a technical outcome, not a meaningful answer. Browser fetch/decode/playback and pending-audio waits have deadlines; missing TTS leaves a caption and continuation control. Completed answers survive LLM failure and retry.

## Interpretation and graph

Fast conversation uses the short companion prompt in `backend/gc2/story-prompts.ts`; no persona extraction is scheduled per answer. Finish queues deeper transcript analysis. Raw recordings remain private files under `GC2_MEDIA_ROOT`; PostgreSQL holds transcripts, analysis JSON, metadata and graph records. The analysis model receives text, not raw audio.

Analysis schema 2 adds nullable, evidence-linked situation, trigger, tags, goal, constraints, options, action, reasoning, reaction, emotions, outcome, reflection and alternative. Each field cites user turns and distinguishes lived, hypothetical, self-described and inferred material. Assistant suggestions are context, not user evidence. Earlier analysis records are retained as superseded versions.

Embedding text version 2 separately represents the experience and the user's response. Model, dimensions (768) and construction version must match for retrieval. Legacy version-1 vectors remain separate. Candidate identity includes its comparison view; review receives up to eight response and four experience pairs, filtered by `GC2_SIMILARITY_THRESHOLD` (0.72 by default). Private review includes owner evidence. Cross-person review includes only approved descriptions and metadata.

Returning-memory retrieval is asynchronous after turns 1, 4, 7 and so on. It caches up to 12 node IDs, reads their current owner-visible records before each reply and never blocks the live model on an embedding request. Until recall is ready, recent completed stories provide bounded context. Removed/corrected nodes cannot survive through cached text because the cache stores IDs, not copied stories.

The administrator explorer at `/void/explorer` defaults to response patterns. It shows metadata, provenance and relationship explanations, plus person pairs ordered by independent response connections (capped at three corroborating story pairs), response similarity and then shared experiences. These are exploratory signals, not friendship probabilities. A person can appear in several story groups. Fictional and real nodes never match across provenance.

Owners review/edit/remove metadata before approving the exact summary revision. Withdrawal, correction and deletion remove comparison eligibility and dependent nodes immediately. The explorer remains administrator-only; guests cannot grant themselves that role.

## Provider controls

PostgreSQL admission records survive reconnects and restarts. One account may hold one STT lease and one live-generation lease. Defaults are 12 capture starts and 12 live calls/account/minute; server concurrency is STT 4, live model 4, TTS 4, analysis/review 1 and embedding/recall 2. Guest creation also has a persisted, hashed-IP 12/hour counter; socket controls have a persisted 120/account/minute counter.

Existing session limits remain. Additional per-session request ceilings are 160 STT starts, configured live-call allowance, 160 TTS requests, 3 analyses, 8 relationship reviews, 160 embedding requests and 28 recall requests. Repeated identical embedding inputs within one job reuse a result. Separate live/background/recall queue selections prevent a background backlog from hiding live work.

An explicit HTTP 429/503 rejection may retry once within the original deadline, respecting Retry-After. Ambiguous network failures/timeouts do not automatically repeat paid requests. Explicit retries reference their failed job and retain the accepted answer. Three transient failures open that provider capability's circuit for 30 seconds; recovery allows one probe. Expired leases become unknown outcomes. No paid-provider fallback occurs.

Model data stays separate from trusted prompts. Strict structured outputs, source-ID checks, permitted pair/view checks, ownership checks and server-controlled actions constrain results. Models have no tools or authority to grant access or approve comparisons. This reduces prompt-injection risk; it is not an immunity guarantee. Operational logs store identifiers, stage/error codes and timings, not prompts, transcripts or audio.

## Upgrade and verification

Run the normal migrations and build before releasing frontend/backend together. Migrations `0012_void_reliability` and `0013_void_ingress` add admission tables, metadata/version columns and retry links without resetting existing data. They have been applied to the local application and dedicated test databases. GC2 WebSocket protocol 3 uses `/api/gc2/v3/socket`; REST resources remain `/api/gc2/v2`. The old socket endpoint directs clients to refresh. Game 1 stays on protocol 6. PWA shell version 19 excludes private API data.

Reprocessing is explicitly invoked, may use paid providers, and withdraws old comparison approval:

```powershell
npm run void:operator -w backend -- reprocess SESSION_ID
```

There is no automatic paid backfill or synthetic reseeding. Follow the existing [deployment runbook](AWS_DEMO_DEPLOYMENT.md) when promoting the verified source.

Evidence on 15 November:

- Production build, TypeScript, lint and generated contracts passed; no new test files or folders were added.

- 43 existing game, competitive, multilingual and PCM checks passed.
- Existing backend checks: 20 passed; the previously documented optional-reply timing failure remains at `interactive-host.test.ts:238`.
- 47 inline PostgreSQL checks passed with mocked host, TTS and embeddings, using the six authored fictional conversations. Includes atomic acceptance, duplicates, cap/empty recognition, grounding rejection, linked retries, capacity/rate/circuit controls, queue fairness, approval withdrawal and deletion.
- 18 real HTTP/WebSocket/database checks passed with simulated PCM and mocked providers: three turns, language forwarding, private receipts, duplicate job dispatch, takeover and guest admin denial.
- 19 desktop Edge controller checks passed with a fake microphone, real local VAD/playback and mocked transport, including three turns, suspension, pending/failed audio, ownership loss and cancellation. Synthetic speech boundaries were triggered deliberately. Latest cold readiness was 4.366 seconds; prepared capture startup was 0.1 ms in this simulation. The probe injects the new local controller against reachable public assets; it does not deploy the new application. A stalled audio-context resume was also forced and reached its recovery deadline. Mock STT/model timings are not provider latency measurements.

- 28 production-UI browser checks passed at 390×844 and 1440×900 with mocked identity/socket/graph responses: text submission after caption fallback, private transcript detail, keyboard dismissal, light/dark surfaces, reduced-motion configuration, enlarged explorer text and evidence details.
- One concurrent-build simulation failed a minimum-frame-count assertion. Subsequent isolated runs passed; the cause is not established. This is not physical-device or latency-under-load evidence.

Live-provider quality, Hindi/Hinglish speech quality, graph interpretation quality and repeated physical-phone turns on the updated EC2 site remain unverified. No claim is made that the reported phone failure is resolved until that acceptance is completed.
