import { awardPoints } from "./score-events";
import { incomeSources } from "./income";
import { palaces } from "./content";
import type { GameState, Player } from "./types";
import { ownBuildings, requireRule, gainScholar } from "./internal";
import { gainPower } from "./actions/power";
import { advanceScience } from "./actions/science";
import { queueChoice } from "./responses";
import { finishGame } from "./scoring";
export function giveIncome(s: GameState) {
  s.phase = "income";
  for (const p of Object.values(s.players)) {
    for (const row of incomeSources(s, p)) {
      p.resources.coins += row.coins ?? 0;
      p.resources.tools += row.tools ?? 0;
      awardPoints(s, p, row.vp ?? 0, row.source);
      if (row.power)
        p.resources.power = gainPower(p.resources.power, row.power);
      if (row.scholars) gainScholar(s, p, row.scholars);
      if (row.books)
        queueChoice(
          s,
          p.seat,
          "book",
          row.books,
          ["0", "1", "2", "3"],
          row.source === "奖励板"
            ? "bonus-income"
            : row.source === "书籍与魔力能力"
              ? "income"
              : "palace-income",
        );
      if (row.science)
        queueChoice(
          s,
          p.seat,
          "science",
          row.science,
          ["0", "1", "2", "3"],
          "income-tool-science",
        );
    }
  }
  if (!s.pending.length) s.phase = "actions";
}
function roundBonus(s: GameState) {
  const tile = s.setup.roundTiles[s.round - 1];
  const rules: Record<string, [number, number, string, number]> = {
    "workshop-law": [1, 3, "scholar", 1],
    "workshop-bank": [0, 3, "power", 4],
    "guild-law": [1, 3, "book", 1],
    "guild-medicine": [3, 4, "spades", 1],
    "city-engineering": [2, 4, "spades", 1],
    "school-bank": [0, 1, "coins", 1],
    "big-medicine": [3, 2, "tools", 1],
    "big-bank": [0, 2, "tools", 1],
    "spade-engineering": [2, 1, "coins", 1],
    "science-medicine": [3, 3, "book", 1],
    "advance-engineering": [2, 3, "scholar", 1],
    "innovation-law": [1, 2, "power", 3],
  };
  const rule = rules[tile];
  if (!rule) return;
  for (const seat of s.passOrder) {
    const p = s.players[seat];
    const [track, step, resource, n] = rule;
    const amount =
      Math.floor(
        (p.science[track] + (p.faction === "blessed" ? 3 : 0)) / step,
      ) * n;
    if (resource === "coins") p.resources.coins += amount;
    if (resource === "tools") p.resources.tools += amount;
    if (resource === "scholar") gainScholar(s, p, amount);
    if (resource === "power")
      p.resources.power = gainPower(p.resources.power, amount);
    if (resource === "spades" && amount) {
      queueChoice(
        s,
        p.seat,
        "spades",
        amount,
        ["terraform", "discard"],
        "round-science",
      );
      const choice = s.pending[s.pending.length - 1];
      choice.canBuild = false;
      choice.canBuySpades = false;
    }
    if (resource === "book" && amount)
      queueChoice(
        s,
        p.seat,
        "book",
        amount,
        ["0", "1", "2", "3"],
        "round-science",
      );
  }
}
export function pass(s: GameState, p: Player, bonus?: string) {
  if (s.round < 6) {
    requireRule(!!bonus && s.setup.bonusPool.includes(bonus), "INVALID_BONUS");
    requireRule(
      !Object.values(s.players).some((x) => x.bonus === bonus),
      "BONUS_UNAVAILABLE",
    );
  }
  const bs = ownBuildings(s, p.seat);
  if (p.innovations.includes("trading-routes"))
    awardPoints(
      s,
      p,
      2 * bs.filter(([, b]) => b.kind === "guild").length,
      "trading-routes",
    );
  if (p.palace === "school-pass")
    awardPoints(
      s,
      p,
      3 * bs.filter(([, b]) => b.kind === "school").length,
      "school-pass",
    );
  if (p.competencies.includes("city-pass"))
    awardPoints(s, p, p.keys * 2, "city-pass");
  if (p.competencies.includes("min-science-pass"))
    awardPoints(s, p, Math.min(...p.science), "min-science-pass");
  if (p.bonus === "bigbuilding")
    awardPoints(
      s,
      p,
      4 *
        bs.filter(([, b]) => b.kind === "palace" || b.kind === "university")
          .length,
      "宫殿与大学奖励板",
    );
  if (p.bonus === "school") {
    const n = bs.filter(([, b]) => b.kind === "school").length;
    for (let i = 0; i < n; i++)
      queueChoice(s, p.seat, "science", 1, ["0", "1", "2", "3"], "pass");
  }
  if (s.round < 6) {
    p.resources.coins += s.shared.bonusCoins[bonus!] ?? 0;
    s.shared.bonusCoins[bonus!] = 0;
    p.bonus = bonus!;
  }
  p.passed = true;
  p.primaryDone = false;
  s.passOrder.push(p.seat);
  if (s.passOrder.length === s.turnOrder.length) {
    if (!s.pending.length) completeRound(s);
  } else {
    let i = s.turnOrder.indexOf(p.seat);
    do {
      i = (i + 1) % s.turnOrder.length;
    } while (s.players[s.turnOrder[i]].passed);
    s.activeSeat = s.turnOrder[i];
  }
}

export function completeRound(s: GameState) {
  if (s.round === 6) {
    finishGame(s);
    return;
  }
  s.phase = "science";
  roundBonus(s);
  if (!s.pending.length) startNextRound(s);
}
export function settlePhase(s: GameState) {
  if (s.pending.length) return;
  if (s.phase === "setup") {
    giveIncome(s);
    return;
  }
  if (s.phase === "science") startNextRound(s);
  else if (s.phase === "income") s.phase = "actions";
  else if (s.passOrder.length === s.turnOrder.length) completeRound(s);
}
function startNextRound(s: GameState) {
  s.round++;
  s.turnOrder = [...s.passOrder];
  s.passOrder = [];
  s.shared.usedActions = [];
  for (const id of s.setup.bonusPool)
    if (!Object.values(s.players).some((p) => p.bonus === id))
      s.shared.bonusCoins[id]++;
  for (const p of Object.values(s.players)) {
    p.passed = false;
    p.primaryDone = false;
    p.usedSpecials = [];
  }
  s.activeSeat = s.turnOrder[0];
  giveIncome(s);
}

export { awardRound } from "./round-scoring";
