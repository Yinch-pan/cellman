import type { GameState, Player } from "./types";
import { queueChoice } from "./responses";
import { gainPower } from "./actions/power";
import { advanceScience } from "./actions/science";
import { competencyOptions } from "./actions/competency";
import { queueNeutral } from "./actions/neutral";
import { advanceTechnology } from "./technology";
import { officialLarge, bridgeSites } from "./map";
import { gainScholar } from "./internal";
import { validBridgeGeometry } from "./actions/bridge";
export function chooseBooks(
  s: GameState,
  p: Player,
  n: number,
  source: string,
) {
  queueChoice(s, p.seat, "book", n, ["0", "1", "2", "3"], source);
}
export function freeSpades(s: GameState, p: Player, n: number, source: string) {
  queueChoice(s, p.seat, "spades", n, ["terraform", "discard"], source);
  if (s.phase === "setup" || s.phase === "placement")
    s.pending.at(-1)!.canBuild = false;
}
export function freeBridge(s: GameState, p: Player, source: string) {
  const ids = Object.keys(officialLarge.hexes);
  const sites =
    p.faction === "moles"
      ? ids.flatMap((a) =>
          ids
            .filter((b) => a < b && validBridgeGeometry(a, b, true))
            .map((b) => `${a}:${b}`),
        )
      : bridgeSites.map(([a, b]) => `${a}:${b}`);
  queueChoice(s, p.seat, "bridge", 1, [...sites, "discard"], source);
}
export function palaceEffect(s: GameState, p: Player, id: string) {
  if (id === "immediate-score") p.vp += 10;
  if (id === "power-books") {
    p.resources.power = gainPower(p.resources.power, 12);
    chooseBooks(s, p, 2, id);
  }
  if (id === "competency-palace")
    queueChoice(s, p.seat, "competency", 1, competencyOptions(s, p), id);
  if (id === "city-palace")
    queueChoice(
      s,
      p.seat,
      "city",
      1,
      Object.keys(s.shared.cities).filter((c) => s.shared.cities[c] > 0),
      id,
    );
  if (id === "river-city") {
    advanceTechnology(s, p, "sailing", true);
    advanceTechnology(s, p, "sailing", true);
  }
  if (id === "engineering-palace") {
    const before = s.pending.length;
    freeSpades(s, p, 2, id);
    freeBridge(s, p, id);
    freeBridge(s, p, id);
    chooseBooks(s, p, 2, id);
    for (const c of s.pending.slice(before))
      c.batch = `${id}:${s.choiceSerial}:${c.kind}`;
  }
  if (id === "remote-guild") {
    const options = Object.values(officialLarge.hexes)
      .filter(
        (h) =>
          (s.board.terrain[h.id] ?? h.terrain) === p.native &&
          !s.board.buildings[h.id],
      )
      .map((h) => h.id);
    if (
      options.length &&
      Object.values(s.board.buildings).filter(
        (b) => b.seat === p.seat && b.kind === "guild" && !b.neutral,
      ).length < 4
    )
      queueChoice(s, p.seat, "freeGuild", 1, options, id);
  }
}
export function innovationEffect(s: GameState, p: Player, id: string) {
  if (id === "deus-ex-machina") {
    chooseBooks(s, p, 1, id);
    for (const i of [0, 1, 2, 3] as const) advanceScience(s, p, i, 1);
  }
  if (id === "steam-power") {
    gainScholar(s, p, 1);
    advanceTechnology(s, p, "terraform", true);
    advanceTechnology(s, p, "sailing", true);
  }
  if (id.startsWith("neutral-")) {
    const kind = id.slice(8) as
      "workshop" | "guild" | "school" | "university" | "palace" | "monument";
    queueNeutral(s, p, kind, id);
    if (kind === "school")
      queueChoice(s, p.seat, "competency", 1, competencyOptions(s, p), id);
    if (kind === "palace") p.resources.power[2] += 2;
    if (kind === "monument") p.vp += 7;
  }
}
export function buildingRewards(s: GameState, p: Player, hex: string) {
  if (s.phase !== "actions") return;
  const kind = s.board.buildings[hex].kind;
  if (kind === "guild") {
    if (p.bonus === "guild") p.vp += 3;
    if (p.palace === "guild-special") p.vp += 3;
  }
  if (kind !== "workshop") return;
  if (p.palace === "workshop-score") p.vp += 2;
  const river = officialLarge.neighbors[hex].some(
    (id) => officialLarge.hexes[id].terrain === "river",
  );
  if (p.faction === "navigators" && river) {
    p.vp += 2;
    p.resources.coins++;
  }
  if (p.bonus === "river" && river) p.vp += 2;
  const border = officialLarge.neighbors[hex].length < 6;
  if (p.competencies.includes("border-score") && border) p.vp += 3;
  if (s.round === 6 && s.setup.finalRoundTile === "border" && border) p.vp += 3;
}
