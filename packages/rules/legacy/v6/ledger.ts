import type { GameAction, GameState, RuleEvent } from "./types";
import { scoreAwards } from "./score-events";

export const actionNames: Record<GameAction["kind"], string> = {
  collectBooks: "领取书籍",
  convertBatch: "资源转换",
  draftPick: "轮抽开局配置",
  turn: "提交回合",
  chooseSetup: "选择种族与家园",
  riverCity: "跨河建城",
  place: "放置起始建筑",
  terraform: "改造与建造",
  upgrade: "升级建筑",
  convert: "资源转换",
  burn: "燃烧魔力",
  scholar: "派遣学者",
  advance: "推进技术",
  powerAction: "公共魔力行动",
  bookAction: "书籍行动",
  innovation: "研发创新",
  special: "特殊行动",
  pass: "结束本轮",
  endTurn: "结束回合",
  respond: "处理选择",
  setLeech: "设置自动蹭魔",
};
export const fieldLabels: Record<string, string> = {
  coins: "金币",
  tools: "工具",
  scholars: "学者",
  vp: "分数",
  keys: "城市钥匙",
  sailing: "航运",
  terraformLevel: "改造等级",
  "power.0": "魔力Ⅰ",
  "power.1": "魔力Ⅱ",
  "power.2": "魔力Ⅲ",
  "books.0": "银行学书",
  "books.1": "法学书",
  "books.2": "工程学书",
  "books.3": "医学书",
  "science.0": "银行学",
  "science.1": "法学",
  "science.2": "工程学",
  "science.3": "医学",
};
export interface ResourceChange {
  seat: string;
  field: string;
  before: number;
  after: number;
  delta: number;
}
export function ledgerEntry(
  before: GameState,
  after: GameState,
  seat: string,
  action: GameAction,
): RuleEvent {
  const changes: ResourceChange[] = [];
  for (const [id, p] of Object.entries(before.players)) {
    const n = after.players[id];
    const add = (field: string, a: number, b: number) => {
      if (a !== b)
        changes.push({ seat: id, field, before: a, after: b, delta: b - a });
    };
    for (const key of ["coins", "tools", "scholars"] as const)
      add(key, p.resources[key], n.resources[key]);
    for (const key of ["vp", "keys", "sailing", "terraformLevel"] as const)
      add(key, p[key], n[key]);
    for (const key of ["power", "books"] as const)
      p.resources[key].forEach((v, i) =>
        add(`${key}.${i}`, v, n.resources[key][i]),
      );
    p.science.forEach((v, i) => add(`science.${i}`, v, n.science[i]));
  }
  const target = "hex" in action && action.hex ? ` · ${action.hex}` : "";
  const selection =
    action.kind === "respond"
      ? before.pending.find((c) => c.id === action.choiceId)
      : undefined;
  return {
    kind: "ledger",
    seat,
    text: `${before.players[seat].name}：${actionNames[action.kind] ?? action.kind}${target}`,
    details: {
      action: structuredClone(action),
      round: before.round,
      phase: before.phase,
      changes,
      scoreSources: scoreAwards(after),
      choiceSource: selection?.source,
      choices: after.pending
        .filter((c) => !before.pending.some((b) => b.id === c.id))
        .map((c) => ({
          id: c.id,
          seat: c.seat,
          kind: c.kind,
          amount: c.amount,
          source: c.source,
        })),
    },
  };
}
