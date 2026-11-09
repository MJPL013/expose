import { pack } from "./content";
import { spotlightPack } from "./spotlight";
import type { PackId } from "./contracts";
import { getPack, getSpotlightPack } from "./packs";
import { z } from "zod";
import { localizeContent } from "./languages";
import type { HostLanguage } from "./host";
import { SpotlightQuestionSchema } from "./spotlight";

const text = z.string();
const texts = z.array(text);
const heat = z.object({ mild: text, medium: text, spicy: text });
export const ContentSnapshotSchema = z.object({
  bluff: z.array(SpotlightQuestionSchema).optional(),
  version: text,
  data: z.object({
    id: text,
    name: text,
    tagline: text,
    traits: z.array(z.object({ id: text, left: text, right: text })),
    nominations: texts,
    replacementNomination: text,
    scenarios: texts,
    roundPrompts: texts,
    replacementRoundPrompts: texts,
    replacementScenarios: texts,
    lines: z.object({ mild: texts, medium: texts, spicy: texts }),
    catchphrase: text,
    catchphraseSample: text,
    botCatchphrases: z.object({ manoj: text, ananya: text, kabir: text }),
    defenseSample: text,
    alternateDecoy: text,
    replacementCallout: text,
    replacementCatchphrase: text,
    replacementWildcard: text,
    cardTitles: z.object({ late: text, planner: text }),
    wildcard: text,
    wildcardSample: text,
    syncQuestion: text,
    calloutLines: heat,
  }),
  story: z.object({ title: text, paragraphs: texts }),
  spotlight: z.object({
    fact: z.array(SpotlightQuestionSchema),
    favourite: z.array(SpotlightQuestionSchema),
  }),
});

export type ContentSnapshot = {
  bluff?: typeof spotlightPack.fact;
  version: string;
  data: Omit<typeof pack, "story">;
  story: ReturnType<typeof pack.story>;
  spotlight: typeof spotlightPack;
};
export function captureContent(
  seats: number,
  id: PackId = "hostel-2am",
  language: HostLanguage = "en",
): ContentSnapshot {
  const { story, ...data } = getPack(id);
  return localizeContent(
    structuredClone({
      version: `${id}@3:${language}`,
      data,
      story: story(
        "{hero}",
        "{speaker}",
        "{catchphrase}",
        Array.from({ length: seats }, (_, i) => `{seat${i}}`),
      ),
      spotlight: getSpotlightPack(id),
    }),
    language,
  );
}
export function contentFor(snapshot?: ContentSnapshot): typeof pack {
  if (!snapshot) return pack;
  return {
    ...snapshot.data,
    story: (hero, speaker, catchphrase, roster) => {
      const values: Record<string, string> = {
        hero,
        speaker,
        catchphrase,
        ...Object.fromEntries(roster.map((name, i) => [`seat${i}`, name])),
      };
      const render = (text: string) =>
        text.replace(
          /\{(hero|speaker|catchphrase|seat\d+)\}/g,
          (_, key) => values[key] ?? "",
        );
      return {
        title: render(snapshot.story.title),
        paragraphs: snapshot.story.paragraphs.map(render),
      };
    },
  };
}
