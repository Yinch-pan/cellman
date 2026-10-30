import { actionState } from "./actions";

// Observed BGA table 939319293, move 94, immediately before all three pass.
export function bgaFinalState() {
  const s = actionState();
  s.round = 6;
  s.turnOrder = ["p1", "p3", "p2"];
  s.board.buildings = {
    E2: { seat: "p1", kind: "palace" },
    B6: { seat: "p1", kind: "workshop" },
    E1: { seat: "p2", kind: "school" },
    G3: { seat: "p2", kind: "workshop" },
    H2: { seat: "p2", kind: "workshop" },
    D1: { seat: "p3", kind: "university" },
    B7: { seat: "p3", kind: "workshop" },
  };
  Object.assign(s.players.p1, {
    name: "Yinch_pan",
    native: "forest",
    faction: "lizards",
    vp: 19,
    science: [3, 1, 1, 1],
    sailing: 0,
    bonus: "coins",
    resources: {
      coins: 55,
      tools: 10,
      scholars: 1,
      books: [0, 0, 0, 4],
      power: [3, 7, 2],
    },
  });
  Object.assign(s.players.p2, {
    name: "AuditSpecial",
    native: "plains",
    faction: "inventors",
    vp: 29,
    science: [4, 3, 1, 1],
    sailing: 0,
    bonus: "scholar",
    resources: {
      coins: 7,
      tools: 14,
      scholars: 7,
      books: [1, 3, 0, 0],
      power: [0, 2, 10],
    },
  });
  Object.assign(s.players.p3, {
    name: "AuditFinal",
    native: "desert",
    faction: "philosophers",
    vp: 40,
    science: [2, 4, 0, 0],
    sailing: 1,
    bonus: "power",
    resources: {
      coins: 15,
      tools: 8,
      scholars: 5,
      books: [0, 3, 0, 0],
      power: [0, 1, 11],
    },
  });
  return s;
}
