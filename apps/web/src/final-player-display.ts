import type { GameState, Player } from "../../../packages/rules/src/types";

/** BGA shows converted holdings at normal endgame; keep the original ledger
 * intact so the score breakdown and historical replay retain their inputs. */
export function finalPlayerDisplay(state: GameState, player: Player): Player {
  if (state.status !== "finished" || state.matchResult || !state.scores.length)
    return player;
  const r = player.resources;
  const burned = Math.floor(r.power[1] / 2);
  const spendable = r.power[2] + burned;
  return {
    ...player,
    resources: {
      coins:
        r.coins +
        r.tools +
        r.scholars +
        r.books.reduce((a, b) => a + b, 0) +
        spendable,
      tools: 0,
      scholars: 0,
      books: [0, 0, 0, 0],
      power: [r.power[0] + spendable, r.power[1] - burned * 2, 0],
    },
  };
}
