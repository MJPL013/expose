# Local development and private phone playtests

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
