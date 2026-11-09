import type { PackId } from "./contracts";
import { pack as hostel } from "./content";
import { spotlightPack, type SpotlightQuestion } from "./spotlight";

const goa: typeof hostel = {
  ...hostel,
  id: "goa-trip",
  name: "Goa Trip",
  tagline: "One group chat. A thousand cancelled plans.",
  traits: [
    { id: "planning", left: "Books everything", right: "Bas nikalte hain" },
    { id: "chaos", left: "Beach nap", right: "Next adventure" },
    { id: "timing", left: "Sunrise ready", right: "Five more minutes" },
  ],
  nominations: [
    "Who would turn a two-day Goa trip into a week?",
    "Who says ‘tickets booked’ while still comparing flights?",
  ],
  replacementNomination: "Who would find the best sunset spot for the squad?",
  roundPrompts: [
    "The Goa plan finally leaves the group chat. What does {name} say?",
    "The squad took a wrong turn on the way to the beach. What is {name}’s excuse?",
    "The hotel booking is for tomorrow. What does {name} tell reception?",
    "Everyone wants a different sunset spot. How does {name} settle it?",
  ],
  replacementRoundPrompts: [
    "The squad has one scooter and too many bags. What does {name} suggest?",
    "It starts raining at the beach. What is {name}’s new plan?",
  ],
  lines: {
    mild: [
      "Beach pe chai milegi na?",
      "Tickets booked. Sunscreen bhool gaya.",
      "Sunset first, plans later.",
      "Main playlist sambhalta hoon.",
      "My itinerary has scheduled spontaneous fun.",
    ],
    medium: [
      "Goa ka plan is baar pakka hai.",
      "Shortcut hai bro, map ko ignore kar.",
      "Budget trip, premium expectations.",
      "Main ready hoon. Swimsuit mentally packed.",
      "The beach has accepted my calendar invitation.",
    ],
    spicy: [
      "Goa aa gaye. Group chat still says maybe.",
      "Budget ne trip se resign kar diya.",
      "Sunscreen optional, confidence compulsory.",
      "Itinerary mera, responsibility tumhari.",
      "My holiday spreadsheet has filed for leave.",
    ],
  },
  catchphrase: "What’s your signature line when the squad plans a trip?",
  catchphraseSample: "Is baar Goa pakka.",
  replacementCatchphrase: "Convince the squad to catch the sunrise.",
  wildcard: "Turn your trip catchphrase into an excuse for missing the bus.",
  wildcardSample: "Goa pakka… bus agle waali.",
  syncQuestion: "Who will accidentally make this trip unforgettable?",
  cardTitles: {
    late: "THE LAST-BOARDING LEGEND",
    planner: "THE ITINERARY INSPECTOR",
  },
  story: (hero, speaker, catchphrase, roster) => ({
    title: "The Goa plan that actually happened",
    paragraphs: [
      `${hero} finally got the Goa plan out of the group chat. The tickets were real. The itinerary was mostly optimism.`,
      `${speaker} said, “${catchphrase}” ${roster[1]} took that as permission for a beach detour. ${roster[2] ?? roster[0]} documented every wrong turn.`,
      `One missed sunset, three snack stops and a very dramatic map debate later, ${roster.at(-1)} called it the perfect trip. Nobody checked the return tickets.`,
    ],
  }),
};
const goaQuestions: Record<"fact" | "favourite", SpotlightQuestion[]> = {
  fact: [
    {
      prompt: "What drink would {name} order at the beach?",
      samples: ["Coconut water", "Lemonade", "Cola", "Water", "Chai"],
      aliases: {
        nariyal: "coconut water",
        "nariyal pani": "coconut water",
        "nimbu pani": "lemonade",
        coke: "cola",
        tea: "chai",
        pani: "water",
      },
    },
    {
      prompt: "Does {name} prefer sunrise or sunset?",
      samples: ["Sunset", "Sunrise"],
      aliases: { evening: "sunset", morning: "sunrise" },
    },
    {
      prompt: "What snack would {name} pack for the road?",
      samples: ["Chips", "Sandwich", "Biscuits", "Fruit", "Nuts"],
      aliases: { crisps: "chips", cookies: "biscuits", sandwiches: "sandwich" },
    },
    {
      prompt: "Would {name} pick the beach, a fort or a market first?",
      samples: ["Beach", "Fort", "Market"],
      aliases: { shopping: "market", sea: "beach" },
    },
    {
      prompt: "What colour is {name}’s ideal holiday outfit?",
      samples: ["Blue", "Black", "White", "Green", "Red"],
      aliases: {
        blu: "blue",
        neela: "blue",
        kala: "black",
        safed: "white",
        hara: "green",
        laal: "red",
      },
    },
    {
      prompt: "What does {name} always forget to pack?",
      samples: ["Charger", "Sunscreen", "Towel", "Sunglasses", "Nothing"],
      aliases: {
        "phone charger": "charger",
        sunblock: "sunscreen",
        shades: "sunglasses",
      },
    },
    {
      prompt: "Does {name} prefer a train, flight or road trip?",
      samples: ["Train", "Flight", "Road trip"],
      aliases: { plane: "flight", car: "road trip", road: "road trip" },
    },
    {
      prompt: "What music would {name} play on the way to Goa?",
      samples: ["Bollywood", "Pop", "Indie", "Rock", "Punjabi"],
      aliases: { hindi: "bollywood" },
    },
  ],
  favourite: [
    {
      prompt: "Give {name}’s Goa trip a movie title.",
      samples: [
        "Tickets Toh Book Hain",
        "Sunscreen Aur Suspense",
        "Bas Ek Aur Beach",
        "Budget Ki Kahaani",
        "Return Flight Optional",
        "The Spreadsheet Goes Swimming",
      ],
    },
    {
      prompt: "What would {name} say after missing the sunset?",
      samples: [
        "Kal bhi toh hoga.",
        "Photos mein filter laga denge.",
        "Chai was worth it.",
        "Main mentally dekh liya.",
        "Sun ne wait nahi kiya.",
        "I have requested an official sunset reschedule.",
      ],
    },
    {
      prompt: "Write {name}’s excuse for the wrong hotel booking.",
      samples: [
        "Same name tha bro.",
        "Surprise location upgrade.",
        "Adventure ka part hai.",
        "Reviews acche the.",
        "Goa ke paas hi hai… mostly.",
        "My booking assistant is a confused coconut.",
      ],
    },
    {
      prompt: "What would {name} put in the trip group chat at 6 AM?",
      samples: [
        "Sunrise gang, uth jao.",
        "Five more minutes.",
        "Breakfast kahan hai?",
        "Scooter ki key kispe hai?",
        "Main location bhej raha hoon.",
        "Attendance will be taken by the seagulls.",
      ],
    },
    {
      prompt: "Invent {name}’s perfect beach job.",
      samples: [
        "Chief Chai Officer",
        "Sunset Photographer",
        "Snack Security",
        "Playlist Minister",
        "Professional Hammock Tester",
        "Executive Sandcastle Compliance Auditor",
      ],
    },
    {
      prompt: "How would {name} explain the trip budget?",
      samples: [
        "Memories priceless hain.",
        "Petrol ka split baaki hai.",
        "Souvenirs investment hain.",
        "Kal se saving.",
        "Calculator ko rest do.",
        "The coconuts have requested a financial audit.",
      ],
    },
    {
      prompt: "What souvenir would {name} bring back for the squad?",
      samples: [
        "Matching fridge magnets",
        "A thousand blurry photos",
        "Beach sand in every bag",
        "A new group-chat name",
        "Cashews for everyone",
        "A formally certified ocean breeze",
      ],
    },
    {
      prompt: "Write {name}’s next-trip announcement.",
      samples: [
        "Goa again?",
        "Is baar itinerary follow karenge.",
        "Pehle photos bhejo.",
        "Same gang, new chaos.",
        "Tickets kaun book karega?",
        "Please consult the Ministry of Spontaneous Travel.",
      ],
    },
  ],
};
export const packCatalog = [hostel, goa].map(({ id, name, tagline }) => ({
  id: id as PackId,
  name,
  tagline,
}));
export function getPack(id: PackId = "hostel-2am") {
  return id === "goa-trip" ? goa : hostel;
}
export function getSpotlightPack(id: PackId = "hostel-2am") {
  return id === "goa-trip" ? goaQuestions : spotlightPack;
}
