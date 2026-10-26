import type { GameState, Player } from "./types";
import { palaces } from "./content";
export interface IncomeSource {
  source: string;
  coins?: number;
  tools?: number;
  scholars?: number;
  power?: number;
  books?: number;
  science?: number;
  vp?: number;
}
// Shared by settlement and the personal board. Values are gross income;
// scholar supply and bowl capacity are applied at settlement, never duplicated.
export function incomeSources(s: GameState, p: Player): IncomeSource[] {
  const bs = Object.values(s.board.buildings).filter(
    (b) => b.seat === p.seat && !b.neutral,
  );
  const count = (kind: string) => bs.filter((b) => b.kind === kind).length;
  const g = count("guild");
  const rows: IncomeSource[] = [
    { source: "工坊", tools: count("workshop") },
    { source: "商会", coins: 2 * g, power: [0, 1, 2, 4, 6][g] },
    { source: "学校与大学", scholars: count("school") + count("university") },
  ];
  if (p.native === "mountain")
    rows.push({ source: "山地家园", coins: 2 + (g ? 1 : 0) });
  const bonuses: Record<string, IncomeSource> = {
    coins: { source: "奖励板", coins: 6 },
    power: { source: "奖励板", coins: 2, power: 4 },
    guild: { source: "奖励板", power: 3 },
    scholar: { source: "奖励板", scholars: 1 },
    school: { source: "奖励板", coins: 4 },
    bigbuilding: { source: "奖励板", tools: 1 },
    "science-bonus": { source: "奖励板", tools: 2 },
    "spade-bonus": { source: "奖励板", books: 1 },
    "bridge-bonus": { source: "奖励板", books: 1 },
  };
  if (bonuses[p.bonus]) rows.push(bonuses[p.bonus]);
  const sciences: IncomeSource[] = [
    { source: "银行学 9", coins: 3 },
    { source: "法学 9", power: 6 },
    { source: "工程学 9", tools: 1 },
    { source: "医学 9", scholars: 3 },
  ];
  p.science.forEach((n, i) => {
    if (n >= 9) rows.push(sciences[i]);
  });
  const palace = p.palace ? palaces[p.palace] : undefined;
  if (palace?.income) rows.push({ source: palace.name, ...palace.income });
  if (p.faction === "omar") rows.push({ source: "奥玛", coins: 2, power: 2 });
  const extra: Record<string, IncomeSource> = {
    "neutral-workshop": { source: "中立工坊创新", tools: 3 },
    "neutral-guild": { source: "中立商会创新", coins: 5 },
    "neutral-university": { source: "中立大学创新", vp: 2 },
    "neutral-palace": { source: "中立宫殿创新", power: 4 },
    "income-tool-science": { source: "工具与学科能力", tools: 1, science: 1 },
    tower: { source: "塔楼能力", coins: 2, power: 2 },
    "income-vp-coins": { source: "得分与金币能力", vp: 3, coins: 2 },
    "income-book-power": { source: "书籍与魔力能力", books: 1, power: 1 },
  };
  for (const id of [...p.innovations, ...p.competencies])
    if (extra[id]) rows.push(extra[id]);
  return rows.filter((row) =>
    Object.entries(row).some(([k, v]) => k !== "source" && Number(v) > 0),
  );
}
export function buildingInventory(s: GameState, seat: string) {
  return Object.entries({
    workshop: 9,
    guild: 4,
    school: 3,
    palace: 1,
    university: 1,
  }).map(([kind, total]) => {
    const used = Object.values(s.board.buildings).filter(
      (b) => b.seat === seat && b.kind === kind && !b.neutral,
    ).length;
    return { kind, used, remaining: total - used, total };
  });
}
