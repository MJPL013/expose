import type { ContentSnapshot } from "./content-snapshot";
import type { Setup } from "./contracts";
import type { SpotlightQuestion } from "./spotlight";
import { aliasesFor } from "./answer-aliases";
import { shuffled } from "./logic";

type Line = readonly [string, string, string];
type Fact = {
  key: string;
  prompt: Line;
  answers: readonly (readonly [string, string, string, string])[];
};
type Creative = readonly [Line, Line];
// Authored equivalents, not runtime translations. Indices are language-independent IDs.
const facts: Fact[] = [
  {
    key: "colour",
    prompt: [
      "Which colour would {name} wear every day?",
      "{name} रोज़ कौन सा रंग पहनना चाहेगा?",
      "{name} roz kaunsa colour pehenna chahega?",
    ],
    answers: [
      ["Blue", "नीला", "neela", "నీలం"],
      ["Black", "काला", "kala", "నలుపు"],
      ["Red", "लाल", "laal", "ఎరుపు"],
    ],
  },
  {
    key: "drink",
    prompt: [
      "What is {name}'s first drink order at {place}?",
      "{place} में {name} सबसे पहले क्या पीने का ऑर्डर देगा?",
      "{place} mein {name} ka first drink order kya hoga?",
    ],
    answers: [
      ["Tea", "चाय", "chai", "టీ"],
      ["Coffee", "कॉफ़ी", "coffee", "కాఫీ"],
      ["Water", "पानी", "paani", "నీరు"],
    ],
  },
  {
    key: "snack",
    prompt: [
      "Which snack would {name} refuse to share?",
      "{name} कौन सा नाश्ता किसी से बाँटना नहीं चाहेगा?",
      "{name} kaunsa snack share nahi karna chahega?",
    ],
    answers: [
      ["Chips", "चिप्स", "chips", "చిప్స్"],
      ["Pizza", "पिज़्ज़ा", "pizza", "పిజ్జా"],
      ["Samosa", "समोसा", "samosa", "సమోసా"],
    ],
  },
  {
    key: "season",
    prompt: [
      "Which season would {name} choose for a holiday?",
      "{name} छुट्टी के लिए कौन सा मौसम चुनेगा?",
      "{name} holiday ke liye kaunsa season choose karega?",
    ],
    answers: [
      ["Winter", "सर्दी", "sardi", "చలికాలం"],
      ["Summer", "गर्मी", "garmi", "వేసవి"],
      ["Monsoon", "बरसात", "barsaat", "వర్షాకాలం"],
    ],
  },
  {
    key: "film",
    prompt: [
      "Which film genre does {name} pick for the squad?",
      "{name} दोस्तों के लिए किस तरह की फ़िल्म चुनेगा?",
      "{name} squad ke liye kaunsa film genre choose karega?",
    ],
    answers: [
      ["Comedy", "कॉमेडी", "comedy", "కామెడీ"],
      ["Horror", "डरावनी", "horror", "హారర్"],
      ["Action", "एक्शन", "action", "యాక్షన్"],
    ],
  },
  {
    key: "dessert",
    prompt: [
      "Which dessert would {name} order after saying they are full?",
      "पेट भरने के बाद भी {name} कौन सी मिठाई मँगाएगा?",
      "Full hone ke baad bhi {name} kaunsi dessert order karega?",
    ],
    answers: [
      ["Ice cream", "आइसक्रीम", "ice cream", "ఐస్ క్రీమ్"],
      ["Chocolate", "चॉकलेट", "chocolate", "చాక్లెట్"],
      ["Cake", "केक", "cake", "కేక్"],
    ],
  },
  {
    key: "transport",
    prompt: [
      "Train, flight or road trip: what would {name} choose?",
      "ट्रेन, फ़्लाइट या सड़क यात्रा: {name} क्या चुनेगा?",
      "Train, flight ya road trip: {name} kya choose karega?",
    ],
    answers: [
      ["Train", "ट्रेन", "train", "రైలు"],
      ["Flight", "फ़्लाइट", "flight", "విమానం"],
      ["Road trip", "सड़क यात्रा", "road trip", "రోడ్డు ప్రయాణం"],
    ],
  },
  {
    key: "music",
    prompt: [
      "Which music genre gets {name} singing along?",
      "किस तरह के संगीत पर {name} गाने लगता है?",
      "Kaunsa music genre sunke {name} saath gaane lagta hai?",
    ],
    answers: [
      ["Pop", "पॉप", "pop", "పాప్"],
      ["Rock", "रॉक", "rock", "రాక్"],
      ["Classical", "शास्त्रीय", "classical", "శాస్త్రీయ"],
    ],
  },
  {
    key: "time",
    prompt: [
      "Sunrise or sunset: which would {name} stay up for?",
      "सूर्योदय या सूर्यास्त: {name} किसका इंतज़ार करेगा?",
      "Sunrise ya sunset: {name} kiska wait karega?",
    ],
    answers: [
      ["Sunrise", "सूर्योदय", "sunrise", "సూర్యోదయం"],
      ["Sunset", "सूर्यास्त", "sunset", "సూర్యాస్తమయం"],
    ],
  },
  {
    key: "pet",
    prompt: [
      "Which pet would {name} bring home?",
      "{name} कौन सा पालतू जानवर घर लाएगा?",
      "{name} kaunsa pet ghar laayega?",
    ],
    answers: [
      ["Dog", "कुत्ता", "kutta", "కుక్క"],
      ["Cat", "बिल्ली", "billi", "పిల్లి"],
      ["Fish", "मछली", "machhli", "చేప"],
    ],
  },
  {
    key: "holiday",
    prompt: [
      "Beach, mountains or city: where does {name} recharge?",
      "समुद्र, पहाड़ या शहर: {name} कहाँ आराम करना चाहेगा?",
      "Beach, mountains ya city: {name} kahan recharge karega?",
    ],
    answers: [
      ["Beach", "समुद्र तट", "beach", "బీచ్"],
      ["Mountains", "पहाड़", "pahaad", "పర్వతాలు"],
      ["City", "शहर", "shehar", "నగరం"],
    ],
  },
  {
    key: "food",
    prompt: [
      "Sweet or spicy: which food does {name} reach for first?",
      "मीठा या तीखा: {name} पहले क्या चुनेगा?",
      "Sweet ya spicy: {name} pehle kya choose karega?",
    ],
    answers: [
      ["Sweet", "मीठा", "meetha", "తీపి"],
      ["Spicy", "तीखा", "teekha", "కారం"],
    ],
  },
  {
    key: "game",
    prompt: [
      "Cards, video games or board games: which does {name} choose?",
      "ताश, वीडियो गेम या बोर्ड गेम: {name} क्या चुनेगा?",
      "Cards, video games ya board games: {name} kya choose karega?",
    ],
    answers: [
      ["Cards", "ताश", "taash", "కార్డులు"],
      ["Video games", "वीडियो गेम", "video games", "వీడియో గేమ్స్"],
      ["Board games", "बोर्ड गेम", "board games", "బోర్డు గేమ్స్"],
    ],
  },
  {
    key: "power",
    prompt: [
      "Flying or invisibility: which power would {name} choose?",
      "उड़ना या अदृश्य होना: {name} कौन सी शक्ति चुनेगा?",
      "Flying ya invisibility: {name} kaunsi power choose karega?",
    ],
    answers: [
      ["Flying", "उड़ना", "udna", "ఎగరడం"],
      ["Invisibility", "अदृश्य होना", "invisibility", "అదృశ్యం"],
    ],
  },
];
const everyday: Creative[] = [
  [
    [
      "Give {name}'s life at {place} a documentary title.",
      "{place} में {name} की ज़िंदगी की डॉक्यूमेंट्री का नाम दो।",
      "{place} mein {name} ki life ki documentary ka title do.",
    ],
    [
      "Five more minutes: a twelve-part series",
      "बस पाँच मिनट और: बारह भागों की कहानी",
      "Bas five minutes aur: twelve-part series",
    ],
  ],
  [
    [
      "Invent {name}'s excuse for missing the squad's departure.",
      "दोस्तों के निकलने का समय चूकने पर {name} का बहाना बनाओ।",
      "Squad ke departure ko miss karne ka {name} ka excuse banao.",
    ],
    [
      "I was waiting for the motivational background music",
      "मैं प्रेरणादायक बैकग्राउंड संगीत का इंतज़ार कर रहा था",
      "Main motivational background music ka wait kar raha tha",
    ],
  ],
  [
    [
      "What would {name} text after accidentally becoming the trip organiser?",
      "गलती से ट्रिप का आयोजक बनने पर {name} क्या संदेश भेजेगा?",
      "Galti se trip organiser banne par {name} kya text karega?",
    ],
    [
      "The itinerary is a feeling, not a document",
      "यात्रा की योजना एक भावना है, दस्तावेज़ नहीं",
      "Itinerary ek feeling hai, document nahi",
    ],
  ],
  [
    [
      "Write {name}'s one-star review of an alarm clock.",
      "अलार्म घड़ी के लिए {name} की एक-स्टार समीक्षा लिखो।",
      "Alarm clock ki {name} wali one-star review likho.",
    ],
    [
      "Very rude. Keeps interrupting my best work",
      "बहुत बदतमीज़। मेरे सबसे अच्छे काम में बाधा डालती है",
      "Bahut rude. Mere best work ko interrupt karti hai",
    ],
  ],
  [
    [
      "Name the business {name} would open at {place}.",
      "{place} में {name} के नए कारोबार का नाम रखो।",
      "{place} mein {name} ke naye business ka naam rakho.",
    ],
    [
      "Professional procrastination, delivery tomorrow",
      "पेशेवर टालमटोल, डिलीवरी कल",
      "Professional procrastination, delivery kal",
    ],
  ],
  [
    [
      "Invent {name}'s campaign slogan for squad leader.",
      "दोस्तों का नेता बनने के लिए {name} का नारा बनाओ।",
      "Squad leader banne ke liye {name} ka campaign slogan banao.",
    ],
    [
      "More snacks, fewer decisions",
      "नाश्ता ज़्यादा, फ़ैसले कम",
      "Snacks zyada, decisions kam",
    ],
  ],
  [
    [
      "What warning label belongs on {name}'s suitcase?",
      "{name} के सूटकेस पर कौन सी चेतावनी लिखी होनी चाहिए?",
      "{name} ke suitcase par kaunsa warning label hona chahiye?",
    ],
    [
      "Contains everything except the charger",
      "चार्जर छोड़कर सब कुछ मौजूद है",
      "Charger ke alawa sab kuch hai",
    ],
  ],
  [
    [
      "Write the message {name}'s phone would send the squad.",
      "{name} का फ़ोन दोस्तों को क्या संदेश भेजेगा?",
      "{name} ka phone squad ko kya message bhejega?",
    ],
    [
      "Please stop saying five minutes on my behalf",
      "कृपया मेरे नाम पर पाँच मिनट कहना बंद करें",
      "Please mere behalf par five minutes bolna band karo",
    ],
  ],
  [
    [
      "Give {name} an imaginary job at {place}.",
      "{place} में {name} के लिए एक काल्पनिक नौकरी बनाओ।",
      "{place} mein {name} ke liye imaginary job banao.",
    ],
    [
      "Chief officer of unnecessary detours",
      "बेवजह रास्ता बदलने का मुख्य अधिकारी",
      "Chief officer of unnecessary detours",
    ],
  ],
  [
    [
      "What would {name} say after ordering food for the wrong room?",
      "गलत कमरे में खाना मँगाने के बाद {name} क्या कहेगा?",
      "Wrong room mein food order karne ke baad {name} kya bolega?",
    ],
    [
      "I call it community building",
      "मैं इसे पड़ोसियों से दोस्ती करना कहता हूँ",
      "Main ise community building bolta hoon",
    ],
  ],
  [
    [
      "Write {name}'s apology for sending a voice note to the wrong group.",
      "गलत ग्रुप में वॉइस नोट भेजने पर {name} की माफ़ी लिखो।",
      "Wrong group mein voice note bhejne par {name} ki apology likho.",
    ],
    [
      "That was a trailer. The full explanation is worse",
      "वह ट्रेलर था। पूरी सफ़ाई और भी खराब है",
      "Woh trailer tha. Full explanation aur bhi buri hai",
    ],
  ],
  [
    [
      "What would {name} put on a billboard at {place}?",
      "{place} के बड़े विज्ञापन बोर्ड पर {name} क्या लिखेगा?",
      "{place} ke billboard par {name} kya likhega?",
    ],
    [
      "We are almost there. Emotionally",
      "हम लगभग पहुँच गए हैं। भावनात्मक रूप से",
      "Hum almost pahunch gaye. Emotionally",
    ],
  ],
  [
    [
      "Give {name}'s imaginary cooking show a name.",
      "{name} के काल्पनिक कुकिंग शो का नाम रखो।",
      "{name} ke imaginary cooking show ka naam rakho.",
    ],
    [
      "Smoke alarm: the secret ingredient",
      "धुएँ का अलार्म: गुप्त मसाला",
      "Smoke alarm: secret ingredient",
    ],
  ],
  [
    [
      "Write the notification that would finally get {name} out of bed.",
      "कौन सी सूचना आखिर {name} को बिस्तर से उठा देगी?",
      "Kaunsa notification finally {name} ko bed se utha dega?",
    ],
    [
      "Your snack delivery has joined another squad",
      "तुम्हारा नाश्ता दूसरे दोस्तों के साथ चला गया",
      "Tumhara snack delivery doosri squad mein join ho gaya",
    ],
  ],
];
const adult: Creative[] = [
  [
    [
      "Invent the dating bio {name} thinks sounds irresistible.",
      "ऐसा डेटिंग परिचय बनाओ जो {name} को बेहद आकर्षक लगता हो।",
      "Woh dating bio banao jo {name} ko irresistible lagti hai.",
    ],
    [
      "Emotionally available after my afternoon nap",
      "दोपहर की नींद के बाद भावनात्मक रूप से उपलब्ध",
      "Afternoon nap ke baad emotionally available",
    ],
  ],
  [
    [
      "In a rom-com, {name} texts a crush in the squad chat. What is the recovery message?",
      "रोमांटिक कॉमेडी में {name} क्रश का संदेश दोस्तों को भेज देता है। अब क्या सफ़ाई देगा?",
      "Rom-com mein {name} crush ka text squad chat mein bhej deta hai. Recovery message kya hoga?",
    ],
    [
      "That was for all of you. Team morale",
      "वह तुम सबके लिए था। टीम का उत्साह बढ़ा रहा था",
      "Woh tum sabke liye tha. Team morale",
    ],
  ],
  [
    [
      "Invent {name}'s spectacularly bad pickup line at {place}.",
      "{place} में {name} की बेहद खराब फ़्लर्टिंग लाइन बनाओ।",
      "{place} mein {name} ki spectacularly bad pickup line banao.",
    ],
    [
      "Are you the Wi-Fi? My standards disappear when you connect",
      "क्या तुम वाई-फ़ाई हो? जुड़ते ही मेरी समझ गायब हो जाती है",
      "Tum Wi-Fi ho? Connect hote hi meri samajh gayab ho jaati hai",
    ],
  ],
  [
    [
      "Cast {name} as an overconfident dating coach. What is the worst advice?",
      "{name} को अति-आत्मविश्वासी डेटिंग गुरु बनाओ। सबसे खराब सलाह क्या होगी?",
      "{name} ko overconfident dating coach banao. Worst advice kya hogi?",
    ],
    [
      "Send a spreadsheet of your emotional availability",
      "अपनी भावनात्मक उपलब्धता की स्प्रेडशीट भेजो",
      "Emotional availability ki spreadsheet bhejo",
    ],
  ],
  [
    [
      "In a fictional first date, {name} gets the bill. What do they say?",
      "एक काल्पनिक पहली डेट पर {name} को बिल मिलता है। क्या कहेगा?",
      "Fictional first date par {name} ko bill milta hai. Kya bolega?",
    ],
    [
      "So this is what commitment costs",
      "तो वादे निभाने की इतनी कीमत होती है",
      "Toh commitment ki itni cost hoti hai",
    ],
  ],
  [
    [
      "Invent {name}'s excuse for liking a crush's three-year-old photo.",
      "क्रश की तीन साल पुरानी तस्वीर लाइक करने पर {name} का काल्पनिक बहाना बनाओ।",
      "Crush ki three-year-old photo like karne par {name} ka imaginary excuse banao.",
    ],
    [
      "Historical research. Very rigorous methodology",
      "ऐतिहासिक शोध था। बेहद गंभीर पद्धति",
      "Historical research tha. Very rigorous methodology",
    ],
  ],
  [
    [
      "What would {name}'s fictional flirting style be called as a weather forecast?",
      "मौसम की ख़बर में {name} के काल्पनिक फ़्लर्टिंग अंदाज़ को क्या कहेंगे?",
      "Weather forecast mein {name} ki fictional flirting style ka naam kya hoga?",
    ],
    [
      "High confidence with a severe chance of embarrassment",
      "भरपूर आत्मविश्वास और शर्मिंदगी की भारी संभावना",
      "High confidence, embarrassment ke severe chances",
    ],
  ],
  [
    [
      "Write a cheeky slogan for {name}'s imaginary singles party at {place}.",
      "{place} में {name} की काल्पनिक सिंगल्स पार्टी का चुलबुला नारा लिखो।",
      "{place} mein {name} ki imaginary singles party ka cheeky slogan likho.",
    ],
    [
      "Come for the chemistry. Stay because the taxi cancelled",
      "आकर्षण के लिए आओ। टैक्सी रद्द हुई तो रुक जाओ",
      "Chemistry ke liye aao. Taxi cancel ho toh ruk jao",
    ],
  ],
  [
    [
      "In a sitcom, {name} accidentally books two dates at the same café. What is the cover story?",
      "सिटकॉम में {name} एक कैफ़े में दो डेट बुक कर देता है। अब क्या कहानी बनाएगा?",
      "Sitcom mein {name} same cafe mein two dates book kar deta hai. Cover story kya hogi?",
    ],
    [
      "Welcome to the pilot episode of my support group",
      "मेरे सहायता समूह के पहले एपिसोड में स्वागत है",
      "Mere support group ke pilot episode mein welcome",
    ],
  ],
  [
    [
      "Give {name}'s imaginary late-night dating podcast a title.",
      "{name} के काल्पनिक देर-रात डेटिंग पॉडकास्ट का नाम रखो।",
      "{name} ke imaginary late-night dating podcast ka title do.",
    ],
    [
      "Mixed signals, full battery",
      "उलझे इशारे, पूरी बैटरी",
      "Mixed signals, full battery",
    ],
  ],
  [
    [
      "Invent the flirty text {name} would rewrite twelve times before sending.",
      "वह काल्पनिक फ़्लर्टिंग संदेश बनाओ जिसे {name} बारह बार लिखेगा।",
      "Woh fictional flirty text banao jo {name} twelve times rewrite karega.",
    ],
    [
      "Hey. That took forty minutes",
      "हाय। इसे लिखने में चालीस मिनट लगे",
      "Hey. Isme forty minutes lage",
    ],
  ],
  [
    [
      "As a fictional reality-show contestant, what would {name} call their biggest dating red flag?",
      "काल्पनिक रियलिटी शो में {name} अपनी सबसे बड़ी डेटिंग समस्या को क्या नाम देगा?",
      "Fictional reality show mein {name} apne biggest dating red flag ko kya bolega?",
    ],
    [
      "A limited-edition personality feature",
      "व्यक्तित्व की सीमित संस्करण वाली ख़ासियत",
      "Limited-edition personality feature",
    ],
  ],
  [
    [
      "Write the awkward morning-after text in {name}'s imaginary rom-com.",
      "{name} की काल्पनिक रोमांटिक कॉमेडी में अगली सुबह का अजीब संदेश लिखो।",
      "{name} ki imaginary rom-com ka awkward morning-after text likho.",
    ],
    [
      "Great chemistry. Terrible directions home",
      "आकर्षण शानदार था। घर का रास्ता समझाना बेहद खराब",
      "Chemistry great thi. Ghar ki directions terrible",
    ],
  ],
  [
    [
      "Invent {name}'s cheeky complaint after a fictional date talks only about their gym routine.",
      "काल्पनिक डेट पर सिर्फ़ जिम की बातें सुनकर {name} की चुलबुली शिकायत लिखो।",
      "Fictional date par sirf gym routine sunkar {name} ki cheeky complaint likho.",
    ],
    [
      "I came for butterflies, not a damn workout plan",
      "मैं रोमांच के लिए आया था, कमबख़्त कसरत की योजना के लिए नहीं",
      "Butterflies ke liye aaya tha, damn workout plan ke liye nahi",
    ],
  ],
];

export function freshContent(
  base: ContentSnapshot,
  setup: Setup,
  seed: string,
  seen: string[] = [],
): ContentSnapshot {
  const s = structuredClone(base),
    lang = setup.hostLanguage ?? "hinglish",
    i = lang === "en" ? 0 : lang === "hi" ? 1 : 2;
  const pack = setup.packId ?? "hostel-2am",
    place =
      pack === "goa-trip"
        ? ["Goa", "गोवा", "Goa"]
        : ["the hostel", "हॉस्टल", "hostel"];
  const line = (l: Line) => l[i].replaceAll("{place}", place[i]);
  const order = <T extends { id?: string }>(list: T[], kind: string) => {
    const deck = shuffled(list, `${seed}:${pack}:${kind}`);
    return [
      ...deck.filter((q) => !seen.includes(q.id!)),
      ...deck.filter((q) => seen.includes(q.id!)),
    ];
  };
  s.version = `${pack}@4:${lang}:${setup.spice}`;
  s.spotlight.fact = order(
    facts.map((f) => {
      const aliases: Record<string, string> = {};
      for (const a of f.answers)
        for (const value of a)
          aliases[value.normalize("NFKC").toLowerCase()] = a[0].toLowerCase();
      return {
        id: `${pack}:v4:fact:${f.key}`,
        prompt: line(f.prompt),
        samples: f.answers.map((a) => a[i]),
        aliases: aliasesFor(
          f.answers.map((a) => a[0]),
          aliases,
        ),
      };
    }),
    "fact",
  );
  const source = setup.spice === "spicy" ? adult : everyday;
  const creative = (kind: string): SpotlightQuestion[] =>
    order(
      source.map((c, n) => ({
        id: `${pack}:v4:${kind}:${setup.spice === "spicy" ? "adult" : "party"}:${n}`,
        prompt: line(c[0]),
        samples: [line(c[1])],
      })),
      kind,
    );
  s.spotlight.favourite = creative("favourite");
  s.bluff = creative("bluff");
  s.data.roundPrompts = s.bluff.map((q) => q.prompt);
  const builtins: Record<Setup["spice"], Line[]> = {
    mild: [
      [
        "First snacks, then decisions",
        "पहले नाश्ता, फिर फ़ैसले",
        "Pehle snacks, phir decisions",
      ],
      [
        "I brought enthusiasm instead of a plan",
        "योजना की जगह उत्साह लाया हूँ",
        "Plan ki jagah enthusiasm laaya hoon",
      ],
      [
        "Almost ready is a state of mind",
        "लगभग तैयार होना एक मानसिक अवस्था है",
        "Almost ready ek state of mind hai",
      ],
      [
        "My calendar needs a holiday",
        "मेरे कैलेंडर को छुट्टी चाहिए",
        "Mere calendar ko holiday chahiye",
      ],
      [
        "I consulted the snack committee",
        "मैंने नाश्ता समिति से सलाह ली",
        "Maine snack committee se consult kiya",
      ],
    ],
    medium: [
      [
        "My confidence arrived before my competence",
        "मेरी काबिलियत से पहले आत्मविश्वास पहुँच गया",
        "Competence se pehle confidence pahunch gaya",
      ],
      [
        "The plan exists in a different timezone",
        "योजना किसी और समय क्षेत्र में है",
        "Plan alag timezone mein hai",
      ],
      [
        "Please blame the unpaid intern: me",
        "बिना वेतन वाले इंटर्न को दोष दो: मुझे",
        "Unpaid intern ko blame karo: mujhe",
      ],
      [
        "I am the reason this group needs screenshots",
        "मेरी वजह से इस ग्रुप को स्क्रीनशॉट चाहिए",
        "Meri wajah se group ko screenshots chahiye",
      ],
      [
        "My excuse has better attendance than I do",
        "मेरे बहाने की हाज़िरी मुझसे बेहतर है",
        "Mere excuse ki attendance mujhse better hai",
      ],
    ],
    spicy: [
      [
        "My flirting needs technical support",
        "मेरी फ़्लर्टिंग को तकनीकी सहायता चाहिए",
        "Meri flirting ko technical support chahiye",
      ],
      [
        "Chemistry confirmed, common sense missing",
        "आकर्षण पक्का, समझ लापता",
        "Chemistry confirmed, common sense missing",
      ],
      [
        "Even my imaginary date left me on read",
        "मेरी काल्पनिक डेट ने भी संदेश पढ़कर छोड़ दिया",
        "Imaginary date ne bhi read par chhod diya",
      ],
      [
        "A red flag, but excellent lighting",
        "ख़तरे का इशारा, पर रोशनी शानदार",
        "Red flag hoon, lighting excellent hai",
      ],
      [
        "All that confidence and not a damn clue",
        "इतना आत्मविश्वास और कमबख़्त समझ बिल्कुल नहीं",
        "Itna confidence aur damn clue bhi nahi",
      ],
    ],
  };
  for (const heat of ["mild", "medium", "spicy"] as const)
    s.data.lines[heat] = builtins[heat].map(line);
  s.data.catchphraseSample = line([
    "Five minutes. I mean it this time.",
    "पाँच मिनट। इस बार सच में।",
    "Five minutes. Is baar sach mein.",
  ]);
  s.data.botCatchphrases = {
    manoj: s.data.lines[setup.spice][0],
    ananya: s.data.lines[setup.spice][1],
    kabir: s.data.lines[setup.spice][2],
  };
  s.data.defenseSample = line([
    "My intentions arrived on time.",
    "मेरे इरादे समय पर पहुँच गए थे।",
    "Mere intentions time par pahunch gaye the.",
  ]);
  s.data.alternateDecoy = line([
    "This is exactly what my imaginary assistant warned me about.",
    "मेरे काल्पनिक सहायक ने इसी बात की चेतावनी दी थी।",
    "Mere imaginary assistant ne isi cheez ke liye warn kiya tha.",
  ]);
  s.data.wildcardSample = line([
    "Five minutes, plus a snack emergency.",
    "पाँच मिनट, और नाश्ते की एक आपात स्थिति।",
    "Five minutes, plus snack emergency.",
  ]);
  for (const heat of ["mild", "medium", "spicy"] as const)
    s.data.calloutLines[heat] = line(
      heat === "spicy"
        ? [
            "Your confidence wrote a dating bio your answers cannot support.",
            "तुम्हारे आत्मविश्वास ने ऐसी डेटिंग बायो लिखी जिसे जवाब सहारा नहीं देते।",
            "Confidence ne aisi dating bio likhi jise answers support nahi karte.",
          ]
        : heat === "medium"
          ? [
              "Your self-review and your friends' review need a meeting.",
              "तुम्हारी और दोस्तों की समीक्षा को आपस में बात करनी चाहिए।",
              "Tumhari aur friends ki review ko ek meeting chahiye.",
            ]
          : [
              "Your friends see a slightly different story.",
              "दोस्तों को कहानी थोड़ी अलग दिखती है।",
              "Friends ko story thodi alag dikhti hai.",
            ],
    );
  if (lang === "en") {
    s.data.catchphrase = "What line do your friends always hear you say?";
    s.data.nominations = [
      "Who would turn a quick snack into an all-night adventure?",
      "Who says they are ready while still looking for their shoes?",
    ];
  }
  s.story = {
    title: line(["The squad's story", "दोस्तों की कहानी", "Squad ki story"]),
    paragraphs: [
      line([
        "{hero} became the squad's final prediction. Your answers and results tell the rest of tonight's story.",
        "{hero} दोस्तों की आख़िरी पसंद बना। आज की बाकी कहानी तुम्हारे जवाब और नतीजे बताते हैं।",
        "{hero} squad ki final prediction bana. Aaj ki baaki story tumhare answers aur results batate hain.",
      ]),
    ],
  };
  return s;
}
