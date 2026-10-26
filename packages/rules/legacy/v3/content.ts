import type { Four, Resources } from "./types";
type Definition = { name: string; description: string; page: number };
type Faction = Definition & { science: Four; tools?: number };
export const factions: Record<string, Faction> = {
  blessed: {
    name: "受祝福者",
    description: "起始所有学科 +1；轮末学科奖励按高 3 级计算。",
    science: [1, 1, 1, 1],
    page: 20,
  },
  felines: {
    name: "猫族",
    description: "起始银行学、医学 +1；建城时自由推进学科共 3 格并获得一本书。",
    science: [1, 0, 0, 1],
    page: 20,
  },
  goblins: {
    name: "哥布林",
    description: "起始多一工具，银行学、工程学 +1；每使用一把铲子获得 2 金币。",
    science: [1, 0, 1, 0],
    tools: 1,
    page: 20,
  },
  illusionists: {
    name: "幻术师",
    description:
      "医学 +2；公共魔力行动少支付 1 魔力，并获得 1 分（4–5 人为 2 分）。",
    science: [0, 0, 0, 2],
    page: 20,
  },
  inventors: {
    name: "发明家",
    description: "完成起始建筑放置后，免费选择一块能力板块。",
    science: [0, 0, 0, 0],
    page: 20,
  },
  lizards: {
    name: "蜥蜴人",
    description:
      "起始自由推进学科 2 格；建城时获得 1 把铲子和一次免费工坊建造。",
    science: [0, 0, 0, 0],
    page: 20,
  },
  moles: {
    name: "鼹鼠",
    description:
      "工程学 +2；改造建造时可支付一工具跨过一格，获得人数 +2 分；可支付一工具建桥。",
    science: [0, 0, 2, 0],
    page: 20,
  },
  monks: {
    name: "修道士",
    description:
      "法学 +1；开局最后放置一所大学，代替两座工坊，并获得能力板块。",
    science: [0, 1, 0, 0],
    page: 20,
  },
  navigators: {
    name: "航海家",
    description: "法学 +3；沿河建造工坊获得 2 分和 1 金币。",
    science: [0, 3, 0, 0],
    page: 20,
  },
  omar: {
    name: "奥玛族",
    description:
      "银行学、工程学 +1；开局额外放置一座中立塔楼；每轮收入 2 魔力和 2 金币。",
    science: [1, 0, 1, 0],
    page: 20,
  },
  philosophers: {
    name: "哲学家",
    description:
      "银行学 +2；领取能力额外获得该颜色的一本书；每轮一次特殊行动获得一本书。",
    science: [2, 0, 0, 0],
    page: 20,
  },
  psychics: {
    name: "灵能者",
    description:
      "银行学、医学 +1，多一工具；每轮一次获得 5 魔力后继续执行一个主要行动。",
    science: [1, 0, 0, 1],
    tools: 1,
    page: 20,
  },
};
type Palace = Definition & {
  income?: Partial<Pick<Resources, "coins" | "tools" | "scholars">> & {
    power?: number;
    books?: number;
  };
  special?: string;
};
export const palaces: Record<string, Palace> = {
  "tools-special": {
    name: "工具宫殿",
    description: "收入 5 魔力；特殊行动获得 2 工具。",
    income: { power: 5 },
    special: "tools",
    page: 22,
  },
  "spades-special": {
    name: "改造宫殿",
    description: "特殊行动：2 把免费铲子并可建造工坊。",
    special: "spades",
    page: 22,
  },
  "downgrade-special": {
    name: "回收宫殿",
    description: "收入 2 魔力；特殊行动将学校降为商会，获得 3 分和 1 工具。",
    income: { power: 2 },
    special: "downgrade",
    page: 22,
  },
  "upgrade-special": {
    name: "商贸宫殿",
    description: "收入 2 魔力；特殊行动免费将工坊升级为商会。",
    income: { power: 2 },
    special: "upgrade",
    page: 22,
  },
  "competency-palace": {
    name: "学术宫殿",
    description: "建成获得一块能力板块；收入 4 魔力。",
    income: { power: 4 },
    page: 22,
  },
  "science-special": {
    name: "研究宫殿",
    description: "收入 2 魔力和一本书；特殊行动推进同一学科最多 2 格。",
    income: { power: 2, books: 1 },
    special: "science",
    page: 22,
  },
  "school-pass": {
    name: "学校计分宫殿",
    description: "收入 4 魔力；结束本轮时，每所学校获得 3 分。",
    income: { power: 4 },
    page: 22,
  },
  "city-discount": {
    name: "城市宫殿",
    description: "建城魔力门槛降为 6；收入 2 金币、2 魔力和 1 工具。",
    income: { coins: 2, power: 2, tools: 1 },
    page: 22,
  },
  flight: {
    name: "飞行宫殿",
    description: "收入一学者；改造建造可支付一学者跨越最多两格，获得 5 分。",
    income: { scholars: 1 },
    page: 22,
  },
  "power-books": {
    name: "知识宫殿",
    description: "建成获得 12 魔力和两本书；收入 6 金币。",
    income: { coins: 6 },
    page: 22,
  },
  "city-palace": {
    name: "建城宫殿",
    description: "建成立即领取一块城市板块；收入一工具。",
    income: { tools: 1 },
    page: 22,
  },
  "workshop-score": {
    name: "工坊宫殿",
    description: "收入 8 魔力；每建造一座工坊获得 2 分。",
    income: { power: 8 },
    page: 22,
  },
  "guild-special": {
    name: "商业宫殿",
    description: "每建造商会获得 3 分；特殊行动获得一本书和 3 金币。",
    special: "book-coins",
    page: 22,
  },
  "river-city": {
    name: "河港宫殿",
    description: "建成免费提升两级航运；收入 6 魔力；建城可连接一个河流格。",
    income: { power: 6 },
    page: 22,
  },
  "engineering-palace": {
    name: "工程宫殿",
    description:
      "收入 6 魔力；建成获得 2 把铲子、两座免费桥和两本书，可选择各奖励的处理顺序。",
    income: { power: 6 },
    page: 22,
  },
  "remote-guild": {
    name: "远方商会宫殿",
    description:
      "建成立即在任意空置家园放置一座免费商会；收入 2 魔力和一本书。",
    income: { power: 2, books: 1 },
    page: 22,
  },
  "immediate-score": {
    name: "荣耀宫殿",
    description: "建成获得 10 分；收入 2 魔力。",
    income: { power: 2 },
    page: 22,
  },
};
export const innovations: Record<string, Definition> = {
  "deus-ex-machina": {
    name: "机械降神",
    description: "立即获得一本书并各学科 +1；特殊行动：一把铲子并可建造。",
    page: 21,
  },
  "trading-routes": {
    name: "贸易路线",
    description: "结束本轮时，每座商会获得 2 分。",
    page: 21,
  },
  professors: {
    name: "教授",
    description: "特殊行动：获得一学者和 3 分。",
    page: 21,
  },
  architecture: {
    name: "建筑学",
    description: "立即获得 10 分，并为每种不同外形的建筑自由推进学科一格。",
    page: 21,
  },
  census: {
    name: "人口普查",
    description: "拥有 7–8 / 9–10 / 11+ 座建筑，立即获得 8 / 12 / 18 分。",
    page: 21,
  },
  colleges: { name: "学院", description: "每所学校立即获得 5 分。", page: 21 },
  communications: {
    name: "通讯",
    description: "拥有 4 / 5 / 6+ 个相邻建筑群，立即获得 8 / 12 / 18 分。",
    page: 21,
  },
  "league-of-cities": {
    name: "城市联盟",
    description: "每块城市板块立即获得 5 分。",
    page: 21,
  },
  libraries: {
    name: "图书馆",
    description: "立即获得最高两项学科等级总和的分数。",
    page: 21,
  },
  sewerage: {
    name: "排水系统",
    description: "每座工坊立即获得 2 分。",
    page: 21,
  },
  "steam-power": {
    name: "蒸汽动力",
    description: "立即获得一学者，并免费提升改造和航运各一级，照常获得奖励。",
    page: 21,
  },
  steel: {
    name: "钢铁",
    description: "拥有 1 / 2 / 3 座桥，立即获得 8 / 12 / 18 分。",
    page: 21,
  },
  "neutral-workshop": {
    name: "中立工坊",
    description: "立即放置中立工坊；收入 3 工具。",
    page: 21,
  },
  "neutral-guild": {
    name: "中立商会",
    description: "立即放置中立商会；收入 5 金币。",
    page: 21,
  },
  "neutral-school": {
    name: "中立学校",
    description: "立即放置中立学校并获得能力板块。",
    page: 21,
  },
  "neutral-university": {
    name: "中立大学",
    description: "立即放置中立大学；收入 2 分。",
    page: 21,
  },
  "neutral-palace": {
    name: "中立宫殿",
    description:
      "立即放置中立宫殿并向魔力碗 III 增加两个魔力标记；收入 4 魔力。",
    page: 21,
  },
  "neutral-monument": {
    name: "纪念碑",
    description:
      "立即放置魔力值为 4 的纪念碑并获得 7 分；所在城市只需两座建筑。",
    page: 21,
  },
};
export const bonusIds = [
  "coins",
  "power",
  "guild",
  "scholar",
  "school",
  "bigbuilding",
  "river",
  "spade-bonus",
  "bridge-bonus",
  "science-bonus",
];
export const bonusDescriptions: Record<string, string> = {
  coins: "收入 6 金币",
  power: "收入 2 金币、4 魔力",
  guild: "收入 3 魔力；建造商会 +3 分",
  scholar: "收入一学者；派遣学者 +2 分",
  school: "收入 4 金币；结束本轮每所学校自由推进学科一格",
  bigbuilding: "收入一工具；结束本轮每座宫殿或大学 +4 分",
  river: "航运可达范围 +1（不用于终局）；沿河工坊 +2 分",
  "spade-bonus": "收入一本书；特殊行动获得一把铲子并可建造",
  "bridge-bonus": "收入一本书；特殊行动免费建桥",
  "science-bonus": "收入两工具；特殊行动自由推进学科一格",
};
export const roundIds = [
  "workshop-law",
  "workshop-bank",
  "guild-law",
  "guild-medicine",
  "school-bank",
  "big-medicine",
  "big-bank",
  "spade-engineering",
  "science-medicine",
  "city-engineering",
  "advance-engineering",
  "innovation-law",
];
