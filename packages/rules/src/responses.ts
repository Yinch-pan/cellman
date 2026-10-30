import type {
  Building,
  GameState,
  Player,
  RuleEvent,
  PendingChoice,
} from "./types";
import { connected, officialLarge } from "./map";
import { note, ownBuildings } from "./internal";
import { gainPower } from "./actions/power";
export const buildingPower = (b: Building): number =>
  ({
    workshop: 1,
    guild: 2,
    school: 2,
    palace: 3,
    university: 3,
    tower: 2,
    monument: 4,
  })[b.kind] + (b.annex ? 1 : 0);
export function queueChoice(
  s: GameState,
  seat: string,
  kind: PendingChoice["kind"],
  amount: number,
  options: string[],
  source: string,
) {
  if (kind === "book" && amount > 1) {
    for (let i = 0; i < amount; i++)
      queueChoice(s, seat, kind, 1, options, source);
    return;
  }
  s.pending.push({
    id: `${s.setup.id}:${++s.choiceSerial}`,
    seat,
    kind,
    amount,
    options,
    continuation: { kind: "resume-turn" },
    source,
  });
}
export function offerLeech(s: GameState, builder: string, hex: string) {
  for (const seat of s.turnOrder) {
    if (seat === builder) continue;
    const p = s.players[seat];
    const value = ownBuildings(s, seat)
      .filter(([id]) =>
        connected(officialLarge, id, hex, s.board.bridges, seat),
      )
      .reduce((n, [, b]) => n + buildingPower(b), 0);
    const amount = Math.min(
      value,
      p.vp + 1,
      p.resources.power[0] * 2 + p.resources.power[1],
    );
    if (amount > 0)
      queueChoice(s, seat, "leech", amount, ["accept", "decline"], hex);
  }
}
export function acceptLeech(
  p: Player,
  amount: number,
  events: RuleEvent[],
  automatic = false,
) {
  const gain = Math.min(
    amount,
    p.vp + 1,
    p.resources.power[0] * 2 + p.resources.power[1],
  );
  p.resources.power = gainPower(p.resources.power, gain);
  p.vp -= Math.max(0, gain - 1);
  note(
    events,
    p.seat,
    "leech",
    `${p.name} 获得 ${gain} 魔力，支付 ${Math.max(0, gain - 1)} 分`,
    { automatic },
  );
}
export function autoLeech(s: GameState, events: RuleEvent[]) {
  s.pending = s.pending.filter((c) => {
    const p = s.players[c.seat];
    if (
      c.kind === "leech" &&
      p.leechPolicy.enabled &&
      p.leechPolicy.rejectPaid
    ) {
      const cost = Math.max(
        0,
        Math.min(
          c.amount,
          p.vp + 1,
          p.resources.power[0] * 2 + p.resources.power[1],
        ) - 1,
      );
      if (cost === 0) acceptLeech(p, c.amount, events, true);
      else
        note(events, p.seat, "leech", `${p.name} 自动拒绝付分蹭魔`, {
          automatic: true,
          declined: true,
          cost,
        });
      return false;
    }
    if (
      c.kind === "leech" &&
      p.leechPolicy.enabled &&
      Math.max(
        0,
        Math.min(
          c.amount,
          p.vp + 1,
          p.resources.power[0] * 2 + p.resources.power[1],
        ) - 1,
      ) <= p.leechPolicy.maxVpCost
    ) {
      acceptLeech(p, c.amount, events, true);
      return false;
    }
    return true;
  });
}
