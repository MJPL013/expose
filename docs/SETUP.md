# Local development and private phone playtests

## Quick Void guest entry — 9 November 2026, B071

Open **http://localhost:3000/void** and choose **Continue as guest**. Allow the microphone to speak, or select **I'd rather type** first. No Google client or signup is needed. Returning visits show **Enter The Void** and the history icon. The disclosure on first entry explains retained recordings/transcripts/reflections; there is no separate consent checkbox.

`GC2_GUEST_ENABLED` defaults to `true`; set it to `false` to require a shared Google login again. `GC2_LOCAL_TESTING` is still obsolete. Guest creation requires the configured allowed Origin and is limited to 12 requests per IP/hour; normal session/provider allowances remain. The application cookie lasts 180 days. Browser voice/language preferences remain local. Audio/transcripts/graphs are stored on the **server**, which is this PC during local testing, not in browser localStorage. Clearing browser data, cookie expiry or choosing Leave guest profile loses access; it does not delete saved server data. Use private history to delete first if desired.

For a different person, use another browser/profile/device; tabs in the same browser share the guest. The Void is still solo conversation; the Play section remains the multiplayer friends game. Phone microphone use still requires the normal HTTPS playtest origin. No additional migration is required for guest identities.

The Google instructions below are now **optional**, superseding B070's mandatory-sign-in statement. The administrator explorer still requires an explicitly granted Google account role and is separate from guest conversation entry.

## Localhost Google sign-in — 9 November 2026, B070

The Void now opens with **Enter The Void**. Signed-out visitors enter Google sign-in from that action; microphone preparation and session creation happen only after authentication. The first signed-in entry still explains recording retention. An unconfigured server shows a short unavailable message after the click, not setup instructions on the consumer landing screen. Cancelling Google returns to the landing with a retry message. This revises B069's disabled Google button; it does not restore B065's local bypass.

To configure this PC:

1. Open [Google Cloud Console](https://console.cloud.google.com/) and select or create a project, for example `Expose local`.
2. Open **Google Auth Platform → Branding → Get started**. Set the app name to Expose, select your support email, choose **External** for a personal Gmail account and supply your contact email.
3. In **Audience**, keep the app in **Testing** and add your Gmail address under **Test users**. Only basic `openid`, `email` and `profile` sign-in scopes are requested by Expose; this does not require Gmail inbox access.
4. Open **Clients → Create client → Web application**. Name it `Expose localhost`. The required **Authorized redirect URI** is exactly `http://localhost:3000/api/account/v1/auth/google/callback`. Authorized JavaScript origins are not required by our server authorization-code flow; if you add one, use `http://localhost:3000` with no path.
5. Copy the client ID and secret into the existing `backend/.env` locally, replacing or adding only these values. Do not paste them into chat, put them in frontend environment variables, or overwrite the rest of the file:

   ```dotenv
   GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=your-client-secret
   PUBLIC_ORIGIN=http://localhost:3000
   ALLOWED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
   ```

6. Restart the Expose server with `npm start` (or `npm run dev` for development). Open **http://localhost:3000/void**, not the internal port 3001 or a different hostname, then enter and complete Google sign-in. After returning, enter to allow the microphone or choose typing. Environment-only changes need a restart, not a new build.

Google explicitly allows HTTP localhost redirect URIs. Their exact scheme/host/port/path must match, or sign-in fails with `redirect_uri_mismatch`. A physical phone needs the registered HTTPS app origin instead; its own localhost does not refer to this PC. Official references: [configure consent](https://developers.google.com/workspace/guides/configure-oauth-consent), [create a web client](https://developers.google.com/identity/protocols/oauth2/web-server), [redirect URI rules](https://support.google.com/cloud/answer/15549257?hl=en).

After configuration, `/api/gc2/v2/me` should report `configured: true`. That verifies configuration presence only; completing the real Google callback proves login. See [storage, prompts and explorer](ACCOUNTS_AND_STORY_GRAPHS.md#storage-and-prompt-map) for where the resulting data lives.

## Shared Google accounts — 9 November 2026, B069

Run `npm run db:migrate` for additive migrations through 0011. Google is currently unconfigured locally and now required for The Void. Configure backend `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` with exact redirect `http://localhost:3000/api/account/v1/auth/google/callback`; use the equivalent registered stable HTTPS origin for phones. `GC2_LOCAL_TESTING` no longer bypasses sign-in. Guest friends play remains available. Independent `GC2_CONVERSATION_*`, `GC2_ANALYSIS_*`, `GC2_EMBEDDING_MODEL` and `GC2_VECTOR_STORE=array` settings are in `.env.example`. See [complete setup, admin-role and fictional seed commands](ACCOUNTS_AND_STORY_GRAPHS.md). Never replace a configured `.env` with the example.

## Google-free localhost testing — 7 November 2026, B065

Rebuild/restart and open `http://localhost:3000/void`. Accept the storage disclosure and press **Enable microphone**. `GC2_LOCAL_TESTING` defaults to `true` for this loopback-only path; no Google setup or new migration is needed. Gnani and the selected reasoning provider still need their existing configuration. Set `GC2_LOCAL_TESTING=false` to test Google locally. Public origins and HTTPS phone links continue requiring Google under this revision.

## The Void setup — 7 November 2026, B064

Install dependencies and migrate through 0008 before starting the updated application. `/void` additionally needs a Google Web OAuth client configured with `PUBLIC_ORIGIN` + `/api/gc2/auth/google/callback`, server-only Google configuration, the existing AI/Gnani configuration and private persistent `GC2_MEDIA_ROOT` storage. See [The Void setup and evidence](THE_VOID.md). Google configuration and physical HTTPS phone acceptance are not supplied by a passing local build.

## Hands-free assets and acceptance - 5 November 2026, B051

After pulling B051, run `npm install` and build/restart the app. The pinned VAD/ONNX packages supply local model/worklet/WASM assets; `scripts/voice-assets.mjs` copies them on dev/build/start. Generated `frontend/public/audio/vad/` files are ignored by Git. Deployments must include the generated public assets. No extra database migration is needed for this revision.

Create a new room or rematch to get voice input version 2 (saved older runs stay manual). Choose Hands-free and explicitly Enable microphone on each device. Use the shared proxy origin on port 3000 locally, and an HTTPS room link for a phone. Localhost permissions do not make an HTTP LAN address secure. Microphone choice remains English/Hindi/Telugu; room prompts remain English/Hindi/Hinglish. Live voice still requires the existing backend provider configuration and full-match profile; this change does not enable providers or alter keys.

For physical acceptance, complete PC/phone match and rematch, including one non-English microphone language, nearby speaker noise, designated same-room playback, background/resume and exhausted retries. Measure prepared capture startup, final transcription, translation and auto-send separately. A prepared startup below 150 ms is a target, not a hardware guarantee. Current mocked/browser evidence and known legacy fixtures are in [status](STATUS.md).

5 November 2026, B048: run `npm run db:migrate` before the updated backend (migration 0006), then rebuild/restart both services together for protocol 5. Stale installed clients must refresh. New rooms expose pace and guided voice settings; use the public `/join/CODE` link for the second device. HTTPS is still required for physical-phone microphones. Full-match narration has its own allowance. [Implemented behavior and pending acceptance](ROOMS_AND_GUIDED_VOICE.md).

## Interactive host setup — 4 November 2026, B045

### Select DeepSeek for the host and translation

In the existing `backend/.env`, set the following locally (replace the placeholder with your key; do not paste it into chat):

```dotenv
HOST_LLM_PROVIDER=deepseek
DEEPSEEK_API_KEY=your_key_here
DEEPSEEK_MODEL=deepseek-flash
AI_ENABLED=true
AI_PROFILE=full-match
```

Restart the backend after changing these settings. The playtest runner also controls `AI_ENABLED`; use `node scripts/playtest.mjs --voice --full-match` for that runner. A process explicitly launched with `AI_ENABLED=false` overrides the `.env` value. Gemini configuration can remain present: only the selected provider is used. DeepSeek supplies automatic host reasoning, follow-up replies, closing/callbacks and answer translation. Gnani still supplies STT/TTS, and shared rules still score answers. No automatic paid-provider fallback occurs.

The adapter uses server-side Bearer authentication, non-thinking chat completions, bounded output and JSON object mode. `deepseek-flash` and JSON mode were checked against the [official model documentation](https://api-docs.deepseek.com/quick_start/pricing/) and [JSON output documentation](https://api-docs.deepseek.com/guides/json_mode/). Mocked compatibility checks pass; a live DeepSeek account response/latency has not been verified.

Apply migrations with `npm run db:migrate`; `0005_interactive-host.sql` is included. New rooms/rematches default to host flow 2 (`HOST_DIRECTOR_ENABLED=true`). `AI_PROFILE=smoke` retains small probe limits; select `full-match` for a complete voice match. Select a provider in backend configuration; no credentials enter frontend configuration or prompts. Current live Gemini requests time out, so configuration flags alone must not be described as a working live host.

After `npm run build`, stop the development runner and use **`node scripts/playtest.mjs --voice --full-match`** for a temporary HTTPS two-device session. Direct Node invocation avoids this Windows/npm installation losing CLI flags. Omit `--full-match` for smoke limits. `GNANI_STT_COMMIT=true` is an opt-in account-qualified finalisation path; default false keeps the existing method. Do not reuse B043's stopped temporary origin. See [interactive host](INTERACTIVE_HOST.md) and [current acceptance](../work-log/verification/2026-11-04-interactive-host.md).

See [current status](STATUS.md) before interpreting a successful startup as acceptance of every feature. The system connections and data stores are described in [architecture](ARCHITECTURE.md) and [database](DATABASE.md).

Use Node 22.13 or newer (Node 22.12 currently runs the workspace but one lint dependency declares 22.13). Install workspace dependencies from the repository root with `npm install`.

`npm run build` type-checks shared/backend code and creates the Next.js production build. The backend's build script is currently `tsc --noEmit`; production runners still execute its TypeScript through `tsx`. Shared code is consumed from TypeScript source. There is no separately emitted backend JavaScript artifact or container deployment bundle yet.

## PostgreSQL

Choose one database method; both examples bind port 5433 on loopback.

**Existing portable instance on this machine:** PostgreSQL 17.11 is under `.tools/postgres/pgsql`, with data in `.data/postgres`. No new Docker was installed. To restart an already initialized instance:

```powershell
& .tools/postgres/pgsql/bin/pg_ctl.exe -D .data/postgres -l .data/postgres.log -o '-p 5433 -h 127.0.0.1' -w start
```

**Docker on another machine:** `npm run db:up` starts the PostgreSQL service defined in `compose.yaml`. Stop the portable instance first if using the same port. Do not delete the portable data directory or Docker volume to solve startup errors.

Copy `backend/.env.example` to `backend/.env` only if the destination does not already exist. The current destination contains a backend-only provider credential; never overwrite it or copy it into the frontend.

```powershell
npm run db:migrate
npm run dev
```

The root runner serves one origin on 3000: Next.js on 3001, backend on 4000, including WebSocket upgrades. The combined runner binds these services and PostgreSQL to loopback. `/api/v1/health` reports process/protocol, voice availability and selected host LLM configuration; it does not probe the database or provider. Acknowledged game data survives a backend restart in PostgreSQL; the online adapter reconnects, and Resume is available after reload.

For a live host reply, put **one** provider key in `backend/.env` and set `HOST_LLM_PROVIDER=deepseek` with `DEEPSEEK_API_KEY`, or `HOST_LLM_PROVIDER=gemini` with `GEMINI_API_KEY`. The model names in `.env.example` can be changed for an account's available models. The default `scripted` selection sends no LLM request. `AI_ENABLED=true` and a clear AI stop switch are also required; run `node scripts/playtest.mjs --voice` for the bounded live-AI playtest. Keep all keys in the backend environment and restart the server after changing them. The game does not automatically try the other paid provider if the selected one fails. A direct bounded Gemini request succeeded in B043; an actual two-player room host exchange remains to be verified.

## Private HTTPS origin

This workspace includes a portable `.tools/cloudflared.exe`. After stopping the development server and running `npm run build`, use `npm run playtest` for typing or `node scripts/playtest.mjs --voice` for the configured bounded live-speech allowance. On this Windows/npm setup, `npm run playtest -- --voice` did not pass the flag through, so verify `liveVoice:true` before testing. The runner creates a temporary HTTPS origin, sets exact allowed origins for its child backend and starts the production app. It does not rewrite backend/.env. The current origin is written to ignored `.data/playtest.json`. Players do not enter a separate playtest password: the host creates a room and shares its generated room code.

The live Gnani STT/TTS adapters have been endpoint-probed, but a new `--voice` playtest still needs human speech and phone checks. The Say it control follows the server's `liveVoice` flag and stays disabled when voice is off. Keep the backend credential in `backend/.env`; do not put it in a public Next.js variable. Starting a fresh quick tunnel changes its hostname, which changes the browser's cookie identity and installed PWA origin. Finish an existing room before switching links.

The manual equivalent follows.

Install `cloudflared` from the [official download instructions](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/). Run:

```powershell
cloudflared tunnel --url http://localhost:3000
```

Use the printed HTTPS origin for `PUBLIC_ORIGIN` and add that exact origin to `ALLOWED_ORIGINS` in `backend/.env`. Set `COOKIE_SECURE=true`, then restart the root server. Keep `AI_ENABLED=false` until ready for the bounded provider test. Serve all phone traffic through the same origin; do not open separate frontend/API tunnels.

[Quick Tunnels](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/) are temporary development URLs. A new hostname means a different cookie identity, browser storage and PWA origin. Existing seats cannot be recovered by entering their display name or room code. Finish/resume at the original origin while it remains available, or start a new room on the new hostname. Install the PWA only after opening the current HTTPS URL. A stable tunnel hostname is a later deployment decision.

Room codes admit new players while seats are available; they never grant another person's existing seat. Keep the testing URL within your squad. Do not expose PostgreSQL, backend 4000, or operator tools directly.

For a two-player trial, select **2 players** when creating the room. Open the same HTTPS address on your phone and join with the room code. For two players on one PC, use two browser profiles or a normal and an Incognito window; two ordinary tabs share a device identity. Everyone taps **I’m ready**, then the room owner taps **Play**. The human owner manages setup; Gnani mediates the game with scripted captions. A configured selected DeepSeek or Gemini model can answer Tap to ask; scripted narration remains separate.

Android Chrome haptics: open Settings → Test vibration. The test requests two 120 ms pulses and reports API rejection/suppression separately. An accepted request cannot prove the motor moved; system vibration settings, Silent and Do Not Disturb may suppress it. Pending actions receive increasing deadline pulses; submitted answers, recording/playback and background tabs remain quiet. See [MDN vibration behavior](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/vibrate).

## Tests and checks

Create a separate `expose_test` PostgreSQL database with the same local user before integration tests. `backend/tests/multiplayer.test.ts` refuses to truncate any database whose name is not exactly `expose_test`.

```powershell
npm run test
npm run typecheck
npm run lint
npm run contracts
node node_modules/tsx/dist/cli.mjs backend/src/contract-docs.ts --check
npm run build
npm run test:e2e -- network.spec.ts
```

Development browser journeys use Playwright's combined-server runner, reusing an existing server outside CI. Use a development instance for suites that need `/dev` or `/preview`; a running production playtest intentionally returns 404 there. Browser tests use independent Chromium contexts; they are not physical Android/iPhone checks. Production-only PWA tests use `PLAYWRIGHT_PRODUCTION=1` and a production frontend server. Do not replace a user's active playtest just to run documentation checks.

For filtered Playwright runs, use the workspace directly (root script forwarding can lose extra flags): `npm exec -w frontend -- playwright test network.spec.ts --grep "two players"`. The GitHub workflow is [verify.yml](../.github/workflows/verify.yml); its presence is not evidence of a remote CI pass.

## Phone checklist

1. Three separate phones create/join one room. Test Spotlight and Bluff, same-room and remote settings.
2. Tap Record, grant microphone access, speak softly and normally, stop, edit, then submit. Repeat with denied permission and silence.
3. Compare fans/music/nearby voices. Record reference text only with diagnostic consent; avoid spoken secrets when friends can hear them physically.
4. Background and reopen one phone during secret/guess/vote/reveal. Confirm the preserved answer, stand-in badge, next-question return and host migration.
5. Test Android vibration, iPhone visual/sound fallback, keyboard/safe-area dock, screen wake lock, approved PNG downloads and installed PWA restart.
6. Capture actual results in `work-log/verification/`; do not mark a device tested from viewport emulation.
