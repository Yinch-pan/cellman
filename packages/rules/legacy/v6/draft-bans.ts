import { factions, palaces, bonusIds } from "./content";
import { terrainCycle } from "./map";

export const draftCategories = [
  "faction",
  "native",
  "palace",
  "bonus",
] as const;
export type DraftCategory = (typeof draftCategories)[number];
export type DraftBans = Record<DraftCategory, string[]>;
export const emptyDraftBans = (): DraftBans => ({
  faction: [],
  native: [],
  palace: [],
  bonus: [],
});
export const draftCatalog = {
  faction: Object.keys(factions),
  native: [...terrainCycle],
  palace: Object.keys(palaces).filter((id) => id !== "immediate-score"),
  bonus: [...bonusIds],
};
export const draftPoolSizes = (
  players: number,
): Record<DraftCategory, number> => ({
  faction: players + 1,
  native: 6,
  palace: players + 1,
  bonus: players + 3,
});
export function invalidDraftBans(bans: DraftBans) {
  return draftCategories.some(
    (category) =>
      new Set(bans[category]).size !== bans[category].length ||
      bans[category].some(
        (id) => !(draftCatalog[category] as readonly string[]).includes(id),
      ),
  );
}
export function excessiveDraftBans(bans: DraftBans, players: number) {
  const sizes = draftPoolSizes(players);
  return draftCategories.filter(
    (category) =>
      draftCatalog[category].length - bans[category].length < sizes[category],
  );
}
