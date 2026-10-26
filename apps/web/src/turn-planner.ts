import { applyAction } from "../../../packages/rules/src/engine";
import type { GameAction, GameState } from "../../../packages/rules/src/types";
export type Step = Exclude<GameAction, { kind: "turn" }>;
export interface TurnDraft {
  baseRevision: number;
  actions: Step[];
  state: GameState;
}
export function planTurn(
  base: GameState,
  seat: string,
  actions: Step[],
): TurnDraft {
  let state = base;
  for (const action of actions) {
    const next = applyAction(state, seat, action);
    if (!next.ok) throw Error(next.error.code);
    state = next.state;
  }
  return { baseRevision: base.revision, actions, state };
}
export function submissionActions(draft: TurnDraft, seat: string): Step[] {
  const s = draft.state;
  return s.status === "active" &&
    s.phase === "actions" &&
    s.activeSeat === seat &&
    !s.pending.length &&
    s.players[seat].primaryDone
    ? [...draft.actions, { kind: "endTurn" }]
    : draft.actions;
}
