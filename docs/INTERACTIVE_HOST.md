# Interactive host and multilingual answers

5 November 2026: B048 adds flow-4 spice direction, separately budgeted authored narration, spoken choices, pace and room question history. The validated Gemini/DeepSeek contract and host cadence remain. See [clearer rooms and guided voice](ROOMS_AND_GUIDED_VOICE.md); older run behavior below remains versioned.

Implemented 4 November 2026, B045 implements B044. The **online host flow remains version 2**, now transported through **socket protocol 5** under B048. Existing saved runs retain their previous gameplay flow and pinned content. Rematches create new runs using gameplay flow 4. Offline demo remains scripted practice.

## Player journey

Both Spotlight and Bluff support 2–7 seats: self/friend ratings, two nominations, first host opportunity, catchphrases, scored rounds with occasional host opportunities, prediction, personalised closing, verdict/cards, summary and rematch. Existing score amounts and pack structure remain unchanged.

Act 1 combines ratings and nominations even when friends agree. A mid-game opportunity follows two scored questions. If the model waits, another follows the third; speaking, or waiting at the third, resets the interval. The final scored reveal has no extra interruption before closing. Two-player Bluff has an opportunity after its first round. The server claims each checkpoint once.

Most moments are one short line. The host may invite two different connected human players, one at a time. Each may type, record, pass or report microphone trouble. Reply windows last at most 20 seconds; the whole exchange has a persisted 60-second ceiling. The model cannot change points, permissions or arbitrary game state. Missing allowance, invalid output or provider failure lets the match continue.

## Prompt and context

`backend/src/host-context.ts` contains `HOST_PROMPT_V2` and small Act 1, mid-game, reply and closing instructions. Act 1 incorporates rematch memories when relevant. The voice is an affectionate, specific, sarcastic friend: connect actual choices, vary targets, acknowledge good bluffs and wait on weak material. Turns are instructed to stay under 40 words; the schema also caps characters. Humour requires a group playtest.

Context contains released ratings/nominations, catchphrases, scored rounds, original/confirmed answers, standings, confirmed host replies, outcomes, recent host lines and eligible invitees. Unrevealed answers, unfinished transcripts and translation drafts are excluded. Controller provenance identifies scripted stand-ins, which must not become claims attributed to friends. Pass, blank recognition, timeout and STT failure are distinct. Player text is untrusted game material, never instructions.

The accepted result is `decision` (`speak`/`wait`), `text`, supporting `evidenceIds`, nullable `inviteSeat` and nullable `memory`. Evidence IDs must exist and invitees must be eligible. Unknown scoring/command fields are rejected. Gemini uses JSON MIME type plus a JSON schema; DeepSeek uses JSON object mode with the same server validator. Only the configured provider is called. Gemini 3.5 Flash-Lite receives explicit `MINIMAL` thinking; there is no automatic paid model/provider substitution. Translation has a separate instruction/schema preserving meaning, names and intent without embellishment or obeying embedded instructions.

## Controls and recording

The 0–10 sliders start unanswered. They have visible values, endpoints, enlarged thumbs/touch targets, keyboard control, increment/decrement buttons and explicit midpoint choices. Complete “You” before “Your friend”; six untouched defaults cannot be submitted. Nominations, votes and predictions select first and lock explicitly. Phase-scoped tab-private drafts survive resize, refresh and reconnect and expire after two hours.

The common `VoiceInput` serves answers and host replies:

1. Enable the microphone before a usable recording gesture.
2. Hold to speak, or use keyboard/tap Start and Stop.
3. Release immediately stops capture while transcription finishes.
4. Review/edit original text and, if needed, gameplay translation.
5. Explicitly Send. Release never submits.

Elapsed time and completed speech segments appear during recording. Cancelling permission/setup cannot start a late microphone. Pointer cancellation, backgrounding, loss of connection/seat ownership and phase unmount release capture. Failed online STT never substitutes sample text. Factual-lock recordings cap at five seconds; others at eight. The fixed three-second review delay is removed.

There are two accepted recordings per answer/reply: initial plus one re-record. The server persists acceptance on the first audio frame, so refresh/language changes cannot reset it. Failures before capture do not consume the server allowance; accepted empty recognition does. Editing, typing and passing remain available afterward.

A timed phase with voice work pending receives one **shared 15-second grace period** from its original deadline. Cancelling unfinished capture or submitting an answer clears its pending flag. Host replies never extend their overall 60-second ceiling.

## Languages and scoring

The owner selects English (`en`), Hindi (`hi`) or Hinglish (`hinglish`) for prompts and host speech. Navigation remains in its current language. Both packs have authored variants and stable question IDs; each run pins its chosen content snapshot. Players separately save microphone language English (`en-IN`), Hindi (`hi-IN`) or Telugu (`te-IN`). Every Gnani recording supplies that locale with `transcribe`, replacing the legacy global Hindi/transliteration default.

Cross-language answers show editable original and gameplay text before Send. Translation runs after recording or explicit Review, never on each keystroke. Editing the original/language invalidates old translation; late responses cannot overwrite edits. Manual gameplay text remains available on failure. English input is directly usable in English/Hinglish rooms, Hindi in Hindi rooms; other combinations require review.

Only confirmed gameplay text is scored. Unicode normalization, terminal-punctuation removal and question-scoped curated multilingual aliases determine factual equivalence. The LLM never awards points. Friends see original/confirmed texts only at an allowed reveal; confirmed host replies appear publicly in the exchange.

## Durable work, budgets and memory

`HostDirector` owns checkpoints/turns, `GnaniProviders` transport, and `AnswerPreparation` private translation. Row-locked PostgreSQL transactions claim and publish work; **provider requests never hold a transaction open**. Normal play dispatches immediately; the existing pg-boss `host-director` queue recovers due work. Only due rooms are queued, with a singleton key per room.

Run/checkpoint/turn identities, persisted claims and unique usage operations prevent duplicate accepted dispatches. Timed-out work is not blindly reissued. Changed run/phase/turn/deadline results are discarded. Reply CIDs check a body hash on replay. This prevents our duplicate requests; a remote provider can still charge for cancelled work already dispatched.

LLM/translation deadlines are five seconds; TTS is eight. Captions publish first. One authenticated room audio asset is generated per utterance and shared under existing remote/same-room playback rules. Reconnect snapshots, including audio arriving later for the restored exchange, do not autoplay. TTS failure leaves captions usable.

Host, translation and speech allowances are separate. `AI_PROFILE=smoke` defaults to 60 reserved STT seconds, 1,000 TTS characters, four host calls and 12 translation calls. `full-match` derives ceilings from roster size, rounds, host opportunities and two recordings per answer. Exact conservative formulas live in `backend/src/usage.ts`; these are not price estimates. Diagnostic speech and the AI stop switch remain separate.

At most 12 compact callbacks live in `rooms.host_memory`, with supporting events, involved seats, run ID and creation/recent-use times. Delivered captions update memory without an extra summarisation call. Same-room rematch preserves it; another room starts empty. Removed-seat callbacks are excluded. End-room and expiry purge it.

## Compatibility and operation

Apply `0005_interactive-host.sql` using `npm run db:migrate`. Run JSON holds the exchange/deadlines, recording counts, translation preparation, confirmed sources/outcomes and reply receipts. Provider credentials remain server-side.

Protocol 4 adds host state/replies, language settings, original/confirmed submissions and private transcript segments. `POST /api/v1/rooms/:roomId/translate` authenticates the seat and checks run, epoch and optional host turn. Older clients receive a refresh-required error. The PWA cache is `v12-host4`.

After a fresh build and stopping an existing server, use `node scripts/playtest.mjs --voice --full-match` for HTTPS playtesting. Omit `--full-match` for bounded smoke allowances. Health flags indicate configuration, not responsiveness. The earlier B043 temporary HTTPS process is stopped; never reuse an old invitation blindly.

From `backend`, opt-in synthetic qualification is `node --import tsx --env-file=.env src/verify-interactive-providers.ts --live`. It writes ignored `.data/interactive-provider-verification.json`. `--diagnostic` allows one host case 15 seconds without changing gameplay deadlines; `--simple` checks one five-second greeting. Use synthetic material only.

See [verification and remaining acceptance](../work-log/verification/2026-11-04-interactive-host.md). Human speech, two real devices, match/rematch completion and subjective humour are separate acceptance checks.
