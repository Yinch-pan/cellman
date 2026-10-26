// Presentation IDs only: never persist these in commands or use them to identify rules.
// SH1–SH16 follow the user's 2023 guide, pp. 10–14.
// FAV follows BGA's competency sprite, cross-checked against its scoring statistics.
// Verified BON numbers and E14 follow BGA table 937134162 (2026-10-26).
// BON-P* explicitly denotes an unverified legacy project number; INN/TW remain
// project codes. Never infer a BGA content number from a DOM instance ID.
// See docs/i18n.md for evidence, remaining gaps, and the old-to-new mapping.
export const palaceCodes: Record<string, string> = {
  "tools-special": "SH1",
  "spades-special": "SH2",
  "downgrade-special": "SH3",
  "upgrade-special": "SH4",
  "competency-palace": "SH5",
  "science-special": "SH6",
  "school-pass": "SH7",
  "city-discount": "SH8",
  flight: "SH9",
  "power-books": "SH10",
  "city-palace": "SH11",
  "workshop-score": "SH12",
  "guild-special": "SH13",
  "river-city": "SH14",
  "engineering-palace": "SH15",
  "remote-guild": "SH16",
  // Existing extra content, absent from the guide's numbered palace chapter.
  "immediate-score": "SH-X1",
};
export const competencyCodes: Record<string, string> = {
  "income-book-power": "FAV7",
  "income-tool-science": "FAV12",
  "income-vp-coins": "FAV9",
  tower: "FAV1",
  "two-spades": "FAV6",
  "power-special": "FAV3",
  annexes: "FAV2",
  "immediate-resources": "FAV11",
  "city-pass": "FAV5",
  "min-science-pass": "FAV4",
  "border-score": "FAV10",
  "scholar-score": "FAV8",
};
export const bonusCodes: Record<string, string> = {
  coins: "BON10",
  power: "BON9",
  guild: "BON-P3",
  scholar: "BON-P4",
  school: "BON8",
  bigbuilding: "BON-P6",
  river: "BON-P7",
  "spade-bonus": "BON5",
  "bridge-bonus": "BON-P9",
  "science-bonus": "BON7",
};
export const innovationCodes: Record<string, string> = {
  "deus-ex-machina": "INN1",
  "trading-routes": "INN2",
  professors: "INN3",
  architecture: "INN4",
  census: "INN5",
  colleges: "INN6",
  communications: "INN7",
  "league-of-cities": "INN8",
  libraries: "INN9",
  sewerage: "INN10",
  "steam-power": "INN11",
  steel: "INN12",
  "neutral-workshop": "INN13",
  "neutral-guild": "INN14",
  "neutral-school": "INN15",
  "neutral-university": "E14",
  "neutral-palace": "INN17",
  "neutral-monument": "INN18",
};
export const cityCodes: Record<string, string> = {
  tools: "TW1",
  spades: "TW2",
  books: "TW3",
  coins: "TW4",
  science: "TW5",
  power: "TW6",
  scholar: "TW7",
};
export function tileCode(category: string, id: string): string {
  const categories: Record<string, Record<string, string>> = {
    palace: palaceCodes,
    competency: competencyCodes,
    bonus: bonusCodes,
    innovation: innovationCodes,
    city: cityCodes,
  };
  return categories[category]?.[id] ?? id;
}
