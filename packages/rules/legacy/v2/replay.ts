import { applyAction } from "./engine";
import type { GameAction, GameState, RuleEvent } from "./types";
export interface RecordedCommand {
  revision: number;
  seat: string;
  action: GameAction;
}
export function replayGame(
  initial: GameState,
  commands: RecordedCommand[],
  through = Infinity,
) {
  let state = structuredClone(initial);
  const history: { revision: number; events: RuleEvent[] }[] = [];
  for (const c of commands) {
    if (c.revision > through) break;
    if (c.revision !== state.revision + 1)
      throw Error(`REPLAY_GAP:${state.revision + 1}`);
    const result = applyAction(state, c.seat, c.action);
    if (!result.ok)
      throw Error(`REPLAY_INVALID:${c.revision}:${result.error.code}`);
    state = result.state;
    state.revision = c.revision;
    history.push({ revision: c.revision, events: result.events });
  }
  return { state, history };
}
