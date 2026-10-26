import type { GameState, Player, GameAction } from "../types";
import { requireRule, pay, gainScholar } from "../internal";
import { gainPower } from "./power";
import { findCities } from "./city";
import { advanceScience } from "./science";
import { checkSupply, upgrade } from "./build";
import { offerLeech } from "../responses";
import { awardRound } from "../round-scoring";
import {
  chooseBooks,
  freeSpades,
  freeBridge,
  buildingRewards,
} from "../effects";
import { palaces } from "../content";
export function specialOptions(
  p: Player,
): { id: string; label: string; target?: boolean; track?: boolean }[] {
  const options: {
    id: string;
    label: string;
    target?: boolean;
    track?: boolean;
  }[] = [];
  if (p.annexes)
    options.push({
      id: "annex",
      label: `放置附属建筑（余 ${p.annexes}）`,
      target: true,
    });
  if (p.competencies.includes("power-special"))
    options.push({
      id: "competency:power-special",
      label: "能力：获得 4 魔力",
    });
  if (p.faction === "philosophers")
    options.push({ id: "faction:philosophers", label: "哲学家：获得一本书" });
  if (p.faction === "psychics")
    options.push({
      id: "faction:psychics",
      label: "灵能者：获得 5 魔力并继续行动",
    });
  if (p.faction === "moles")
    options.push({ id: "faction:moles", label: "鼹鼠：支付一工具建桥" });
  if (p.palace && palaces[p.palace]?.special)
    options.push({
      id: `palace:${p.palace}`,
      label: palaces[p.palace].name,
      target: ["upgrade-special", "downgrade-special"].includes(p.palace),
      track: p.palace === "science-special",
    });
  if (p.innovations.includes("deus-ex-machina"))
    options.push({
      id: "innovation:deus-ex-machina",
      label: "机械降神：铲子与建造",
    });
  if (p.innovations.includes("professors"))
    options.push({ id: "innovation:professors", label: "教授：一学者与 3 分" });
  if (["spade-bonus", "bridge-bonus", "science-bonus"].includes(p.bonus))
    options.push({
      id: `bonus:${p.bonus}`,
      label: {
        "spade-bonus": "奖励板：铲子与建造",
        "bridge-bonus": "奖励板：免费建桥",
        "science-bonus": "奖励板：学科推进",
      }[p.bonus]!,
      track: p.bonus === "science-bonus",
    });
  return options;
}
export function special(
  s: GameState,
  p: Player,
  a: Extract<GameAction, { kind: "special" }>,
) {
  requireRule(
    specialOptions(p).some((o) => o.id === a.source),
    "SPECIAL_UNAVAILABLE",
  );
  if (a.source === "annex") {
    const b = s.board.buildings[a.hex ?? ""];
    requireRule(b?.seat === p.seat && !b.annex, "INVALID_ANNEX_BUILDING");
    b.annex = true;
    p.annexes--;
    findCities(s, p);
    return;
  }
  if (a.source !== "faction:moles") {
    requireRule(!p.usedSpecials.includes(a.source), "SPECIAL_USED");
    p.usedSpecials.push(a.source);
  }
  if (a.source === "competency:power-special")
    p.resources.power = gainPower(p.resources.power, 4);
  if (a.source === "faction:philosophers") chooseBooks(s, p, 1, a.source);
  if (a.source === "faction:psychics") {
    p.resources.power = gainPower(p.resources.power, 5);
    p.extraActions = 1;
  }
  if (a.source === "faction:moles") {
    pay(p, { tools: 1 });
    freeBridge(s, p, a.source);
  }
  if (a.source === "innovation:professors") {
    gainScholar(s, p, 1);
    p.vp += 3;
  }
  if (["innovation:deus-ex-machina", "bonus:spade-bonus"].includes(a.source))
    freeSpades(s, p, 1, a.source);
  if (a.source === "bonus:bridge-bonus") freeBridge(s, p, a.source);
  if (
    a.source === "bonus:science-bonus" ||
    a.source === "palace:science-special"
  ) {
    requireRule(a.track !== undefined, "INVALID_TRACK");
    advanceScience(s, p, a.track, a.source.startsWith("palace") ? 2 : 1);
  }
  if (a.source === "palace:tools-special") p.resources.tools += 2;
  if (a.source === "palace:spades-special") freeSpades(s, p, 2, a.source);
  if (a.source === "palace:guild-special") {
    p.resources.coins += 3;
    chooseBooks(s, p, 1, a.source);
  }
  if (a.source === "palace:upgrade-special") {
    requireRule(a.hex, "INVALID_HEX");
    upgrade(s, p, { kind: "upgrade", hex: a.hex, to: "guild" }, true);
    awardRound(s, p, "guild");
    findCities(s, p);
  }
  if (a.source === "palace:downgrade-special") {
    const b = s.board.buildings[a.hex ?? ""];
    requireRule(
      b?.seat === p.seat && b.kind === "school" && !b.neutral,
      "INVALID_DOWNGRADE",
    );
    checkSupply(s, p, "guild");
    b.kind = "guild";
    p.vp += 3;
    p.resources.tools++;
    offerLeech(s, p.seat, a.hex!);
    buildingRewards(s, p, a.hex!);
    awardRound(s, p, "guild");
    findCities(s, p);
  }
}
