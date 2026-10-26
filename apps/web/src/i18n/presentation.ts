import type {
  Player,
  RuleEvent,
  GameState,
} from "../../../../packages/rules/src/types";
import { specialOptions as ruleSpecialOptions } from "../../../../packages/rules/src/actions/special";
import {
  actionNames as ruleActionNames,
  fieldLabels as ruleFieldLabels,
} from "../../../../packages/rules/src/ledger";
import { incomeSources as ruleIncomeSources } from "../../../../packages/rules/src/income";
import * as rawContent from "../../../../packages/rules/src/content";
import {
  palaces,
  innovations,
  bonusDescriptions,
  competencyDescriptions,
} from "./content";
import { tileCode } from "./tile-codes";
import { t } from "./index";
import ruleMessages from "./rule-messages.json" with { type: "json" };

const literals = new Map(
  ruleMessages
    .filter((m) => !/\{p\d+\}/.test(m.source))
    .map((m) => [m.source, m.key]),
);
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const patterns = ruleMessages
  .filter(
    (m) =>
      /\{p\d+\}/.test(m.source) &&
      m.source.replace(/\{p\d+\}/g, "").length >= 2,
  )
  .sort(
    (a, b) =>
      b.source.replace(/\{p\d+\}/g, "").length -
      a.source.replace(/\{p\d+\}/g, "").length,
  )
  .map((m) => ({
    ...m,
    names: [...m.source.matchAll(/\{(p\d+)\}/g)].map((m) => m[1]),
    pattern: new RegExp(
      "^" +
        m.source
          .split(/\{p\d+\}/)
          .map(escape)
          .join("(.*?)") +
        "$",
      "s",
    ),
  }));
/** Only call for system-authored text. User names, chat and undo reasons remain verbatim. */
export function translateRuleText(text: string): string {
  const key = literals.get(text);
  if (key) return t(key);
  for (const item of patterns) {
    const match = item.pattern.exec(text);
    if (match)
      return t(
        item.key,
        Object.fromEntries(item.names.map((name, i) => [name, match[i + 1]])),
      );
  }
  return text;
}
export const fieldLabels: Record<string, string> = Object.fromEntries(
  Object.entries(ruleFieldLabels).map(([id, text]) => [
    id,
    translateRuleText(text),
  ]),
);
export const actionNames = Object.fromEntries(
  Object.entries(ruleActionNames).map(([id, text]) => [
    id,
    translateRuleText(text),
  ]),
) as typeof ruleActionNames;
export function eventText(event: RuleEvent, state: GameState) {
  if (event.kind === "ledger" && event.details?.action && event.seat) {
    const action = event.details.action as {
      kind: keyof typeof actionNames;
      hex?: string;
    };
    return `${state.players[event.seat]?.name ?? event.seat}：${actionNames[action.kind] ?? action.kind}${action.hex ? " · " + action.hex : ""}`;
  }
  return translateRuleText(event.text);
}
export function specialOptions(player: Player) {
  return ruleSpecialOptions(player).map((option) => {
    const [category, id] = option.id.split(":");
    const description =
      category === "palace"
        ? palaces[id]?.description
        : category === "innovation"
          ? innovations[id]?.description
          : category === "bonus"
            ? bonusDescriptions[id]
            : category === "competency"
              ? competencyDescriptions[id]
              : undefined;
    return {
      ...option,
      label: description
        ? `${tileCode(category, id)} · ${description}`
        : translateRuleText(option.label),
    };
  });
}
export function incomeSources(state: GameState, player: Player) {
  const sourceIds: Record<string, string> = {
    奖励板: `bonus:${player.bonus}`,
    中立工坊创新: "innovation:neutral-workshop",
    中立商会创新: "innovation:neutral-guild",
    中立大学创新: "innovation:neutral-university",
    中立宫殿创新: "innovation:neutral-palace",
    工具与学科能力: "competency:income-tool-science",
    塔楼能力: "competency:tower",
    得分与金币能力: "competency:income-vp-coins",
    书籍与魔力能力: "competency:income-book-power",
  };
  if (player.palace)
    sourceIds[rawContent.palaces[player.palace].name] =
      `palace:${player.palace}`;
  return ruleIncomeSources(state, player).map((row) => {
    const id = sourceIds[row.source];
    return {
      ...row,
      source: id
        ? tileCode(...(id.split(":") as [string, string]))
        : translateRuleText(row.source),
    };
  });
}
