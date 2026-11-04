# Current online game flow

## Flow 4 — 5 November 2026, B048

New rooms/rematches use [clearer rooms and guided voice](ROOMS_AND_GUIDED_VOICE.md): invitations, resumable Leave game, definitive removal, owner lobby settings, per-player adult confirmation and multilingual question history. Normal gives 90 seconds for ratings, 45 for answers, 30 for choices and 15 for reveals. Relaxed reveals are also 15 seconds. Optional narration precedes the shared answer window. Points and AI cadence remain unchanged. Saved earlier runs retain stored flow/content.

## Current flow 2 update — 4 November 2026, B045

New rooms/rematches use ratings → nominations → AI opportunity → catchphrases/scored rounds → occasional callbacks → prediction → personalised closing → verdict/cards → rematch. Act 1 always offers the host a checkpoint. Mid-game opportunities occur after two scored questions, retry at the third only after a wait, and omit the last scored reveal. Two-player Bluff includes one after round one. Each exchange permits up to two different optional replies, one at a time, with a 60-second ceiling. Shared scoring is unchanged.

Ratings require deliberate choices and selections require Lock. Hold/release recording is followed by review and explicit Send, with two accepted recordings per answer/reply and one shared 15-second timed-phase grace. Same-room rematches retain up to 12 callbacks. [Interactive host specification](INTERACTIVE_HOST.md) gives the implemented conditions, language behavior and failure rules. The tables/descriptions below document the earlier baseline; conditional scripted callout, scripted story and 25-second Tap to ask apply to legacy saved runs, not flow 2.

Audited 31 October 2026 against [definitions](../shared/src/game/definitions.ts), [engine](../shared/src/game/engine.ts), [Spotlight rules](../shared/src/game/spotlight.ts) and [room service](../backend/src/rooms.ts). This is the protocol-3 online flow; local fixtures use different timings.

## Create, join and start

1. The human room owner chooses Spotlight (default) or Bluff, **2–7 seats**, Hostel 2 AM or Goa Trip, spice, and remote/same-room layout. Spicy requires the adult confirmation.
2. Backend creates a random six-character hexadecimal room code. Friends provide their name and that code; they inherit the host's settings.
3. Players chat and toggle Ready. The host has its own Ready plus a separate **Play** button. Play stays disabled until every configured seat has joined, is connected and is ready, including the host. A pending host conversation also pauses start.
4. The host can remove another guest in the lobby with confirmation. Capacity remains fixed; a replacement must join and ready. The removed guest identity cannot rejoin. Mid-match removal is not implemented.
5. Accepted Play freezes the match roster, schedules the start cue on engaged/unmuted devices and opens the trait sliders for everyone.

## Three acts and actual online deadlines

| Phase               | Who acts                                                                     | Current deadline / outcome                                                                   |
| ------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Traits              | Everyone rates self and one seeded assigned friend on three 0–10 traits each | 30 s; missing input is skipped                                                               |
| Two nominations     | Everyone nominates a seat                                                    | 10 s each; no points                                                                         |
| Conditional callout | Only the selected subject may defend                                         | 15 s; largest self/peer gap above 1.5, at most one callout; absent if no qualifying data/gap |
| Catchphrase         | Everyone types or records/edits a signature line                             | 25 s online; no points                                                                       |
| Spotlight factual   | Target privately locks, then everyone else guesses                           | 15 s lock → 25 s guesses → 8 s reveal                                                        |
| Spotlight favourite | Others answer, then target judges anonymous grouped options                  | 25 s answers → 10 s judge → 8 s reveal                                                       |
| Bluff target turn   | Everyone submits; target supplies truth; others imitate                      | 35 s answer → 2 s sealing → 25 s vote → 8 s reveal                                           |
| Prediction          | Everyone votes simultaneously                                                | 15 s input; then a separate 5 s results window, no points                                    |
| Story               | Scripted roster-aware narrative                                              | 20 s; host can continue early                                                                |
| Verdict             | Shared ranks/scoreboard                                                      | 10 s; host can continue early                                                                |
| Friend Card         | Each connected human approves or keeps their own card private                | Untimed; advance when connected human seats have decided; stand-ins never approve            |
| Summary / rematch   | Export/save approved artifacts, local highlight, host rematch                | Untimed; rematch creates a new run and resets readiness/scores                               |

Required input phases finish early when all required participants submit or pass. Reveal/presentation phases have deadlines and host continuation controls. Recording is capped at five seconds for factual locks and eight seconds elsewhere; capture is followed by editing and explicit submission. Timers are code configuration, not host-editable settings.

The displayed duration estimate sums configured phase durations. It includes the possible callout, excludes lobby/card waits and conversations, and does not include the extra five-second prediction reveal. Early submissions shorten play; prompt replacement adds time. With these settings the nominal sums range from about **5.3 to 12.9 minutes for Spotlight** and **4.6 to 10.4 minutes for Bluff** at 2–7 seats (317–772 seconds and 275–625 seconds respectively). The original six-to-eight-minute target is not a guaranteed duration.

## Spotlight scoring

A seeded shuffled roster gives each seat one factual and one favourite question, paired in that rotation: `2 × seat count` scored questions. All other seats contribute in each question.

- Factual: normalized text plus curated aliases, no semantic model grading. Every matching contributor earns **+100**.
- Favourite: target selects an anonymous answer group; every human contributor to that group earns **+100**. AI bait alone gives nobody points. Identical bait cannot remove matching human credit.
- Target does not score for judging. Contributors may pass; judge may choose None fit. Missing lock skips the factual question without scoring; missing guess/judgment yields no reward for that missing action.
- Pending actors can replace a prompt once in supported input phases. Submissions clear, epoch advances and the question restarts. A second veto skips scoring. There is no veto action in the favourite judging phase.
- Reveal shows winning answer/reason, deltas and updated standings. Tied scores share rank; there is no streak bonus.

Example with A, B, C and rotation C → A → B: C locks Blue; A guesses blue and B black, so A earns 100. C then chooses B's favourite answer, so B earns 100. A and B receive their own pairs next. Each player targets two questions and competes in the other four. The same rule scales to 2–7 seats.

## Bluff scoring

Every seat receives one target turn. The target's answer is truth, the other submissions are imitations, and one scripted decoy is added. Before reveal there are neutral options with no authors/truth/AI labels; the target observes voting and contributors cannot choose their own option. With all submissions, show `seat count + 1` options, up to eight at seven seats. The original five-option cap is superseded.

Correct truth vote: **+100**. Each opponent fooled by a human imitation: **+150** to its author. Choosing the decoy: **−50**. Scores commit before animation. Nominations, callout defenses, catchphrases and prediction do not score. Wildcard remains a working optional local/developer module; online creation currently never enables it.

## Presence, host and voices

Disconnected seats remain reserved. After 15 seconds or the action deadline, whichever comes first, deterministic scripted actions fill missing input. Locked human actions survive; replacement-earned points are attributed to the seat as AI points. Return before a replacement acts restores control; after it acts in the question, the human waits until the next question. Earliest eligible connected human takes host duties after grace. These stand-ins make no LLM calls.

Tap to ask is available in lobby, Bluff/Spotlight reveal and summary. One speaker claims a 25-second pause. Cancelling an unsent request returns the slot; submitting consumes that phase's exchange. The host uses scripted replies until a selected DeepSeek or Gemini key is configured and live AI is enabled. The selected LLM receives the question and public phase/names/scores/rules, not private answers; automatic commentary comparing friends' submitted answers is not yet implemented. Narration captions/templates are separate from the human room owner's moderation controls. In same-room mode only an elected playback seat plays host audio; spoken secrets should be typed because noise suppression cannot stop nearby people hearing them.

Real online rooms require the server. Offline devices show connection loss; they do not advance a local copy. Two hours after run creation, resume access ends. Refresh restores accepted server state through the cookie identity, not unsubmitted drafts or local recordings.

## Returning to the squad — 3 November 2026

At summary every player gets **Back to lobby**, independently of the host. This is a presentation of the completed room: the server remains at summary, scores are visible, chat is open, and **View results** returns to the receipts. Browser Back dismisses this view before leaving the room. Only the host sees **Run it back**; it creates a fresh run in the same room, resets scores/readiness and preserves the latest 50 chat messages. Everyone must ready again and the host must press Play. Chat is hidden/disabled during the active game, preserved in its private snapshot, and reappears at summary. Duplicate names receive distinct numbered room labels without changing their saved profiles.
