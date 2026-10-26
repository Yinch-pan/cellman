import { it, expect } from "vitest";
import {
  createClock,
  settleClock,
  transitionClock,
  pauseClock,
  projectClock,
} from "../src/games/clock";
import { gameSettingsSchema } from "../../../packages/contracts/src/room";
import { createGame } from "../../../packages/rules/src/state";
import { sampleSetup } from "../../../packages/rules/test/fixtures/setup";
import { queueChoice } from "../../../packages/rules/src/responses";
import {
  defaultGameSettings,
  timeControlSchema,
  timeLabel,
} from "../../../packages/contracts/src/room";
import {
  activeElapsed,
  paceBudget,
} from "../../../packages/contracts/src/room";
const settings = gameSettingsSchema.parse({
  time: { mode: "bank", minutes: 15 },
});
it("three-day bank adds a day per completed move, caps at three days, and preserves debt", () => {
  const s = state(),
    config = defaultGameSettings(),
    day = 86400000;
  const initial = createClock(s, config, 0)!;
  expect(initial.remaining.p1).toBe(3 * day);
  expect(initial.activeStartUtc).toBeUndefined();
  expect(transitionClock(initial, s, config, day)!.remaining.p1).toBe(2 * day);
  expect(transitionClock(initial, s, config, day, "p1")!.remaining.p1).toBe(
    3 * day,
  );
  expect(transitionClock(initial, s, config, day / 2, "p1")!.remaining.p1).toBe(
    3 * day,
  );
  expect(
    transitionClock(initial, s, config, 4.5 * day, "p1")!.remaining.p1,
  ).toBe(-0.5 * day);
  const paused = pauseClock(initial, day);
  expect(transitionClock(paused, s, config, 4 * day, "p1")!.remaining.p1).toBe(
    2 * day,
  );
  expect(timeLabel(config.time)).toBe("初始 3 天 · 每步 +1 天 · 上限 3 天");
});
it("initial, increment and cap are independently configured and invalid banks are rejected", () => {
  const s = state(),
    day = 86400000;
  const config = gameSettingsSchema.parse({
    time: {
      mode: "incremental",
      initialHours: 24,
      incrementHours: 48,
      maximumHours: 72,
    },
  });
  const clock = createClock(s, config, 0)!;
  expect(clock.remaining.p1).toBe(day);
  expect(transitionClock(clock, s, config, day / 2, "p1")!.remaining.p1).toBe(
    2.5 * day,
  );
  for (const patch of [
    { initialHours: 96 },
    { incrementHours: 0 },
    { maximumHours: 0 },
    { initialHours: -1 },
    { incrementHours: 1.5 },
    { maximumHours: 169 },
  ]) {
    expect(
      timeControlSchema.safeParse({ ...config.time, ...patch }).success,
    ).toBe(false);
  }
});
function state() {
  const s = createGame(sampleSetup());
  s.phase = "actions";
  s.activeSeat = "p1";
  return s;
}
it("charges only eligible responders, including simultaneous responses; querying never mutates persisted clock", () => {
  const s = state(),
    initial = createClock(s, settings, 1000)!;
  queueChoice(s, "p2", "leech", 2, ["accept", "decline"], "test");
  queueChoice(s, "p3", "leech", 1, ["accept", "decline"], "test");
  const response = transitionClock(initial, s, settings, 4000)!;
  expect(response.running).toEqual(["p2", "p3"]);
  expect(response.remaining.p1).toBe(897000);
  const projected = projectClock(response, 6000)!;
  expect(projected.remaining).toEqual({ p1: 897000, p2: 898000, p3: 898000 });
  expect(initial.remaining.p1).toBe(900000);
  expect(response.remaining.p2).toBe(900000);
  s.pending = [];
  expect(transitionClock(response, s, settings, 6000)!.running).toEqual(["p1"]);
});
it("same-seat conversions do not reset either clock; asynchronous time renews only on a new response period", () => {
  const s = state(),
    asyncSettings = gameSettingsSchema.parse({
      time: { mode: "async", hours: 12 },
    }),
    budget = 43200000;
  let clock = createClock(s, asyncSettings, 0)!;
  clock = transitionClock(clock, s, asyncSettings, 1000)!;
  expect(clock.remaining.p1).toBe(budget - 1000);
  s.activeSeat = "p2";
  clock = transitionClock(clock, s, asyncSettings, 2000)!;
  s.activeSeat = "p1";
  clock = transitionClock(clock, s, asyncSettings, 4000)!;
  expect(clock.remaining.p1).toBe(budget);
  expect(clock.remaining.p2).toBe(budget - 2000);
});
it("undo pauses without refunds and resumed clocks do not charge time spent negotiating", () => {
  const s = state(),
    clock = createClock(s, settings, 0)!;
  const paused = pauseClock(clock, 5000)!;
  expect(projectClock(paused, 100000)!.remaining.p1).toBe(895000);
  s.activeSeat = "p2";
  const resumed = transitionClock(paused, s, settings, 100000)!;
  expect(settleClock(resumed, 102000)!.remaining).toEqual({
    p1: 895000,
    p2: 898000,
    p3: 900000,
  });
});
it("finished games stop clocks; expiry records negative time and backwards wall time cannot refund time", () => {
  const s = state(),
    clock = createClock(s, settings, 0)!;
  expect(projectClock(clock, 1000000)!.overdue).toEqual(["p1"]);
  expect(projectClock(clock, 1000000)!.remaining.p1).toBe(-100000);
  const settled = settleClock(clock, 3000)!;
  expect(settleClock(settled, 1000)).toEqual(settled);
  s.status = "finished";
  const final = transitionClock(settled, s, settings, 5000)!;
  expect(projectClock(final, 9999999)!.remaining.p1).toBe(895000);
  expect(final.running).toEqual([]);
  expect(createClock(s, gameSettingsSchema.parse({}))).toBeNull();
});
it("paced clock grants one increment per completed move, caps the bank, and does not reset on conversions or undo", () => {
  const s = state(),
    config = gameSettingsSchema.parse({
      time: { mode: "paced", movesPerDay: 4 },
    }),
    hour = 3600000;
  let clock = createClock(s, config, 0)!;
  clock = transitionClock(clock, s, config, 8 * hour)!;
  expect(clock.remaining.p1).toBe(16 * hour);
  clock = transitionClock(clock, s, config, 9 * hour, "p1")!;
  expect(clock.remaining.p1).toBe(21 * hour);
  clock = transitionClock(clock, s, config, 9 * hour, "p1")!;
  expect(clock.remaining.p1).toBe(24 * hour);
  const paused = pauseClock(clock, 10 * hour)!;
  expect(
    transitionClock(paused, s, config, 100 * hour, "p1")!.remaining.p1,
  ).toBe(23 * hour);
});
it("fast asynchronous clocks freeze overnight including cross-midnight windows, offline gaps and UI projection", () => {
  const hour = 3600000,
    day = 24 * hour;
  expect(activeElapsed(0, 3 * day, 18)).toBe(36 * hour);
  expect(activeElapsed(23 * hour, 26 * hour, 18)).toBe(3 * hour);
  expect(activeElapsed(6 * hour, 18 * hour, 18)).toBe(0);
  const s = state(),
    config = gameSettingsSchema.parse({
      time: { mode: "paced", movesPerDay: 12, activeStartUtc: 2 },
    });
  let clock = createClock(s, config, 13 * hour)!;
  clock = settleClock(clock, 26 * hour)!;
  expect(clock.remaining.p1).toBe(11 * hour);
  expect(projectClock(clock, 27 * hour)!.remaining.p1).toBe(10 * hour);
  expect(
    config.time.mode === "paced" && paceBudget(config.time).increment,
  ).toBe(hour);
  expect(settleClock(clock, 25 * hour)).toEqual(clock);
});
