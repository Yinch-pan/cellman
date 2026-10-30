import { z } from "zod";
import { draftCatalog } from "../../rules/src/draft-bans";
const banList = (ids: readonly string[]) =>
  z
    .array(
      z
        .string()
        .max(64)
        .refine((id) => ids.includes(id)),
    )
    .max(ids.length)
    .refine((ids) => new Set(ids).size === ids.length);
export const draftBansSchema = z
  .object({
    faction: banList(draftCatalog.faction).default([]),
    native: banList(draftCatalog.native).default([]),
    palace: banList(draftCatalog.palace).default([]),
    bonus: banList(draftCatalog.bonus).default([]),
  })
  .strict();
export const asyncSpeeds = [0.5, 1, 2, 3, 4, 8, 12, 24] as const;
export const timeHours = [6, 12, 24, 48, 72, 120, 168] as const;
export const incrementalTimeSchema = z
  .object({
    mode: z.literal("incremental"),
    initialHours: z.number().int().min(1).max(168),
    incrementHours: z.number().int().min(1).max(168),
    maximumHours: z.number().int().min(1).max(168),
  })
  .strict()
  .refine((t) => t.initialHours <= t.maximumHours, {
    message: "Initial time exceeds maximum",
  });
export const durationLabel = (hours: number) =>
  hours % 24 === 0 ? `${hours / 24} 天` : `${hours} 小时`;
export const pacedTimeSchema = z
  .object({
    mode: z.literal("paced"),
    movesPerDay: z.union([
      z.literal(0.5),
      z.literal(1),
      z.literal(2),
      z.literal(3),
      z.literal(4),
      z.literal(8),
      z.literal(12),
      z.literal(24),
    ]),
    activeStartUtc: z.number().int().min(0).max(23).default(2),
  })
  .strict();
export const timeControlSchema = z.discriminatedUnion("mode", [
  incrementalTimeSchema,
  pacedTimeSchema,
  z.object({ mode: z.literal("none") }).strict(),
  z
    .object({
      mode: z.literal("bank"),
      minutes: z.union([
        z.literal(15),
        z.literal(30),
        z.literal(60),
        z.literal(90),
      ]),
    })
    .strict(),
  z
    .object({
      mode: z.literal("async"),
      hours: z.union([
        z.literal(12),
        z.literal(24),
        z.literal(48),
        z.literal(72),
      ]),
    })
    .strict(),
]);
export const gameSettingsSchema = z
  .object({
    time: timeControlSchema.default({ mode: "none" }),
    draftBans: draftBansSchema.optional(),
    undo: z.enum(["unanimous", "disabled"]).default("unanimous"),
    // Accept legacy clients/saved settings, but every completed game now counts.
    countStats: z
      .boolean()
      .default(true)
      .transform(() => true),
    seatOrder: z.enum(["random", "seated"]).default("random"),
    seed: z
      .string()
      .trim()
      .max(32)
      .regex(/^[a-zA-Z0-9_-]*$/)
      .default(""),
  })
  .strict();
export type GameSettings = z.infer<typeof gameSettingsSchema>;
export const defaultGameSettings = (): GameSettings =>
  gameSettingsSchema.parse({
    time: {
      mode: "incremental",
      initialHours: 72,
      incrementHours: 24,
      maximumHours: 72,
    },
  });
export const setupModeSchema = z.enum([
  "snake-forward",
  "snake-reverse",
  "standard",
  "training",
]);
export function setupLabel(mode: string) {
  return mode === "snake-forward"
    ? "顺蛇轮抽"
    : mode === "snake-reverse"
      ? "逆蛇轮抽"
      : mode === "training"
        ? "旧版固定入门局"
        : "旧版组合选配";
}
export const roomInputSchema = z
  .object({
    visibility: z.enum(["public", "private"]),
    seats: z.number().int().min(3).max(5),
    setupMode: setupModeSchema.default("snake-reverse"),
    settings: gameSettingsSchema.default(defaultGameSettings()),
  })
  .strict()
  .refine((r) => r.setupMode !== "training" || r.seats === 3, {
    message: "Training requires three players",
  });
export type RoomInput = z.input<typeof roomInputSchema>;
export function effectiveSettings(
  settings: GameSettings,
  mode: string,
): GameSettings {
  return {
    ...settings,
    seed: mode === "training" ? "" : settings.seed,
    seatOrder: mode === "training" ? "seated" : settings.seatOrder,
    countStats: true,
  };
}
export function timeLabel(time: GameSettings["time"]) {
  if (time.mode === "incremental")
    return `初始 ${durationLabel(time.initialHours)} · 每步 +${durationLabel(time.incrementHours)} · 上限 ${durationLabel(time.maximumHours)}`;
  if (time.mode === "paced") {
    const speed =
      time.movesPerDay === 0.5 ? "每 2 天 1 步" : `每天 ${time.movesPerDay} 步`;
    const start = (time.activeStartUtc + 8) % 24;
    return (
      speed +
      (time.movesPerDay >= 8
        ? ` · 活跃 ${String(start).padStart(2, "0")}:00–${String((start + 12) % 24).padStart(2, "0")}:00（北京时间）`
        : "")
    );
  }
  return time.mode === "none"
    ? "不限时"
    : time.mode === "bank"
      ? `每人总思考时间 ${time.minutes} 分钟`
      : `每次轮到响应 ${time.hours} 小时`;
}
export function paceBudget(time: z.infer<typeof pacedTimeSchema>) {
  const fast = time.movesPerDay >= 8;
  const increment = ((fast ? 12 : 24) / time.movesPerDay) * 3600000;
  return {
    increment,
    maximum: (fast ? 12 : Math.max(24, 48 / time.movesPerDay)) * 3600000,
  };
}
// Integral over recurring 12-hour UTC windows, including midnight crossings.
export function activeElapsed(from: number, to: number, startUtc?: number) {
  if (to <= from) return 0;
  if (startUtc === undefined) return to - from;
  const day = 86400000,
    window = day / 2;
  const integral = (at: number) => {
    const shifted = at - startUtc * 3600000;
    const days = Math.floor(shifted / day);
    return days * window + Math.min(window, shifted - days * day);
  };
  return integral(to) - integral(from);
}
