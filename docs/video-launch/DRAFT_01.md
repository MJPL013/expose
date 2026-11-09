# Expose launch film: first draft

**B055, 7 November 2026.** Local video: `E:\self_random_project\Gnani\.data\video-launch\expose-launch-draft-01.mp4` (ignored by Git). The reproducible edit is [render_draft.py](render_draft.py), with editorial voice clips built by [build_voices.ps1](build_voices.ps1). Run the voice script, then `python docs/video-launch/render_draft.py` from the repository root. The script needs the local FFmpeg wheel under `.tools/video-python`, plus the current captured screenshots under `reference-images/live-2026-11-07`.

The draft is **60.00 seconds, 1280×720, 30 fps, H.264/AAC**. It uses the current Expose online home/setup, current playable demo screens, the extracted original Expose lockup, and the app's own charcoal, paper, marigold and red colours. It has three local synthetic character voices, English subtitle translations, an original simple score and a short quiet beat before the verified answer. The opening now says Expose is a friendship party game; the final card invites the viewer to create a room. No public play URL is claimed.

## Story and evidence corrections after independent review

- Recaptured the online setup with **three seats** to match the three fictional demo squadmates. The lobby is labelled **Demo gameplay** in the film. It is not presented as proof of a physical or live multiplayer match.
- Recaptured the rating change and the selected **A** vote from the current demo. The actual verified answer is **C**, so Manoj now guesses A and Ananya's “wrong” reaction matches the displayed result. The vote and answer are enlarged in the edit.
- Riya, whose name appears on the Friend Card, now reacts to **her own** card; Manoj says “Frame it.”
- The planned image-generated tabletop still could not be made because the built-in image-generation tool was unavailable in this session and no authorized API fallback was configured. The draft opens on a crop of the **fresh current app dossier**. No black-and-white concept photos or older screenshots were used.
- The planned AI-host beat is represented by the current demo verdict instead; no live AI-host output is claimed. All cast speech is editorial narration generated locally, not in-app player or host audio.

## Render check

The [timeline](timeline.json) validator reported **0 errors, 0 warnings** after dialogue timing and shot revisions. Video Director's [render QA](../../.data/video-launch/qa/report.md) reported 60.00 seconds, frame 0 and hook contrast pass, no single-frame flashes, planned cuts aligned with no missing/unplanned cuts, loudness **−14.7 LUFS**, true peak **−1.3 dBTP**, and the loudest 100 ms at **40.15 seconds**, the verified reveal. Its remaining warnings are read holds, two intended action-change spikes, and the original logo image's unmeasured text box. [Contact sheet](../../.data/video-launch/contact-sheet.jpg) and QA phone/hook sheets were visually reviewed.

## Next creative pass

Replace the local synthetic voices with consenting friends or a suitable approved speech model, record live product interactions if a demo run is to be portrayed as live multiplayer, and make the single [image-generated tabletop plate](IMAGE_PROMPTS.md) when an image-generation model is available. Add a public play URL only after one is verified. The current video is a reviewable **first cut**, not live-provider or physical-device acceptance evidence.
