import type { GameAction, GameState, Four, Discipline } from "../../src/types";
import {
  applyAction,
  getAvailableChoices,
  getWaitingSeats,
} from "../../src/engine";
import { officialLarge } from "../../src/map";
import { draftOptions, placementOptions } from "../../src/setup";

export function seededRandom(seed: number) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
}

function payment(
  available: Four,
  count: number,
  minimum: Four = [0, 0, 0, 0],
): Four | null {
  const result = [...minimum] as Four;
  if (result.some((n, i) => n > available[i])) return null;
  let remaining = count - result.reduce((a, b) => a + b, 0);
  for (let i = 0; i < 4; i++) {
    const n = Math.min(remaining, available[i] - result[i]);
    result[i] += n;
    remaining -= n;
  }
  return remaining === 0 ? result : null;
}

// Four repeatable play styles, with no fixture resource injections. The rules
// filter candidates; this exercises flow/invariants, not an independent rules oracle.
export function chooseMove(s: GameState): { seat: string; action: GameAction } {
  const seat = getWaitingSeats(s)[0];
  if (!seat) throw Error(`No waiting player at revision ${s.revision}`);
  const p = s.players[seat];
  const legal = (action: GameAction) => applyAction(s, seat, action).ok;
  const candidates: GameAction[] = [];
  if (s.pending.length) {
    for (const c of getAvailableChoices(s).filter((c) => c.seat === seat)) {
      // Prioritize actual rewards; discard only when no useful option is legal.
      for (const option of [...c.options].sort(
        (a, b) =>
          Number(a === "discard" || a === "decline") -
          Number(b === "discard" || b === "decline"),
      )) {
        if (option === "terraform") continue;
        candidates.push({ kind: "respond", choiceId: c.id, option });
      }
    }
  } else if (s.phase === "draft") {
    if (s.setup.draft) {
      for (const category of ["faction", "native", "palace", "bonus"] as const)
        for (const option of draftOptions(s, seat, category))
          candidates.push({ kind: "draftPick", category, option });
    } else
      for (let offer = 0; offer < 7; offer++)
        candidates.push({ kind: "chooseSetup", offer });
  } else if (s.phase === "placement") {
    // Place nearby opponents when possible to exercise discounted guilds/leech.
    const hexes = Object.values(officialLarge.hexes).sort((a, b) => {
      const neighbors = (id: string) =>
        officialLarge.neighbors[id].filter((n) => s.board.buildings[n]).length;
      return neighbors(b.id) - neighbors(a.id);
    });
    for (const h of hexes)
      for (const building of placementOptions(s, seat))
        candidates.push({
          kind: "place",
          hex: h.id,
          building: building as "workshop" | "tower" | "university",
        });
  } else if (p.primaryDone) {
    candidates.push({ kind: "endTurn" });
  } else {
    const groups: GameAction[][] = [[], [], [], []];
    for (const [hex, b] of Object.entries(s.board.buildings).filter(
      ([, b]) => b.seat === seat,
    )) {
      for (const to of ["palace", "university", "school", "guild"] as const) {
        if (to === "palace")
          for (const palace of p.draftPalace
            ? [p.draftPalace]
            : s.shared.palaces)
            groups[0].push({ kind: "upgrade", hex, to, palace });
        else groups[0].push({ kind: "upgrade", hex, to });
      }
    }
    for (const h of Object.values(officialLarge.hexes))
      if (h.terrain !== "river" && !s.board.buildings[h.id])
        groups[1].push({
          kind: "terraform",
          hex: h.id,
          terrain: p.native,
          build: true,
        });
    for (const track of [0, 1, 2, 3] as Discipline[]) {
      if (p.science[track] >= 12) continue;
      for (const slot of [0, 1, 2, 3, null])
        groups[2].push({ kind: "scholar", track, slot });
    }
    if (s.round % 2 === 0)
      groups[2].unshift(
        { kind: "advance", track: "sailing" },
        { kind: "advance", track: "terraform" },
      );
    for (const id of s.shared.innovations) {
      const minimum = s.setup.innovationCosts?.[id] ?? [0, 0, 0, 0];
      const books = payment(
        p.resources.books,
        5 +
          (p.native === "wasteland" && p.innovations.length === 1
            ? 0
            : p.innovations.length),
        minimum,
      );
      if (books) groups[3].push({ kind: "innovation", id, books });
    }
    const costs: Record<string, number> = {
      power: 1,
      science: 1,
      coins: 2,
      upgrade: 2,
      "guild-score": 2,
      spades: 3,
    };
    for (const id of s.shared.bookActions) {
      // The fourth player saves for a first innovation instead of spending
      // every newly earned book on a public action.
      if (seat === `p${s.turnOrder.length}` && p.innovations.length === 0)
        continue;
      const books = payment(p.resources.books, costs[id]);
      if (!books) continue;
      if (id === "upgrade") {
        for (const [hex, b] of Object.entries(s.board.buildings))
          if (b.seat === seat && b.kind === "workshop")
            groups[3].push({ kind: "bookAction", id, books, hex });
      } else if (id !== "spades")
        groups[3].push({ kind: "bookAction", id, books, track: 0 });
    }
    const style = (Number(seat.slice(1)) - 1) % 4;
    for (let i = 0; i < 4; i++) candidates.push(...groups[(style + i) % 4]);
    for (const id of ["tools", "coins", "scholar"])
      candidates.push({ kind: "powerAction", id });
    for (const bonus of s.setup.bonusPool)
      candidates.push({ kind: "pass", bonus });
    if (s.round === 6) candidates.push({ kind: "pass" });
  }
  const action = candidates.find(legal);
  if (!action)
    throw Error(
      `No legal move: ${JSON.stringify({ revision: s.revision, phase: s.phase, seat, pending: s.pending })}`,
    );
  return { seat, action };
}
