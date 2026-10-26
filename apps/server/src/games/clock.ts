import type { GameState } from "../../../../packages/rules/src/types";
import { getWaitingSeats } from "../../../../packages/rules/src/engine";
import type { GameSettings } from "../../../../packages/contracts/src/room";
import {
  paceBudget,
  activeElapsed,
} from "../../../../packages/contracts/src/room";
export interface GameClock {
  at: number;
  remaining: Record<string, number>;
  running: string[];
  paused: boolean;
  activeStartUtc?: number;
  timedOut?: string[];
}
function allowance(settings: GameSettings) {
  if (settings.time.mode === "incremental")
    return settings.time.initialHours * 3600000;
  if (settings.time.mode === "paced") return paceBudget(settings.time).maximum;
  return settings.time.mode === "bank"
    ? settings.time.minutes * 60000
    : settings.time.mode === "async"
      ? settings.time.hours * 3600000
      : 0;
}
export function createClock(
  state: GameState,
  settings: GameSettings,
  now = Date.now(),
): GameClock | null {
  if (settings.time.mode === "none") return null;
  return {
    at: now,
    remaining: Object.fromEntries(
      Object.keys(state.players).map((seat) => [seat, allowance(settings)]),
    ),
    running: getWaitingSeats(state),
    paused: false,
    ...(settings.time.mode === "paced" && settings.time.movesPerDay >= 8
      ? { activeStartUtc: settings.time.activeStartUtc }
      : {}),
  };
}
export function settleClock(
  clock: GameClock | null,
  now = Date.now(),
): GameClock | null {
  if (!clock) return null;
  const next = structuredClone(clock),
    elapsed = activeElapsed(clock.at, now, clock.activeStartUtc);
  if (!clock.paused)
    for (const seat of clock.running)
      next.remaining[seat] = (next.remaining[seat] ?? 0) - elapsed;
  const late = next.running.filter(
    (seat) => !next.paused && next.remaining[seat] <= 0,
  );
  if (late.length)
    next.timedOut = [...new Set([...(next.timedOut ?? []), ...late])];
  next.at = Math.max(clock.at, now);
  return next;
}
export function transitionClock(
  clock: GameClock | null,
  state: GameState,
  settings: GameSettings,
  now = Date.now(),
  completedSeat?: string,
): GameClock | null {
  const next = settleClock(clock, now);
  if (!next) return null;
  if (state.matchResult) {
    next.running = [];
    next.paused = false;
    return next;
  }
  if (
    (settings.time.mode === "paced" || settings.time.mode === "incremental") &&
    completedSeat &&
    !next.paused
  ) {
    const budget =
      settings.time.mode === "incremental"
        ? {
            maximum: settings.time.maximumHours * 3600000,
            increment: settings.time.incrementHours * 3600000,
          }
        : paceBudget(settings.time);
    next.remaining[completedSeat] = Math.min(
      budget.maximum,
      (next.remaining[completedSeat] ?? 0) + budget.increment,
    );
  }
  const running = getWaitingSeats(state);
  if (settings.time.mode === "async")
    for (const seat of running)
      if (!next.running.includes(seat) && !next.paused)
        next.remaining[seat] = allowance(settings);
  next.running = running;
  next.paused = false;
  return next;
}
export function pauseClock(clock: GameClock | null, now = Date.now()) {
  const next = settleClock(clock, now);
  if (next) next.paused = true;
  return next;
}
export function projectClock(clock: GameClock | null, now = Date.now()) {
  const next = settleClock(clock, now);
  return next
    ? {
        ...next,
        serverNow: now,
        overdue: Object.keys(next.remaining).filter(
          (seat) => next.remaining[seat] <= 0,
        ),
      }
    : null;
}
