import type { GameAction, GameState, RuleEvent, Transition } from "./types";
import { applyActionRaw, getAvailableChoices, getWaitingSeats } from "./engine";
import { draftOptions, placementOptions } from "./setup";
import { officialLarge } from "./map";

// Administrative actions are replayable, but never accepted by the game-command API.
export type LifecycleAction = {
  kind: "adjudicate";
  reason: "forfeit" | "inactive" | "close";
  target?: string;
  at: string;
};
export function adjudicate(state: GameState, action: LifecycleAction) {
  const next = structuredClone(state);
  if (state.status === "finished") throw Error("GAME_FINISHED");
  const events: RuleEvent[] = [];
  if (action.reason === "forfeit") {
    if (next.matchResult || !action.target || !next.players[action.target])
      throw Error("INVALID_ADJUDICATION");
    next.matchResult = {
      reason: "forfeit",
      at: action.at,
      loser: action.target,
      winners: next.setup.players
        .map((p) => p.seat)
        .filter((s) => s !== action.target),
      round: next.round,
    };
    events.push({
      kind: "forfeit",
      seat: action.target,
      text: `${next.players[action.target].name} 因超时被移除；按末名结算，其余玩家并列第一。余局不再改变战绩。`,
    });
    return advanceDeparted({ ok: true, state: next, events });
  }
  if (action.reason === "close" && !next.matchResult)
    throw Error("INVALID_ADJUDICATION");
  next.matchResult ??= {
    reason: "inactive",
    at: action.at,
    winners: [],
    round: next.round,
  };
  next.status = "finished";
  next.phase = "finished";
  next.pending = [];
  events.push({
    kind: action.reason,
    text:
      action.reason === "inactive"
        ? "整局连续 10 天没有有效操作，自动结束；已有弃局结果保留，否则不判胜负。"
        : "玩家结束余局，已结算的战绩保持不变。",
  });
  return { ok: true as const, state: next, events };
}

// No strategic play: decline optional responses, complete required setup in
// stable pool order, then end/pass turns. Every generated move uses the rules.
export function advanceDeparted(result: Transition): Transition {
  if (!result.ok || result.state.matchResult?.reason !== "forfeit")
    return result;
  let state = result.state;
  const events = [...result.events],
    loser = state.matchResult!.loser!;
  for (let n = 0; n < 500 && state.status !== "finished"; n++) {
    if (!getWaitingSeats(state).includes(loser))
      return { ok: true, state, events };
    const candidates: GameAction[] = [];
    const choices = getAvailableChoices(state).filter((c) => c.seat === loser);
    if (choices.length) {
      for (const c of choices) {
        const priority = (v: string) =>
          ["decline", "discard", "skip"].includes(v) ? 0 : 1;
        for (const option of [...c.options].sort(
          (a, b) => priority(a) - priority(b),
        ))
          candidates.push({ kind: "respond", choiceId: c.id, option });
      }
    } else if (state.phase === "draft") {
      if (state.setup.draft) {
        for (const category of [
          "faction",
          "native",
          "palace",
          "bonus",
        ] as const)
          for (const option of draftOptions(state, loser, category))
            candidates.push({ kind: "draftPick", category, option });
      } else {
        state.setup.offers?.forEach((_, offer) =>
          candidates.push({ kind: "chooseSetup", offer }),
        );
      }
    } else if (state.phase === "placement") {
      for (const hex of Object.keys(officialLarge.hexes).sort())
        for (const building of placementOptions(state, loser))
          candidates.push({
            kind: "place",
            hex,
            building: building as "workshop" | "tower" | "university",
          });
    } else if (state.phase === "actions") {
      candidates.push({ kind: "endTurn" });
      candidates.push({ kind: "pass" });
      for (const bonus of state.setup.bonusPool)
        candidates.push({ kind: "pass", bonus });
    }
    let applied: Extract<Transition, { ok: true }> | undefined;
    for (const candidate of candidates) {
      const step = applyActionRaw(state, loser, candidate);
      if (step.ok) {
        applied = step;
        break;
      }
    }
    if (!applied) {
      // A legacy/unsupported choice must never strand the remaining players.
      state = structuredClone(state);
      state.status = "finished";
      state.phase = "finished";
      state.pending = [];
      events.push({
        kind: "casual-ended",
        text: "余局无法自动跳过此步骤，已结束余局；弃局战绩保持不变。",
      });
      return { ok: true, state, events };
    }
    state = applied.state;
    events.push(
      {
        kind: "auto-skip",
        seat: loser,
        text: `${state.players[loser].name} 已退出，自动处理必要步骤或跳过回合。`,
      },
      ...applied.events,
    );
  }
  if (state.status !== "finished") throw Error("AUTO_SKIP_LIMIT");
  return { ok: true, state, events };
}
