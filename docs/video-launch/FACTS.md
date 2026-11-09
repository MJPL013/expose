# Expose launch film claim sources

Planning check, 7 November 2026. Screen copy may be revised during editing only if the code still supports it.

| Claim as planned | Current source | Scope |
| --- | --- | --- |
| 2–7 friends | [`roomSizes`](../../shared/src/game/contracts.ts) and online room-size control in [`entry.tsx`](../../frontend/src/features/entry.tsx) | Implemented room capacity; the local demo is simulated. |
| Together or remote | `mode` contract in [`contracts.ts`](../../shared/src/game/contracts.ts) and online room-setting options in [`entry.tsx`](../../frontend/src/features/entry.tsx) | Both layouts are offered in current setup. |
| Spotlight and Bluff | Mode options in [`entry.tsx`](../../frontend/src/features/entry.tsx), and [game flow](../GAME_FLOW.md) | Both are implemented game modes. |
| Friend Card is optional to approve | [card screen](../../frontend/src/features/screens/act-three.tsx) and [results share](../../frontend/src/features/results-share.tsx) | Approval precedes download/share; player may keep it private. |
| Optional AI host | [interactive host](../INTERACTIVE_HOST.md) and [current status](../STATUS.md) | Implemented, but latest live-provider and physical-device acceptance remain open. Final footage must be verified or this beat replaced. |

No live AI or speech-provider performance, physical multiplayer run, speed claim or audience statistic is claimed in the plan.
