# Gnani Expose · local frontend prototype

> Historical notes for the offline prototype, preserved on 31 October 2026. This is not the current online specification. Start at [the docs index](README.md), [current status](STATUS.md) and [game flow](GAME_FLOW.md). The 3–5-seat/timing/multiplayer statements below describe the earlier baseline. Paths below were relative to the former frontend-only application.

A complete three-act party-game mock with a fictional squad. Built in Next.js, TypeScript, CSS Modules, and Zod. The phone-first app has Play, My cards, Profile, and Settings screens. Real microphone recording stays in memory; transcripts and other players are fixtures. Character details, sound preferences, and explicitly saved approved cards use local browser storage. There is no AI service, multiplayer server, database, or upload.

## Run

```powershell
npm install
npm run dev
```

Open http://localhost:3000 for **player mode**. The first view is the case-file card with a brief **SUSPECT** stamp animation; reduced-motion settings show its stable equivalent. Choose **Create a room** or **Join with code**, then enter your display name. Mark yourself ready in the lobby; the host can start only when everyone is ready. The room briefing identifies the current local simulator, and the only join code is `DEMO42`. Choose Spotlight or Bluff and 3–5 seats (default: Spotlight, five). Submitted text, scores, and reserved seats can be resumed in the same browser for two hours; recordings are discarded on leave/reload. Use Resume game after refresh or reopen. Only one tab may control the local seat. Saved characters and approved cards survive.

**Developer mode** is at http://localhost:3000/dev, also linked from Settings only during `npm run dev`. Its demo launch opens the workbench at `/preview`; **Resume workbench** preserves its state. Select a phase, switch perspectives, pause/advance timers, change the flow or room-layout variant, and simulate interruption or microphone failure. Player and developer sessions use separate simulator instances, so workbench changes cannot change a player session. Character, saved cards, and sound preferences are shared. Changing routes releases local audio; perspective changes cancel and discard an active recording. Both `/dev` and `/preview` return 404 in production and are excluded from offline caching.

```powershell
npm run typecheck
npm run lint
npm test
npm run test:e2e
npm run build
npm start
```

Browser tests use an installed Chrome on Windows when available; otherwise install Playwright Chromium (`npx playwright install chromium`). They use a synthetic microphone device, never the computer's physical microphone. Generated screenshots and download traces live under ignored `test-results`.

## Installable app and sound

The app frame has one scrolling content region, a separate phase action dock, and a bottom navigation bar. The dock keeps Start, Submit, Vote, Approve, and Rematch accessible without scrolling through the phase. Safe areas and the visual viewport accommodate browser chrome and on-screen keyboards. Text inputs use 16px text to avoid iOS focus zoom. At very short heights or large text sizes, action regions can scroll independently.

Settings includes the browser's native installation prompt when available and Safari/browser-menu instructions otherwise. A manifest, regular and maskable PNG icons, Apple touch icon, theme metadata, and a production service worker support home-screen installation. Phone installation requires HTTPS. The service worker caches public app documents, route payloads, scripts, styles, fonts, and icons for offline local play; it never caches recordings, player saves, session state, or preview tools. It is disabled in development to avoid stale builds. Increment `CACHE` in `public/sw.js` when changing the public shell. Updates wait for an explicit user action because reloading discards recordings and requires resuming the saved session.

To verify production PWA behavior, build and start the app, then run in another PowerShell window:

```powershell
$env:PLAYWRIGHT_PRODUCTION = '1'
npm run test:e2e -- pwa.spec.ts
Remove-Item Env:PLAYWRIGHT_PRODUCTION
```

Short effects are generated with Web Audio after a player gesture: tap, ready, session start, reveal, countdown, timeout, and save. Sound, volume, and countdown cues have separate controls in Settings. Cues are suppressed during capture, transcript review, clip playback, and background-tab activity. Sound is supplementary; every event retains visible feedback.

Profile lets players choose one of four replaceable characters, a color, name, and short bio. Appearance carries into new rooms. After approving a card, choose **Save to my cards** to keep it locally; the latest saved traits also appear in Profile. My cards supports PNG export and removal. The most recent 12 cards are retained. Settings can reset all saved data. If storage is unavailable, edits remain usable for the visit and the app explains that saving is temporary.

App layout is in `src/features/app-shell.tsx` and `app.module.css`; the card-first home is in `home.tsx`; Create/Join is in `entry.tsx` and `entry.module.css`; profile, saved cards, and settings are in `player-pages.tsx`. Developer-only screens and controls live in `src/features/developer/` and are composed into the shared game renderer by the preview route. The player game does not import the developer UI. Player persistence is in `src/player/preferences.ts`, sounds in `src/media/sound-effects.ts`, and install behavior in `src/features/pwa.tsx`. Interface copy is in `src/content/app.en.ts` and `ui.en.ts`.

## Where to change the game

| Change                                                | Module                                                                              |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Colors, type, spacing, reusable controls              | `src/app/globals.css`, `src/ui`                                                     |
| Screen registry, per-act renderers, layout            | `src/features/screens.tsx`, `src/features/screens/`, `src/features/game.module.css` |
| Flow order, timing, optional wildcard, scoring values | `src/game/definitions.ts`                                                           |
| Prompts, Hinglish sample lines, spice variants        | `src/game/content.ts`                                                               |
| English interface wording                             | `src/content/ui.en.ts`                                                              |
| Intents, snapshots, player-specific payload types     | `src/game/contracts.ts`                                                             |
| State transitions and view projection                 | `src/game/engine.ts`                                                                |
| Scoring, seeded shuffle, callout detection            | `src/game/logic.ts`                                                                 |
| Simulator clock, subscription, development controls   | `src/session/mock-session.ts`                                                       |
| Recording, clip consent, playback, cleanup            | `src/media/local-audio.ts`                                                          |
| Approval-gated image exports                          | `src/artifacts/png.ts`                                                              |

The visual authority is the **detailed brand prose** in `color palette/DESIGN.md`. Its opening YAML conflicts with that prose; runtime tokens use the prose palette, with readable control borders and contrast-corrected labels. Fonts are bundled locally. Avatars are original SVG placeholders with a replaceable asset boundary. The supplied screenshot references are not embedded as UI.

## Architecture and extension

`SessionClient` exposes create/join, subscribe, snapshots, intent submission, and disposal. The mock adapter executes pure reducers; screens only send intents. Replace it with a network adapter when the backend exists. `GameSnapshot` is a **provisional frontend contract**, not the missing production contract mentioned in the PRD.

Private answers stay inside the simulator. `project()` creates a player-specific view with no authors, AI marker, correct-answer flag, or vote ownership before reveal. This prevents accidental UI leaks; frontend-only mock data is not a security boundary. A production server must enforce the same projection.

Flows are versioned and validated for registered renderers, unique step IDs, and preceding data requirements. Move independent steps or adjust duration and scoring directly in the definitions. The classic flow excludes the wildcard; the remix flow enables it. For a new mechanic, add its contract/intent, transition behavior, projection, and renderer registry entry, then add its flow definition and meaningful tests. Keep React and browser APIs out of the game logic.

The first mock keeps each subsystem in one application. These module boundaries can later be extracted into shared packages without introducing a monorepo toolchain now.

## Deliberate prototype behavior

- Player rooms have 3–5 seats. Spotlight rotates one factual and one favourite question per seat; Bluff gives each seat one target turn. The original four-player, two-round flow remains a developer fixture.
- Spotlight awards +100 for each matching factual answer or selected favourite. Equivalent answers share credit. AI bait appears only in favourite questions. Facts use curated text aliases, never semantic AI grading.
- Missing seats have a 15-second grace period, capped by the current action deadline; deterministic AI then earns points for that seat. Rejoining keeps those points and returns control next question if AI already acted.
- Local checkpoints use protocol 2 and expire two hours after creation. Web Locks protect one-tab ownership, with a checked expiring lease fallback. This is local simulation, not network reconnect.
- +100 correct guess, +150 per player fooled, −50 for picking an AI decoy. Targets observe voting; self-votes are blocked. Ties share rank. Other phases do not score.
- Self ratings and the friend ratings feed cards; scripted peer ratings trigger at most one callout when the largest gap exceeds 1.5.
- Bot answers and votes are deterministic. Unanswered prompts use a seeded fallback; skipped votes abstain. Input timeouts progress safely. Cards wait for an explicit approve/keep-private decision.
- Veto replaces a prompt. A second veto skips it. The content pack keeps all spice levels playful.
- Free-text prompts support real local audio or typing. Sliders and nominations use native controls.
- Recording lasts up to eight seconds, or three seconds during the short factual secret phase. The three-second review is followed by **explicit submission**, not automatic submission. The sample transcript is not inferred from the recording.
- Microphone access happens only on Start recording. Format support is detected. Ignored/denied permission can be bypassed by typing. Preview-perspective changes cancel and discard capture.
- Clips are never uploaded or persisted. Private preview is available to the speaker. Separate opt-in is needed for reveal/highlight playback and can be revoked before highlight playback. No raw clip is played during anonymous voting.
- PNG downloads require subject approval. Images are generated locally. No public link is created. Audio highlight is local playback for at most 20 seconds; no audio export is implemented.
- Same-room mode is a layout preview; there is no jammer. Couples, other packs, voice masking, streaming PCM, production moderation, accounts, and cross-device reconnect/multiplayer are later work.

## Browser and phone checks

Microphone access requires localhost or HTTPS. An ordinary HTTP LAN address on a phone will not grant capture. Serve through a trusted HTTPS development endpoint for real-device checks; no deployment is included.

Automated browser coverage uses Chromium with a synthetic audio device. It is not a substitute for Android Chrome or iOS Safari hardware checks. Physical Android and iOS microphone behavior has not been verified in this workspace.

## Design iteration checklist

Play through once without the workbench, then inspect individual phases with it. Note confusing instructions, time pressure, weak bluffs, missing feedback, and whether the final card is worth keeping. Change the relevant content, timing, rules, or renderer; rerun the affected tests. A six-to-eight-minute full timer path is a target, while an eager player can progress faster.

## Feedback and tracking

PROJECT_LOG.md records concise append-only milestones and revisions. Sound & feel settings are shared between Settings and the in-game help sheet. Vibration is optional and browser-dependent (not supported by iPhone Safari); urgency pulses only apply while your action is pending. Microphone capture and playback suppress effects. Reduced motion keeps stable reveals and scores. Screen wake lock is attempted only during visible active play and tolerates denial. Feedback adapters live in `src/media/feedback.ts` and `wake-lock.ts`; Spotlight content and matching are in `src/game/spotlight.ts`. Browser tests use simulated audio and vibration; they do not prove physical-device behavior.
