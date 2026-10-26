import { t as translate } from "./i18n";
import React from "react";
import {
  type GameSettings,
  effectiveSettings,
  timeHours,
  defaultGameSettings,
} from "../../../packages/contracts/src/room";
import { timeLabel, durationLabel, setupLabel } from "./i18n/time";
export type RoomOptionsValue = {
  visibility: "public" | "private";
  seats: number;
  setupMode: "snake-forward" | "snake-reverse" | "standard" | "training";
  settings: GameSettings;
};
export function RoomOptions({
  value,
  onChange,
  minimumSeats = 3,
}: {
  value: RoomOptionsValue;
  onChange: (value: RoomOptionsValue) => void;
  minimumSeats?: number;
}) {
  const change = (patch: Partial<RoomOptionsValue>) =>
    onChange({ ...value, ...patch });
  return (
    <>
      <div className="settings-grid room-basics">
        <label>
          {translate("ui.room-settings.041a2836b2")}
          <select
            aria-label={translate("ui.room-settings.041a2836b2")}
            value={value.visibility}
            onChange={(e) =>
              change({
                visibility: e.target.value as RoomOptionsValue["visibility"],
              })
            }
          >
            <option value="public">
              {translate("ui.room-settings.1b384a7a97")}
            </option>
            <option value="private">
              {translate("ui.room-settings.d1a1fdff92")}
            </option>
          </select>
        </label>
        <label>
          {translate("ui.room-settings.4b2e05d718")}
          <select
            aria-label={translate("ui.room-settings.4b2e05d718")}
            value={value.seats}
            onChange={(e) => change({ seats: Number(e.target.value) })}
          >
            {[3, 4, 5].map((n) => (
              <option key={n} value={n} disabled={n < minimumSeats}>
                {n} {translate("ui.room-settings.d63842643d")}
              </option>
            ))}
          </select>
        </label>
        <label>
          {translate("ui.room-settings.8818fed3c2")}
          <select
            aria-label={translate("ui.room-settings.8818fed3c2")}
            value={value.setupMode}
            onChange={(e) =>
              change({
                setupMode: e.target.value as RoomOptionsValue["setupMode"],
              })
            }
          >
            <option value="snake-forward">
              {translate("ui.room-settings.81dc8bf7f7")}
            </option>
            <option value="snake-reverse">
              {translate("ui.room-settings.e1e8017dd3")}
            </option>
          </select>
        </label>
        <TimeOptions
          value={value.settings}
          onChange={(settings) => change({ settings })}
        />
      </div>
      <GameOptions
        value={value.settings}
        onChange={(settings) => change({ settings })}
        mode={value.setupMode}
      />
      <p
        className="room-creation-summary"
        aria-label={translate("ui.room-settings.05475d6b50")}
      >
        <RoomSummary
          visibility={value.visibility}
          capacity={value.seats}
          setupMode={value.setupMode}
          settings={value.settings}
        />
      </p>
    </>
  );
}
export function TimeOptions({
  value,
  onChange,
}: {
  value: GameSettings;
  onChange: (next: GameSettings) => void;
}) {
  const time =
    value.time.mode === "incremental"
      ? value.time
      : (defaultGameSettings().time as Extract<
          GameSettings["time"],
          { mode: "incremental" }
        >);
  const change = (
    field: "initialHours" | "incrementHours" | "maximumHours",
    hours: number,
  ) => {
    const next = { ...time, [field]: hours };
    if (next.initialHours > next.maximumHours) {
      if (field === "initialHours") next.maximumHours = next.initialHours;
      else next.initialHours = next.maximumHours;
    }
    onChange({ ...value, time: next });
  };
  return (
    <fieldset
      className="time-settings settings-wide"
      aria-label={translate("ui.room-settings.8b6ff49851")}
    >
      <legend>{translate("ui.room-settings.8b6ff49851")}</legend>
      <div className="time-fields">
        {(
          [
            ["initialHours", translate("ui.room-settings.e46c2e065f")],
            ["incrementHours", translate("ui.room-settings.4958570bb2")],
            ["maximumHours", translate("ui.room-settings.33e9b1fcbd")],
          ] as const
        ).map(([field, title]) => (
          <label key={field}>
            {title}
            <select
              aria-label={title}
              value={time[field]}
              onChange={(e) => change(field, Number(e.target.value))}
            >
              {[...new Set([...timeHours, time[field]])]
                .sort((a, b) => a - b)
                .map((hours) => (
                  <option key={hours} value={hours}>
                    {durationLabel(hours)}
                  </option>
                ))}
            </select>
          </label>
        ))}
      </div>
      <p className="muted settings-wide">
        {translate("ui.room-settings.724d36d7ec")}
        {durationLabel(time.initialHours)}
        {translate("ui.room-settings.59d6c49925")}{" "}
        {durationLabel(time.incrementHours)}
        {translate("ui.room-settings.6d708937de")}{" "}
        {durationLabel(time.maximumHours)}
        {translate("ui.room-settings.114c417677")}
      </p>
    </fieldset>
  );
}
export function GameOptions({
  value,
  onChange,
  mode,
}: {
  value: GameSettings;
  onChange: (next: GameSettings) => void;
  mode: string;
}) {
  const change = (patch: Partial<GameSettings>) =>
    onChange({ ...value, ...patch });
  return (
    <details className="creation-settings">
      <summary>{translate("ui.room-settings.44455611b9")}</summary>
      <div className="settings-grid">
        <label>
          {translate("ui.room-settings.689dae8ef9")}
          <select
            aria-label={translate("ui.room-settings.689dae8ef9")}
            value={value.undo}
            onChange={(e) =>
              change({ undo: e.target.value as GameSettings["undo"] })
            }
          >
            <option value="unanimous">
              {translate("ui.room-settings.96976c1cc2")}
            </option>
            <option value="disabled">
              {translate("ui.room-settings.27ddd214b2")}
            </option>
          </select>
        </label>
        {mode !== "training" && (
          <>
            <label>
              {translate("ui.room-settings.5f5d9f4039")}
              <select
                aria-label={translate("ui.room-settings.5f5d9f4039")}
                value={value.seatOrder}
                onChange={(e) =>
                  change({
                    seatOrder: e.target.value as GameSettings["seatOrder"],
                  })
                }
              >
                <option value="random">
                  {translate("ui.room-settings.75ca4f9214")}
                </option>
                <option value="seated">
                  {translate("ui.room-settings.a3c78968f0")}
                </option>
              </select>
            </label>
            <label>
              {translate("ui.room-settings.5cf1743517")}
              <input
                value={value.seed}
                maxLength={32}
                pattern={"[a-zA-Z0-9_\\-]*"}
                placeholder={translate("ui.room-settings.2e241e7b12")}
                onChange={(e) => change({ seed: e.target.value })}
              />
            </label>
            <p className="muted settings-wide">
              {translate("ui.room-settings.3bf88bdf8e")}
            </p>
          </>
        )}
        <p className="muted settings-wide">
          {translate("ui.room-settings.5eefc83a49")}
        </p>
      </div>
    </details>
  );
}
export function RoomSummary({
  visibility,
  capacity,
  setupMode,
  settings,
}: {
  visibility: string;
  capacity: number;
  setupMode: string;
  settings: GameSettings;
}) {
  return (
    <span className="room-summary">
      {[
        visibility === "private"
          ? translate("ui.room-settings.d1a1fdff92")
          : translate("ui.room-settings.1b384a7a97"),
        translate("ui.room-settings.fa1142a258", { p0: capacity }),
        settings.time.mode === "bank"
          ? translate("ui.room-settings.599bad1cff", {
              p0: timeLabel(settings.time),
            })
          : settings.time.mode === "async"
            ? translate("ui.room-settings.a5ce714648", {
                p0: timeLabel(settings.time),
              })
            : timeLabel(settings.time),
        setupLabel(setupMode),
        settings.undo === "disabled"
          ? translate("ui.room-settings.27ddd214b2")
          : translate("ui.room-settings.2d82491823"),
        translate("ui.room-settings.4d983d179c"),
      ].join(" · ")}
    </span>
  );
}
export function SettingsSummary({
  settings,
  mode,
  locked = false,
}: {
  settings: GameSettings;
  mode?: string;
  locked?: boolean;
}) {
  const s = mode ? effectiveSettings(settings, mode) : settings;
  return (
    <div
      className="settings-summary"
      aria-label={
        locked
          ? translate("ui.room-settings.14acf4a2bb")
          : translate("ui.room-settings.87518ac0b1")
      }
    >
      {mode && <span>{setupLabel(mode)}</span>}
      <span>{timeLabel(s.time)}</span>
      <span>
        {s.undo === "disabled"
          ? translate("ui.room-settings.e78bbfff79")
          : translate("ui.room-settings.2d82491823")}
      </span>
      <span>{translate("ui.room-settings.4d983d179c")}</span>
      <span>
        {s.seatOrder === "random"
          ? translate("ui.room-settings.b784f3f920")
          : translate("ui.room-settings.f95da63d4e")}
      </span>
      {s.seed && (
        <span>
          {translate("ui.room-settings.b7d7c219f0")}
          {s.seed}
        </span>
      )}
      {locked && <span>{translate("ui.room-settings.d617f69c27")}</span>}
    </div>
  );
}
