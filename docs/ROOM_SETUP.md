# Game 1 room setup and catalog — B078, 16 November 2026

## Rating tuner and seat alignment — 16 November 2026, B079

This revises B078's rating presentation and vehicle geometry. The opening three traits are fixed across Spotlight and Bluff: planning, calm/adventure and punctuality. Setting and room language change the wording; mode and spice do not shuffle these traits. The later scored prompts use the setting/spice catalog and unseen-question history.

Ratings display **5–4–3–2–1–0–1–2–3–4–5**: zero means balanced, and strength increases toward either labelled endpoint. The analogue tuner uses fine ticks, a moving needle and a direction-specific readout. Dragging, tapping, native arrow/Home/End keys, labelled direction buttons and an explicit **0 · Balanced** button all select deliberately. Untouched ratings remain null; the neutral needle is not an answer. Existing self/friend phase drafts still survive tab changes and refresh.

Canonical stored and submitted ratings remain **0–10**, with **5** as the midpoint. For example, displayed left-strength 3 stores 2; right-strength 3 stores 8. Scoring, validation, saved runs and protocol 7 are unchanged. Host context explains this display mapping; authored rating narration describes it in all five room languages. No database migration or question-catalog bump is needed. The current PWA shell is `gnani-public-shell-v21-rating-tuner`, superseding B078's cache name below.

Each vehicle now uses saddle/cabin-specific passenger positions, including a smaller front driver below the auto's sloping windscreen. All six sizes still display the selected number of characters and the saved host appearance.

Verification: **43 existing shared-engine/scoring/multilingual/PCM checks passed**. Backend host/provider checks: **20 passed, one failed** at the previously intermittent optional-reply timing assertion (`interactive-host.test.ts:238`). This revision does not fix or hide that unrelated timing failure. **47 inline Edge browser checks passed**, using simulated touch and keyboard: mirrored labels, canonical draft values, untouched gating, explicit midpoint selection, tab/refresh persistence, 320/390/1280-pixel layouts with enlarged text, reduced motion, six passenger counts and cabin/saddle geometry. Dark/light tuner and vehicle screenshots were reviewed. These are browser diagnostics, not physical-phone or live-provider acceptance. No new test files/folders or paid provider calls. Final production build, lint and type checks passed; six production-browser smoke checks verified backend health, 2/3/4 passenger counts, the current PWA shell and absence of page exceptions. The local app was restarted at http://localhost:3000.

This revises B048/B051 on `v2`. Game 1 uses socket protocol **7**, question catalog **5**, existing flow 4 and voice input version 2. GC2 stays protocol 3. No deployment or Git publication is part of this change.

## Choosing a game

| Choice | Effect |
| --- | --- |
| Spotlight | Guess the featured friend's locked factual answer; write creative answers for that friend to judge. |
| Bluff | Submit plausible answers, then identify the featured friend's real answer among the bluffs. |
| Setting | Hostel 2 AM supplies roommate, class and late-night scenarios; Goa Trip supplies travel, booking, beach and budget scenarios. Either setting works with either mode. |
| Mild / Medium / Spicy | Separate creative prompts and built-in lines: warm everyday teasing, confident excuses/awkward banter, or non-graphic dating/flirting. The existing host spice direction also changes its tone. Spicy requires each player to confirm adulthood before readiness. |

Points, predictions, ratings, host checkpoints and recording allowances are unchanged. AI commentary does not determine factual scores.

## Entry and controls

Creation, manual-code join and invitation join use the saved Profile name and character. First-time players complete Profile before creating/joining. Edit profile temporarily saves the unfinished room choices and optional code in sessionStorage (`expose.room-entry.v1`); a validated local return path restores them after Save, including after a Profile refresh. No room is created by opening Profile. Existing named browser profiles remain usable; explicit profile saves mark completion.

New normal rooms are remote. Old same-room runs and the isolated demo remain readable/playable. The remote/same-room selector is removed from creation.

The setup dialog contains mode cards, setting cards, a spice example drawn from gameplay's catalog, a horizontal timer rail, room language, question voice, then squad size. A persistent Create room action stays within reach. Native radio groups support keyboard selection. The six custom SVG vehicles show exactly 2–7 characters, beginning with the saved host character; the remaining characters represent available seats. The numeric count remains available independently of the illustration. Reduced motion disables the arrival transition.

| Pace | Both ratings steps | Answers | Choices/votes | Reveals |
| --- | --- | --- | --- | --- |
| Quick | 60 s | 30 s | 15 s | 10 s |
| Normal (default) | 90 s | 45 s | 30 s | 15 s |
| Relaxed | 120 s | 60 s | 45 s | 15 s |

These are phase deadlines, not capture caps. Existing five/15-second capture limits, one re-record, shared 15-second finalisation grace and 60-second host exchange ceiling remain. The approximate match length comes from the selected flow's scheduled durations. Every selected seat must join and become ready. Owner lobby changes to pace, language, spice or guided voice reset readiness before start.

## Content and language

`shared/src/game/catalog-scenes.ts`, `catalog-facts.ts` and `catalog.ts` are the new authored catalog. Each setting has 14 factual prompts and 14 creative prompts per spice, used by favourite and bluff mechanics. Each creative prompt combines a setting-specific event with a spice-specific task; Mild and Medium can revisit an everyday incident with a different task, while Spicy uses adult-party incidents. Hostel and Goa do not use location substitution for their scored scenarios.

Question IDs do not contain language. Catalog versions look like `goa-trip@5:ta:medium`; question identities include `v5`. Room history favours unseen IDs, allowing a full seven-player match and rematch before repeating eligible questions. Existing active runs retain their serialized questions and deadlines; new rooms/rematches use the new catalog. No automatic paid rewriting or migration of active content occurs.

Room questions, examples, traits, nominations, built-in answers/decoys, host direction and authored narration support English, Hindi, Hinglish, Telugu and Tamil. Navigation stays English. Locally served Noto fonts cover Hindi, Telugu and Tamil. Microphone language is independent: English, Hindi, Telugu or Tamil.

`shared/src/game/host.ts` centralizes language labels/codes and room-to-speech mappings. STT receives the selected microphone code per capture. Timbre v3 uses the configured multilingual voice and native language code; v2 selects a compatible language voice (Telugu Suhana, Tamil Asmita by default). It does not silently fall back to Hindi. Hinglish uses `hi-en` for v2 and `hi-IN` for v3. Actual provider availability and pronunciation still require live acceptance.

Cross-language answers retain original text and reviewed gameplay translation. Hinglish uses Latin script, so Hindi recognition also passes through translation/transliteration review. Editing invalidates a prior translation; translation failure leaves manual correction/Send available. Explicit aliases normalize equivalent authored factual examples across all five languages. Native Telugu/Tamil number words and option prefixes resolve spoken choices deterministically; ambiguous speech cannot select an option. Narration uses authored text, without an extra LLM call.

## Persistence and contracts

Room setup/content continue in existing PostgreSQL JSON run state, with room question history preserved on rematch. No new table or migration is required. Account preferences accept Tamil speech input. Local profile/setup drafts contain preferences only, not audio or answer transcripts.

Game 1 connect, intent, audio preparation and server state require protocol 7. Incompatible clients receive the existing refresh path. PWA shell cache is `gnani-public-shell-v20-room-protocol7`; private responses remain outside the shell cache. See [API](API.md), [voice](VOICE.md) and [frontend](FRONTEND.md).

## Verification boundary

Existing shared-engine/scoring/multilingual/PCM checks: **43 passed**. Existing transactional interactive-host/provider checks: **21 passed**. The optional-reply timing assertion recorded as failing in B077 passed this run without an assertion change; this does not establish a root-cause fix or a full-suite pass.

Inline, provider-free catalog diagnostics passed: **30 setting/spice/language combinations**, **4,200 authored factual alias checks**, **36 rematch/pace/readiness checks**, and **16 native spoken-number checks**. Local mocked WebSocket checks passed **14 STT/TTS language/model configurations**. These establish request configuration and deterministic behavior, not recognition quality.

**126 inline PostgreSQL checks** passed across 12 disposable two-player rooms, covering both modes, both added languages, all presets, persisted readiness resets/deadlines, protocol 7 snapshots, retained active content, rematch upgrades/unseen preference and manual correction after translation failure.

**50 Edge browser checks** passed with isolated profiles and intercepted room creation/invitations: Profile return (including refresh), saved settings/code, remote payload, six passenger counts and touch targets, native keyboard controls, timer snapping, 320/390/1280 px layouts, both themes, reduced motion, enlarged text and no page exceptions. Phone/desktop screenshots were reviewed. The initial dialog overflow and inherited dock styles were corrected and rechecked. This is browser evidence, not physical-device evidence. Final production build, lint/types, generated contracts and six production-browser smoke checks passed. The local preview is running at `http://localhost:3000`; protocol 7 health was verified. No new test files/folders were added. Real PC/phone matches in both modes, Telugu/Tamil STT and narration, native-speaker content review, speech latency and live translation quality remain pending. This change has not been deployed to EC2.
