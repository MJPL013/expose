# Clearer rooms and guided voice

Implemented 5 November 2026, B048, revising B045/B047. Gameplay flow 4 and socket protocol 5 supersede earlier dated descriptions for new runs.

## Rooms and results

Invitations use the configured public origin and `/join/CODE`. Public availability contains settings, not roster or answers. New visitors enter a name; returning members resume a valid seat without code entry. Manual entry remains. Full, started, removed and expired rooms have distinct responses.

The lobby owner can change pace, room language, spice and guided voice before starting. Saving resets readiness. Every participant must confirm they are 18 or older before becoming ready in Spicy rooms. Your lineup avatar opens a modal editor; saving updates room and player appearance.

Leave game preserves seat and points, with existing stand-in and owner-transfer behavior. End match for everyone remains a separate owner action. Removal stops recording/playback, discards drafts and clears the affected resumable seat, showing **The host removed you from your previous room.** Homepage membership refreshes on opening, focus/visibility changes and every 15 seconds while visible; Resume validates again. Connected removal is immediate. Network failures and another-tab ownership remain distinct.

Question screens put the actual question, one role instruction, input and confirmation first. Ratings retain deliberate nullable 0–10 values, midpoint/keyboard/tap controls and You → Your friend progress. Choices require Lock. Scoring detail and standings are secondary. Empty completed host moments are hidden.

Results have My card and Rap sheet previews. Approved PNGs are prepared before Share, preserving the browser's user activation requirement. Download remains available where file sharing is unsupported. Cancelling stays on results; no public upload occurs. Existing approval/consent rules remain. Seven rap-sheet rows fit above the footer.

## Pace

| Preset | Ratings, both steps | Text/voice answers | Choices, judging, prediction | Reveals |
| --- | ---: | ---: | ---: | ---: |
| Quick | 60 s | 30 s | 15 s | 10 s |
| Normal, default | 90 s | 45 s | 30 s | 15 s |
| Relaxed | 120 s | 60 s | 45 s | 15 s |

Answer windows start after question presentation; completed input phases advance early. Existing five/eight-second recording caps, one shared 15-second finalisation grace per phase and 60-second AI exchange ceiling remain. Pace cannot change during play.

## Guided voice

Guided voice is optional, enabled in the create-room UI by default. API clients omitting it keep narration off. Authored questions, anonymous choices and brief stage instructions go directly to Gnani TTS without an LLM. Later stages use a short instruction instead of repeating the question. Ratings remain sliders with spoken directions.

`shared/src/game/guided.ts` uses the public projection, never raw secret answers. Nomination, judging, vote and prediction offer Say a choice: review STT, then lock an exact visible name/text, letter or curated English/Hindi/Telugu option number. Ambiguous or unmatched text cannot become a vote. This is push-to-talk with review, not continuous hands-free listening.

Remote answers and public host replies default to voice; same-room answers default to typing. Lobby microphone setup is remembered for the browser-service session. Hold → speak → release → review → Send stays explicit. Initial recording plus one re-record is server-enforced across language changes/refresh; editing, typing and passing remain. Permission failure before capture does not count. Release/cancellation stops capture.

Each microphone independently uses English, Hindi or Telugu. Room questions/host use English, Hindi or Hinglish. Cross-language free text retains original and confirmed gameplay text; editing invalidates translation. Option numbers bypass translation/LLM selection. Factual points still use deterministic normalization and authored aliases.

`backend/src/question-guide.ts` claims narration under a room lock, releases the transaction, then requests speech. Pending/generating/presenting/done state and deadlines persist in run JSON. Generation has an eight-second deadline. A successful clip gets its duration plus 750 ms of presentation before answer timing; failure gets a five-second reading window. Crash recovery uses persisted deadlines. Late/previous-run responses cannot become the current presentation.

One asset is reused per utterance within a run, deduplicated by text-hash operation key. The immediately next known public narration can be prepared early; unrevealed vote/judge options are not prefetched. Same-room playback is assigned to the owner at generation time, including when temporarily disconnected, so absence cannot enable speech on every device. Captions continue; remote devices each play the shared clip. Host voice is an independent saved preference with Play/Replay. Restored narration never autoplays, including audio arriving later. Browser autoplay restrictions can still require Play.

Narration reserves `narrationCharacters` separately from commentary TTS and host calls. Full-match ceilings include choice recordings and derive from roster, rounds and host opportunities; smoke remains bounded. Measured TTS use is retained. Gemini and DeepSeek keep their validated host contract; no automatic paid-provider failover was added.

## Content and replay

`shared/src/game/fresh-content.ts` provides 14 factual prompts and 14 eligible prompts per creative scored type in each pack. Questions, examples, built-ins and decoys have authored English, Hindi and Hinglish variants, with language-independent IDs and hostel/Goa context. Curated aliases also cover Telugu factual equivalents. The LLM cannot award points.

Mild/Medium share the everyday creative bank but use different built-ins and host direction: warm teasing versus sharper banter and excuses. Spicy selects a separate 14-prompt adult bank covering fictional dating, flirting, awkward messages and non-graphic innuendo, plus stronger built-ins and host direction. It never establishes real romantic history about a player.

Room history prefers unseen IDs across rematches. Per-run history avoids repeats even after the room exhausts its eligible pool. Veto replacements stay within that pool with aligned IDs/decoys. History is room-isolated and removed on end/expiry. Existing host memory remains capped at 12 callbacks and excludes removed players.

## Persistence and compatibility

Migration `0006_guided-game.sql` adds `rooms.question_history`. Run JSON stores narration, prepared audio references, per-run history and chosen Bluff question IDs. History updates share the run transaction. Provider calls remain outside transactions; room locks and operation keys guard publication and charging.

New rooms/rematches use flow 4. Saved earlier runs execute stored durations/content; the new bank/timing path is selected explicitly, not reconstructed at resume. The host exchange contract remains version 2, with flow-4 spice direction recorded as `host-v3-spice`. PWA cache `v13-guided5` and protocol checks require stale clients to refresh rather than interpret protocol 5 as 4.

Authenticated `GET /api/v1/recovery` returns `{ rooms, notices }`; the older resume list remains. New intents are `settings.update`, `appearance.update`, `adult.confirm`. Appearance is self-only in lobby/results; settings are owner-only in the lobby. See generated [HTTP](api/openapi.json) and [socket](api/sockets.json) schemas.

## Evidence boundary

Manual checks used fake players, isolated desktop/phone-sized browsers, synthetic microphone input and mocked providers in the dedicated local test database. Existing checks ran separately. No test source or test folders were added or changed. Evidence and exceptions are in [work status](../work-log/STATUS.md) and the append-only [project log](../work-log/PROJECT_LOG.md).

Physical PC/phone HTTPS play, real Hindi/Telugu STT accuracy, live narration, actual share sheets, physical-browser autoplay, live LLM latency and whether the host is funny remain acceptance work. Earlier provider failures remain relevant until new live checks replace them.
