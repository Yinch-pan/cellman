import { t as translate } from "./index";
import * as rules from "../../../../packages/rules/src/content";
import { t } from "./index";
import { palaceCodes, innovationCodes } from "./tile-codes";

function definitions<T extends { name: string; description: string }>(
  category: string,
  source: Record<string, T>,
  codes?: Record<string, string>,
): Record<string, T> {
  return Object.fromEntries(
    Object.entries(source).map(([id, definition]) => [
      id,
      {
        ...definition,
        get name() {
          return codes?.[id] ?? t(`content.${category}.${id}.name`);
        },
        get description() {
          return t(`content.${category}.${id}.description`);
        },
      },
    ]),
  );
}
export const factions = definitions("faction", rules.factions);
export const palaces = definitions("palace", rules.palaces, palaceCodes);
export const innovations = definitions(
  "innovation",
  rules.innovations,
  innovationCodes,
);
export const bonusDescriptions: Record<string, string> =
  Object.defineProperties(
    {},
    Object.fromEntries(
      rules.bonusIds.map((id) => [
        id,
        { enumerable: true, get: () => t(`content.bonus.${id}.description`) },
      ]),
    ),
  );
export { bonusIds, roundIds } from "../../../../packages/rules/src/content";
export const competencyDescriptions: Record<string, string> = {
  "income-book-power": translate("ui.i18n.content.9ca039ce08"),
  "income-tool-science": translate("ui.i18n.content.93fc8eb4a5"),
  "income-vp-coins": translate("ui.i18n.content.c2dcd02183"),
  tower: translate("ui.i18n.content.53bc1cc734"),
  "two-spades": translate("ui.i18n.content.ff3280fdb3"),
  "power-special": translate("ui.i18n.content.155cd6f5cb"),
  annexes: translate("ui.i18n.content.2bcde18e20"),
  "immediate-resources": translate("ui.i18n.content.3447ec36ed"),
  "city-pass": translate("ui.i18n.content.d0a15e6a7a"),
  "min-science-pass": translate("ui.i18n.content.3fd701a776"),
  "border-score": translate("ui.i18n.content.829a0658f0"),
  "scholar-score": translate("ui.i18n.content.60a9bf3e6d"),
};
