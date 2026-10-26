import { replayRecord, activeHistory, type ReplayRecord } from "./replay";
import type { ResourceChange } from "./ledger";
import type { GameAction } from "./types";
import type { ScoreAward } from "./score-events";

/** Net changes are deliberately not described as gross income or spending. */
export function gameStatistics(record: ReplayRecord) {
  const replay = replayRecord(record);
  const rows = activeHistory(replay.history);
  const players = Object.values(record.initial.players).map((p) => ({
    seat: p.seat,
    name: p.name,
    initialVp: p.vp,
    actions: {} as Record<string, number>,
    rounds: {} as Record<
      number,
      { vp: number; changes: Record<string, number> }
    >,
    scoreSources: {} as Record<string, number>,
  }));
  for (const row of rows)
    for (const e of row.events.filter((e) => e.kind === "ledger")) {
      const round = ["draft", "setup", "placement"].includes(
        String(e.details?.phase),
      )
        ? 0
        : Number(e.details?.round ?? 0);
      const action = e.details?.action as GameAction;
      const author = players.find((p) => p.seat === e.seat);
      if (author && action)
        author.actions[action.kind] = (author.actions[action.kind] ?? 0) + 1;
      for (const change of (e.details?.changes ?? []) as ResourceChange[]) {
        const player = players.find((p) => p.seat === change.seat);
        if (!player) continue;
        const r = (player.rounds[round] ??= { vp: 0, changes: {} });
        r.changes[change.field] = (r.changes[change.field] ?? 0) + change.delta;
        if (change.field === "vp") {
          r.vp += change.delta;
          // Includes any automatic effects of the triggering command.
          const sources = (
            (e.details?.scoreSources ?? []) as ScoreAward[]
          ).filter((s) => s.seat === player.seat);
          for (const source of sources)
            player.scoreSources[source.source] =
              (player.scoreSources[source.source] ?? 0) + source.points;
          const rest = change.delta - sources.reduce((n, s) => n + s.points, 0);
          if (rest)
            player.scoreSources[e.text] =
              (player.scoreSources[e.text] ?? 0) + rest;
        }
      }
    }
  return {
    players,
    state: replay.state,
    activeCount: rows.length,
    totalCount: replay.history.length,
  };
}
