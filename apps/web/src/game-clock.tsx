import { t as translate } from "./i18n";
import React, { useEffect, useState } from "react";
import type { GameState } from "../../../packages/rules/src/types";
import type { GameSettings } from "../../../packages/contracts/src/room";
import { activeElapsed } from "../../../packages/contracts/src/room";
import { timeLabel } from "./i18n/time";
import { SettingsSummary } from "./room-settings";
export interface ClockSnapshot {
  remaining: Record<string, number>;
  running: string[];
  paused: boolean;
  receivedAt: number;
  serverNow?: number;
  activeStartUtc?: number;
}
export function GameClockPanel({
  state,
  settings,
  clock,
  seat,
  inactiveDeadline,
  disabled,
  onAdjudicate,
}: {
  state: GameState;
  settings: GameSettings;
  clock: ClockSnapshot | null;
  seat: string;
  inactiveDeadline?: string;
  disabled?: boolean;
  onAdjudicate: (reason: "forfeit" | "close", target?: string) => Promise<void>;
}) {
  const [tick, setTick] = useState(performance.now());
  const [confirm, setConfirm] = useState<string | null>(null);
  useEffect(() => {
    setConfirm(null);
  }, [state.revision]);
  useEffect(() => {
    if (!clock) return;
    setTick(performance.now());
    const t = setInterval(() => setTick(performance.now()), 1000);
    return () => clearInterval(t);
  }, [clock]);
  const elapsed = clock
    ? activeElapsed(
        clock.serverNow ?? 0,
        (clock.serverNow ?? 0) + Math.max(0, tick - clock.receivedAt),
        clock.activeStartUtc,
      )
    : 0;
  const night =
    clock?.activeStartUtc !== undefined &&
    activeElapsed(
      (clock.serverNow ?? 0) + Math.max(0, tick - clock.receivedAt),
      (clock.serverNow ?? 0) + Math.max(0, tick - clock.receivedAt) + 1000,
      clock.activeStartUtc,
    ) === 0;
  const remainingFor = (s: string) =>
    (clock?.remaining[s] ?? 0) -
    (clock?.running.includes(s) && !clock.paused ? elapsed : 0);
  const overdue =
    clock && !clock.paused && !state.matchResult && state.status !== "finished"
      ? Object.keys(clock.remaining).filter((s) => remainingFor(s) <= 0)
      : [];
  const removable = overdue.filter(
    (s) => s !== seat && remainingFor(seat) >= remainingFor(s),
  );
  const duration = (ms: number) => {
    const sec = Math.ceil(Math.abs(ms) / 1000),
      h = Math.floor(sec / 3600),
      m = Math.floor((sec % 3600) / 60);
    return `${ms < 0 ? "−" : ""}${h ? `${h}:` : ""}${String(m).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`;
  };
  return (
    <section
      className="game-clock-panel"
      aria-label={translate("ui.game-clock.917fb33288")}
    >
      {state.matchResult && (
        <div className="notice" role="status">
          <strong>
            {state.matchResult.reason === "forfeit"
              ? translate("ui.game-clock.19c62aba23")
              : translate("ui.game-clock.a7c764e596")}
          </strong>
          <p>
            {state.matchResult.reason === "forfeit"
              ? translate("ui.game-clock.c07b50fb89", {
                  p0: state.players[state.matchResult.loser!].name,
                })
              : translate("ui.game-clock.7793b4c392")}
          </p>
          {state.status !== "finished" && state.matchResult.loser !== seat && (
            <button disabled={disabled} onClick={() => setConfirm("close")}>
              {translate("ui.game-clock.3871ca6802")}
            </button>
          )}
        </div>
      )}
      {confirm && (
        <div className="notice" role="alert">
          <p>
            {confirm === "close"
              ? translate("ui.game-clock.cc724980aa")
              : translate("ui.game-clock.ed25585f87", {
                  p0: state.players[confirm]?.name,
                })}
          </p>
          <button
            disabled={disabled}
            onClick={async () => {
              await onAdjudicate(
                confirm === "close" ? "close" : "forfeit",
                confirm === "close" ? undefined : confirm,
              );
              setConfirm(null);
            }}
          >
            {translate("ui.game-clock.36f33adaf0")}
            {confirm === "close"
              ? translate("ui.game-clock.3871ca6802")
              : translate("ui.game-clock.6135d4159e")}
          </button>
          <button disabled={disabled} onClick={() => setConfirm(null)}>
            {translate("ui.game-clock.1fdf48a500")}
          </button>
        </div>
      )}
      {clock && (
        <>
          <div className="clock-heading">
            <strong>{timeLabel(settings.time)}</strong>
            <span>
              {state.matchResult
                ? state.status === "finished"
                  ? translate("ui.game-clock.3c03903fbc")
                  : translate("ui.game-clock.2a332b8c5f")
                : clock.paused
                  ? translate("ui.game-clock.a2c8b5419d")
                  : state.status === "finished"
                    ? translate("ui.game-clock.3c03903fbc")
                    : night
                      ? translate("ui.game-clock.195381874e")
                      : translate("ui.game-clock.274c953d45")}
            </span>
          </div>
          <div className="clock-players">
            {Object.keys(state.players).map((seat) => {
              const running = clock.running.includes(seat) && !clock.paused,
                remaining = remainingFor(seat);
              return (
                <div
                  key={seat}
                  className={
                    "player-clock " +
                    (running ? "running " : "") +
                    (remaining <= 0 ? "overdue" : "")
                  }
                  aria-label={translate("ui.game-clock.a60d1a7b35", {
                    p0: state.players[seat].name,
                  })}
                >
                  <span>{state.players[seat].name}</span>
                  <strong>{duration(remaining)}</strong>
                  <span>
                    {state.matchResult?.loser === seat
                      ? translate("ui.game-clock.174688c755")
                      : remaining <= 0
                        ? translate("ui.game-clock.73ce15fee4")
                        : clock.paused || night
                          ? translate("ui.game-clock.8d12fc0d4e")
                          : running
                            ? translate("ui.game-clock.444a23b031")
                            : translate("ui.game-clock.251bc40e70")}
                  </span>
                </div>
              );
            })}
          </div>
          {overdue.length > 0 && (
            <div className="notice" role="status">
              {overdue.map((seat) => state.players[seat].name).join("、")}{" "}
              {translate("ui.game-clock.c44baa3534")}
              {removable.map((s) => (
                <button
                  key={s}
                  disabled={disabled || !!confirm}
                  onClick={() => setConfirm(s)}
                >
                  {translate("ui.game-clock.6679670c7b")}
                  {state.players[s].name}
                </button>
              ))}
            </div>
          )}
        </>
      )}
      <details>
        <summary>{translate("ui.game-clock.14acf4a2bb")}</summary>
        <SettingsSummary
          settings={settings}
          mode={
            state.setup.draft
              ? `snake-${state.setup.draft.direction}`
              : undefined
          }
          locked
        />
        {clock && (
          <p className="muted">{translate("ui.game-clock.c1a0735382")}</p>
        )}
        {state.status !== "finished" && (
          <p className="muted">
            {translate("ui.game-clock.768ce1b5fc")}
            {inactiveDeadline
              ? translate("ui.game-clock.4ca9e4c371", {
                  p0: new Date(inactiveDeadline).toLocaleString("zh-CN", {
                    timeZone: "Asia/Shanghai",
                  }),
                })
              : ""}
            {translate("ui.game-clock.9660c9314e")}
          </p>
        )}
      </details>
    </section>
  );
}
