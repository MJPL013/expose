# Expose documentation

**10 November 2026 — B074 EC2 launch:** user selected t3.small in Mumbai; stack creation succeeded and Session Manager is online. Server preparation is underway; application remains stopped pending manual .env configuration. Follow the [EC2 runbook](AWS_DEMO_DEPLOYMENT.md). Live AI/device acceptance remains pending.

**10 November 2026 — B073 deployment source:** the requested `ec2` branch snapshots the current application from `main`. See [EC2 delivery and pending launch work](AWS_DEMO_DEPLOYMENT.md). Publishing source does not deploy the application.

**9 November 2026 — B071 guest Void entry:** Google is now optional for The Void, explicitly revising B069/B070. Choose **Continue as guest**; a private cookie remembers this browser and the existing local server stores its history, recordings and analysis. Separate browsers have separate profiles. Friends retain their existing guest play. Read [quick entry](SETUP.md#quick-void-guest-entry--9-november-2026-b071) and [identity/storage behavior](ACCOUNTS_AND_STORY_GRAPHS.md#browser-guests--9-november-2026-b071). Administrator access remains protected.

**9 November 2026 — B070 Void entry and Google setup:** all visitors start with **Enter The Void**, with Google sign-in when needed and no microphone capture before authentication. Follow the [localhost setup steps](SETUP.md#localhost-google-sign-in--9-november-2026-b070) and [storage/prompt/explorer map](ACCOUNTS_AND_STORY_GRAPHS.md#storage-and-prompt-map). Google client creation and real callback verification remain required.

**9 November 2026 — B069 shared accounts and story graphs:** Google accounts now serve both games; friends still support guests, while The Void requires configured Google login on localhost too. New Void conversations continue naturally until Finish/time limits and analyse only afterwards. PostgreSQL stores versioned evidence graphs; the administrator explorer uses approved summaries and three fictional profiles. Start with [accounts and story graphs](ACCOUNTS_AND_STORY_GRAPHS.md). This supersedes B065's local authentication shortcut and B064's four-to-eight-turn/per-answer analysis. Older dated notes below are historical.

**7 November 2026 — three main sections (B066):** Play opens the 2–7-player friends game directly, The Void occupies the middle navigation position, and Profile contains Character/My cards. Old `/collection` links redirect to `/profile/cards`. The header Settings button toggles back to its originating section. See [frontend navigation](FRONTEND.md).

**7 November 2026 — local voice testing (B065):** `/void` on localhost opens microphone setup without Google sign-in, using an isolated browser identity. Live provider configuration, consent, history and deletion are retained. Public deployments still require Google. See [The Void setup](THE_VOID.md).

**7 November 2026 — The Void (B064):** the home page now separates the friends game and a solo voice experience with Google identity, an amber eclipse, grounded quote/persona and private returning-user memory. Feature code is isolated under the two `gc2` folders. Read [The Void](THE_VOID.md) for actual behaviour, setup, storage/deletion, API and verification limits. Live Google/provider and physical-device acceptance remain open. The Game 2 deferral statements in the dated 5 November sections below are historical.

Current behavior was updated on **5 November 2026** for [optional hands-free Game 1](VOICE.md), B051, following [clearer rooms and guided voice](ROOMS_AND_GUIDED_VOICE.md), B048, building on the [interactive AI host](INTERACTIVE_HOST.md). Dated older sections preserve historical evidence and legacy-run behavior. Source schemas and the newest dated update take precedence over earlier descriptions.

**Voice update:** protocol 6, persisted voice input version 2, optional local Silero detection with reviewed/automatic answers, prepared microphone and no player audio playback. Existing runs keep legacy manual behavior. Game 2 is deferred.

**Current baseline:** a single-instance multiplayer PWA for **2–7 real players**, with Spotlight and Bluff, Hostel 2 AM and Goa Trip. Flow 4 adds room invitations/recovery, pace presets, optional question/choice narration, spoken choices, card sharing, multilingual question history and an adult creative pool. Recurring AI reactions, optional replies and room callback memory remain; shared rules determine points. Physical two-device and live-provider acceptance remain open. See [work status](../work-log/STATUS.md) and [earlier provider evidence](../work-log/verification/2026-11-04-interactive-host.md).

| Read this                              | What it answers                                                                           |
| -------------------------------------- | ----------------------------------------------------------------------------------------- |
| [Implementation status](STATUS.md)     | What works, what has evidence, what remains incomplete, and the next checks               |
| [Interactive host](INTERACTIVE_HOST.md) | Current cadence, personality, languages, recording, memory, budgets and compatibility |
| [System connections](ARCHITECTURE.md)  | How the browser, proxy, API, engine, database, media and jobs connect                     |
| [Database](DATABASE.md)                | Actual tables, foreign keys, transaction boundaries, storage and retention gaps           |
| [Game flow](GAME_FLOW.md)              | The current player journey, live timings, roles, scoring and disconnect behavior          |
| [Adaptive app update](ADAPTIVE_APP.md) | Layouts, tabs, draft recovery, media invalidation and measured traffic |
| [Frontend](FRONTEND.md)                | Routes, session adapters, local storage, PWA behavior and UI ownership                    |
| [API and sockets](API.md)              | Routes, request/response shapes, authentication, ownership and callbacks                  |
| [Voice and costs](VOICE.md)            | Capture/STT/TTS/host pipeline, measured evidence and provider limitations                 |
| [Setup](SETUP.md)                      | Local services, migrations, HTTPS playtests and verification commands                     |
| [Operations](OPERATIONS.md)            | AI switch, evaluation, rates, reports, retention and restart procedures                   |
| [Evon access research](EVON_ACCESS.md) | Prior account-access investigation; this code audit did not recheck external availability |
| [Phrase video research](PHRASE_VIDEO_RESEARCH.md) | Feasibility, sources and rights for pairing recorded catchphrases with video |
| [60-second launch film plan](VIDEO_LAUNCH_PLAN.md) | Current-product story, timed sketchbook, fresh localhost captures and production route (B052-B054) |
| [Launch film draft 01](video-launch/DRAFT_01.md) | Local MP4, corrected screen/dialogue continuity, render checks and first-cut limits (B055) |
| [Launch film v2 script and timeline](../video/expose-launch-v2/README.md) | Current B056 recording sheet, source-traced silent animatic, editable browser timeline and final-footage direction |
| [Launch film concept v3](video-launch/CONCEPT_V3.md) | B057 proposed animated case-file storyboard and narrator-led script for discussion; no v3 video has been made |
| [Launch film concept v4](video-launch/CONCEPT_V4.md) | B058 award-show proposal, preserved before the user's ghost-cast reference |
| [Launch film concept v5](video-launch/CONCEPT_V5.md) | Current B059 painted ghost cast, veranda comedy opening, character acting and narrator-led 60-second proposal |
| [Ghost film and editable timeline](../video/expose-launch-v5/README.md) | B060 production of the approved ghost concept, generated painted assets, fresh gameplay, seven-track editor and Gnani recording slots |
| [Declare Your Baggage film](../video/expose-airport/README.md) | B067 airport story, generated whole-body character actions, fresh friends/Void captures, labelled future stranger play and nine-track editor |
| [Midnight Chai comic film](../video/expose-tapri/README.md) | B069 full user script, generated painted panels and moving paper cutouts, 35 Gnani performances, current local app inserts and ten-track editor; manual review requested |

The current audit evidence is in [the documentation audit](../work-log/verification/2026-10-31-documentation-audit.md). [Work status](../work-log/STATUS.md) records dated verification; [project history](../work-log/PROJECT_LOG.md) remains append-only. [Mock frontend history](MOCK_FRONTEND_HISTORY.md) is historical, not the current online specification.

## How to keep this accurate

- Update the relevant design document and `docs/STATUS.md` when behavior changes; append the actual result to the work log.
- Distinguish **implemented**, **automated verification**, **physical verification**, **unverified integration** and **not implemented**. Passing mocked provider tests does not verify a real provider account.
- Link behavior to source and tests. The source schemas and migrations take precedence over diagrams; generated JSON is never edited by hand.
- Record test dates and scope. A previous browser run or dependency audit is historical evidence, not a new check.
- Keep credentials, private answers, recordings, callback tokens and temporary room invitations out of documentation. Current temporary invitations live in ignored `.data/` files.


The 3 November character/brand revision is described in [Frontend](FRONTEND.md) with [verification evidence](../work-log/verification/2026-11-03-characters.md): modular appearance, Randomise, five backgrounds and extracted Expose logo assets.

The B035/B036 room continuity and warm-theme update is documented in [Game flow](GAME_FLOW.md), [Frontend](FRONTEND.md) and [API](API.md); see [verification](../work-log/verification/2026-11-03-room-continuity.md).
