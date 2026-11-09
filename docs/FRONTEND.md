# Frontend connections and browser data

## Guest Void entry — 9 November 2026, B071

The signed-out landing defaults to **Continue as guest**, followed by mic preparation or the existing typing alternative. The first-entry disclosure explains retained server data and browser-only access recovery. The guest endpoint accepts that consent and returns a typed guest identity; no Google redirect or extra signup form occurs. Returning guests see Enter The Void, a browser-profile label and private history. An optional Google button appears only when configured. Browser Web Locks serialize guest bootstrap between tabs where available; cookies persist the profile after refresh. Settings → Leave guest profile opens a confirmation explaining loss of access, then revokes the guest token and releases voice. Shared Google sign-out remains separate. No microphone, transcript, provider or scoring logic changed. The admin explorer's denied state links to The Void without granting guest admin access.

## Void entry — 9 November 2026, B070

The landing uses **Enter The Void** for signed-out and signed-in visitors, with the same voice/type preference. Signed-out entry redirects to `/api/account/v1/auth/google?returnTo=/void` before microphone preparation or session creation. The signed-in entry retains versioned retention onboarding and browser microphone permission. Missing Google configuration is explained with a short inline unavailable message only after clicking; cancelling sign-in returns a recoverable message. The landing no longer contains the disabled Google link or developer setup instructions. Authentication and admin explorer rules are unchanged.

## Account and graph interface — 9 November 2026, B069

Profile now includes Google account controls, explicit browser-player linking, linked room recovery and saved match results. My cards adds account-backed approved cards and explicit local imports. `frontend/src/account` owns neutral account UI/sync; `frontend/gc2` retains Void and adds processing/history, summary approval and Cytoscape explorer. `/void/explorer` is a thin Next route backed by server admin enforcement. Closing the shared Settings screen returns to the explorer. The explorer includes source/person/session/group/search filters, two connection views, a list/detail alternative and a 500-story rendering bound. PWA cache v18 excludes private API and Void responses. Google-unconfigured state has no local bypass. See [current flow](ACCOUNTS_AND_STORY_GRAPHS.md).

## Three-section navigation — 7 November 2026, B066

Main navigation is **Play → The Void → Profile**. `/` renders the friends-game entry directly; `/friends` remains an alias. The Void keeps its own header and now has the shared bottom/desktop-side navigation. Switching sections during an unfinished Void conversation uses its existing leave confirmation and releases the microphone on confirmation.

Profile includes Character and My cards links. `/profile/cards` renders the existing collection, with Profile remaining selected in main navigation. `/collection` redirects there; local card data, approval, download and removal are unchanged. The former home-page card teaser is removed.

The global header Settings control is a labelled button with expanded state. Opening it remembers the originating section; pressing it again returns there. The remembered route is restricted to known local sections, with Play as the fallback for direct settings entry. PWA public-shell cache is v17; private Void data remains excluded.

## Direct localhost entry — 7 November 2026, B065

When `/me` reports `localTesting`, `/void` replaces Google entry with consent and Enable microphone/Type controls. First entry obtains a browser-scoped session from `/auth/local` before creating the conversation. The UI labels local testing and explains that clearing cookies or leaving the session loses access to its history. Voice/provider behaviour remains unchanged. The public shell cache advances to v16.

## The Void — 7 November 2026, B064

`/` selects between friends and solo; `/friends` retains the existing party-game landing. `/void` mounts `frontend/gc2` with its own microphone, canvas and history/reveal screens. GC2 input-mode and microphone-language preferences are saved locally; microphone enabling remains explicit per session. Conversation content is fetched from authenticated APIs and is not cached offline. The Void suppresses Game 1 ambient sounds, uses its own exit handling and hides the party-game chrome. PWA refresh offers are deferred on this route. See [The Void](THE_VOID.md) for UI and browser evidence.

## Optional hands-free input - 5 November 2026, B051

`VoiceInput` shares a session-owned `PreparedMicrophone` through `NetworkAudio`/`LocalAudioService` for game answers and invited host replies. A saved input mode selects Hands-free, Hold or Type; mic readiness remains session-only and requires Enable microphone. Hold/tap/keyboard capture retains explicit sending. Hands-free exposes listening/capture/transcription/review and a cancelable two-second auto-send countdown. Translation and unique curated choice matching finish before countdown. Editing/manual choice selection cancels it; continued speech appends using the remaining attempt; Retry replaces the draft. Cap-hit, empty/ambiguous/failed input stays manual. Both room arrangements allow hands-free secret answers; nearby voices are not identified.

AI playback and presentation state pause listening, including a renewable same-room lease and 300 ms settling. Music/effects are suppressed while listening/capturing. Mute/background/leave/removal/takeover stop resources; phase changes cancel unfinished speech. VAD loads lazily from local assets and falls back to hold/typing on failure. Two accepted captures and server-supplied five/15-second caps replace per-widget assumptions for new runs. The rating midpoint button reads **5** and still deliberately selects a previously unanswered slider.

Player audio playback/reveal/share/delete/receipt UI is removed; editable text, AI voice and approved PNG sharing remain. PWA cache is `v14-handsfree6`; protocol mismatch requires refreshing. Game scoring, packs, room language and host personality are unchanged. Asset copying runs during development/build/start; see [voice](VOICE.md) and [setup](SETUP.md). Physical-device acceptance is tracked separately in [status](STATUS.md).

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
