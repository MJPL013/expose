import type { HostLanguage } from "./host";
import type { ContentSnapshot } from "./content-snapshot";
import { aliasesFor } from "./answer-aliases";
type Pair = [string, string];
const hostelFacts: Pair[] = [
  ["{name} का पसंदीदा रंग क्या है?", "{name} ka favourite colour kya hai?"],
  [
    "रात दो बजे {name} क्या पीना पसंद करता है?",
    "Raat 2 baje {name} kya peena pasand karta hai?",
  ],
  [
    "देर रात {name} कौन सा नाश्ता चुनेगा?",
    "Late night {name} kaunsa snack chunega?",
  ],
  [
    "{name} को कौन सा मौसम सबसे पसंद है?",
    "{name} ko kaunsa mausam sabse pasand hai?",
  ],
  [
    "मूवी नाइट पर {name} किस तरह की फ़िल्म चुनेगा?",
    "Movie night par {name} kis genre ki film chunega?",
  ],
  ["{name} कौन सी मिठाई मँगाएगा?", "{name} kaunsi sweet treat order karega?"],
];
const hostelFavourites: Pair[] = [
  [
    "रात दो बजे {name} को ₹1,000 मिलते हैं। अब क्या होगा?",
    "Raat 2 baje {name} ko ₹1,000 milte hain. Ab kya hoga?",
  ],
  [
    "{name} की हॉस्टल जीवनकथा को एक नाम दो।",
    "{name} ki hostel biography ka title do.",
  ],
  [
    "{name} हॉस्टल के नोटिस बोर्ड पर क्या लिखेगा?",
    "{name} hostel ke notice board par kya likhega?",
  ],
  [
    "सुबह आठ बजे की क्लास छोड़ने का {name} का बहाना क्या होगा?",
    "8 AM ki class miss karne ka {name} ka excuse kya hoga?",
  ],
  [
    "{name} के लिए पाँच मिनट का परफ़ेक्ट ब्रेक बनाओ।",
    "{name} ka perfect five-minute break plan karo.",
  ],
  [
    "{name} दोस्तों के ग्रुप चैट का क्या नाम रखेगा?",
    "{name} squad ke group chat ka kya naam rakhega?",
  ],
];
const goaFacts: Pair[] = [
  [
    "समुद्र तट पर {name} क्या पीने का ऑर्डर देगा?",
    "Beach par {name} kya drink order karega?",
  ],
  [
    "{name} को सूर्योदय पसंद है या सूर्यास्त?",
    "{name} ko sunrise pasand hai ya sunset?",
  ],
  [
    "सफ़र के लिए {name} कौन सा नाश्ता रखेगा?",
    "Road trip ke liye {name} kaunsa snack pack karega?",
  ],
  [
    "{name} पहले समुद्र तट, किला या बाज़ार चुनेगा?",
    "{name} pehle beach, fort ya market chunega?",
  ],
  [
    "छुट्टियों में {name} किस रंग के कपड़े पहनेगा?",
    "{name} ke ideal holiday outfit ka colour kya hai?",
  ],
  [
    "{name} हमेशा क्या पैक करना भूल जाता है?",
    "{name} hamesha kya pack karna bhool jaata hai?",
  ],
  [
    "{name} ट्रेन, फ़्लाइट या रोड ट्रिप पसंद करेगा?",
    "{name} train, flight ya road trip pasand karega?",
  ],
  [
    "गोवा जाते हुए {name} कैसा संगीत बजाएगा?",
    "Goa jaate hue {name} kaunsa music bajayega?",
  ],
];
const goaFavourites: Pair[] = [
  [
    "{name} की गोवा ट्रिप को फ़िल्म का नाम दो।",
    "{name} ki Goa trip ka movie title do.",
  ],
  [
    "सूर्यास्त छूट जाने पर {name} क्या कहेगा?",
    "Sunset miss hone par {name} kya kahega?",
  ],
  [
    "गलत होटल बुक करने का {name} का बहाना लिखो।",
    "Galat hotel booking ka {name} ka excuse likho.",
  ],
  [
    "सुबह छह बजे {name} ट्रिप ग्रुप में क्या भेजेगा?",
    "6 AM par {name} trip group mein kya bhejega?",
  ],
  [
    "{name} के लिए समुद्र तट पर परफ़ेक्ट नौकरी बनाओ।",
    "{name} ka perfect beach job invent karo.",
  ],
  [
    "{name} ट्रिप के बजट को कैसे समझाएगा?",
    "{name} trip budget ko kaise explain karega?",
  ],
  [
    "{name} दोस्तों के लिए गोवा से क्या लाएगा?",
    "{name} squad ke liye Goa se kya souvenir laayega?",
  ],
  [
    "{name} की अगली ट्रिप का ऐलान लिखो।",
    "{name} ki next trip ka announcement likho.",
  ],
];
/** Authored variants keep the same question order and IDs in every language. */
export function localizeContent(
  snapshot: ContentSnapshot,
  language: HostLanguage,
) {
  const goa = snapshot.data.id === "goa-trip",
    index = language === "hi" ? 0 : 1;
  const choose = (pair: readonly string[]) => pair[index];
  for (const kind of ["fact", "favourite"] as const) {
    const variants = goa
      ? kind === "fact"
        ? goaFacts
        : goaFavourites
      : kind === "fact"
        ? hostelFacts
        : hostelFavourites;
    snapshot.spotlight[kind] = snapshot.spotlight[kind].map((q, i) => ({
      ...q,
      id: snapshot.data.id + ":" + kind + ":" + i,
      prompt: language === "en" ? q.prompt : choose(variants[i]),
      aliases: aliasesFor(q.samples, q.aliases),
    }));
  }
  if (language === "en") {
    snapshot.data.traits = snapshot.data.traits.map((t) => ({
      ...t,
      right:
        t.right === "Dekh lenge"
          ? "We'll figure it out"
          : t.right === "Bas nikalte hain"
            ? "Let's just go"
            : t.right,
    }));
    return snapshot;
  }
  const p = snapshot.data;
  const traits: Pair[][] = goa
    ? [
        [
          ["सब कुछ बुक करता है", "Sab book karta hai"],
          ["बस निकलते हैं", "Bas nikalte hain"],
        ],
        [
          ["समुद्र किनारे झपकी", "Beach par nap"],
          ["अगला रोमांच", "Next adventure"],
        ],
        [
          ["सूर्योदय के लिए तैयार", "Sunrise ready"],
          ["बस पाँच मिनट और", "Bas five minutes aur"],
        ],
      ]
    : [
        [
          ["योजना बनाता है", "Plan banata hai"],
          ["देख लेंगे", "Dekh lenge"],
        ],
        [
          ["शांति बनाए रखता है", "Sabko calm rakhta hai"],
          ["हंगामा शुरू करता है", "Chaos shuru karta hai"],
        ],
        [
          ["हमेशा जल्दी", "Hamesha early"],
          ["बस पाँच मिनट और", "Bas five minutes aur"],
        ],
      ];
  p.traits = p.traits.map((t, i) => ({
    ...t,
    left: choose(traits[i][0]),
    right: choose(traits[i][1]),
  }));
  p.nominations = (
    goa
      ? [
          [
            "दो दिन की गोवा ट्रिप को हफ़्ते भर का कौन बना देगा?",
            "Do din ki Goa trip ko ek hafte ka kaun bana dega?",
          ],
          [
            "फ़्लाइट की तुलना करते हुए भी कौन कहता है, टिकट बुक हैं?",
            "Flights compare karte hue bhi kaun kehta hai, tickets booked?",
          ],
        ]
      : ([
          [
            "चाय के ब्रेक को रात तीन बजे के रोमांच में कौन बदलेगा?",
            "Chai break ko 3 AM adventure mein kaun badlega?",
          ],
          [
            "जूते ढूँढ़ते हुए भी कौन कहता है, मैं तैयार हूँ?",
            "Shoes dhoondte hue bhi kaun kehta hai, main ready hoon?",
          ],
        ] as Pair[])
  ).map(choose);
  p.replacementNomination = choose(
    goa
      ? [
          "दोस्तों के लिए सबसे अच्छा सूर्यास्त कौन ढूँढ़ेगा?",
          "Squad ke liye best sunset spot kaun dhoondhega?",
        ]
      : [
          "रात भर जागने के लिए सबसे अच्छे स्नैक्स कौन लाएगा?",
          "All-nighter ke liye best snacks kaun laayega?",
        ],
  );
  p.roundPrompts = (
    goa
      ? [
          [
            "गोवा का प्लान आखिर ग्रुप चैट से बाहर निकला। {name} क्या कहेगा?",
            "Goa ka plan finally group chat se nikla. {name} kya kahega?",
          ],
          [
            "समुद्र तट जाते हुए गलत मोड़ लिया। {name} का बहाना क्या है?",
            "Beach jaate hue wrong turn liya. {name} ka excuse kya hai?",
          ],
          [
            "होटल की बुकिंग कल की है। {name} रिसेप्शन पर क्या कहेगा?",
            "Hotel booking kal ki hai. {name} reception par kya kahega?",
          ],
          [
            "हर किसी को अलग सूर्यास्त वाला स्थान चाहिए। {name} कैसे सुलझाएगा?",
            "Sabko alag sunset spot chahiye. {name} kaise settle karega?",
          ],
        ]
      : ([
          [
            "रात दो बजे हैं। निकलने को पाँच मिनट हैं। {name} क्या कहेगा?",
            "Raat 2 baje hain. Nikalne ko five minutes hain. {name} kya kahega?",
          ],
          [
            "ग्रुप प्रोजेक्ट कल जमा करना है। {name} दोस्तों को क्या कहेगा?",
            "Group project kal due hai. {name} squad ko kya kahega?",
          ],
          [
            "मूवी नाइट पर वाई-फ़ाई बंद हो गया। {name} क्या करेगा?",
            "Movie night par Wi-Fi gaya. {name} kya karega?",
          ],
        ] as Pair[])
  ).map(choose);
  p.replacementRoundPrompts = (
    goa
      ? [
          [
            "एक स्कूटर और ढेर सारे बैग हैं। {name} क्या सुझाएगा?",
            "Ek scooter aur bahut bags hain. {name} kya suggest karega?",
          ],
          [
            "समुद्र तट पर बारिश शुरू हो गई। {name} का नया प्लान क्या है?",
            "Beach par baarish aa gayi. {name} ka naya plan kya hai?",
          ],
        ]
      : ([
          [
            "कैंटीन में एक समोसा बचा है। {name} क्या कहेगा?",
            "Canteen mein ek samosa bacha hai. {name} kya kahega?",
          ],
          [
            "दोस्तों को फ़िल्म सुझानी है। {name} क्या चुनेगा?",
            "Squad ko movie suggest karo. {name} kya chunega?",
          ],
        ] as Pair[])
  ).map(choose);
  p.catchphrase = choose(
    goa
      ? [
          "ट्रिप का प्लान बनते ही तुम कौन सी लाइन कहते हो?",
          "Trip ka plan bante hi tumhari signature line kya hoti hai?",
        ]
      : [
          "तुम्हारे दोस्त तुम्हें कौन सी लाइन बार-बार कहते सुनते हैं?",
          "Tumhare friends tumhari kaunsi line baar-baar sunte hain?",
        ],
  );
  p.replacementCatchphrase = choose(
    goa
      ? [
          "दोस्तों को सूर्योदय देखने के लिए मनाओ।",
          "Squad ko sunrise dekhne ke liye manao.",
        ]
      : ["दोस्त को चाय पर कैसे बुलाओगे?", "Friend ko chai par kaise bulaoge?"],
  );
  p.wildcard = choose(
    goa
      ? [
          "बस छूटने के बहाने में अपनी ट्रिप वाली लाइन डालो।",
          "Bus miss karne ke excuse mein apni trip wali line daalo.",
        ]
      : [
          "अपनी लाइन को दुनिया का सबसे कम भरोसेमंद बहाना बनाओ।",
          "Apni line ko duniya ka least convincing excuse banao.",
        ],
  );
  p.replacementWildcard = choose([
    "अपनी लाइन को खुशहाल अंत दो।",
    "Apni line ko happy ending do.",
  ]);
  p.replacementCallout = choose([
    "अपना सबसे मज़ेदार छोटा सा बहाना बताओ।",
    "Apna best harmless excuse batao.",
  ]);
  p.syncQuestion = choose(
    goa
      ? [
          "अनजाने में इस ट्रिप को यादगार कौन बना देगा?",
          "Galti se is trip ko unforgettable kaun bana dega?",
        ]
      : [
          "इस रात को यादगार कहानी में कौन बदलेगा?",
          "Is raat ko legendary story mein kaun badlega?",
        ],
  );
  // The built-in decoy must not be identifiable simply by its language.
  for (const heat of ["mild", "medium", "spicy"] as const) {
    p.lines[heat] = (
      [
        [
          "बस दो मिनट, जूते पहन रहा हूँ।",
          "Bas two minutes, shoes pehen raha hoon.",
        ],
        ["पहले चाय, फिर फ़ैसले।", "Pehle chai, phir decisions."],
        ["मैं तैयार हूँ। मन से।", "Main ready hoon. Mentally."],
        [
          "प्लान पूरा है, बस विवरण बाकी है।",
          "Planning full hai, details baaki hain.",
        ],
        [
          "मेरे कैलेंडर के हिसाब से हम कल ही निकल गए।",
          "Mere calendar ke hisaab se hum kal hi nikal gaye.",
        ],
      ] as Pair[]
    ).map(choose);
  }
  p.alternateDecoy = choose([
    "मेरे काल्पनिक सहायक ने सब पक्का कर दिया।",
    "Mere imaginary assistant ne sab confirm kar diya.",
  ]);
  return snapshot;
}
