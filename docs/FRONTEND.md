# Frontend connections and browser data

## Room and voice controls — 5 November 2026, B048

`/join/[code]` resolves invitations, accepts a name or resumes membership. Homepage recovery refreshes every 15 seconds while visible and on focus. Typed errors distinguish removal/expiry, network failure and another-tab control. Lobby character edits are modal and settings reset readiness. Compact question-first screens use hold/review/send and deterministic spoken choices. Results prepare approved PNGs before Share; Download and cancellation stay in-place. Host voice is saved separately from effects. Protocol 5 and cache `v13-guided5` supersede the dated baseline below. [Behavior and evidence](ROOMS_AND_GUIDED_VOICE.md).

## Interactive controls — 4 November 2026, B045

The existing theme/characters remain. Ratings use unanswered nullable values, explicit midpoint and +/- alternatives, large range controls and self/friend completion steps. Nominations/votes/prediction use select-then-lock cards. `session/phase-draft.ts` stores tab-private phase-scoped drafts with a two-hour expiry for resize/reload/reconnect.

`features/voice-input.tsx` is shared by answers and host replies: preflight permission, hold/tap/keyboard recording, immediate release, private completed segments, two recording attempts, editable review, explicit Send and cross-language original/gameplay fields. `features/host-moment.tsx` displays captions, optional invitations/replies and shared audio. Restored host exchanges suppress autoplay, including audio arriving after reconnect. Language preferences are separate from navigation; room setup chooses host/question language.

Protocol 4 and PWA cache `v12-host4` prevent old cached clients silently interpreting the new messages. [Current specification](INTERACTIVE_HOST.md) and [verification](../work-log/verification/2026-11-04-interactive-host.md) distinguish browser checks from the pending real-phone exercise. Older UI descriptions below are dated history where superseded.

Audited 31 October 2026. Next.js/React/TypeScript, CSS Modules, shared Zod contracts, Lucide SVG icons. The appearance follows the preserved [design reference](../frontend/color%20palette/DESIGN.md). Fonts are bundled. The November 3 adaptive shell uses a centered frame up to 1200px, or a saved 430px compact view, with scrollable panes and a stable action dock.

## Routes

| Route              | Current purpose                                                                     |
| ------------------ | ----------------------------------------------------------------------------------- |
| `/`                | Dossier/SUSPECT opening, real host setup or name/code-only join, resume entry       |
| `/play`            | Active selected session: online or explicitly chosen demo                           |
| `/profile`         | Local name/bio/avatar/color and saved character information                         |
| `/collection`      | Explicitly saved approved cards, local to this browser                              |
| `/settings`        | Sound, timer alerts, vibration/test, reduced motion, wake lock and install guidance |
| `/demo`            | Clearly separated offline simulated practice                                        |
| `/dev`, `/preview` | Developer fixtures/perspective controls in development; `notFound()` in production  |

Development and player sessions are separate instances. The original compact two-round Bluff fixture remains available to developer tools. Production exclusion means routes return 404; it is not a claim that every reusable mock module is absent from the client build, since `/demo` needs the mock engine.

## Session and rendering boundaries

[SessionProvider](../frontend/src/session/provider.tsx) owns shared browser services. [NetworkSession](../frontend/src/session/network-session.ts) performs asynchronous HTTP/socket operations for real rooms. [MockSession](../frontend/src/session/mock-session.ts) runs the local simulator and optional checkpoint. Both feed the existing phase renderers through [Game](../frontend/src/features/game.tsx).

Online actions remain pending until an accepted ack and its state revision arrive. Duplicate messages reuse intent IDs; disconnect disables authoritative actions. Online clients never advance themselves or recover another person's seat from a name/code. The adapter recovers rooms using the HttpOnly guest cookie and backend resume list; it does not save the server's private game state in browser storage.

Phase renderers receive the viewer's permitted data and send intents. Layout/controls live under [ui](../frontend/src/ui), phases under [screens](../frontend/src/features/screens), English interface text in [ui.en.ts](../frontend/src/content/ui.en.ts), game dialogue/content under [shared/game](../shared/src/game). Change scores/timing/rotation in shared definitions/engine, not in a screen component. See [game flow](GAME_FLOW.md).

## Device storage and media

### Character builder and branding — 3 November 2026

`/profile` uses the reusable [character builder](../frontend/src/features/character-builder.tsx): male/female style, four skin tones, four outfits, five eyes, five mouths, seven hairstyles, five glasses choices, five earring choices and four necklace choices. Accessories are independent and include a None choice for each slot. The five backgrounds are Marigold, Lavender, Terracotta, Sage and Sky. Selecting a category keeps the same editor and draft mounted; option previews use the actual avatar renderer. Randomise changes the whole appearance and background, guarantees a different appearance from the current one, and preserves name/bio. Changes are saved only through **Save my character**.

The [shared appearance catalog](../shared/src/game/appearance.ts) defines a stable numeric encoding. Legacy IDs 0–3 still load; customised IDs 4–560003 encode every part without changing the existing profile, seat or card shape. Catalog order/radices are immutable for this format; future format extensions need a new ID range. The same validated SVG renderer is used in the editor, roster, headers, cards and approved PNG downloads. Names never enter SVG markup and colours are validated before interpolation. Existing saved cards retain their appearance IDs; editing a profile does not change a previously approved card or active room seat. Legacy characters are drawn with the updated artwork.

The supplied gold lips/waveform and EXPOSE wordmark are extracted into transparent artwork under `public/brand`. Headers use a horizontal lockup; PWA, Apple and favicon assets use the approved yellow tile with dark corners and black mark (B034). The Android maskable variant extends the yellow background to the edges and keeps the mark within the safe area. Public shell cache v11 includes both brand images and versioned yellow-icon URLs. Unnecessary provider branding is removed from headers, metadata, host UI and exported filenames; the online transcription disclosure still names Gnani. Installed icon refresh timing is controlled by the browser/OS; physical installed-app updates have not been verified for this revision.

- `gnani.player.v1`: profile including local bio, adaptive/compact layout, dark/light theme and sound/feedback preferences and at most 12 approved saved cards. The guest API syncs name/avatar/color, not bio or card collection.
- `expose.playMode`: online/demo selection only.
- `gnani.session.v2`: versioned, two-hour offline-demo checkpoint. This is separate from protocol-3 server recovery and excludes recordings.
- Online credential: `expose_guest` HttpOnly cookie, unavailable to browser JavaScript. Pending intents remain in memory. Unfinished online answer/transcript text uses tab-scoped `expose.answer-draft.v1` sessionStorage keyed by match, seat, step and phase epoch, with two-hour expiry; recordings remain memory-only. Recovery validates the current server question before displaying text and never submits it.
- Public service worker cache: `gnani-public-shell-v11`, public routes/build assets/fonts/icons; API/audio responses are not cached.

Offline capture uses MediaRecorder and explicitly labelled sample transcripts. Online capture switches to [NetworkAudio](../frontend/src/media/network-audio.ts), AudioWorklet PCM and server transcription. Both require explicit record actions, editable text and explicit submission. Typing remains available when recording fails. Capture/private playback are transient unless separate reveal/diagnostic consent permits an upload. Ordinary online STT still transmits speech to the backend/provider; “not stored” does not mean “not sent.”

Friend Card/rap-sheet PNGs are generated client-side after subject approval. Local saving is explicit. Highlight preview is up to 20 seconds of the local player's opted-in in-memory clips; it is not a mixed squad recording or downloadable audio export. Reload does not restore those local recordings. Consented remote clips have separate authenticated reveal playback.

## Interaction behavior and limits

The lobby has host-only Play/removal, a Ready toggle for every player, and a stable chat composer with smaller sender labels. Play requires every configured seat to be present, connected and ready. Ask uses the shared dialog: outside tap, Escape, X or Back closes it, stops capture and requests server cancellation.

Feedback is centralized in [feedback.ts](../frontend/src/media/feedback.ts) and [sound-effects.ts](../frontend/src/media/sound-effects.ts). Accepted start schedules a 500 ms generated cue. Timer haptics only run for a pending local action: at 5 seconds `40`, 3 seconds `50`, 2 seconds `[40,60,40]`, 1 second `[60,50,60]`, expiry `60` milliseconds (arrays alternate vibration/pause). These replace the shorter original proposal. The diagnostic requests `[120,80,120]`; browser acceptance alone does not establish physical vibration.

Sound/vibration settings are independent. Capture, playback, backgrounding, navigation and already-submitted states suppress inappropriate effects; reduced motion has stable equivalents. Wake-lock rejection is tolerated. Healthy online sockets remain connected when the tab is merely hidden; actual socket loss/page exit/lease expiry follows server presence rules. Mobile browsers may still suspend a hidden process.

Browser checks cover 320/375/430/1440 px and selected enlarged-text/keyboard scenarios. Physical Android evidence is narrower and iPhone remains untested; see [status](STATUS.md). PWA installation events tested in Chromium do not prove installed behavior on every phone. A new temporary tunnel hostname creates a new cookie/storage/PWA origin.

## Adaptive shell — 2026-11-03

The saved `layout` preference defaults compatibly to `adaptive`; `compact` caps the frame at 430px. The adaptive frame caps at 1200px. At 768px and at least 500px height, lobby roster/chat and question/standings use adjacent panes. CSS changes the existing tree without remounting an answer or opening another socket. Outside play, navigation becomes a rail at 1024px. During play, navigation is limited to room/progress, sound, help/settings and a shared leave confirmation. The action dock belongs to the question pane; lobby chat retains its own composer. [Lifecycle and network update](ADAPTIVE_APP.md).

## Room UX and warm light theme — 3 November 2026

B035/B036: summary reuses the existing lobby for an independently selected post-game view; it does not send an advance/restart intent on entry. Run it back stays host-only and retains chat. The chat list uses natural scroll chaining: short/empty lists allow the surrounding page to scroll, long lists scroll internally until their boundary. Entry action spacing is 14px to separate buttons and focus rings.

Settings and the in-game settings sheet share a light/dark button. Dark remains the default; light uses parchment/cream surfaces, ink text, brass accents and marigold actions. Semantic tokens cover the shell, controls, chat and character editor; fixed evidence-card colours are retained. The saved preference is applied by a small guarded script before hydration to avoid a dark flash and stays local to the device. Storage failures keep the in-memory preference usable. No game API call is made by changing theme.

## First sound audition — 3 November 2026

B037 uses the supplied traditional-stamp sample for the first SUSPECT entrance and the supplied funny/comedy/sneaky track as the first ambient-music candidate. Ambient playback is limited to non-game app pages, loops at a maximum volume of 12% (6.3% with the default Effects volume), and follows the existing sound toggle and volume control. It pauses while hidden, during capture/playback suppression, on match screens and on disposal. The stamp is capped below 45% and plays once with the first entrance; browsers that block autoplay retry it from the first user gesture. This audition adds no provider or API traffic.
