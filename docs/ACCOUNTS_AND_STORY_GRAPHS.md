# Shared accounts and story graphs

Implemented on `v2`, 9 November 2026, **B069**, revising B064/B065. This is the current account and Void specification. Earlier dated documents remain historical evidence.

## Browser guests — 9 November 2026, B071

The user's B071 request supersedes B069/B070's Google-only Void policy. **Continue as guest** creates a browser-owned Void profile and proceeds into the ordinary voice/type flow. Returning guests see **Enter The Void**. Google stays optional, with its button shown when configured. This uses the existing provider-backed conversation, subject to model/speech configuration and usage ceilings.

`backend/gc2/auth.ts` owns guest resolution and endpoints. A 256-bit opaque token, prefixed `vg_`, is stored only in the HttpOnly, SameSite=Lax `expose_void_guest` cookie (Secure on HTTPS; 180-day lifetime). PostgreSQL stores its hash in `gc2_logins` and an independent `guest:<uuid>` subject in `gc2_accounts`. Account/login creation is transactional. No migration or data reset is needed. Existing Google IDs, synthetic fixtures and older local-test records are not claimed or merged. The guest cookie has priority within Void; an invalid/expired guest can fall back to a valid shared Google cookie. Shared account APIs never authenticate guest subjects, even if a guest token is copied into a shared cookie. Guest roles are always player and the admin operator rejects them.

The browser remembers access and local voice preferences. **Audio, transcript, analysis and graph storage remains the existing private server filesystem/PostgreSQL**, local to this PC in development; it is not a browser-only or offline implementation. Refresh preserves identity/history. Different browsers/devices have separate guests; tabs share one. Web Locks serialize first entry where supported. Session creation still locks the owner row and reuses an unfinished session. Guest onboarding records the same versioned retention agreement as Google onboarding. Guest creation is Origin-checked and limited to 12 requests/IP/hour; session/provider limits are unchanged. Disabling `GC2_GUEST_ENABLED` blocks guest REST/socket access, without deleting data.

Private history and deletion remain available to each guest. Leaving the guest profile requires a confirmation, revokes its token, clears the browser cookie and closes its Void connections. It does **not** delete server data; the UI directs users to delete history first if needed. Cookie clearing/expiry also loses access; there is no cross-device recovery or automatic Google conversion. Google-account Game 1 features and ordinary multiplayer guest seats are unchanged. The administrator explorer remains restricted; its error state links back to guest-capable `/void`.

## What players experience

Play with friends still accepts guests and uses the existing deterministic scoring. Profile offers Google sign-in, account preference sync, linked room recovery and server-generated results. Profile → My cards offers account-saved approved cards and explicit import of browser cards. Imported cards are labelled `local-import`; their contents cannot establish a verified result. Sign-in does not silently claim an existing guest. **Link this browser's player** verifies its guest cookie and rejects conflicting account or live-room seats. Existing seats remain intact after a rejected link. Signing out revokes the application login and closes owned game/voice sockets.

The Void accepts either a browser guest or a shared Google identity. `GC2_LOCAL_TESTING` no longer grants access; old `local-test:` records remain unassigned and cannot authenticate. Google is currently unconfigured on this PC; B071 guest entry permits testing without it. The server issues a guest identity before microphone preparation or session creation. Google setup remains in [the optional operator guide](SETUP.md#localhost-google-sign-in--9-november-2026-b070).

First entry explains that audio, transcripts and interpretations are retained until deletion. The account remembers onboarding version 1. **Enter The Void** prepares microphone/playback through the user's action when permission permits. No repeated consent checkbox is required. Hands-free, mute, tap-to-talk and typing remain. Browser permission and explicit resume after interruption are still required.

The live companion reacts like an attentive, playful friend. Questions are optional. Serious stories receive gentler responses, refused subjects are dropped, and remembered stories remain tentative. New sessions no longer run persona extraction after each answer or finish after four to eight turns. The server suggests wrapping around 20 active minutes and ends at 30, excluding explicit pauses. An utterance capped at 60 seconds still requires Continue/Send; no timer silently approves a capped draft. Explicit Finish includes a completed pending utterance.

Finish saves the ordered conversation and queues background work. History shows Processing, Ready or Needs retry; users can leave while it runs. Completed analysis provides an original inspired quote, tentative persona, supported stories/observations and optional comparison-summary approval. The quote is not presented as a literal quotation from the user.

## Authentication and data ownership

`backend/src/accounts` owns shared Google code exchange, PKCE/state/nonce verification, token verification, login cookies, profiles, linking, cards and results. Google subject IDs remain stable. Existing physical `gc2_accounts`, `gc2_logins`, `gc2_oauth` tables retain account IDs and foreign keys. The HttpOnly application cookie is `expose_account`; an old Google `expose_void` cookie can authenticate during transition. Cookies are Secure on HTTPS and SameSite Lax. Redirects use a fixed application allowlist. State attempts expire and are consumed once. Mutations and sockets require allowed Origins; authentication/provider work has rate and usage ceilings. Requests/logs omit credentials, audio and story contents.

Account linking serializes ownership and rejects overlapping linked identities in one live room. Selecting a linked seat closes the old browser connection and uses the existing takeover rules. Results are derived from persisted score events; permanent summaries contain mode, completion date, placement and points, not other players' private answers. Linking can backfill completed runs still retained in the room database. Previously purged runs cannot be reconstructed. Existing browser imports remain explicitly separate from verified match cards/results.

Administrators require `gc2_accounts.role='admin'` set through the local operator command. The frontend cannot grant this role. The explorer receives approved descriptions, pseudonymous real-person labels and relationship explanations; raw transcripts/audio remain owner-restricted. No endpoint serves player recording playback. All account/GC2 responses use `no-store`; the PWA excludes API and Void resources.

## Live and background models

| Role | Default | Deadline |
| --- | --- | --- |
| Conversation | Gemini `gemini-3.5-flash-lite`, minimal thinking | 5 seconds |
| Interpretation and relationship review | DeepSeek `deepseek-v4-pro`, thinking enabled | 120 seconds |
| Similarity | Gemini `gemini-embedding-2`, normalized 768 dimensions | 15 seconds/request |
| STT/TTS | Gnani, existing prepared capture and playback coordination | TTS 8 seconds |

`GC2_CONVERSATION_PROVIDER/MODEL` and `GC2_ANALYSIS_PROVIDER/MODEL` independently accept Gemini or DeepSeek. `GC2_EMBEDDING_MODEL` controls embeddings. There is no automatic paid-provider fallback. Defaults were checked against [Gemini Flash-Lite](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite), [Gemini embeddings](https://ai.google.dev/gemini-api/docs/embeddings), and [DeepSeek models](https://api-docs.deepseek.com/quick_start/pricing/).

The conversational context contains at most 16 recent transcript entries and a bounded relevant selection of completed-session memories. The deeper path receives the complete accepted transcript with user/assistant roles and corrections, not raw audio. It separates lived accounts, hypotheses, self-description, inference and assistant suggestions. Every story/observation references saved user turns. Analysis outputs are schema-checked and reference-checked; they are not accepted as proven facts merely because the model produced them.

Defaults per new session: 1,800 active seconds, 1,200 captured speech seconds, 80 conversation calls, 80 accepted user turns, 60,000 TTS characters, three analysis attempts and eight graph/relationship attempts. New sessions are capped at three/account/UTC day. Limits are configurable and copied into session state. Empty recognition is a technical outcome, not a meaningful answer. Accepted completed audio with failed recognition is retained privately with empty text; background listening and discarded partial capture are not archived.

The GC2 `gc2-live` and `gc2-background` pg-boss queues are separate; the old `gc2-work` queue drains legacy work. Database claims prevent duplicate invocation and a partial unique index allows only one running background operation/session. Provider calls execute outside transactions. Generation IDs, transcript hashes and tombstones reject stale publication. Caption publication precedes TTS. Ambiguous interrupted paid work fails for explicit bounded retry, rather than automatically charging again. Job outcomes store safe codes/durations, never exception payloads or private prompts.

## PostgreSQL graph pipeline

PostgreSQL remains the source of truth; no Neo4j, Redis or new database service is required. Migrations 0009–0011 add:

- `account_players`, `account_matches`, `account_cards` and shared-account fields.
- `gc2_transcript_turns`: ordered user/AI/technical entries, original text, corrected gameplay text, language, timestamps, private audio references and invalidation status.
- `gc2_analysis_runs`: model, analysis version, transcript hash, status and validated result.
- `gc2_graph_nodes`/`gc2_graph_edges`: session groups, stories/observations, provenance, supporting turns and explained relationships.
- `gc2_graph_embeddings`: normalized arrays with model, dimensions, version and experience/response view.
- `gc2_comparison_summaries`: separately revisioned, explicitly approved descriptions.
- `gc2_cluster_snapshots`: rebuildable exploratory group memberships.
- `gc2_jobs`: completion timestamps, durations, safe failure codes and pg-boss delivery receipts.

Raw recordings use private `GC2_MEDIA_ROOT` files (default `backend/.data/gc2` when starting from the backend workspace). They are not Next assets, database blobs, public URLs or analysis-model inputs. Deployment needs a persistent private volume; provider retention policies are separate from local deletion.

Analysis, graph construction, vector search and comparison approval are separate modules under `backend/gc2`. The initial array adapter performs exact cosine search over all eligible rows in bounded pages. The optional `pgvector` adapter uses the extension's cosine operator against the same arrays; enabling it does not reset/migrate the existing database. It is not an ANN index and the extension is not installed locally. Both adapters filter model/dimensions/version/view, account/scope, approval, deletion and provenance. Incompatible embedding spaces cannot be compared.

For each story/view, retrieve up to five candidates above initial similarity 0.72, then deduplicate/rank the pairs and review at most 12 strongest candidate links with the analysis model. Private links may express continuation, related experience, support, contradiction or similar response. Cross-person links use only the approved summary and are restricted to experience/response similarity. Fictional and real candidates stay in separate similarity pools; the combined lab view displays both. Editing, withdrawing or deleting a summary removes its comparison nodes and derived links/embeddings immediately. A newly approved revision must be processed again.

Deterministic label propagation groups reviewed links independently for experience and response. Isolated stories remain isolated; one person can participate in multiple story groups. These exploratory groups are not friendship probabilities. Search is exact and the visual renders at most 500 matching stories; larger deployments will need measured indexing/pagination work.

Deletion tombstones the session immediately, cancels pending operations and invalidates affected nodes, embeddings, approvals and cluster snapshots. A durable job removes files and cascaded rows. Downstream remembered evidence is invalidated and remaining valid evidence is reanalysed within the session budget. Original transcripts are not silently rewritten as facts. Unreferenced interrupted file writes are swept after an hour.

## Explorer and fictional data

### Storage and prompt map

Runtime configuration checked on 9 November 2026 (B070): local PostgreSQL `expose` at `127.0.0.1:5433`, private media root `E:\self_random_project\Gnani\backend\.data\gc2`, array vector adapter. No Neo4j service is used.

| Data or behavior | Location |
| --- | --- |
| Completed raw speaking captures | Private UUID `.bin` files under the media root, with WAV-encoded PCM; `gc2_assets` holds their session/kind/key metadata. AI speech files also use this store with a distinct kind. |
| Original recognition, corrections, ordered user and assistant text | `gc2_transcript_turns`; active/legacy conversation state also lives in `gc2_sessions.state`. |
| Complete validated background LLM output and version/model/status | `gc2_analysis_runs.result` JSONB; saved evidence/persona also lives in session state. |
| Node metadata and explained relationships | `gc2_graph_nodes`, `gc2_graph_edges`; source turn IDs preserve traceability. |
| Similarity vectors and exploratory groups | `gc2_graph_embeddings`, `gc2_cluster_snapshots`. |
| Explicitly approved cross-person material | `gc2_comparison_summaries`; approval is separate from recording retention. |
| Live companion, completed-conversation analyst and relationship-review prompts | `backend/gc2/story-prompts.ts`; validated output shapes in `shared/src/gc2-graph.ts`. |
| Graph construction, candidate review, comparison and group calculation | `backend/gc2/story-graph.ts`, `backend/gc2/vectors.ts`. |
| Fictional source conversations | `backend/gc2/data/synthetic-profiles.json`; processed through the ordinary pipeline. |

The flow is **speech → Gnani STT → saved text/live companion → Finish → background transcript analysis → validated nodes/edges → embeddings and relationship review → explorer**. Raw audio is stored privately but is not input to the interpretation LLM. The current node schema includes title, summary, experience, response, story/observation kind, lived/hypothetical/self-described/inferred source, provenance and supporting turns. It has **no separate free-form tags field, acoustic/emotion classifier or per-word audio annotation**. These existing semantic fields should not be described as an implemented audio-tagging system.

The analyst prompt requires evidence from user turns, excludes assistant suggestions as proof, preserves contradictions, removes identifying details from its output, and asks for a modest persona/original inspired quote or null when evidence is sparse. The relationship reviewer checks candidate connections rather than treating cosine similarity as proof. Prompt instructions guide output; they do not establish psychological truth or guarantee removal of every identifying detail.

To view results, owners use The Void's **Private conversation history** control for saved personas/quotes and comparison approval. The administrator visual interface is **http://localhost:3000/void/explorer** after Google login and the explicit admin grant below. It displays approved comparison descriptions, not private transcripts/audio. Private graph data is owner-authenticated at `/api/gc2/v2/graph`; a dedicated owner-facing full private graph screen is not implemented. The PostgreSQL tables are available to a local database administrator; there is no raw-audio playback or full analysis JSON inspector in the product UI.

B070's read-only database check found six ready analysis runs (and two historical failed runs), 26 private synthetic nodes and 13 comparison synthetic nodes. All current graph nodes are fictional; these are existing processed results, not real-user acceptance. The asset table contained one recording and ten host clips; contents were not opened. Google login and physical PC/phone speech remain unverified.

### Explorer access and seed commands

`/void/explorer` is administrator-only. Cytoscape supports expandable session groups, selection, zoom/pan, person/session/source filters, search and experience/response views. Session groups use a packed layout to prevent overlapping containers; relationships are conveyed by edges and group filters, not canvas distance. The list/detail interface provides keyboard-accessible descriptions and connection reasons. Fictional nodes use diamond markers and explicit provenance labels. Both app themes and reduced-motion handling are retained.

The application dataset is `backend/gc2/data/synthetic-profiles.json`: Asha, Kabir and Meera, each with two authored conversations. It includes continuation, contrasting responses, similar responses across different situations, contradictions and unrelated details. It creates no Google login and no audio. Imports are stable/idempotent and processing uses the same analysis/graph modules as real sessions.

From the backend directory:

```powershell
node --import tsx --env-file=.env gc2/seed.ts
node --import tsx --env-file=.env gc2/seed.ts --process
node --import tsx --env-file=.env gc2/operator.ts approve-synthetic
node --import tsx --env-file=.env gc2/operator.ts grant-admin ACCOUNT_UUID
node --import tsx --env-file=.env gc2/operator.ts revoke-admin ACCOUNT_UUID
node --import tsx --env-file=.env gc2/operator.ts retry-graph SESSION_UUID
```

`--process` queues paid configured-provider work. The server/worker must be running. Approve fictional descriptions after analysis is ready to populate the comparison explorer. After Google login, obtain your account UUID from the authenticated `/api/account/v1/me` response. Only an existing Google account can receive an admin role; synthetic/local-test identities cannot log in. Normal users approve or withdraw their own summaries in private history.

## Setup

Run migrations, build and start from the repo root. Keep the existing `.env`; do not overwrite it with the example. Configure a Google Web application OAuth client with basic sign-in scopes and consent/test users as applicable. The new exact localhost callback is:

```text
http://localhost:3000/api/account/v1/auth/google/callback
```

Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` only in the backend environment if enabling optional Google login. For phones, use an HTTPS origin and set `PUBLIC_ORIGIN` plus exact `ALLOWED_ORIGINS`; Google login also needs that origin's registered redirect URI. Browser mic permission cannot be granted silently. Missing Google configuration does not block B071 guest Void or guest friends play.

GC2 API/socket version 2 uses `/api/gc2/v2/*`; account endpoints use `/api/account/v1/*`. See [generated account contract](api/account.json) and [GC2 contract](api/gc2.json). Game 1 remains socket protocol 6. Stored version-1 Void sessions retain their old limits and interpretation path; readable Google-owned legacy history is preserved. Legacy localhost records are not automatically transferred to a real account.

## Verification boundaries

See the dated B069 section in [status](STATUS.md) for actual check counts and live fictional-pipeline outcomes. No new test files/folders were created. Automated/mock/browser evidence does not prove physical microphone quality, Google callback configuration, psychological validity or friendship compatibility. Human PC/phone conversations, mixed-language speech, sustained echo handling and subjective conversation quality remain acceptance work. Public discovery, friend requests, messaging and voice rooms remain deferred.
