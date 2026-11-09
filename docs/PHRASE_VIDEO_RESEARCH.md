# Phrase-matched video for recorded catchphrases

Research checked 4 November 2026. This is a feature investigation, not an implemented integration or a license grant.

## Goal and current boundary

The proposed effect is: a player records a catchphrase, the game finds a short video in which someone says the same words, mutes the source audio, and plays the player's recording with the video. The current [catchphrase phase](GAME_FLOW.md) accepts typed text or a recorded, editable transcript. [Ordinary recordings](VOICE.md) remain in browser memory and are not saved for later playback. Sharing a player's voice with the room would require a separate opt-in, authorized delivery and expiry behavior.

## Source investigation

| Source | What it offers | Fit for exact spoken phrase and replacement audio |
| --- | --- | --- |
| [PlayPhrase.me](https://www.playphrase.me/) | Searches short movie and TV dialogue clips, with a separate [Mixer](https://mixer.playphrase.me/) for user-uploaded downloaded clips | Its [Fair Use Policy](https://www.playphrase.me/fair-use-policy.html) explicitly says there is no public or private API, free or paid. Its [Terms](https://www.playphrase.me/terms-of-use.html) disallow scraping, systematic copying and redistribution; the policy limits downloaded clip sharing to personal, educational, noncommercial use. It does not grant Expose rights to fetch, edit or serve its clips. Its own fair-use claim is specific to its service. |
| [GIPHY Clips](https://developers.giphy.com/docs/clips/endpoint/search/) | API searches short videos by text; some clips have [caption files](https://developers.giphy.com/docs/clips/schema/) that could confirm words and timing | Closest external API, but Clips access requires approval. Text search is not a guarantee that the exact words are spoken. Permission to mute, overdub or redistribute the returned video needs confirmation in the partner agreement. |
| [Pexels Videos API](https://www.pexels.com/api/documentation/) | Free topic-based video search; [license](https://www.pexels.com/license/) permits editing and app use, subject to limits such as not implying endorsement | Suitable for a thematic video behind the player's voice, but API search does not expose spoken-word transcripts or exact dialogue timing. |
| [Pixabay Videos API](https://pixabay.com/api/docs/) | Searchable stock video under its [content license](https://pixabay.com/service/license-summary/) | Similar thematic fallback; no documented spoken-phrase index. Check the license and depicted-person rights for each use. |
| [D-ID Echo Sessions](https://docs.d-id.com/docs/echo-sessions-quickstart) | Streams supplied audio into a talking avatar that lip-syncs the voice | Supports arbitrary recorded phrases with the player's audio, but produces an avatar rather than finding an existing movie scene. Requires a provider account, licensed avatar and a live session; pricing and actual game latency were not tested. Its [offline Talks API](https://docs.d-id.com/docs/v2-photo-avatar-quickstart) documents roughly 10–30 seconds of processing, too slow to assume an instant reveal. |
| YouTube Data API | Public video discovery and player embedding | [Developer policies](https://developers.google.com/youtube/terms/developer-policies) prohibit separating or modifying the audiovisual components, including applying an alternate audio track, so the proposed overdub is not supported through that integration. |

## Practical direction

A small first-party catalog is the most controllable way to achieve the intended effect: record or commission short silent and spoken performances of known game catchphrases with permission for in-game revoicing; index each clip by exact normalized text, language and spoken timing. On a match, validate the transcript, choose a matching clip, mute its original audio, and synchronize the player's consented recording. If no exact match exists, show a visual card or stock scene rather than claiming a quote match. Arbitrary user phrases cannot be guaranteed to occur in any finite catalog.

Even with a matched phrase, another speaker's mouth timing will differ from the player's audio. A short fixed phrase and duration-based selection may look acceptable; reliable lip sync needs a separate processing step and permissions. Pre-indexing and prefetching selected videos would avoid a live external search at reveal time. Before any room-wide voice playback, define explicit consent, clip/audio retention, access control, moderation and a delete path. Keep provider and catalog credentials in the backend.

No API credentials, clips or user audio were downloaded or integrated in this investigation. No live API request or device playback test was run.
