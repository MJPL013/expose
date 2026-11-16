import type { ContentSnapshot } from "./content-snapshot";
import type { Setup, PackId, Spice } from "./contracts";
import type { HostLanguage } from "./host";
import { shuffled } from "./logic";
import { aliasesFor } from "./answer-aliases";
import { answers, hostelFacts, goaFacts } from "./catalog-facts";
import {
  text5,
  type Text5,
  hostelScenes,
  goaScenes,
  hostelAdult,
  goaAdult,
  tasks,
} from "./catalog-scenes";
export const CATALOG_VERSION = 5;
const lines: Record<Spice, Text5[]> = {
  mild: [
    [
      "Snacks first. A plan will follow.",
      "पहले नाश्ता, फिर प्लान।",
      "Pehle snacks, phir plan.",
      "ముందు తిండి, తర్వాత ప్లాన్.",
      "முதலில் சிற்றுண்டி, பிறகு திட்டம்.",
    ],
    [
      "I brought enthusiasm, not instructions.",
      "मैं उत्साह लाया, निर्देश नहीं।",
      "Enthusiasm laaya, instructions nahi.",
      "ఉత్సాహం తెచ్చాను, సూచనలు కాదు.",
      "உற்சாகம் கொண்டுவந்தேன், வழிமுறைகள் இல்லை.",
    ],
    [
      "Five minutes. This time I mean it.",
      "पाँच मिनट। इस बार सच में।",
      "Five minutes. Is baar sach mein.",
      "ఐదు నిమిషాలు. ఈసారి నిజంగా.",
      "ஐந்து நிமிடங்கள். இந்த முறை நிச்சயமாக.",
    ],
    [
      "The snack committee has approved.",
      "नाश्ता समिति ने मंज़ूरी दे दी।",
      "Snack committee ne approve kiya.",
      "చిరుతిండి కమిటీ ఒప్పుకుంది.",
      "சிற்றுண்டிக் குழு ஒப்புதல் கொடுத்தது.",
    ],
    [
      "My calendar needs a holiday.",
      "मेरे कैलेंडर को छुट्टी चाहिए।",
      "Mere calendar ko holiday chahiye.",
      "నా క్యాలెండర్‌కు సెలవు కావాలి.",
      "என் காலண்டருக்கு விடுமுறை தேவை.",
    ],
  ],
  medium: [
    [
      "My confidence arrived before my competence.",
      "काबिलियत से पहले आत्मविश्वास आ गया।",
      "Competence se pehle confidence aa gaya.",
      "సామర్థ్యం కంటే ముందే ఆత్మవిశ్వాసం వచ్చింది.",
      "திறமைக்கு முன்னால் தன்னம்பிக்கை வந்துவிட்டது.",
    ],
    [
      "Blame the unpaid intern: me.",
      "बिना वेतन के इंटर्न को दोष दो: मुझे।",
      "Unpaid intern ko blame karo: mujhe.",
      "జీతం లేని ఇంటర్న్‌ను నిందించండి: నన్నే.",
      "சம்பளம் இல்லாத இன்டர்னைக் குறை சொல்லுங்கள்: என்னைத்தான்.",
    ],
    [
      "My excuse has perfect attendance.",
      "मेरे बहाने की हाज़िरी पूरी है।",
      "Mere excuse ki attendance perfect hai.",
      "నా సాకుకు హాజరు శాతం వంద.",
      "என் சாக்கு தினமும் தவறாமல் வருகிறது.",
    ],
    [
      "The screenshots lack context. Obviously.",
      "स्क्रीनशॉट में संदर्भ नहीं है। ज़ाहिर है।",
      "Screenshots mein context nahi hai. Obviously.",
      "స్క్రీన్‌షాట్లకు సందర్భం లేదు. ఖచ్చితంగా.",
      "ஸ்கிரீன்ஷாட்களில் சூழல் இல்லை. நிச்சயமாக.",
    ],
    [
      "My plan exists in another timezone.",
      "मेरा प्लान दूसरे समय क्षेत्र में है।",
      "Mera plan doosre timezone mein hai.",
      "నా ప్లాన్ వేరే టైమ్‌జోన్‌లో ఉంది.",
      "என் திட்டம் வேறொரு நேர மண்டலத்தில் உள்ளது.",
    ],
  ],
  spicy: [
    [
      "My flirting needs technical support.",
      "मेरी फ़्लर्टिंग को तकनीकी मदद चाहिए।",
      "Meri flirting ko tech support chahiye.",
      "నా ఫ్లర్టింగ్‌కు టెక్నికల్ సపోర్ట్ కావాలి.",
      "என் ஃப்ளர்ட்டிங்கிற்கு தொழில்நுட்ப உதவி தேவை.",
    ],
    [
      "Chemistry confirmed. Common sense missing.",
      "आकर्षण पक्का। समझ लापता।",
      "Chemistry confirmed. Common sense missing.",
      "కెమిస్ట్రీ ఖాయం. కామన్ సెన్స్ కనిపించదు.",
      "கெமிஸ்ட்ரி உறுதி. பொது அறிவைக் காணவில்லை.",
    ],
    [
      "Even my imaginary date left me on read.",
      "काल्पनिक डेट ने भी पढ़कर जवाब नहीं दिया।",
      "Imaginary date ne bhi read par chhod diya.",
      "ఊహల్లోని డేట్ కూడా చదివి జవాబు ఇవ్వలేదు.",
      "கற்பனை டேட் கூட படித்துவிட்டுப் பதில் தரவில்லை.",
    ],
    [
      "A red flag, but excellent lighting.",
      "ख़तरे का संकेत, पर रोशनी अच्छी है।",
      "Red flag, par lighting excellent hai.",
      "రెడ్ ఫ్లాగ్, కానీ లైటింగ్ బాగుంది.",
      "ரெட் ஃப்ளாக், ஆனால் வெளிச்சம் அருமை.",
    ],
    [
      "All that confidence and not a damn clue.",
      "इतना आत्मविश्वास, कमबख़्त समझ बिल्कुल नहीं।",
      "Itna confidence, damn clue bhi nahi.",
      "అంత ధైర్యం, అసలు ఏమీ తెలియదు.",
      "அவ்வளவு தன்னம்பிக்கை, ஒரு விவரமும் தெரியவில்லை.",
    ],
  ],
};
export function creativeQuestions(
  pack: PackId,
  spice: Spice,
  language: HostLanguage,
) {
  const scenes =
    spice === "spicy"
      ? pack === "goa-trip"
        ? goaAdult
        : hostelAdult
      : pack === "goa-trip"
        ? goaScenes
        : hostelScenes;
  return scenes.map((scene, i) => ({
    id: `${pack}:v5:creative:${spice}:${i}`,
    prompt: `${text5(scene, language)} ${text5(tasks[spice][i % tasks[spice].length], language)}`,
    samples: [text5(lines[spice][i % 5], language)],
  }));
}
export function previewQuestion(
  pack: PackId,
  spice: Spice,
  language: HostLanguage,
) {
  return creativeQuestions(pack, spice, language)[0].prompt;
}
export function catalogContent(
  base: ContentSnapshot,
  setup: Setup,
  seed: string,
  seen: string[] = [],
): ContentSnapshot {
  const s = structuredClone(base),
    lang = setup.hostLanguage ?? "hinglish",
    pack = setup.packId ?? "hostel-2am",
    goa = pack === "goa-trip";
  const t = (v: Text5) => text5(v, lang),
    p = s.data;
  const order = <T extends { id?: string }>(items: T[], kind: string) => {
    const deck = shuffled(items, `${seed}:${pack}:${kind}`);
    return [
      ...deck.filter((q) => !seen.includes(q.id!)),
      ...deck.filter((q) => seen.includes(q.id!)),
    ];
  };
  s.version = `${pack}@${CATALOG_VERSION}:${lang}:${setup.spice}`;
  s.spotlight.fact = order(
    (goa ? goaFacts : hostelFacts).map(([key, topic, pool]) => {
      const variants = answers[pool],
        aliases: Record<string, string> = {};
      for (const a of variants)
        for (const v of a)
          aliases[v.normalize("NFKC").toLowerCase()] = a[0].toLowerCase();
      return {
        id: `${pack}:v5:fact:${key}`,
        prompt: t([
          `What would {name} choose for ${topic[0]}?`,
          `${topic[1]} के लिए {name} क्या चुनेगा?`,
          `${topic[2]} ke liye {name} kya choose karega?`,
          `${topic[3]} కోసం {name} ఏది ఎంచుకుంటారు?`,
          `${topic[4]}: {name} எதைத் தேர்ந்தெடுப்பார்?`,
        ]),
        samples: variants.map(t),
        aliases: aliasesFor(
          variants.map((a) => a[0]),
          aliases,
        ),
      };
    }),
    "fact",
  );
  const creative = creativeQuestions(pack, setup.spice, lang);
  s.spotlight.favourite = order(creative, "favourite");
  s.bluff = order(creative, "bluff");
  p.scenarios = (goa ? goaScenes : hostelScenes).map(t);
  p.replacementScenarios = p.scenarios.slice(7);
  p.roundPrompts = s.bluff.map((q) => q.prompt);
  p.replacementRoundPrompts = p.roundPrompts.slice(7);
  for (const heat of ["mild", "medium", "spicy"] as const)
    p.lines[heat] = lines[heat].map(t);
  p.traits = [
    {
      id: "planning",
      left: t(
        goa
          ? [
              "Itinerary ready",
              "यात्रा का प्लान तैयार",
              "Itinerary ready",
              "ప్రయాణ ప్రణాళిక సిద్ధం",
              "பயணத் திட்டம் தயார்",
            ]
          : [
              "Plans everything",
              "हर चीज़ का प्लान",
              "Sabka plan",
              "అన్నీ ప్లాన్ చేస్తారు",
              "எல்லாவற்றையும் திட்டமிடுவார்",
            ],
      ),
      right: t([
        "Figures it out later",
        "बाद में देखेंगे",
        "Baad mein dekhenge",
        "తర్వాత చూసుకుందాం",
        "பிறகு பார்த்துக்கொள்ளலாம்",
      ]),
    },
    {
      id: "chaos",
      left: t([
        "Keeps it calm",
        "शांत रखता है",
        "Calm rakhta hai",
        "ప్రశాంతంగా ఉంచుతారు",
        "அமைதியாக வைத்திருப்பார்",
      ]),
      right: t([
        "Starts the adventure",
        "रोमांच शुरू करता है",
        "Adventure start karta hai",
        "సాహసం మొదలుపెడతారు",
        "சாகசத்தைத் தொடங்குவார்",
      ]),
    },
    {
      id: "timing",
      left: t([
        "Always early",
        "हमेशा पहले",
        "Always early",
        "ఎప్పుడూ ముందే",
        "எப்போதும் சீக்கிரம்",
      ]),
      right: t([
        "Five more minutes",
        "पाँच मिनट और",
        "Five more minutes",
        "ఇంకో ఐదు నిమిషాలు",
        "இன்னும் ஐந்து நிமிடங்கள்",
      ]),
    },
  ];
  p.nominations = (
    (goa
      ? [
          [
            "Who would turn a two-day Goa trip into a week?",
            "दो दिन की गोवा ट्रिप को हफ़्ते भर का कौन बनाएगा?",
            "Do din ki Goa trip ko week ka kaun banayega?",
            "రెండు రోజుల గోవా ట్రిప్‌ను వారంగా ఎవరు మారుస్తారు?",
            "இரண்டு நாள் கோவா பயணத்தை ஒரு வாரமாக மாற்றுவது யார்?",
          ],
          [
            "Who announces tickets are booked before choosing a train?",
            "ट्रेन चुनने से पहले टिकट बुक होने का दावा कौन करेगा?",
            "Train choose karne se pehle booked kaun bolega?",
            "రైలు ఎంచుకోకముందే టికెట్లు బుక్ అయ్యాయనేది ఎవరు?",
            "ரயிலைத் தேர்ந்தெடுக்கும் முன்பே டிக்கெட் எடுத்தாச்சு என்பவர் யார்?",
          ],
        ]
      : [
          [
            "Who would turn a chai break into a 3 AM adventure?",
            "चाय के ब्रेक को सुबह तीन बजे का रोमांच कौन बनाएगा?",
            "Chai break ko three AM adventure kaun banayega?",
            "టీ విరామాన్ని తెల్లవారుజామున సాహసంగా ఎవరు మారుస్తారు?",
            "தேநீர் இடைவேளையை அதிகாலை மூன்று மணி சாகசமாக மாற்றுவது யார்?",
          ],
          [
            "Who says they are ready while still looking for their shoes?",
            "जूते ढूँढते हुए भी तैयार होने का दावा कौन करता है?",
            "Shoes dhoondte hue ready kaun bolta hai?",
            "చెప్పులు వెతుకుతూనే సిద్ధమని చెప్పేది ఎవరు?",
            "காலணிகளைத் தேடிக்கொண்டே தயாராகிவிட்டேன் என்பவர் யார்?",
          ],
        ]) as Text5[]
  ).map(t);
  p.replacementNomination = p.nominations[0];
  p.catchphrase = t(
    goa
      ? [
          "What line do you always say when planning a trip?",
          "ट्रिप का प्लान बनाते समय तुम्हारी पक्की लाइन क्या है?",
          "Trip plan karte waqt tumhari signature line kya hai?",
          "ట్రిప్ ప్లాన్ చేసేటప్పుడు మీరు ఎప్పుడూ చెప్పే మాట ఏది?",
          "பயணம் திட்டமிடும்போது நீங்கள் எப்போதும் சொல்லும் வசனம் என்ன?",
        ]
      : [
          "What line do your friends always hear you say?",
          "दोस्त तुम्हें कौन सी लाइन बार-बार कहते सुनते हैं?",
          "Friends tumhari kaunsi line baar-baar sunte hain?",
          "మీ స్నేహితులు మీ దగ్గర ఎప్పుడూ వినే మాట ఏది?",
          "உங்கள் நண்பர்கள் நீங்கள் அடிக்கடி சொல்வதாகக் கேட்கும் வசனம் என்ன?",
        ],
  );
  p.catchphraseSample = t(lines.mild[2]);
  p.botCatchphrases = {
    manoj: p.lines[setup.spice][0],
    ananya: p.lines[setup.spice][1],
    kabir: p.lines[setup.spice][2],
  };
  p.defenseSample = t([
    "My intentions arrived on time.",
    "मेरे इरादे समय पर पहुँचे।",
    "Mere intentions time par aaye.",
    "నా ఉద్దేశాలు సమయానికే వచ్చాయి.",
    "என் எண்ணங்கள் சரியான நேரத்துக்கு வந்தன.",
  ]);
  p.alternateDecoy = t([
    "My imaginary assistant has approved the plan.",
    "काल्पनिक सहायक ने प्लान मंज़ूर किया।",
    "Imaginary assistant ne plan approve kiya.",
    "నా ఊహాత్మక సహాయకుడు ప్లాన్ ఒప్పుకున్నారు.",
    "என் கற்பனை உதவியாளர் திட்டத்தை ஒப்புக்கொண்டார்.",
  ]);
  p.replacementCallout = t([
    "Give your best harmless excuse.",
    "अपना सबसे मज़ेदार हल्का बहाना दो।",
    "Apna harmless excuse do.",
    "సరదాగా ఒక హాని లేని సాకు చెప్పండి.",
    "யாரையும் பாதிக்காத ஒரு வேடிக்கையான சாக்கு சொல்லுங்கள்.",
  ]);
  p.replacementCatchphrase = p.catchphrase;
  p.wildcard = t([
    "Turn your signature line into an excuse for being late.",
    "अपनी लाइन को देर होने का बहाना बनाओ।",
    "Apni line ko late hone ka excuse banao.",
    "మీ మాటను ఆలస్యానికి సాకుగా మార్చండి.",
    "உங்கள் வசனத்தைத் தாமதத்திற்கான சாக்காக மாற்றுங்கள்.",
  ]);
  p.replacementWildcard = p.wildcard;
  p.wildcardSample = t(lines.medium[4]);
  p.syncQuestion = t(
    goa
      ? [
          "Who will accidentally make this trip unforgettable?",
          "अनजाने में ट्रिप को यादगार कौन बनाएगा?",
          "Galti se trip unforgettable kaun banayega?",
          "అనుకోకుండా ఈ ట్రిప్‌ను మరపురానిదిగా ఎవరు చేస్తారు?",
          "தற்செயலாக இந்தப் பயணத்தை மறக்க முடியாததாக மாற்றுவது யார்?",
        ]
      : [
          "Who will turn this hostel night into a story?",
          "हॉस्टल की इस रात को कहानी कौन बनाएगा?",
          "Hostel ki is raat ko story kaun banayega?",
          "ఈ హాస్టల్ రాత్రిని కథగా ఎవరు మారుస్తారు?",
          "இந்த விடுதி இரவை ஒரு கதையாக மாற்றுவது யார்?",
        ],
  );
  p.cardTitles = {
    late: t([
      "THE LAST-MINUTE LEGEND",
      "आख़िरी मिनट का खिलाड़ी",
      "Last-minute legend",
      "చివరి నిమిషపు హీరో",
      "கடைசி நிமிட நாயகன்",
    ]),
    planner: t([
      "THE PLAN INSPECTOR",
      "प्लान का निरीक्षक",
      "Plan inspector",
      "ప్లాన్ ఇన్‌స్పెక్టర్",
      "திட்ட ஆய்வாளர்",
    ]),
  };
  p.calloutLines = {
    mild: t([
      "Your friends see a slightly different story.",
      "दोस्तों को थोड़ी अलग कहानी दिखती है।",
      "Friends ko thodi alag story dikhti hai.",
      "మీ స్నేహితులకు కొంచెం వేరే కథ కనిపిస్తోంది.",
      "உங்கள் நண்பர்களுக்குக் கொஞ்சம் வேறு கதை தெரிகிறது.",
    ]),
    medium: t([
      "Your self-review needs a meeting with your friends.",
      "तुम्हारी समीक्षा को दोस्तों से मिलना चाहिए।",
      "Self-review ko friends se meeting chahiye.",
      "మీ స్వీయ సమీక్ష స్నేహితులతో మాట్లాడాలి.",
      "உங்கள் சுயமதிப்பீடு நண்பர்களைச் சந்திக்க வேண்டும்.",
    ]),
    spicy: t(lines.spicy[1]),
  };
  s.story = {
    title: t([
      "The squad's story",
      "दोस्तों की कहानी",
      "Squad ki story",
      "స్నేహితుల కథ",
      "நண்பர்களின் கதை",
    ]),
    paragraphs: [
      t([
        "{hero} became the squad's final prediction. Your answers tell tonight's story.",
        "{hero} दोस्तों की आख़िरी पसंद बना। तुम्हारे जवाब आज की कहानी कहते हैं।",
        "{hero} squad ki final prediction bana. Answers aaj ki story batate hain.",
        "{hero} స్నేహితుల చివరి ఎంపిక అయ్యారు. మీ జవాబులే ఈ రాత్రి కథ.",
        "{hero} நண்பர்களின் இறுதித் தேர்வானார். உங்கள் பதில்களே இன்றிரவின் கதை.",
      ]),
    ],
  };
  return s;
}
