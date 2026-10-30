import { createGame } from "../../src/state";
import { sampleSetup } from "./setup";
export function actionState() {
  const s = createGame(sampleSetup());
  // Action fixtures exercise explicit response choices; live new games default
  // to accepting free leech automatically.
  for (const player of Object.values(s.players))
    player.leechPolicy.enabled = false;
  s.phase = "actions";
  s.board.buildings = {
    A1: { seat: "p1", kind: "workshop" },
    B1: { seat: "p2", kind: "guild" },
    A6: { seat: "p3", kind: "workshop" },
  };
  return s;
}
