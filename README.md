# Expose

Multiplayer party-game playtest: 2–7 guests, Spotlight or Bluff, Hostel 2 AM or Goa Trip. A host creates a room and shares its generated code; friends join and chat until everyone is ready. Offline practice is isolated at `/demo`.

| Folder | Responsibility |
| --- | --- |
| `frontend/` | Next.js app, PWA, profiles, capture, player and developer screens |
| `backend/` | Fastify HTTP/WebSocket API, PostgreSQL, provider adapters, jobs, private media |
| `shared/` | Versioned Zod contracts, pure game engine, flows, packs, scoring |
| `docs/` | Setup, architecture, API/database/voice decisions and operations |
| `work-log/` | Append-only history, current status and actual verification evidence |

Start with [local setup](docs/SETUP.md), [architecture and database](docs/ARCHITECTURE.md), [API contract](docs/API.md), and [voice/provider findings](docs/VOICE.md). [Current status](work-log/STATUS.md) distinguishes implemented code from live-provider and physical-device verification.

```powershell
npm install
Copy-Item backend/.env.example backend/.env
npm run db:migrate
npm run dev
```

The combined origin is `http://localhost:3000`. PostgreSQL must already be running. This workspace has a portable PostgreSQL installation on port 5433; Docker is optional. Provider keys belong only in `backend/.env`.

The former `Mock_website` app is now in `frontend`; its design references moved with it. Existing project history is preserved in `work-log/PROJECT_LOG.md`.

Repository layout: `main` is an empty baseline; `v1` contains the first application snapshot. Use `v1` to run or review the game. Local screenshots, provider-probe files and verification artifacts referenced by historical notes are deliberately excluded from Git. Build outputs, databases, recordings and real environment files are also excluded. The sample database password is for local development only; configure private credentials for deployment. See [current implementation and acceptance limits](docs/STATUS.md) before treating this playtest as production-ready.
