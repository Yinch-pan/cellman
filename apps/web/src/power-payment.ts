import type { GameAction, GameState } from "../../../packages/rules/src/types";
import { supportsBatchActions } from "../../../packages/rules/src/state";

const costs: Record<string, number> = {
  scholar: 3,
  bridge: 3,
  tools: 4,
  coins: 4,
  spade: 4,
  spades: 6,
};

// This only proposes a payment. The authoritative engine still validates both
// children atomically, and the UI explicitly reviews any loss of power tokens.
export function withPowerBurn(
  state: GameState,
  seat: string,
  action: GameAction,
): GameAction {
  if (
    !supportsBatchActions(state.rulesVersion) ||
    action.kind !== "powerAction" ||
    action.burn !== undefined
  )
    return action;
  const p = state.players[seat];
  const burn =
    costs[action.id] -
    (p.faction === "illusionists" ? 1 : 0) -
    p.resources.power[2];
  return burn > 0 && p.resources.power[1] >= burn * 2
    ? { ...action, burn }
    : action;
}
