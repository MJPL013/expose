# Expose documentation

Current behavior was updated on **5 November 2026** for [clearer rooms and guided voice](ROOMS_AND_GUIDED_VOICE.md), B048, building on the [interactive AI host](INTERACTIVE_HOST.md). Dated older sections preserve historical evidence and legacy-run behavior. Source schemas and the newest dated update take precedence over earlier descriptions.

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

The current audit evidence is in [the documentation audit](../work-log/verification/2026-10-31-documentation-audit.md). [Work status](../work-log/STATUS.md) records dated verification; [project history](../work-log/PROJECT_LOG.md) remains append-only. [Mock frontend history](MOCK_FRONTEND_HISTORY.md) is historical, not the current online specification.

## How to keep this accurate

- Update the relevant design document and `docs/STATUS.md` when behavior changes; append the actual result to the work log.
- Distinguish **implemented**, **automated verification**, **physical verification**, **unverified integration** and **not implemented**. Passing mocked provider tests does not verify a real provider account.
- Link behavior to source and tests. The source schemas and migrations take precedence over diagrams; generated JSON is never edited by hand.
- Record test dates and scope. A previous browser run or dependency audit is historical evidence, not a new check.
- Keep credentials, private answers, recordings, callback tokens and temporary room invitations out of documentation. Current temporary invitations live in ignored `.data/` files.


The 3 November character/brand revision is described in [Frontend](FRONTEND.md) with [verification evidence](../work-log/verification/2026-11-03-characters.md): modular appearance, Randomise, five backgrounds and extracted Expose logo assets.

The B035/B036 room continuity and warm-theme update is documented in [Game flow](GAME_FLOW.md), [Frontend](FRONTEND.md) and [API](API.md); see [verification](../work-log/verification/2026-11-03-room-continuity.md).
