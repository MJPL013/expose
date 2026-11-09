# Voice, host and provider evidence

## Guest entry — 9 November 2026, B071

The Void can establish a browser guest before preparing the existing microphone and opening the owned GC2 socket. Google is optional; mic permission is still explicit. Silero/Gnani, original audio storage, live companion, post-Finish analysis and all voice limits are unchanged. Guest logout closes its active Void sockets and pauses the client. Different guest browsers cannot read each other's sessions or AI audio. This entry change does not establish new live-provider or physical microphone evidence.

## Longer Void conversations — 9 November 2026, B069

New GC2 sessions retain prepared Silero/Gnani capture, paced frames, a two-second startup buffer, playback pauses/echo settling and 60-second utterance protection. They allow 20 minutes captured speech within 30 active minutes, 80 conversational calls and 60,000 TTS characters. Explicit pauses stop the active clock. Captions precede TTS; Finish queues transcript-only deeper analysis. Retained raw audio is private evidence storage, not input to the persona model. First-entry retention disclosure is versioned per account. Capture/STT/caption/audio metrics remain separate; background job durations now have separate persistence. See [provider roles and evidence boundaries](ACCOUNTS_AND_STORY_GRAPHS.md). Game 1's no-recording-playback policy is unchanged.

## The Void — 7 November 2026, B064

GC2 reuses the prepared microphone and Silero v5 through an independent controller: hands-free or tap-to-talk, speech-scoped Gnani STT, paced binary frames, automatic completed-turn submission, 60-second utterances and eight minutes of session speech. AI playback pauses recognition with a 300 ms settling interval. Capped speech offers Continue/Send. GC2 explicitly stores accepted recordings until deletion; the Game 1 no-player-recording policy below remains unchanged. See [The Void](THE_VOID.md) for budgets and synthetic VAD measurements. Real-provider/physical speech evidence is still outstanding.

## Hands-free Game 1 - 5 November 2026, B051

This section supersedes earlier capture/playback descriptions below. New rooms and rematches persist `voiceInputVersion: 2`; saved older runs retain manual sending and their five/eight-second caps. Game 2 and friend-to-friend voice chat are not included.

Each player chooses **Hands-free / Hold to speak / Type**. The preference is saved, but microphone permission/readiness must be explicitly enabled in each browser session. Hands-free is available in remote and same-room play, including secret answers. Ratings remain manual. Only eligible answer/choice/invited-reply controls arm recognition; waiting, completed answers, narration presentations and reveals do not.

Hands-free: local speech detection -> capture -> final transcription -> translation/unique deterministic choice match when needed -> visible two-second countdown -> submission. Editing, language changes, cancel, manual choice clicks, empty recognition, ambiguity and translation failure prevent automatic sending. Speaking again during the countdown uses the second attempt and appends; Retry replaces the draft and rearms hands-free without opening STT during silence. Two accepted recordings are allowed per answer/host reply. Refresh, reconnect and language changes do not reset the server allowance. Hold mode uses release-to-stop and explicit Send. Creative answers, catchphrases and host replies have a 15-second cap; factual answers and spoken selections have five seconds. Reaching a cap requires manual review. Existing phase deadlines, the single shared 15-second finalisation grace and 60-second host ceiling remain.

`PreparedMicrophone` owns one foreground stream, audio context and PCM worklet. Enable mic prepares these and an authenticated browser/backend audio socket without opening provider STT or charging an attempt. Prepared hold capture starts locally; hands-free includes a short pre-speech buffer. At most 62 queued frames (1.984 seconds) wait for provider readiness. Overflow fails visibly; frames drain one per 32 ms without a catch-up burst. Accepted capture is counted transactionally on its first valid server audio frame. Each provider session has ownership/phase checks, duration/concurrency limits and a metered capture ID. Idle preparation expires without a provider session. Mute, leaving, backgrounding, removal and takeover release the microphone; normal phase changes discard unfinished capture and revalidate before rearming.

Silero v5 runs locally through pinned `@ricky0123/vad-web@0.0.31` and `onnxruntime-web@1.22.0`. Model/worklet/WASM assets are served from `/audio/vad/`, copied by `scripts/voice-assets.mjs` on dev/build/start, and loaded only after enabling voice. Initial configurable boundaries in `prepared-microphone.ts`: positive 0.6, negative 0.35, minimum speech 250 ms, pre-speech 400 ms and silence 1,000 ms. These require physical-device tuning. See [VAD stream/asset documentation](https://docs.vad.ricky0123.com/user-guide/browser/) and [Gnani framing](https://docs.gnani.ai/api/STT/stt-websocket).

AI playback pauses listening until playback and the server presentation window finish, followed by 300 ms settling. Same-room playback reports a short renewable server lease from the designated device; all players pause while it is active. Readiness alone does not block AI audio. Music/effects are suppressed while listening/capturing. No AI interruption or speaker identification is implemented; nearby friends can trigger same-room VAD. VAD errors leave hold/typing available. Gnani commit qualification/configuration is unchanged.

Player recording previews, reveal clips, sharing/consent controls, recording deletion controls and audio receipts are removed. Ordinary answers create no WAV/object URLs and retain only transcripts plus temporary processing buffers. The retired clip-upload endpoint rejects new uploads, including legacy matches. Old stored media keeps existing access/expiry rules; explicitly consented diagnostic capture is separate. AI audio and approved image-card sharing remain. Host/translation/narration budgets are separate; full-match STT ceilings account for two longer captures per eligible input, while smoke limits remain bounded.

Implementation is not physical acceptance: see [current evidence](STATUS.md). No new real-provider request or physical PC/phone multilingual match has been claimed for B051.

## Guided voice — 5 November 2026, B048

Optional authored question/choice TTS accompanies AI moments without an LLM readout. One clip is shared per utterance with same-room playback ownership, Replay and Host voice control. Presentation precedes answer timing; TTS has an eight-second deadline and failure gets a five-second reading window. Narration reserves separate `narrationCharacters`. Reviewed STT selects visible choices deterministically. Remote answers default to voice, same-room answers to typing. [Implementation/evidence limits](ROOMS_AND_GUIDED_VOICE.md). Mocked providers/synthetic input checked this revision; these do not supersede live-provider evidence below.

## Current voice flow — 4 November 2026, B045

New online runs use one hold/tap/keyboard recorder for answers and host replies: permission → capture → release → final STT → editable review/translation → explicit Send. Capturing stops immediately on release/cancellation. Two accepted recordings are allowed per answer/reply; no online fallback sample or three-second review delay. The server supplies a single shared 15-second grace at a timed answer deadline, while host exchanges remain bounded by 60 seconds.

Each recording selects English, Hindi or Telugu with Gnani `transcribe`. Room host/prompts select English, Hindi or Hinglish. Cross-language text is translated only after recording or Review, displayed beside the original, and player-confirmed. Manual correction survives translation failure. Host generation is automatic at eligible checkpoints; translation and host use separate prompts/allowances. LLM/translation timeout is five seconds, TTS eight. Captions publish before the room's single shared utterance clip. Reconnect never automatically replays that clip.

Two synthetic English trials qualified the account's `commit` message: finalisation about 0.35/0.41 seconds versus about 3.00/2.99 seconds with the legacy method. STT configuration returned English/Hindi/Telugu locales. Synthetic English TTS completed in about 1.1 seconds. This does not establish human speech quality or physical-device behavior. `GNANI_STT_COMMIT=false` remains the conservative default; opt in after the desired account/language qualification. Effective speech model was not identified by the configuration response.

Current live Gemini host scenarios timed out at five seconds; a diagnostic case also timed out at 15 seconds and a simple greeting at five. One Hindi translation succeeded in an earlier trial; Telugu and the later translation trial did not complete. No live DeepSeek request was made. The previous B043 Gemini success below remains historical, not current acceptance. Full evidence and remaining checks: [verification](../work-log/verification/2026-11-04-interactive-host.md). Transport/contracts/configuration: [interactive host](INTERACTIVE_HOST.md). The earlier scripted/25-second host paragraphs below apply to legacy runs.

## Current Gnani integration — 4 November 2026

The application connects to Gnani in three separate paths: Prisma streaming STT for an explicitly recorded answer or host question, Timbre TTS for scripted narration and host replies, and batch STT for consented diagnostic comparisons. Gameplay scores, decoys, stories and disconnected-player actions still use the shared rules and scripts. Tap to ask can use a selected DeepSeek or Gemini HTTPS API after its backend key is configured; otherwise it uses a scripted reply. No browser code holds a provider credential.

The earlier B039 bounded live probe connected STT with requested `prisma-v3.0`, `hi-IN`, transliteration and 16 kHz; 2.048 seconds of synthetic silence yielded no speech. A short Timbre request returned 42,284 WAV bytes (0.88 seconds). Neither response identified the effective model. This confirms endpoint/credential compatibility only. It does not verify live speech accuracy, Android microphone behavior, DeepSeek/Gemini access, billing units, or a complete voice match. Probe evidence: [sanitized result](../work-log/verification/provider-probe-c92695d2-abd5-4001-a6b5-bd69ed252f63.json).

The B043 HTTPS playtest reports `liveVoice:true`, `hostLlmProvider:gemini` and `hostLlmConfigured:true`; `node scripts/playtest.mjs --voice` enables live AI for that process. Online snapshots carry voice availability. A prior typing-only playtest had `liveVoice:false` and disabled Say it before microphone permission. The temporary origin changes on restart, creating a new browser identity. Typing and scripted captions continue if a provider call fails. Per-match limits are 60 reserved STT seconds, 1,000 TTS characters and four selected-host LLM requests. No LLM is called while `HOST_LLM_PROVIDER=scripted` or the selected key is absent.

Host provider code updated 4 November 2026; [current status](STATUS.md). The B043 Gnani probe reconfirmed streaming STT connection with synthetic silence and short TTS generation. A direct bounded Gemini request with synthetic public two-player context returned a visible reply and token usage. The voice-enabled playtest now selects Gemini; the real room Tap to ask exchange remains untested on two devices.

## Capture

Explicit Record action → browser echo cancellation/noise suppression → AudioWorklet resampler → mono PCM16LE at 16 kHz → authenticated audio WebSocket → Gnani STT → private editable transcript → explicit game submission.

The resampler carries fractional sample weights across chunks and emits 512-sample/1,024-byte frames at 32 ms cadence. The browser does not cut silence out of an active provider stream. Stop adds a 1.024-second silence tail and a bounded final-result wait. Input windows are voice-friendly; recording caps are five seconds for factual secrets and eight seconds elsewhere. Permission denial, service failures and unsupported capture keep typing available.

VAD baseline is threshold 0.6, minimum speech 100 ms, minimum silence 700 ms, currently fixed headers in [providers.ts](../backend/src/providers.ts), not environment/UI settings. These are requested values, not a verified account configuration or measured optimum. Keep quieter voices and pauses in the test set; noise suppression does not hide spoken secrets from friends in the same room. Same-room secret prompts should be typed.

Sound, vibration and local playback pause during capture. Ownership/phase validation cancels abandoned captures. Recordings are memory-only unless the player separately opts into a reveal upload or diagnostic storage. Ordinary transcript requests do transmit audio to Gnani; offline demo capture remains local.

## Verified and unverified provider behavior

| Check                                                    | Actual result                                                                                                                                                                                     |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Realtime STT endpoint and API credential                 | Connected using `wss://api.vachana.ai/stt/v3/stream`                                                                                                                                              |
| Requested model                                          | `prisma-v3.0`; provider did not echo an effective model, so fallback/model selection is **unconfirmed**                                                                                           |
| `hi-IN,en-IN` streaming list                             | Account endpoint rejected it, asking for one locale                                                                                                                                               |
| Single `hi-IN`, transliterate, 16 kHz                    | Connection acknowledged these settings; synthetic silence probe transmitted 2.048 seconds                                                                                                         |
| Speech recognition accuracy                              | **Untested** with real human speech/Hinglish/noise/phones                                                                                                                                         |
| TTS                                                      | Earlier short `Namaste` probe generated 34,604 WAV bytes / 0.72 seconds; requested Timbre v3.0, Avinash; effective model not confirmed                                                            |
| DeepSeek / Gemini host LLM                                | Both request/response adapters passed mocked HTTPS checks. A direct Gemini request with synthetic public room context returned a short reply and provider token counts; room Tap to ask, latency distribution and billed cost remain unverified. DeepSeek has no live key/test. Prior Evon research remains in [access findings](EVON_ACCESS.md). |
| Batch denoising/callbacks                                | Adapter and mocked reconciliation tests; live account behavior not yet verified                                                                                                                   |
| Pricing, quotas, provider retention/cancellation billing | **Unknown**; no fabricated prices or zero-cost claims                                                                                                                                             |

The corrected earlier probe is [provider-probe-0d156e00-5542-40f6-b776-d70770138e22.json](../work-log/verification/provider-probe-0d156e00-5542-40f6-b776-d70770138e22.json). Earlier probe reports called the requested model effective; this document and the nullable effective-model column correct that interpretation.

Sources: [STT protocol](https://docs.gnani.ai/api/STT/stt-websocket), [Prisma v3](https://docs.gnani.ai/api/STT/models/prisma-v3), [TTS streaming](https://docs.gnani.ai/api/TTS/tts-websocket), [batch](https://docs.gnani.ai/api/STTBatch/Introduction). Documented features do not substitute for verifying the supplied account.

## Host and cost controls

Built-in Hinglish narration marks traits, competitive reveals, story and summary. Captions appear immediately; when enabled, TTS is generated once per narrated phase and shared by the room. Static narration audio has a one-hour process-local cache keyed by text/model/voice, reusable across rooms. Same-room mode elects the host's connected seat for playback; remote devices may each play it. No autoplay guarantee is assumed on mobile.

The TTS provider adapter uses a streaming provider socket but collects audio before saving a WAV and publishing an authenticated media URL. The browser does not receive provider audio chunks live. Stories, decoys and replacement players remain scripted and do not use an LLM. DeepSeek uses a bounded non-streaming HTTPS chat-completions request; Gemini uses a bounded non-streaming HTTPS `generateContent` request. There is no browser-to-LLM connection or automatic cross-provider fallback.

Tap to ask claims one speaker and one exchange per intermission, bounded to 25 seconds. A configured selected LLM receives the current speaker's question and public names/scores/phase/rules. It cannot inspect hidden answers, change scores or approve cards. Failure returns scripted captions and lets the room continue. Reasoning over the group's committed answer choices to produce reveal commentary is a separate, unfinished game feature.

Default per-match smoke limits: 60 reserved STT seconds including silence tails, 1,000 TTS characters, four selected-host LLM calls, and a separate 60-second diagnostic allowance. Reservations are conservative and are not refunded for partial/cancelled requests. Raise limits deliberately after measuring complete sessions; the smoke allowance is not a full-session promise.

Every provider attempt has a task, phase, retry number, latency, requested/effective model, status and usage evidence. Cost estimates use versioned rate snapshots; reconciled invoice amounts remain separate. Generated audio, cache hits and client-reported playback are different measurements. Diagnostic usage is reported separately. Failed/cancelled/uncertain billing stays unknown until provider evidence resolves it. Scripted stand-ins make zero LLM calls.

The ledger can store retry numbers and billed units; that does not mean every provider supplies those units or an automatic retry strategy exists for every task. STT/TTS billing and rate/retention details are unconfirmed. Batch creation currently requests `hi-IN,en-IN` with `format:transcribe`, whereas the tested streaming path requires one locale with transliteration. Batch compatibility remains a live-test item. No rate cards existed in the development database during B021.

Use `npm run report -- <runId>` for a match and `npm run report` for mode/seat/completion/departure/cache cohorts with mean, median and p95. Avoid comparing incomplete or unknown-price samples as if they were verified whole-session costs.

## Noise evaluation

With explicit diagnostic consent, capture a short quiet/noisy phrase and a reference transcript. Use the operator evaluation command twice with denoising false/true. Compare reference word error rate, human corrections, endpoint delay, clipped words and phone responsiveness. Reference-less results have unknown accuracy, not perfect accuracy. Diagnostic results expire with the recording. RNNoise remains a measured follow-up; two denoisers are not stacked by default.

What is automated today: batch reference word error rate, batch job elapsed latency, stream segment timing and usage duration fields. Human transcript correction rate, clipping assessment and phone CPU/load are **not automatically collected**; record those manually in a consented evaluation. Diagnostic upload/cancellation/polling are implemented and mocked-test-covered, but no live denoise comparison or physical speech-quality result is available.
