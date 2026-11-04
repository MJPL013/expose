# Current status

2026-11-05 B048 implementation is complete; live acceptance remains open. New rooms/rematches use flow 4/protocol 5: clearer room entry/recovery/removal, leave/resume, avatar editing, compact settings with pace/language/spice/voice, adults-only readiness, question-first screens, reviewed speech/choices, durable question narration, approved PNG sharing and expanded authored multilingual content. Scoring remains deterministic; saved legacy runs retain their timing/content. See [implemented behavior](../docs/ROOMS_AND_GUIDED_VOICE.md).

Latest production build, frontend lint, workspace type checks and generated-contract drift check passed. Existing focused engine/content/appearance tests passed 43; the selected PostgreSQL host suite passed 12 with one legacy protocol-4 voice fixture excluded. A separate preferences test has one failing exact-key expectation because saved preferences now include `hostVoice`; test source was deliberately left unchanged under the user's no-test-code instruction. The full suite is not claimed green.

Manual B048 verification used the dedicated test database, mocked providers and two isolated Edge contexts (desktop and 390 px phone). The Bluff journey completed two rounds with synthetic inputs, voting, approval/export, rematch, leave/resume and removal. Later phases used an accelerated manual clock. Synthetic microphone hold/release produced a private editable mock transcript, and the second recording exhausted the server/UI allowance. Invitation links, appearance synchronization, readiness reset, adult confirmation, removed-seat cleanup, share cancellation stubs and download fallback were exercised. A separate seven-seat results fixture verified the PNG layout; 320 px with enlarged text/light theme/reduced motion had no horizontal overflow. These are browser checks, not human microphone or physical-device evidence.

Additional manual checks covered one TTS request for concurrent duplicate jobs, provider work outside transactions, exact preset answer windows, five-second failed-narration reading time and rejection of stale publication. All 18 pack/spice/language combinations had eligible 14-prompt banks and stable IDs, with sampled equivalent factual aliases. Seven-player engine runs covered both modes/packs through match/rematch and pool exhaustion, with no repeated scored prompt within a run. Final seven-player PNG was visually inspected with clear separation from its stamp/footer. No test files or folders were created or modified.

Current B048 runtime: rebuilt production at `http://127.0.0.1:3000`, with temporary HTTPS origin in ignored `.data/playtest.json`; public home, invite route and health returned 200, protocol 5, `liveVoice:true`, Gemini selected/configured. No live provider request was made in B048. Earlier Gemini timeouts remain unresolved evidence. Physical PC/phone match/rematch, Hindi/Telugu speech accuracy, live narration and callbacks, actual share sheets, physical autoplay, humour and separate latency measurements remain unverified.

Historical local runtime after B045: production build at `http://127.0.0.1:3000`; home/health HTTP 200, protocol 4, `liveVoice:false`, Gemini selected/configured. AI was deliberately disabled for local controls/typing inspection. Checks at that date: 60 backend, 63 frontend/shared, six interactive browser and four production PWA tests passed; build/lint/contract drift passed. Final phone-width and desktop screenshots were visually inspected. This was not a live AI playtest.

2026-11-04 B045 implements B044: interactive host/voice/UI flow is implemented for new online rooms and rematches. Durable checkpoints/replies, same-room memory, structured providers, translations, per-player languages, recording limits/grace and explicit controls are present. Verification is recorded in [the B045 report](verification/2026-11-04-interactive-host.md). Live Gemini currently times out, including a simple greeting; Gnani synthetic speech/configuration checks respond. Physical two-device full-match/rematch and human multilingual speech/humour acceptance remain open. The old B043 HTTPS process is stopped; its earlier URL/runtime claims below are historical.

2026-11-04 B043: HTTPS voice playtest is running at the current temporary origin stored in ignored `.data/playtest.json`. Public home and health returned HTTP 200; health reports `liveVoice:true`, `hostLlmProvider:gemini`, `hostLlmConfigured:true`. The bounded Gnani probe connected STT with synthetic silence and generated 0.8 seconds of TTS. One direct Gemini request with synthetic public two-player context returned a short visible reply and provider token usage. Human speech, mobile playback, room Tap to ask and a complete two-player game remain unverified. On this Windows/npm setup, the npm command did not forward `--voice`; the working command is `node scripts/playtest.mjs --voice`.

2026-11-04 B042: local development server is running at `http://localhost:3000`; home and API health returned HTTP 200. PostgreSQL on loopback port 5433 is accepting connections. Runtime reports `liveVoice:false`, `hostLlmProvider:scripted`, `hostLlmConfigured:false`; this is a local typing/scripted run, not live speech or LLM verification.

2026-11-04 B041 revises B039: backend Tap to ask now selects scripted, DeepSeek or Gemini. Gnani STT/TTS WebSocket paths are unchanged. Four mocked API-adapter tests, 39 PostgreSQL/socket multiplayer tests (including selected-provider usage persistence), and backend type checking passed. No DeepSeek/Gemini key or live request was used, and the running playtest was not restarted. Group-answer commentary is still unimplemented; the model currently receives only the speaker's question and public room context. See [current docs](../docs/STATUS.md) and [voice flow](../docs/VOICE.md).

Historical 3 November 2026 adaptive-app update: B022–B024 adaptive layouts, same-player tab ownership/drafts and efficient networking are complete, with revisions B025–B028. Evidence from that update: 53 frontend/shared tests, 37 backend tests, 36 distinct development browser checks across focused runs, four production PWA checks, lint/type/contract/build checks. [Detailed verification](verification/2026-11-03-adaptive-app.md). No authorized Android device was connected; tablet/iPhone and live-provider checks remain untested.

Historical October 31 baseline: The 2–7-player invite flow is runnable. Android vibration is physically confirmed; account-specific Evon integration and full physical-device gameplay acceptance remain open.

B021 documentation audit: use the [docs index](../docs/README.md), [implementation status and gaps](../docs/STATUS.md), [database model](../docs/DATABASE.md), [system connections](../docs/ARCHITECTURE.md), [current game flow](../docs/GAME_FLOW.md) and [frontend map](../docs/FRONTEND.md) as the current engineering baseline. The [audit record](verification/2026-10-31-documentation-audit.md) distinguishes freshly run checks from earlier evidence. No game behavior or running playtest was changed for this audit.

Implemented:

- Separate frontend/backend/shared/docs/work-log workspaces; historical logs preserved.
- PostgreSQL-backed 2–7-player Spotlight and Bluff, guest identities, private snapshots, accepted-action acknowledgments, deduplication, reconnect, explicit tab takeover and scripted replacements.
- Host-only setup for Hostel 2 AM or Goa Trip, server-generated six-character room codes, name/code-only joining, lobby chat and a readiness-gated host Start button. No separate player access password or simulated-seat selector in the real flow; offline practice remains at `/demo`.
- Separate sticky Ready and Play controls for the host, lobby player removal with durable access revocation, and dismissible Ask dialogs that release the conversation pause immediately. Chat names, bubbles and composer align at small widths and enlarged text. A 500 ms generated start cue accompanies the accepted transition to self/friend trait sliders.
- Backgrounding silences media without voluntarily dropping a healthy online socket. Authenticated rate limits are per verified guest, so players behind one tunnel or router do not consume each other's request budgets.
- Per-player traits, nominations, catchphrases and card approval; pinned content/aliases and random anonymous option IDs.
- PCM capture/STT gateway, editable transcript, private/consented media, bounded host service, scripted narration and static TTS reuse.
- Consent-aware diagnostic jobs, durable callback inbox, authenticated polling, retention jobs, cost/usage reports, versioned rates and emergency AI stop.
- Production PWA and a private HTTPS playtest runner (`npm run playtest`; optional `-- --voice`).

2026-11-04 B039: current local health remains `liveVoice:false` and Evon unconfigured. A fresh bounded Gnani STT synthetic-silence connection and short TTS request succeeded; effective model, human speech quality, physical phone capture and billed cost remain unverified. Online room snapshots now report voice availability, disabling Say it before microphone permission when the playtest has voice off. A voice-enabled playtest requires a new `-- --voice` run and a new temporary origin.

B039 verification: 40 backend and 57 frontend unit tests, workspace type checking, frontend lint and socket contract drift check passed. The production build and physical voice test were not repeated; the running link still serves its prior build.

Historical verification through October 31:

- 50 frontend/shared/PCM tests passed, including acknowledgment/snapshot arrival ordering, haptic suppression and pack-aware checkpoints.
- B021 freshly reran all 36 backend tests in one passing run (34 PostgreSQL/socket checks plus two metrics unit tests), and all 50 frontend/shared/PCM tests. Includes both games at 2–7 seats, ten concurrent rooms, removal authorization/deduplication/rejoin denial, Ask cancellation/in-flight abort, takeover, privacy and retention.
- 12 distinct development browser checks passed for B018–B019 across focused runs: app (6), mode separation (3), online journeys (2), lobby moderation/layout (1). The two/three-client journeys verify all-ready gating, outside/Escape/Close dismissal with restored focus, start SFX on every client, trait sliders, later acts, individual card approval/export and resume. Lobby checks cover 320/375/430/1440 px, 200% text/reduced motion, chat alignment and background connection retention. These are browser clients, not physical phones. Earlier audio/competitive browser results remain recorded in B016.
- Final targeted PostgreSQL regression passed for concurrent usage completion and excluding unstarted lobbies from session-cost statistics; the started-at migration is applied locally.
- Three production PWA tests passed: offline demo, installation flow and developer-route exclusion.
- Type checking, lint and production build passed; generated contracts checked for drift.
- Latest production output scan: 46 files, no configured backend credential found. PWA shell cache advanced to v7 for the updated controls.
- Production dependency audit: zero advisories. Four moderate development-only entries remain in drizzle-kit's transitive esbuild chain; no force downgrade applied.
- Live Gnani TTS produced 0.72 seconds for a short phrase. Live STT connected with hi-IN/transliterate/16 kHz and transmitted 2.048 seconds of synthetic silence. Effective model selection is unconfirmed. These are endpoint probes, not speech-quality tests.
- Latest production HTTPS smoke test passed: generated room code without a separate access password, secure guest cookies, two authorized WebSocket clients and developer routes returning 404. The current invitation is in ignored `.data/playtest.json`; the temporary URL lasts only while the runner is active. Live provider voice is off for this run.
- Physical vibration diagnostic passed on connected Infinix X663C / Android 12 / Chrome 156: the user explicitly confirmed feeling the repeat test. No Android settings were changed. Countdown timing remains covered by automated tests; physical in-game countdown observation is still pending.
- B021 read-only development metadata: PostgreSQL 17.11, 21 application tables matching source names, five applied migrations, expected pg-boss queues, zero rate cards. Current local health flags: protocol 3, live voice off, Evon unconfigured. Workspace type-check and contract drift check passed again. Schema metadata is not a full schema-diff check; health flags are not provider/database probes.
- Updated B018 production app opened on desktop Chrome and physical Android in a fresh two-seat Goa Trip room. Chat delivery and both lobby layouts were checked; PC shows separate Ready/Play and removal controls. Physical Android Ask opened, outside tap dismissed it, and Ready remained enabled. Both seats are left unready and the match unstarted for the user. The live invitation is in ignored `.data/current-room.json`. This is a physical lobby check, not a completed physical match or speaker-audibility check.

Still to verify or supply:

- Code-audit gaps now documented: REST success-response schemas/validation, optional SQL seat-reference constraints, complete initial-consent audit, guest-profile/room cleanup and guest-erasure endpoint, room-code collision retry, runtime dispatch for version-pinned engine/host updates, and automatic speech-correction/clipping/device-load metrics. These are not marked implemented. See [docs status](../docs/STATUS.md) for scope and priority.

- One bounded live DeepSeek or Gemini Tap to ask call after the selected backend key is supplied; verify account model, latency, token usage and fallback. Historical Evon research remains in [Evon findings](../docs/EVON_ACCESS.md).
- Actual account prices, billed units, quotas, provider retention and cancellation billing.
- Live diagnostic batch/denoise runs and a complete speech-enabled multiplayer session.
- Real Hinglish/quiet/noisy speech, microphone denial/backgrounding on physical Android and iPhone, physical countdown feedback and iPhone fallback. The connected Android vibration diagnostic does not establish these other behaviors.
- Sustained load with providers, internet latency/mobile reconnects, and CI execution on a remote runner. The local ten-room test uses mocked providers and disabled test rate limits.

Docker Desktop remains installed. No replacement Docker was installed or old Docker uninstalled. Portable PostgreSQL 17.11 runs locally on 5433; development and test databases are separate. See [setup](../docs/SETUP.md) and append-only [history](PROJECT_LOG.md).

2026-11-03 final adaptive-app outcome: all three implementation checkpoints and automated checks complete; new physical-device checks remain open. Existing provider gaps remain unchanged.

## Character and logo update — 2026-11-03 (B030/B031)

Implemented modular appearance, independent accessories, five backgrounds, Randomise preserving name/bio, and explicit saving. Shared avatar IDs preserve the profile/room/card schema; supplied logo extracted into clean header and PWA assets. 56 frontend/shared tests, 38 distinct backend tests across runs, seven development browser checks, lint/types/build and contract drift check passed. See verification/2026-11-03-characters.md for scope and corrections. No new physical-device or live-provider verification; installed OS icon refresh remains untested.

2026-11-03 B032: current build now runs in production playtest mode through a temporary HTTPS tunnel. Address is in ignored .data/playtest.json. Public home/API/manifest verified 200; live voice off. Use the same HTTPS origin on PC and phone. Physical opening/install not yet confirmed.

2026-11-03 B034: approved yellow/black icon applied to PWA/Apple/favicon. Build and four production PWA tests pass. HTTPS playtest restarted; current address is in .data/playtest.json. Installed launcher refresh not physically verified.

2026-11-03 B035/B036 complete: numbered duplicate room labels, independent post-game lobby, retained recent chat, corrected scroll chaining, warm light/dark mode and spaced entry buttons. 57 unit tests, 39 backend tests, 15 distinct development browser checks and four production PWA checks pass; lint/types/build pass. Physical device and provider validation remain untested. Verification: verification/2026-11-03-room-continuity.md.

2026-11-03 B037: supplied stamp and first ambient candidate are wired to the existing sound settings and media suppression. Production build/type check passes. No new test files were added; phone loudness and mix are awaiting the user's manual audition.

2026-11-04 B046: DeepSeek compatibility is verified for automatic host and translation; eight mocked provider adapter tests pass, including blank content and API failure without paid fallback. Activation instructions are in docs/SETUP.md. No real key or runtime selection changed; live DeepSeek acceptance remains open.
2026-11-04 B047 supersedes the B045 local-runtime note: temporary HTTPS production voice playtest is running with full-match allowances. Public home/health returned 200, protocol 4, liveVoice:true, Gemini selected/configured. Use the current origin in ignored .data/playtest.json. No physical gameplay or current live Gemini response is claimed.
