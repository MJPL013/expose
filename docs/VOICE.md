# Voice, host and provider evidence

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
