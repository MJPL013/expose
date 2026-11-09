import type { Controller, ScoreEvent } from "./contracts";
import { z } from "zod";
import { hash, shuffled } from "./logic";

export const SpotlightQuestionSchema = z.object({
  id: z.string().optional(),
  prompt: z.string(),
  samples: z.array(z.string()).min(1),
  aliases: z.record(z.string(), z.string()).optional(),
});
export type SpotlightQuestion = z.infer<typeof SpotlightQuestionSchema>;
export const spotlightPack: Record<"fact" | "favourite", SpotlightQuestion[]> =
  {
    fact: [
      {
        prompt: "What is {name}’s favourite colour?",
        samples: ["Blue", "Black", "Red", "Green", "Purple"],
        aliases: {
          blu: "blue",
          neela: "blue",
          kala: "black",
          laal: "red",
          hara: "green",
          grey: "gray",
        },
      },
      {
        prompt: "What is {name}’s go-to drink at 2 AM?",
        samples: ["Chai", "Coffee", "Water", "Cola", "Milk"],
        aliases: {
          tea: "chai",
          "masala chai": "chai",
          paani: "water",
          pani: "water",
          coke: "cola",
        },
      },
      {
        prompt: "What late-night snack would {name} pick?",
        samples: ["Maggi", "Samosa", "Chips", "Pizza", "Biscuits"],
        aliases: {
          noodles: "maggi",
          maggie: "maggi",
          crisps: "chips",
          cookies: "biscuits",
        },
      },
      {
        prompt: "Which season does {name} like most?",
        samples: ["Winter", "Summer", "Monsoon", "Spring", "Autumn"],
        aliases: {
          fall: "autumn",
          rainy: "monsoon",
          rain: "monsoon",
          winters: "winter",
          summers: "summer",
        },
      },
      {
        prompt: "Which genre is {name}’s movie-night pick?",
        samples: ["Comedy", "Horror", "Action", "Romance", "Thriller"],
        aliases: { romantic: "romance", funny: "comedy", scary: "horror" },
      },
      {
        prompt: "What sweet treat would {name} order?",
        samples: ["Ice cream", "Chocolate", "Jalebi", "Gulab jamun", "Cake"],
        aliases: { icecream: "ice cream", chocolates: "chocolate" },
      },
    ],
    favourite: [
      {
        prompt: "{name} finds ₹1,000 at 2 AM. What happens next?",
        samples: [
          "Sabko chai, baaki kal dekhenge.",
          "Emergency Maggi fund, obviously.",
          "Ek legendary midnight breakfast.",
          "Main save karunga. For tomorrow’s snacks.",
          "Auto book karo, adventure time.",
          "A spreadsheet and a financial committee.",
        ],
      },
      {
        prompt: "Give {name} a title for their hostel biography.",
        samples: [
          "Bas Five More Minutes",
          "The Chai Minister",
          "Screenshot Saboot Hai",
          "Deadline Ke Baad",
          "The Accidental Planner",
          "Certified Pillow Consultant",
        ],
      },
      {
        prompt: "What would {name} put on the hostel notice board?",
        samples: [
          "Chai meeting. Attendance compulsory.",
          "Lost: my sleep schedule.",
          "Who took my charger? Confess now.",
          "Quiet hours start after this song.",
          "Maggi contributions welcome.",
          "Please submit your chaos in triplicate.",
        ],
      },
      {
        prompt: "What is {name}’s excuse for missing an 8 AM class?",
        samples: [
          "Alarm bhi so gaya tha.",
          "Researching dreams, very important.",
          "Chai queue was a national emergency.",
          "Main mentally present tha.",
          "Roommate said Sunday hai.",
          "My calendar entered witness protection.",
        ],
      },
      {
        prompt: "Plan {name}’s perfect five-minute break.",
        samples: [
          "Chai, biscuit, zero responsibilities.",
          "One song. Then twelve more.",
          "Bas aankhein band karunga.",
          "A corridor gossip update.",
          "Calling home for snack recommendations.",
          "A formally scheduled spontaneous dance.",
        ],
      },
      {
        prompt: "What would {name} name the squad’s group chat?",
        samples: [
          "Kal Se Serious",
          "Chai Pe Charcha",
          "Last Seen Studying",
          "Attendance Optional",
          "The Midnight Committee",
          "Department of Questionable Decisions",
        ],
      },
    ],
  };
export type SpotlightRound = {
  targetId: string;
  kind: "fact" | "favourite";
  questionIndex: number;
  questions?: SpotlightQuestion[];
  secret: string | null;
  submissions: Record<string, string>;
  controllers: Record<string, Controller>;
  selected: string | null;
  standIn: boolean;
  skipped: boolean;
  scored: boolean;
};
export function normalizeAnswer(text: string, question: SpotlightQuestion) {
  const normalized = text
    .normalize("NFKC")
    .toLocaleLowerCase("en")
    .trim()
    .replace(/\s+/g, " ");
  // Stable IDs were introduced with content v3. Preserve matching for pinned legacy questions.
  const key = question.id
    ? normalized.replace(/[.!?।॥]+$/, "").trim()
    : normalized;
  return question.aliases?.[key] ?? key;
}
export function spotlightQuestion(round: SpotlightRound) {
  const questions = round.questions ?? spotlightPack[round.kind];
  return questions[round.questionIndex % questions.length];
}
export function spotlightOptions(round: SpotlightRound, index: number) {
  const question = spotlightQuestion(round);
  const groups = new Map<
    string,
    { id: string; text: string; authors: string[]; isAI: boolean }
  >();
  function add(text: string, author: string | null) {
    const key = normalizeAnswer(text, question);
    const group = groups.get(key) ?? {
      id: `s${index}-${hash(key).toString(36)}`,
      text,
      authors: [],
      isAI: false,
    };
    if (author) group.authors.push(author);
    else group.isAI = true;
    groups.set(key, group);
  }
  for (const [author, text] of Object.entries(round.submissions))
    add(text, author);
  if (round.kind === "favourite" && !round.skipped)
    add(question.samples.at(-1)!, null);
  return shuffled([...groups.values()], `spotlight:${index}`);
}
export function scoreSpotlight(
  round: SpotlightRound,
  index: number,
  points: { factMatch: number; favourite: number },
): ScoreEvent[] {
  if (round.skipped) return [];
  const question = spotlightQuestion(round);
  const matches =
    round.kind === "fact"
      ? Object.entries(round.submissions)
          .filter(
            ([, text]) =>
              round.secret !== null &&
              normalizeAnswer(text, question) ===
                normalizeAnswer(round.secret, question),
          )
          .map(([id]) => id)
      : (spotlightOptions(round, index).find((o) => o.id === round.selected)
          ?.authors ?? []);
  return matches
    .filter((id) => id !== round.targetId)
    .map((playerId) => ({
      playerId,
      round: index,
      rule: round.kind === "fact" ? "factMatch" : "favourite",
      points: round.kind === "fact" ? points.factMatch : points.favourite,
      controller: round.controllers[playerId] ?? "human",
    }));
}
