let csrf = "";
export const setCsrf = (value: string) => {
  csrf = value;
};
export class RequestError extends Error {
  constructor(public code: string) {
    super(messages[code] ?? "暂时无法完成此操作，请检查选择后重试");
  }
}
const messages: Record<string, string> = {
  INVALID_BRIDGE_SITE: "这两块地之间没有可建桥的位置",
  NO_SURPLUS_SPADES: "剩余铲子不足",
  FIRST_TERRAIN_INCOMPLETE: "请先把前一个地块改造成家园",
  INVALID_CREDENTIALS: "用户名、密码或恢复码不正确",
  USERNAME_UNAVAILABLE: "这个用户名已被使用",
  INVALID_USERNAME: "用户名需要 3–24 位字母、数字或下划线",
  INVALID_PASSWORD_LENGTH: "密码需要 12–128 个字符",
  ROOM_FULL: "房间已经满员",
  NOT_READY: "请等待所有玩家准备",
  REVISION_CONFLICT: "局面已更新，已保留你的选择，请重新预览",
  PENDING_CHOICES: "请先处理待响应选择",
  NOT_YOUR_TURN: "现在还没有轮到你",
  INSUFFICIENT_RESOURCES: "资源不足",
  INSUFFICIENT_POWER: "可用魔力不足",
  OUT_OF_REACH: "这个地块不在你的可达范围内",
  OCCUPIED: "这个地块已有建筑",
  NOT_NATIVE_TERRAIN: "请选择自己的家园地形",
  PRIMARY_ALREADY_USED: "本回合已完成主要行动，请结束回合",
  PRIMARY_REQUIRED: "请先完成一个主要行动",
  FORBIDDEN: "你没有访问这个房间的权限",
  INVALID_INVITE: "邀请链接无效",
  UNAUTHENTICATED: "请先登录",
  BONUS_UNAVAILABLE: "这张奖励板已被其他玩家持有",
  INVALID_UPGRADE: "不能这样升级建筑",
  UNSUPPORTED_ABILITY: "这项能力尚未开放",
  UNSUPPORTED_ACTION: "此行动尚未实现",
  BOOK_PAYMENT: "书籍数量或颜色不满足要求",
  RATE_LIMIT: "操作太频繁，请稍后再试",
  NETWORK_ERROR: "连接中断，已保留提交标识，可以安全重试",
  RULESET_UNAVAILABLE: "当前服务无法处理此对局的规则版本，请等待服务更新后继续",
  RESOLVE_KEY_FIRST: "请先决定是否使用城市钥匙",
  RESOLVE_NEUTRAL_FIRST: "请先立即放置刚获得的中立建筑",
  WAIT_SCIENCE_ORDER: "轮末改造按下一轮的行动顺序处理，请等待前面的玩家",
  NO_CITY_KEY: "没有尚未使用的城市钥匙，可以选择停在 7 级",
};
export async function api<T = any>(path: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch("/api" + path, {
      method: body === undefined ? "GET" : "POST",
      headers:
        body === undefined
          ? {}
          : { "Content-Type": "application/json", "X-CSRF-Token": csrf },
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: "same-origin",
    });
  } catch {
    throw new RequestError("NETWORK_ERROR");
  }
  let data;
  try {
    data = await response.json();
  } catch {
    // The command may already have committed before a proxy replaced its response.
    throw new RequestError("NETWORK_ERROR");
  }
  if (response.status >= 500 && data?.error !== "RULESET_UNAVAILABLE")
    throw new RequestError("NETWORK_ERROR");
  if (!response.ok) throw new RequestError(data.error ?? "SERVER_ERROR");
  return data;
}
export const names: Record<string, string> = {
  discard: "放弃剩余铲子",
  spades: "两把铲子与建造",
  "income-tool-science": "收入：工具与学科",
  "two-spades": "立即获得两把铲子",
  "scholar-score": "派遣学者获得 2 分",
  "border-score": "边境工坊获得 3 分",
  annexes: "两座附属建筑",
  "power-special": "特殊行动：4 魔力",
  "city-pass": "结束本轮：每城市 2 分",
  "min-science-pass": "结束本轮：最低学科计分",
  forest: "森林",
  lake: "湖泊",
  mountain: "山地",
  desert: "沙漠",
  plains: "平原",
  swamp: "沼泽",
  wasteland: "荒地",
  river: "河流",
  workshop: "工坊",
  guild: "商会",
  school: "学校",
  palace: "宫殿",
  university: "大学",
  tower: "塔楼",
  monument: "纪念碑",
  blessed: "受祝福者",
  navigators: "航海家",
  goblins: "哥布林",
  coins: "金币收入",
  power: "魔力收入",
  scholar: "学者",
  bigbuilding: "大型建筑奖励",
  "workshop-score": "工坊计分宫殿",
  "city-discount": "城市折扣宫殿",
  "income-vp-coins": "收入：3 分与 2 金币",
  "income-book-power": "收入：书籍与魔力",
  "immediate-resources": "工具、金币与分数",
  "immediate-score": "建成获得 10 分",
  "school-pass": "结束本轮：每学校 3 分",
  "power-books": "立即魔力与书籍，收入金币",
  libraries: "图书馆",
  census: "人口普查",
  communications: "通讯",
  steel: "钢铁",
  architecture: "建筑学",
  colleges: "学院",
  sewerage: "排水系统",
  "league-of-cities": "城市联盟",
  tools: "工具",
  books: "书籍",
  science: "学科推进",
};
export const label = (id: string) => names[id] ?? id;
