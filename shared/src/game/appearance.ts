/** Appearance format v1. IDs 0–3 are legacy presets. Never reorder these catalogs:
 * their mixed-radix positions are persisted in profiles, seats and approved cards.
 * A future format must use a new ID range rather than change these radices. */
export const appearanceOptions = {
  style: ["Male", "Female"],
  skin: ["Honey", "Warm", "Deep", "Light"],
  body: ["T-shirt", "Hoodie", "Shirt", "Dungarees"],
  eyes: ["Bright", "Sleepy", "Wink", "Wide", "Happy"],
  mouth: ["Smile", "Grin", "Surprised", "Smirk", "Straight"],
  hair: ["Swept", "Spiky", "Straight", "Bald", "Curls", "Bob", "Ponytail"],
  glasses: ["No glasses", "Round", "Square", "Sunglasses", "Goofy"],
  earrings: ["No earrings", "Studs", "Small hoops", "Big hoops", "Stars"],
  necklace: ["No necklace", "Chain", "Pendant", "Beads"],
} as const;
export type AppearancePart = keyof typeof appearanceOptions;
export type Appearance = Record<AppearancePart, number>;
export const appearanceParts = Object.keys(
  appearanceOptions,
) as AppearancePart[];
export const MAX_AVATAR_ID =
  3 + appearanceParts.reduce((n, key) => n * appearanceOptions[key].length, 1);
export const avatarColors = [
  "#ffb020",
  "#b5b2d8",
  "#dca58d",
  "#a8baa0",
  "#93bed2",
] as const;
export const avatarColorNames = [
  "Marigold",
  "Lavender",
  "Terracotta",
  "Sage",
  "Sky",
];
const base: Appearance = {
  style: 0,
  skin: 0,
  body: 0,
  eyes: 0,
  mouth: 0,
  hair: 0,
  glasses: 0,
  earrings: 0,
  necklace: 0,
};
const legacy: Appearance[] = [
  base,
  { ...base, hair: 1, glasses: 3 },
  { ...base, style: 1, skin: 2, hair: 2 },
  { ...base, hair: 4, body: 1 },
];
export function decodeAppearance(id: number): Appearance {
  if (!Number.isInteger(id) || id < 0 || id > MAX_AVATAR_ID) return { ...base };
  if (id < 4) return { ...legacy[id] };
  let remaining = id - 4;
  const result = { ...base };
  for (const key of appearanceParts) {
    result[key] = remaining % appearanceOptions[key].length;
    remaining = Math.floor(remaining / appearanceOptions[key].length);
  }
  return result;
}
export function encodeAppearance(value: Appearance): number {
  let id = 4,
    multiplier = 1;
  for (const key of appearanceParts) {
    const option = value[key];
    if (
      !Number.isInteger(option) ||
      option < 0 ||
      option >= appearanceOptions[key].length
    )
      throw new Error(`Invalid appearance part: ${key}`);
    id += option * multiplier;
    multiplier *= appearanceOptions[key].length;
  }
  return id;
}

/** Only catalog indices and a validated hex colour enter markup, never user text. */
export function avatarSvg(
  id: number,
  background: string = avatarColors[0],
): string {
  const a = decodeAppearance(id);
  const skin = ["#dca477", "#b77750", "#75472f", "#f0c7a5"][a.skin];
  const colour = /^#[a-f\d]{6}$/i.test(background)
    ? background
    : avatarColors[0];
  const hair = [
    '<path d="M25 44V27Q25 9 50 10Q78 8 77 39L70 43L66 25Q45 40 30 27L30 44Z"/>',
    '<path d="M25 44L19 23L29 24L27 10L41 16L49 4L58 15L74 10L72 24L82 25L73 44L66 29L33 29L30 44Z"/>',
    '<path d="M22 77V30Q21 7 50 8Q80 6 78 32V79L69 76V31Q49 40 31 27V78Z"/>',
    "",
    '<path d="M24 41Q14 31 24 24Q19 12 33 14Q35 3 47 10Q57 0 65 12Q80 8 79 24Q89 31 76 42L69 30Q50 36 30 29L30 42Z"/>',
    '<path d="M20 65V31Q20 7 50 9Q81 7 81 32V66L70 69V30L52 25L30 32V68Z"/>',
    '<path d="M27 43V25Q30 7 52 10Q77 10 75 34L69 39L65 24Q49 35 31 29L31 43Z"/><path d="M73 25Q97 17 91 54L83 72L76 57Q86 37 73 35Z"/>',
  ][a.hair];
  const eyes = [
    '<ellipse cx="40" cy="46" rx="2.5" ry="4"/><ellipse cx="60" cy="46" rx="2.5" ry="4"/>',
    '<path d="M35 46h10m10 0h10" fill="none"/>',
    '<ellipse cx="40" cy="46" rx="2.5" ry="4"/><path d="m56 47 5-3 5 3" fill="none"/>',
    '<circle cx="39" cy="46" r="6" fill="white"/><circle cx="61" cy="46" r="6" fill="white"/><circle cx="39" cy="46" r="2"/><circle cx="61" cy="46" r="2"/>',
    '<path d="M35 47q5-8 10 0m10 0q5-8 10 0" fill="none"/>',
  ][a.eyes];
  const mouth = [
    '<path d="M42 59q8 9 16 0" fill="none"/>',
    '<path d="M39 57h22q-2 15-11 15T39 57Z" fill="white"/><path d="M40 63h20"/>',
    '<ellipse cx="50" cy="61" rx="5" ry="7" fill="#59332c"/>',
    '<path d="M43 62q12 3 15-6" fill="none"/>',
    '<path d="M43 61h14"/>',
  ][a.mouth];
  const glasses = [
    "",
    '<circle cx="38" cy="46" r="10"/><circle cx="62" cy="46" r="10"/><path d="M48 45h4M27 44l-4-2m50 2 4-2"/>',
    '<rect x="27" y="37" width="21" height="17" rx="3"/><rect x="52" y="37" width="21" height="17" rx="3"/><path d="M48 44h4"/>',
    '<path d="M27 38h21v12q-11 11-21-1Zm25 0h21v11q-10 12-21 1Z" fill="#28242b"/><path d="M48 43h4"/>',
    '<circle cx="35" cy="46" r="14" stroke="#b62b48"/><circle cx="65" cy="46" r="14" stroke="#b62b48"/><path d="M49 44h2"/>',
  ][a.glasses];
  const earrings = [
    "",
    '<circle cx="25" cy="57" r="2.5"/><circle cx="75" cy="57" r="2.5"/>',
    '<circle cx="25" cy="60" r="4" fill="none"/><circle cx="75" cy="60" r="4" fill="none"/>',
    '<ellipse cx="24" cy="65" rx="7" ry="11" fill="none"/><ellipse cx="76" cy="65" rx="7" ry="11" fill="none"/>',
    '<path d="m24 57 2 5 5 1-4 3 1 5-4-3-4 3 1-5-4-3 5-1Zm52 0 2 5 5 1-4 3 1 5-4-3-4 3 1-5-4-3 5-1Z"/>',
  ][a.earrings];
  const clothing = [
    '<path d="m32 82 18 12 18-12" fill="none" stroke="#ffffff50"/>',
    '<path d="m32 79-7 10 18 9 7-16 7 16 18-9-7-10" fill="#ffffff20"/><path d="M43 88v12m14-12v12" stroke="#eadbc5"/>',
    '<path d="m34 78 16 6-11 13-10-12Zm32 0-16 6 11 13 10-12Z" fill="#eee1ce"/><path d="M50 85v15" stroke="#eee1ce"/>',
    '<path d="M28 77h9v15h26V77h9v23H28Z" fill="#7e9caa"/><circle cx="33" cy="94" r="2" fill="#f4ce73"/><circle cx="67" cy="94" r="2" fill="#f4ce73"/>',
  ][a.body];
  const necklace =
    a.necklace === 0
      ? ""
      : `<path d="M36 80q14 27 28 0" fill="none" stroke="#f7c967" stroke-width="${a.necklace === 3 ? 4 : 2}" ${a.necklace === 3 ? 'stroke-dasharray="1 5"' : ""}/>${a.necklace === 2 ? '<path d="m50 93 4 4-4 4-4-4Z" fill="#f7c967"/>' : ""}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="none"><path fill="${colour}" d="M0 0h100v100H0z"/><g stroke="#28242b" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 103Q10 77 38 76H62Q90 77 91 103" fill="${a.body === 1 ? "#805163" : "#343647"}"/><path d="M40 66v13q10 12 20 0V66" fill="${skin}"/><ellipse cx="26" cy="47" rx="5" ry="8" fill="${skin}"/><ellipse cx="74" cy="47" rx="5" ry="8" fill="${skin}"/><path d="M26 34Q25 15 50 15Q75 15 74 34V52Q73 74 50 76Q27 74 26 52Z" fill="${skin}"/>${clothing}<path d="m47 51-2 5h5" opacity=".3"/>${a.style === 1 ? '<path d="m35 39-3-3m33 3 3-3"/><ellipse cx="32" cy="55" rx="5" ry="2" fill="#c56d68" stroke="none" opacity=".5"/><ellipse cx="68" cy="55" rx="5" ry="2" fill="#c56d68" stroke="none" opacity=".5"/>' : ""}<g fill="#28242b">${eyes}</g><g stroke="#643b34">${mouth}</g><g fill="#33272b">${hair}</g><g fill="none" stroke-width="2.5">${glasses}</g><g fill="#f7c967" stroke="#7c5523" stroke-width="1.5">${earrings}</g>${necklace}</g></svg>`;
}
