import type { Spice } from "./contracts";

export const pack = {
  id: "hostel-2am",
  name: "Hostel 2 AM",
  tagline: "Same friends. Different alibis.",
  traits: [
    { id: "planning", left: "Makes a plan", right: "Dekh lenge" },
    { id: "chaos", left: "Keeps it calm", right: "Starts the chaos" },
    { id: "timing", left: "Always early", right: "Five more minutes" },
  ],
  nominations: [
    "Who would turn a chai break into a 3 AM adventure?",
    "Who says ‘I’m ready’ while still looking for their shoes?",
  ],
  replacementNomination: "Who would bring the best snacks for an all-nighter?",
  scenarios: [
    "It’s 2 AM. The squad wants to leave in five minutes. What does Manoj say?",
    "The group project is due tomorrow. What do you tell the squad?",
  ],
  roundPrompts: [
    "It’s 2 AM. The squad has five minutes to leave. What does {name} say?",
    "The group project is due tomorrow. What does {name} tell the squad?",
    "The Wi-Fi goes down during movie night. What does {name} do?",
  ],
  replacementRoundPrompts: [
    "The canteen has one samosa left. What does {name} say?",
    "The squad needs a movie recommendation. What does {name} pick?",
  ],
  replacementScenarios: [
    "The canteen has one samosa left. What does Manoj say?",
    "Your friend asks you to pick a movie. What do you say?",
  ],
  lines: {
    mild: [
      "Bas two minutes. Shoes pehen raha hoon.",
      "I made a list. The list is still in my head.",
      "Chai first. Decisions later.",
      "I’ll bring the snacks. Probably.",
      "According to my spreadsheet, we left yesterday.",
    ],
    medium: [
      "Koi nahi, ho jayega. Alarm toh lagaya tha.",
      "Full planning hai. Plan kya hai, that’s a surprise.",
      "Bro, tension mat le. I know a shortcut.",
      "Main ready hoon. Mentally.",
      "My punctuality is currently in beta.",
    ],
    spicy: [
      "Main late nahi hoon. Tum log early ho.",
      "Deadline is just a strongly worded suggestion.",
      "The plan is confidence. Details are optional.",
      "I bring the vibes. You bring the actual plan.",
      "My to-do list filed a missing-person report.",
    ],
  } satisfies Record<Spice, string[]>,
  catchphrase: "What’s the one line your friends always hear you say?",
  catchphraseSample: "Koi nahi, ho jayega.",
  botCatchphrases: {
    manoj: "Bas two minutes.",
    ananya: "Screenshot le liya hai.",
    kabir: "Chai pe discuss karte hain.",
  },
  defenseSample: "Okay, but you should see me on a good day.",
  alternateDecoy: "My imaginary assistant already confirmed everything.",
  replacementCallout: "Tell us your best harmless excuse.",
  replacementCatchphrase: "What would you say to invite a friend for chai?",
  replacementWildcard: "Give your catchphrase a happy ending.",
  cardTitles: {
    late: "THE LAST-MINUTE LEGEND",
    planner: "THE PLAN WITH A PLAN",
  },
  story: (
    hero: string,
    localPlayer: string,
    catchphrase: string,
    roster: string[],
  ) => ({
    title: "The great 2 AM escape",
    paragraphs: [
      `At 2:03 AM, ${hero} announced a flawless plan. Nobody asked to see it. That was mistake number one.`,
      `${localPlayer} said, “${catchphrase}” ${roster[1]} heard this as permission to take the scenic route. ${roster[2] ?? roster[0]} was already collecting screenshots.`,
      `Three chai stops, one wrong turn, and absolutely no punctuality later, ${roster.at(-1)} declared the night a success. The squad agreed: same time tomorrow.`,
    ],
  }),
  wildcard: "Remix your catchphrase as the world’s least convincing excuse.",
  wildcardSample: "Koi nahi, ho jayega… after one more chai.",
  syncQuestion: "Who is most likely to turn this night into a legendary story?",
  calloutLines: {
    mild: "Your squad has a slightly different version of events. Care to explain?",
    medium:
      "Aapki rating aur squad ki rating… different departments, apparently.",
    spicy:
      "Your self-review has been returned for fact-checking. With annotations.",
  } satisfies Record<Spice, string>,
};

export const copy = {
  appName: "gnani",
  productName: "EXPOSE",
  localDemo: "LOCAL DEMO",
  sampleTranscript: "Sample transcript · not speech recognition",
  audioPrivate: "Your recording stays on this device for this session.",
  voiceConsent: "Include this clip in my reveal and highlight preview",
  permissionDenied:
    "Microphone access is unavailable. You can keep playing by typing.",
  interruption:
    "Connection paused for this simulation. Your session is still here.",
  invalidAction: "That action could not be read. Please try again.",
  unavailableVote: "That vote is unavailable. Choose another answer or skip.",
  skippedQuestion: "Question skipped. No explanation needed.",
  replacedQuestion: "Question replaced. You can also skip this round.",
  unavailableAction: "This action is not available in the current phase.",
  aiDecoy: "AI decoy",
};
