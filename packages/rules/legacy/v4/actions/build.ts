import type { GameState, Player, GameAction, BuildingKind } from "../types";
import { requireRule, pay, ownBuildings } from "../internal";
import { officialLarge, reachable, terrainDistance, connected } from "../map";
import { offerLeech, queueChoice } from "../responses";
import { competencyOptions } from "./competency";
import { gainPower } from "./power";
import { palaces } from "../content";
import { palaceEffect, buildingRewards } from "../effects";
import { travelReach } from "../travel";
const limits: Partial<Record<BuildingKind, number>> = {
  workshop: 9,
  guild: 4,
  school: 3,
  palace: 1,
  university: 1,
};
export function checkSupply(s: GameState, p: Player, to: BuildingKind) {
  requireRule(
    ownBuildings(s, p.seat).filter(([, b]) => b.kind === to && !b.neutral)
      .length < (limits[to] ?? 0),
    "NO_BUILDING_SUPPLY",
  );
}
export function terraform(
  s: GameState,
  p: Player,
  a: Extract<GameAction, { kind: "terraform" }>,
  freeSpades = 0,
) {
  const targets = [{ hex: a.hex, terrain: a.terrain }, ...(a.additional ?? [])];
  requireRule(targets.length <= Math.max(1, freeSpades), "TOO_MANY_TERRAINS");
  requireRule(
    new Set(targets.map((t) => t.hex)).size === targets.length,
    "DUPLICATE_HEX",
  );
  let totalUsed = 0;
  for (let i = 0; i < targets.length; i++) {
    const target = targets[i];
    const hex = officialLarge.hexes[target.hex];
    requireRule(hex && hex.terrain !== "river", "INVALID_HEX");
    requireRule(!s.board.buildings[target.hex], "OCCUPIED");
    requireRule(
      i === 0 && a.travel
        ? travelReach(s, p, target.hex, a.travel)
        : reachable(
            officialLarge,
            ownBuildings(s, p.seat).map(([id]) => id),
            target.hex,
            p.sailing + (p.bonus === "river" ? 1 : 0),
            s.board.bridges,
            p.seat,
          ),
      "OUT_OF_REACH",
    );
    const current = s.board.terrain[target.hex] ?? hex.terrain;
    if (i === 0 && a.travel) {
      pay(p, a.travel === "tunnel" ? { tools: 1 } : { scholars: 1 });
      p.vp += a.travel === "tunnel" ? s.turnOrder.length + 2 : 5;
    }
    const used = terrainDistance(current, target.terrain);
    requireRule(
      used + terrainDistance(target.terrain, p.native) ===
        terrainDistance(current, p.native),
      "INVALID_TERRAFORM",
    );
    requireRule(used > 0 || (i === 0 && a.build), "EMPTY_ACTION");
    if (i > 0) {
      requireRule(
        s.phase === "science" || targets[i - 1].terrain === p.native,
        "FIRST_TERRAIN_INCOMPLETE",
      );
      requireRule(totalUsed + used <= freeSpades, "NO_SURPLUS_SPADES");
    }
    if (freeSpades > 0 && used > freeSpades)
      requireRule(target.terrain === p.native, "CANNOT_BUY_PARTIAL_SPADES");
    if (i === 0)
      pay(p, {
        tools: Math.max(0, used - freeSpades) * (3 - p.terraformLevel),
      });
    s.board.terrain[target.hex] = target.terrain;
    totalUsed += used;
    if (p.faction === "goblins") p.resources.coins += used * 2;
  }
  if (a.build) {
    requireRule(a.terrain === p.native, "NOT_NATIVE_TERRAIN");
    checkSupply(s, p, "workshop");
    pay(p, { tools: 1, coins: 2 });
    s.board.buildings[a.hex] = { seat: p.seat, kind: "workshop" };
    offerLeech(s, p.seat, a.hex);
    buildingRewards(s, p, a.hex);
  }
  return { spades: totalUsed, built: a.build };
}

export function upgrade(
  s: GameState,
  p: Player,
  a: Extract<GameAction, { kind: "upgrade" }>,
  free = false,
) {
  const b = s.board.buildings[a.hex];
  requireRule(b?.seat === p.seat, "NOT_YOUR_BUILDING");
  requireRule(!b.neutral, "NEUTRAL_BUILDING");
  const paths: Partial<Record<BuildingKind, BuildingKind[]>> = {
    workshop: ["guild"],
    guild: ["school", "palace"],
    school: ["university"],
  };
  requireRule(paths[b.kind]?.includes(a.to), "INVALID_UPGRADE");
  checkSupply(s, p, a.to);
  const neighbor = Object.entries(s.board.buildings).some(
    ([id, b]) =>
      b.seat !== p.seat &&
      connected(officialLarge, id, a.hex, s.board.bridges, p.seat),
  );
  const costs = {
    guild: { tools: 2, coins: neighbor ? 3 : 6 },
    school: { tools: 3, coins: 5 },
    palace: { tools: 4, coins: 6 },
    university: { tools: 5, coins: 8 },
  };
  if (!free) pay(p, costs[a.to as keyof typeof costs]);
  b.kind = a.to;
  if (a.to === "palace") {
    requireRule(
      !!a.palace && s.shared.palaces.includes(a.palace),
      "INVALID_PALACE",
    );
    requireRule(Object.hasOwn(palaces, a.palace), "UNSUPPORTED_ABILITY");
    p.palace = a.palace;
    palaceEffect(s, p, a.palace);
    s.shared.palaces = s.shared.palaces.filter((id) => id !== a.palace);
  }
  if (a.to === "school" || a.to === "university")
    queueChoice(s, p.seat, "competency", 1, competencyOptions(s, p), "upgrade");
  offerLeech(s, p.seat, a.hex);
  buildingRewards(s, p, a.hex);
}
