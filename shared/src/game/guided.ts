import { z } from "zod";
import type { GameSnapshot, StepType } from "./contracts";
import type { HostLanguage } from "./host";

export const PaceSchema = z.enum(["quick", "normal", "relaxed"]);
export type Pace = z.infer<typeof PaceSchema>;
export const paceTimes = {
  quick: { ratings: 60, answer: 30, choice: 15, reveal: 10 },
  normal: { ratings: 90, answer: 45, choice: 30, reveal: 15 },
  relaxed: { ratings: 120, answer: 60, choice: 45, reveal: 15 },
} as const;
export function pacedDuration(type: StepType, pace: Pace, fallback: number) {
  const p = paceTimes[pace];
  const seconds =
    type === "traits"
      ? p.ratings
      : ["secret", "guess", "answer", "catchphrase", "wildcard"].includes(type)
        ? p.answer
        : ["nomination", "vote", "judge", "sync"].includes(type)
          ? p.choice
          : ["reveal", "spotlight-reveal", "verdict"].includes(type)
            ? p.reveal
            : null;
  return seconds === null ? fallback : seconds * 1000;
}
export const narratedInputs = new Set<StepType>([
  "traits",
  "nomination",
  "catchphrase",
  "secret",
  "guess",
  "answer",
  "vote",
  "judge",
  "sync",
]);
export const NarrationSchema = z
  .object({
    id: z.string(),
    epoch: z.number(),
    text: z.string(),
    status: z.enum(["pending", "generating", "presenting", "done"]),
    generationDeadline: z.number(),
    opensAt: z.number(),
    audioUrl: z.string().optional(),
    playbackSeat: z.string().optional(),
  })
  .strict();
export type Narration = z.infer<typeof NarrationSchema>;
export type SpokenChoice = { id: string; text: string; number: number };
export function choicesFor(view: GameSnapshot): SpokenChoice[] {
  const p = view.view.phase;
  if (p.type === "nomination" || (p.type === "sync" && !p.results))
    return view.players.map((s, i) => ({
      id: s.id,
      text: s.name,
      number: i + 1,
    }));
  if (p.type === "vote")
    return p.options.flatMap((o, i) =>
      o.isOwn ? [] : [{ id: o.id, text: o.text, number: i + 1 }],
    );
  if (p.type === "judge")
    return p.options.map((o, i) => ({ ...o, number: i + 1 }));
  return [];
}
const normalized = (s: string) =>
  s
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[.,!?।]/g, "")
    .trim()
    .replace(/\s+/g, " ");
const numbers = [
  ["1", "one", "first", "a", "एक", "ek", "ఒకటి", "okati"],
  ["2", "two", "second", "b", "दो", "do", "రెండు", "rendu"],
  ["3", "three", "third", "c", "तीन", "teen", "మూడు", "moodu"],
  ["4", "four", "fourth", "d", "चार", "chaar", "నాలుగు", "nalugu"],
  ["5", "five", "fifth", "e", "पांच", "पाँच", "paanch", "ఐదు", "aidu"],
  ["6", "six", "sixth", "f", "छह", "chhe", "ఆరు", "aaru"],
  ["7", "seven", "seventh", "g", "सात", "saat", "ఏడు", "edu"],
  ["8", "eight", "eighth", "h", "आठ", "aath", "ఎనిమిది", "enimidi"],
];
/** Only exact visible labels or curated option aliases can select a choice. */
export function matchSpokenChoice(text: string, choices: SpokenChoice[]) {
  const value = normalized(text).replace(
    /^(?:(?:option|number|choice|i choose|i pick|विकल्प|नंबर|ऑप्शन|संख्या|ఆప్షన్|నంబర్|వికల్పం|సంఖ్య)\s+)+/,
    "",
  );
  const matches = choices.filter(
    (c) =>
      normalized(c.text) === value || numbers[c.number - 1]?.includes(value),
  );
  return matches.length === 1 ? matches[0] : null;
}
const words = {
  en: {
    choose: "Say the option number or tap a choice, then lock it.",
    answer: "Hold to speak, review, then send. You can also type or pass.",
    secret: "Keep this answer secret. Friends, wait for your turn.",
    guess: "Now guess {name}'s answer.",
    judge: "{name}, choose your favourite answer.",
    vote: "Now choose {name}'s real answer.",
    traits:
      "Rate yourself on all three sliders, then rate your friend. Zero is the left label; ten is the right.",
    wait: "Your answer is locked. Waiting for your friends.",
    option: "Option",
  },
  hi: {
    choose: "विकल्प का नंबर बोलो या उसे चुनो, फिर लॉक करो।",
    answer: "माइक दबाकर बोलो, जवाब देखो, फिर भेजो। लिख या पास भी कर सकते हो।",
    secret: "यह जवाब गुप्त रखो। बाकी दोस्त अपनी बारी का इंतज़ार करें।",
    guess: "अब {name} का जवाब बताओ।",
    judge: "{name}, अपना पसंदीदा जवाब चुनो।",
    vote: "अब {name} का असली जवाब चुनो।",
    traits:
      "तीनों स्लाइडर पर पहले खुद को, फिर अपने दोस्त को रेट करो। शून्य बायाँ सिरा है, दस दायाँ।",
    wait: "जवाब लॉक है। दोस्तों का इंतज़ार है।",
    option: "विकल्प",
  },
  hinglish: {
    choose: "Option ka number bolo ya tap karo, phir lock karo.",
    answer:
      "Mic hold karke bolo, answer check karo, phir send. Type ya pass bhi kar sakte ho.",
    secret: "Ye answer secret rakho. Baaki friends, apni turn ka wait karo.",
    guess: "Ab {name} ka answer guess karo.",
    judge: "{name}, apna favourite answer choose karo.",
    vote: "Ab {name} ka real answer choose karo.",
    traits:
      "Pehle teeno sliders par khud ko, phir friend ko rate karo. Zero left label hai, ten right.",
    wait: "Answer locked. Friends ka wait hai.",
    option: "Option",
  },
} as const;
export const guideWords = (language: HostLanguage = "en") => words[language];
/** Uses only the public projection. Never pass raw run answers to narration. */
export function questionNarration(view: GameSnapshot): string {
  const p = view.view.phase,
    w = guideWords(view.setup.hostLanguage);
  const target =
    "targetId" in p
      ? (view.players.find((s) => s.id === p.targetId)?.name ?? "")
      : "";
  let text = "";
  if (p.type === "traits") text = w.traits;
  if (p.type === "nomination" || p.type === "sync") text = p.question;
  if (["catchphrase", "secret", "answer"].includes(p.type) && "prompt" in p)
    text = p.prompt + " " + (p.type === "secret" ? w.secret : w.answer);
  if (p.type === "guess")
    text =
      (p.kind === "fact" ? w.guess.replace("{name}", target) : p.prompt) +
      " " +
      w.answer;
  if (p.type === "judge") text = w.judge.replace("{name}", target);
  if (p.type === "vote") text = w.vote.replace("{name}", target);
  if (["nomination", "sync", "vote", "judge"].includes(p.type)) {
    // All anonymous options are public here; ownership and truth markers are never spoken.
    const choices =
      p.type === "vote"
        ? p.options.map((o, i) => ({ ...o, number: i + 1 }))
        : choicesFor(view);
    text +=
      " " +
      choices.map((c) => `${w.option} ${c.number}. ${c.text}`).join(" ") +
      " " +
      w.choose;
  }
  return text.trim();
}
