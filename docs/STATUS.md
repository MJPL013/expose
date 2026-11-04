# Current implementation and remaining work

## Clearer rooms, guided voice and spice — 2026-11-05 (B048)

Implemented for new rooms/rematches: gameplay flow 4, protocol 5, Quick/Normal/Relaxed pace, room-specific invitations, authenticated membership recovery, clear leaving/removal, owner lobby settings, self-avatar editing, approved card previews/sharing, authored question narration, reviewed spoken selections and expanded multilingual/spice content. Existing saved runs keep their stored timing/content. Migration 0006 is applied locally. Details: [rooms and guided voice](ROOMS_AND_GUIDED_VOICE.md).

Verification: production build, frontend lint, backend/shared type checks and generated-contract drift check passed. The focused existing engine/content/appearance checks passed 43 tests; the selected PostgreSQL host suite passed 12 with one protocol-4 voice fixture excluded. One separately run preferences assertion still expects the old exact storage-key set and fails with the new `hostVoice` preference. No test code or test folders were added or modified; the entire regression suite is not claimed green.

Manual evidence used an isolated test database, two Edge browser contexts, mocked providers and synthetic microphone capture. The two-player Bluff walkthrough covered settings/readiness, both rounds, reviewed recording/re-record limits, votes, cards, rematch, leave/resume and removal. Seven-player engine checks covered both packs/modes, match/rematch and exhausted-pool selection without repeated scored prompts within a run. Manual transaction checks covered duplicate narration, deadlines, five-second reading fallback and stale results. PNG export was inspected with seven rows; sharing cancellation was stubbed, and unsupported sharing used Download. Phone-width and enlarged-text checks were emulated, not physical-device evidence.

The refreshed production HTTPS runtime reports protocol 5, live voice enabled and Gemini selected/configured; public home, invite route and health returned HTTP 200. The current temporary origin is in ignored `.data/playtest.json`. These are configuration/HTTP checks, not successful provider requests. B045's observed Gemini timeouts have not been rechecked. Physical PC/phone match and rematch, real multilingual speech, actual OS share sheets, autoplay, live host humour and separately measured transcription/translation/caption/audio latency remain open.

## Historical interactive host and multilingual voice — 2026-11-04 (B045 implements B044)

Implemented for new online rooms/rematches: server-owned checkpoint host, optional replies with 60-second recovery, concise stage prompts, validated Gemini/DeepSeek JSON, same-room callback memory, independent translation budgets, reviewed multilingual answers, durable recording limits/grace, explicit sliders/choice locks and protocol/PWA updates. Scoring amounts remain unchanged. See [current specification](INTERACTIVE_HOST.md) and [verification](../work-log/verification/2026-11-04-interactive-host.md).

Current live limitation: Gemini host requests and a simple greeting timed out; a 15-second diagnostic also failed to complete. Gnani locale configuration, synthetic English transcription and TTS respond; commit finalisation was faster in two synthetic trials but remains opt-in. Real Hindi/Telugu recognition accuracy, host humour, two physical devices completing a match/rematch, playback and callbacks remain unverified. The previous B043 public playtest process is stopped. Historical observations below do not supersede these current limits.

## Two-player voice playtest — 2026-11-04 (B043)

The current production build runs at a temporary HTTPS origin with `liveVoice:true`, `hostLlmProvider:gemini` and `hostLlmConfigured:true`; home and health returned HTTP 200 through that origin. A bounded live Gnani probe connected streaming STT with 2.048 seconds of synthetic silence and generated 0.8 seconds of TTS audio. One bounded live Gemini request with synthetic public two-player context returned a short reply and token usage. These checks prove the configured endpoints respond, not that either player's real microphone, transcription accuracy, speakers, room host exchange or full match work. The full two-player physical game is awaiting user testing. See [voice](VOICE.md) and [setup](SETUP.md).

## Host LLM selection — 2026-11-04 (B041 revises B039)

The backend now selects `scripted`, `deepseek` or `gemini` for **Tap to ask**. DeepSeek and Gemini use server-side HTTPS APIs; Gnani STT and TTS still use provider WebSockets. The LLM receives the asking player's question plus public phase, mode, names, scores and host rules. It does not receive submitted answers or produce automatic commentary about the group's choices. Narration, stories, decoys, scoring and disconnected-player actions remain scripted. Keys are backend-only; the default selection is `scripted`, and the active playtest was not restarted with this revision.

Verification for B041: mocked DeepSeek/Gemini request and response tests passed (4), the PostgreSQL/socket multiplayer suite passed (39, including selected-provider usage persistence), and backend type checking passed. Neither LLM has had a live request, key, quota, latency or billing verification. The prior bounded Gnani STT/TTS endpoint probes remain the only live provider evidence; human speech and physical-device voice remain unverified. See [voice flow](VOICE.md), [API contract](API.md) and [setup](SETUP.md).

## Historical Gnani integration check — 2026-11-04 (B039)

Live STT, TTS and consented batch adapters already exist; the active local playtest is launched with live voice off. A fresh bounded Gnani probe confirmed STT connection using synthetic silence and a short TTS result; it did **not** verify real speech, phone recording or billed cost. The server now sends a `liveVoice` availability flag with online snapshots. When false, the UI keeps typing available and prevents a microphone permission request for unavailable transcription. Health flags require actual configuration, not just the master AI switch. Evon is still unconfigured and the host remains scripted. See [voice evidence](VOICE.md), [API contract](API.md) and [setup](SETUP.md).

Verification for B039: 40 backend tests, 57 frontend unit tests, workspace type check, frontend lint and generated-contract drift check passed. A production build and physical-device speech test were not run for this revision; the existing running playtest was not restarted, so it still serves its earlier build with voice off.

## Character and brand update — 2026-11-03

B030/B031 implement modular character editing, independent accessories, five backgrounds and Randomise with explicit saving. The supplied logo is extracted into a transparent header lockup and app icons; redundant Gnani branding is removed while transcription disclosure remains. Existing profiles/cards remain readable, and PNG exports use the same character renderer as the game. See [frontend implementation](FRONTEND.md) and [verification](../work-log/verification/2026-11-03-characters.md). Physical installed-icon refresh and this editor on Android/iPhone/tablet hardware are untested; earlier device evidence is not a check of this revision.

Audited **31 October 2026**, task B021. This is the shared product/engineering baseline, checked against code rather than the original plan. See [audit evidence](../work-log/verification/2026-10-31-documentation-audit.md) for what was run now versus earlier.

## Historical audited baseline — 31 October 2026

This table preserves the B021 audit. The B045 update above supersedes its host, voice, flow and database behavior.

| Area                 | Current behavior                                                                                                                                                       | Evidence and limit                                                                           |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Workspace            | Separate `frontend`, `backend`, `shared`, `docs`, `work-log`; npm workspaces                                                                                           | Paths and scripts inspected                                                                  |
| Real rooms           | Guest identity, random six-character code, host-only setup, 2–7 seats; no player-entered access password or simulated-seat selector                                    | Both modes at every seat count pass PostgreSQL/socket journeys                               |
| Lobby                | Chat, separate host Ready/Play, all configured seats connected and ready, host removal before start                                                                    | Current backend regressions; earlier browser and physical Android lobby checks               |
| Gameplay             | Traits, nominations, conditional callout, catchphrase, roster-driven Spotlight/Bluff, prediction, templated story, verdict, per-subject card decision, summary/rematch | Engine/socket tests; earlier full two/three-client browser journeys                          |
| Fairness/privacy     | Per-seat private views, answer concealment, self-vote restrictions, score attribution, action receipts, stale-phase rejection                                          | Automated engine and transactional socket tests                                              |
| Recovery             | Durable accepted state/deadlines; explicit tab takeover; scripted disconnected-seat actions; host migration                                                            | Automated service-restart, ownership and catch-up tests; physical mobile-loss matrix pending |
| Frontend             | App navigation, profile, saved cards, fixed action dock, settings, reduced motion, SFX/haptics, wake-lock fallback                                                     | Existing browser checks; Android test vibration and Ask dismissal physically checked         |
| PWA/offline          | Installable shell; separately selected offline demo; developer routes return 404 in production                                                                         | Three production browser tests in B020; no new PWA test in this audit                        |
| Database             | PostgreSQL/Drizzle: 21 application tables, five migrations; separate test database                                                                                     | Live development schema names/migration count checked; all 36 backend tests freshly pass     |
| Voice plumbing       | AudioWorklet PCM capture, authenticated STT socket, editable transcript, typing fallback, consented media                                                              | PCM/unit and mocked gateway checks; real STT evidence is a silence probe only                |
| Host                 | Scripted phase narration, Tap to ask with one speaker/25-second pause, cancellable dialog, TTS adapter/cache, selectable DeepSeek/Gemini adapter                       | Mocked provider and PostgreSQL/socket tests; no live LLM call verified                       |
| Diagnostic callbacks | Consent-gated batch jobs, durable metadata inbox, authenticated polling, cancellation/expiry                                                                           | Mocked HTTP/provider tests; live diagnostic batch not verified                               |
| Costs                | Attempt/usage ledger, conservative per-match limits, rate snapshots, separate estimates/invoice reconciliation, cohort CLI reports                                     | Automated accounting tests; **zero rate cards in the inspected development DB**              |

## Not finished or not yet proven

| Item                                | Actual gap                                                                                                                               | Next evidence needed                                                                                            |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| DeepSeek/Gemini live host validation | Gemini is configured; B045 host scenarios/simple greeting time out. DeepSeek has adapter tests only; billing remains unverified | Investigate current Gemini responsiveness, then complete live host/translation acceptance without an automatic paid fallback |
| Group-answer host acceptance        | B045 implements automatic commentary/replies/memory over released inputs; current live Gemini requests time out | Restore live provider responsiveness, then complete the two-device match/rematch and subjective humour evaluation |
| Complete live voice match           | STT/TTS connection probes do not establish human speech quality, latency, quotas or full-session cost                                    | Consented Android speech tests, then one bounded complete multiplayer session                                   |
| Noise/VAD tuning                    | Browser processing and fixed VAD headers exist; no measured tuning dataset, RNNoise or automatic correction-rate/clipping/CPU collection | Quiet/Hinglish/fan/music/nearby-speaker comparisons; log manual measurements                                    |
| Batch/denoise                       | Live callback delivery, batch language configuration and cancellation behavior untested                                                  | One consented diagnostic pair with denoise off/on and authenticated result reconciliation                       |
| Accurate currency costs             | No account rate card/invoice evidence; failed and uncertain attempts can remain unpriced                                                 | Import confirmed rates/billing units, reconcile provider attempts; do not treat credits as free usage           |
| Physical acceptance                 | Android vibration diagnostic and lobby only; no completed physical match, confirmed start-SFX audibility, or iPhone test                 | PC + phone Ready → Play → all acts; then Android/iPhone recording, backgrounding, keyboard and countdown checks |
| Complete REST specification         | Generated OpenAPI has request schemas/error schema/path inventory but no success-body schemas; socket schemas are more complete          | Add shared success schemas and response validation before relying on generated API clients                      |
| Database hardening                  | Many seat references are logical UUIDs without FKs; action tables are partial projections, not an event-sourced replay log               | Decide constraints/audit requirements before production migration; see [database](DATABASE.md)                  |
| Full identity deletion              | Content purge exists, but `players` and empty `rooms` have no automatic deletion; no public guest logout/delete endpoint                 | Define identity/account deletion and backup policy; add tested deletion flows                                   |
| Consent audit completeness          | Initial diagnostic consent is stored on the asset; `consents` history is written by explicit consent updates                             | Add initial-grant audit events if complete consent chronology is required                                       |
| Code-generation/validation coverage | Generated contracts check schema-file drift, not every route's runtime response or semantic refinements                                  | Expand contract validation; the Spicy/adult rule remains runtime validation                                     |
| Scale and operations                | One backend, process-local socket map/cache, no Redis fan-out/S3 adapter/production deployment/backup restore drills                     | Load/abuse tuning, trusted-edge design, deployment and recovery runbook verification                            |
| Room-code collision                 | Six hexadecimal characters, DB uniqueness, no collision retry; old room rows/codes remain                                                | Retry collisions and define room cleanup before public growth                                                   |
| Automated CI                        | Workflow exists; remote execution not verified                                                                                           | Run it on the actual repository runner; local passes are not CI results                                         |

In the audited legacy flow, decoys, stand-ins and stories are scripted. Current flow 2 retains deterministic decoys/stand-ins and replaces the closing with a host opportunity; see B045 above. Optional wildcard exists in local/developer flows but is not an online room option. Packs and scoring remain code configuration. Old 3–5-seat, two-round and six-to-eight-minute descriptions are superseded; [current timings](GAME_FLOW.md) grow with roster size.

## Verification boundary

- **Fresh B021:** 50 frontend/shared/PCM tests, all 36 backend tests in one run, workspace type checking and generated-contract drift check passed. Development PostgreSQL 17.11 has matching table names and all five migrations. This is not an exhaustive schema-diff audit.
- **Earlier B018–B020:** 12 distinct development browser checks across focused runs; three production PWA checks; lint/build; 46-file public-bundle credential scan. These were not rerun for documentation-only edits.
- **Historical live flags inspected in B021:** protocol 3, `liveVoice:false`, `evonConfigured:false` in the earlier build. The current code reports `hostLlmProvider` and `hostLlmConfigured` instead. Health reports configuration flags; it does not test provider availability or database connectivity.
- **Physical evidence already recorded:** Infinix X663C / Android 12 / Chrome 156 vibration felt by the user; lobby/chat and outside-tap Ask dismissal. No iPhone or complete physical session claim.

Recommended next sequence: finish the real two-device typing playtest; validate speech on the connected Android with bounded usage; obtain provider access/rates; run live diagnostics; close contract/retention gaps before broadening access. Detailed execution history stays in [the work log](../work-log/PROJECT_LOG.md).

## Adaptive app update — 2026-11-03

B022–B024 are implemented: adaptive panes and compact preference; focused navigation/shared leave; explicit same-player tab handoff; refresh text drafts; deferred updates; single-flight initialization; event-driven media refresh; coalesced authorized broadcasts. Revisions B025–B028 address the development channel race, preview overlap, demo leave state, pending-work cancellation and enlarged-text dock.

Fresh checks: 53 frontend/shared tests, 37 backend tests, 36 distinct development browser checks across focused runs, four production PWA checks, type checks, ESLint, contract drift check and production build. Idle results traffic fell from four media requests/3914 HTTP bytes to zero over the same 11 seconds; an idle controlling lobby sent only one ping/pong pair. See [verification scope](../work-log/verification/2026-11-03-adaptive-app.md) and [implementation map](ADAPTIVE_APP.md).

ADB reported no connected authorized Android device. Physical Android/tablet/iPhone acceptance, live provider validation and the outstanding items above remain open. No database migration or cross-device handoff was added.

2026-11-03 B034: approved yellow/dark app icon replaces PWA, Apple and favicon assets. Maskable icon uses a full yellow background and safe-area mark. Versioned icon URLs and public cache v10 are live; production build and all four PWA browser checks pass. Physical launcher icon refresh remains untested.

## Room continuity and themes — 2026-11-03 (B035/B036)

Implemented: case/whitespace-normalized duplicate room labels, independent Back to lobby/View results at summary, post-game chat, chat carried into host-created rematches, natural short-chat scroll chaining, and 14px entry-action spacing. The host still controls creating the next run and starting it after everyone readies. Recent chat remains bounded to 50 messages; this is not an unlimited archive. Existing identity, ownership and scoring rules remain unchanged.

Settings and in-game settings now share a saved light/dark toggle. Light uses warm cream, brass and ink tokens; the preference loads before hydration. Details: [Frontend](FRONTEND.md), [Game flow](GAME_FLOW.md), [API](API.md), [Database](DATABASE.md). Browser emulation is separate from physical touch/phone verification, which has not been performed for this revision.

## Audio sample audition — 2026-11-03 (B037)

The supplied stamp sample is connected to the first SUSPECT entrance. The first supplied background candidate is connected at restrained volume on navigation pages and respects existing sound controls and capture/playback suppression. Production compilation and TypeScript pass; the user requested manual listening instead of added automated audio tests. Physical loudness and mix quality remain intentionally unverified until that listening pass.
