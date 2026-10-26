import React, { useState } from "react";
import { t as translate } from "./i18n";
import type {
  GameAction,
  GameState,
  Terrain,
} from "../../../packages/rules/src/types";
import { officialLarge } from "../../../packages/rules/src/map";
import { GuidedAction, terraformTargets } from "./action-guidance";
import { label } from "./api";
export function SpadesForm({
  stepwise,
  state,
  seat,
  selected,
  native,
  amount,
  canBuild = true,
  travelOptions = [],
  sciencePhase = false,
  disabled,
  onPreview,
  toAction,
}: {
  stepwise?: boolean;
  state: GameState;
  seat: string;
  selected: string;
  native: Terrain;
  amount: number;
  canBuild?: boolean;
  travelOptions?: ("tunnel" | "flight")[];
  sciencePhase?: boolean;
  disabled: boolean;
  onPreview: (a: GameAction) => void;
  toAction: (input: {
    hex: string;
    terrain: Terrain;
    build: boolean;
    deferBuild?: boolean;
    additional: { hex: string; terrain: Terrain }[];
    travel?: "tunnel" | "flight";
  }) => GameAction;
}) {
  const [chosenTerrain, setTerrain] = useState<Terrain>(native),
    [targets, setTargets] = useState<{ hex: string; terrain: Terrain }[]>([]),
    [build, setBuild] = useState(false),
    [travel, setTravel] = useState<"" | "tunnel" | "flight">("");
  const terrains = terraformTargets(state, selected, native);
  const terrain = terrains.includes(chosenTerrain)
    ? chosenTerrain
    : terrains.includes(native)
      ? native
      : (terrains[0] ?? native);
  const effectiveTargets = targets.length
    ? targets
    : selected && terrains.length
      ? [{ hex: selected, terrain }]
      : [];
  const mayBuild = canBuild && effectiveTargets[0]?.terrain === native;
  const action = effectiveTargets.length
    ? toAction({
        ...effectiveTargets[0],
        build:
          mayBuild &&
          (stepwise
            ? (state.board.terrain[effectiveTargets[0].hex] ??
                officialLarge.hexes[effectiveTargets[0].hex]?.terrain) ===
              native
            : build),
        deferBuild:
          !!stepwise &&
          mayBuild &&
          (state.board.terrain[effectiveTargets[0].hex] ??
            officialLarge.hexes[effectiveTargets[0].hex]?.terrain) !== native,
        additional: effectiveTargets.slice(1),
        travel: travel || undefined,
      })
    : null;
  return (
    <div className="form-stack">
      <p className="small">
        {translate("ui.game.76ea97ed3d")}
        {amount} {translate("ui.game.eab53b90b2")}
        {sciencePhase
          ? translate("ui.game.f4c6f2f13b")
          : translate("ui.game.36cd1e6791")}
      </p>
      {!!travelOptions.length && (
        <label>
          {translate("ui.game.bfc00be234")}
          <select
            value={travel}
            onChange={(e) => setTravel(e.target.value as typeof travel)}
          >
            <option value="">{translate("ui.game.108ef16c8b")}</option>
            {travelOptions.map((t) => (
              <option key={t} value={t}>
                {t === "tunnel"
                  ? translate("ui.game.2bba0b1af3")
                  : translate("ui.game.94ae518126")}
              </option>
            ))}
          </select>
        </label>
      )}
      <label>
        {translate("ui.game.815a2af276")}
        <select
          value={terrain}
          disabled={!terrains.length}
          onChange={(e) => setTerrain(e.target.value as Terrain)}
        >
          {!terrains.length && (
            <option value={native}>{translate("ui.game.1713b08c51")}</option>
          )}
          {terrains.map((t) => (
            <option key={t} value={t}>
              {label(t)}
            </option>
          ))}
        </select>
      </label>
      <button
        className="secondary"
        disabled={
          disabled ||
          !selected ||
          !terrains.length ||
          targets.length >= amount ||
          targets.some((t) => t.hex === selected)
        }
        onClick={() => setTargets((t) => [...t, { hex: selected, terrain }])}
      >
        {translate("ui.game.d75cdd59c0")}
        {selected}
      </button>
      {!targets.length && (
        <p className="small muted">{translate("ui.game.3abeb572f6")}</p>
      )}
      {targets.map((t, i) => (
        <p className="small" key={t.hex}>
          {i + 1}. {t.hex} → {label(t.terrain)}{" "}
          <button
            className="text-button"
            onClick={() => setTargets((v) => v.filter((_, j) => i !== j))}
          >
            {translate("ui.game.6135d4159e")}
          </button>
        </p>
      ))}
      {stepwise && canBuild && (
        <p className="small">{translate("ui.game.2e52a00cbd")}</p>
      )}
      {canBuild && !stepwise && (
        <label className="checkbox">
          <input
            type="checkbox"
            checked={mayBuild && build}
            disabled={!mayBuild}
            onChange={(e) => setBuild(e.target.checked)}
          />
          {translate("ui.game.af11d4eeea")}
        </label>
      )}
      <GuidedAction
        state={state}
        seat={seat}
        action={action}
        disabled={disabled}
        onPreview={onPreview}
      >
        {translate("ui.game.01e1e86d35")}
      </GuidedAction>
    </div>
  );
}
