# Adaptive app and browser lifecycle

Status: B022–B024 implemented and automatically verified on 2026-11-03. Revisions B025–B028 are recorded in the append-only project log. Physical-device acceptance remains open.

| Boundary       | Implementation                                                                                                                                         |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Layout         | CSS viewport breakpoints, one React tree; adaptive default or saved compact preference                                                                 |
| Navigation     | MatchNavigation owns leave/end confirmation; Dialog registers the topmost Back layer; no history entry per phase                                       |
| Guest identity | Existing HttpOnly cookie; a tab never creates a guest merely by opening                                                                                |
| Ownership      | BroadcastChannel coordination metadata provides early messaging; backend connection lease authorizes actions                                           |
| Drafts         | Free text only, tab-scoped sessionStorage, match/seat/step/epoch key, two-hour expiry; restored only against accepted server state                     |
| Lifecycle      | Background silences media/effects, keeps healthy owner connection; ownership loss stops retries/media; PWA update activation waits outside match       |
| Network        | Single-flight initialization/resume; jittered bounded reconnect with offline suspension; 10-second lease heartbeat                                     |
| Clips          | Protocol 3 optional media-events-v1 capability; run-scoped media.changed invalidation; visible eligible owner fetches once and coalesces invalidations |
| Server fanout  | One committed room load per broadcast batch, individual authorized projections, removal and ownership checks                                           |

Private API responses and audio remain outside the service-worker cache. No database migration is required. Paid host actions remain explicit/idempotent existing operations, independent of resize and local preferences.

Baseline browser measurement: four clip GETs, 3914 HTTP request/response bytes including headers during an 11-second idle summary window. Excludes WebSocket frames, Next assets/prefetching and provider traffic. After the change, the same window had zero HTTP requests and zero HTTP bytes. A separate idle-owner check recorded only one ping/pong pair (57 application payload bytes). See [verification and limits](../work-log/verification/2026-11-03-adaptive-app.md).

No physical Android, tablet or iPhone checks have been performed for this update. Historical device evidence is not evidence for these new layouts/lifecycle paths.

Connection state is explicit (`inactive`, `connecting`, `active`, `reconnecting`, `controlled-elsewhere`, `moved`, `ended`). Pending intents and HTTP work are cancelled when control ends; already committed server actions remain durable. Advisory owner claims are sent on ownership changes or in response to probes, rather than on every snapshot.

One same-route Back guard is used for the active match. A topmost dialog consumes Back before the leave confirmation. Cancel preserves text; confirmed Leave clears unfinished local text/media and releases the connection. Reload/close warnings are supplementary and browser-dependent. Cross-origin history traversal and mobile system gestures cannot be guaranteed by JavaScript.

Drafts never transfer to another tab. Normal online consented clip uploads/retention remain unchanged; recording drafts themselves are excluded from sessionStorage. Media notifications are best-effort, with list revalidation on phase entry, reconnect and return to visibility.
