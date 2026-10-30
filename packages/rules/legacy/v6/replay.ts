import { applyAction } from "./engine";
import type { GameAction, GameState, RuleEvent } from "./types";
import { jsonbSnapshot } from "./serialization";
import { adjudicate, type LifecycleAction } from "./lifecycle";
export interface RecordedCommand {
  revision: number;
  seat: string;
  action:
    GameAction | LifecycleAction | { kind: "restore"; targetRevision: number };
}
export interface ReplayRecord {
  format?: string;
  initial: GameState;
  commands: RecordedCommand[];
  storage?: "postgres-jsonb";
  revision?: number;
}
export type HistoryRow = { revision: number; events: RuleEvent[] };
export function activeHistory(history: HistoryRow[]) {
  let active: HistoryRow[] = [];
  for (const row of history) {
    const restore = row.events.find((e) => e.kind === "restore");
    if (restore)
      active = active.filter(
        (h) => h.revision <= Number(restore.details?.targetRevision),
      );
    else active.push(row);
  }
  return active;
}
export function replayRecord(record: ReplayRecord, through = Infinity) {
  return replayGame(
    record.initial,
    record.commands,
    through,
    record.storage === "postgres-jsonb" &&
      ["aoi-1.1+2024-09", "aoi-1.1+2024-09.engine-2"].includes(
        record.initial.rulesVersion,
      ),
  );
}
export function replayGame(
  initial: GameState,
  commands: RecordedCommand[],
  through = Infinity,
  persistedLegacy = false,
) {
  const copy = (s: GameState) =>
    persistedLegacy ? jsonbSnapshot(s) : structuredClone(s);
  let state = copy(initial);
  const snapshots = new Map<number, GameState>([[state.revision, copy(state)]]);
  const history: { revision: number; events: RuleEvent[] }[] = [];
  for (const c of commands) {
    if (c.revision > through) break;
    if (c.revision !== state.revision + 1)
      throw Error(`REPLAY_GAP:${state.revision + 1}`);
    if (c.action.kind === "restore") {
      const target = snapshots.get(c.action.targetRevision);
      if (!target || c.action.targetRevision >= c.revision)
        throw Error("REPLAY_INVALID_RESTORE");
      state = copy(target);
      state.revision = c.revision;
      history.push({
        revision: c.revision,
        events: [
          {
            kind: "restore",
            seat: c.seat,
            text: `经全体玩家同意，恢复到 #${c.action.targetRevision} 的局面`,
            details: { targetRevision: c.action.targetRevision },
          },
        ],
      });
      snapshots.set(c.revision, copy(state));
      continue;
    }
    const result =
      c.action.kind === "adjudicate"
        ? adjudicate(state, c.action)
        : applyAction(state, c.seat, c.action);
    if (!result.ok)
      throw Error(`REPLAY_INVALID:${c.revision}:${result.error.code}`);
    state = copy(result.state);
    state.revision = c.revision;
    history.push({ revision: c.revision, events: result.events });
    snapshots.set(c.revision, copy(state));
  }
  return { state, history };
}
