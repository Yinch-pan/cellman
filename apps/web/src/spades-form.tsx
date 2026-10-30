import React, { useState } from "react";
import { hexLabel } from "./map-coordinates";
import { t as translate } from "./i18n";
import type {
  GameAction,
  GameState,
  Terrain,
} from "../../../packages/rules/src/types";
import {
  officialLarge,
  terrainDistance,
} from "../../../packages/rules/src/map";
import { applyAction } from "../../../packages/rules/src/engine";
import { GuidedAction, terraformTargets } from "./action-guidance";
import { label } from "./api";
import "./spades-form.css";
import { withPowerBurn } from "./power-payment";

type Target = { hex: string; terrain: Terrain };
export function SpadesForm({
  stepwise,
  deferSurplus = false,
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
  onSelectHex,
  onPickMap,
}: {
  stepwise?: boolean;
  deferSurplus?: boolean;
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
  onSelectHex: (hex: string) => void;
  onPickMap?: () => void;
  toAction: (
    input: Target & {
      build: boolean;
      deferBuild?: boolean;
      deferSpades?: boolean;
      additional: Target[];
      travel?: "tunnel" | "flight";
    },
  ) => GameAction;
}) {
  const [terrainsByHex, setTerrains] = useState<Record<string, Terrain>>({}),
    [targets, setTargets] = useState<Target[]>([]),
    [build, setBuild] = useState(false),
    [travel, setTravel] = useState<"" | "tunnel" | "flight">(""),
    [discardConfirmation, setDiscardConfirmation] = useState("");
  const current = (hex: string) =>
    state.board.terrain[hex] ?? officialLarge.hexes[hex]?.terrain;
  const cost = (target: Target) =>
    terrainDistance(current(target.hex) as Terrain, target.terrain);
  const terrains = terraformTargets(state, selected, native);
  const chosen =
    terrainsByHex[selected] ??
    targets.find((t) => t.hex === selected)?.terrain ??
    native;
  const terrain = terrains.includes(chosen)
    ? chosen
    : terrains.includes(native)
      ? native
      : (terrains[0] ?? native);
  // A selected map hex is a live candidate; revisiting a saved hex edits it.
  const plan = [...targets];
  if (selected && terrains.length) {
    const index = plan.findIndex((t) => t.hex === selected);
    if (index < 0) plan.push({ hex: selected, terrain });
    else plan[index] = { hex: selected, terrain };
  }
  const used = plan.reduce((sum, target) => sum + cost(target), 0);
  const remaining = Math.max(0, amount - used);
  const extraTools =
    Math.max(0, (plan[0] ? cost(plan[0]) : 0) - amount) *
    (3 - state.players[seat].terraformLevel);
  const mayBuild = canBuild && plan[0]?.terrain === native;
  const preserveSurplus =
    deferSurplus && !!mayBuild && plan.length === 1 && cost(plan[0]) > 0;
  let action =
    plan.length && (!selected || terrains.length)
      ? toAction({
          ...plan[0],
          build:
            !!mayBuild && (stepwise ? current(plan[0].hex) === native : build),
          deferBuild:
            !!stepwise && !!mayBuild && current(plan[0].hex) !== native,
          ...(preserveSurplus ? { deferSpades: true } : {}),
          additional: plan.slice(1),
          travel: travel || undefined,
        })
      : null;
  action = action ? withPowerBurn(state, seat, action) : null;
  const legal = action ? applyAction(state, seat, action).ok : false;
  const signature = JSON.stringify([action, state.revision, remaining]);
  const canContinue =
    legal &&
    remaining > 0 &&
    plan.length < amount &&
    (sciencePhase || plan.at(-1)?.terrain === native);
  return (
    <div className="form-stack spades-planner">
      <div className="spades-budget" role="status">
        <strong>
          {translate("spades.budget", {
            total: amount,
            used: Math.min(amount, used),
            remaining,
          })}
        </strong>
        {extraTools > 0 && (
          <span>
            {translate(
              sciencePhase ? "spades.cannotBuy" : "spades.extraTools",
              { n: sciencePhase ? Math.max(0, used - amount) : extraTools },
            )}
          </span>
        )}
      </div>
      <p className="small muted">
        {translate(sciencePhase ? "spades.scienceHint" : "spades.hint")}
      </p>
      {!!travelOptions.length && (
        <label>
          {translate("ui.game.bfc00be234")}
          <select
            value={travel}
            disabled={disabled}
            onChange={(e) => setTravel(e.target.value as typeof travel)}
          >
            <option value="">{translate("ui.game.108ef16c8b")}</option>
            {travelOptions.map((t) => (
              <option key={t} value={t}>
                {translate(
                  t === "tunnel" ? "ui.game.2bba0b1af3" : "ui.game.94ae518126",
                )}
              </option>
            ))}
          </select>
        </label>
      )}
      {selected && terrains.length ? (
        <div className="spades-current">
          <strong>
            {translate("spades.selected", {
              hex: hexLabel(selected),
              terrain: label(current(selected)),
            })}
          </strong>
          <label>
            {translate("ui.game.815a2af276")}
            <select
              value={terrain}
              disabled={disabled}
              onChange={(e) =>
                setTerrains((v) => ({
                  ...v,
                  [selected]: e.target.value as Terrain,
                }))
              }
            >
              {terrains.map((t) => (
                <option key={t} value={t}>
                  {translate("spades.destination", {
                    terrain: label(t),
                    n: cost({ hex: selected, terrain: t }),
                  })}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : (
        <p className="small">
          {translate(selected ? "spades.invalidHex" : "spades.pickHex")}
        </p>
      )}
      {!!plan.length && (
        <ol className="spades-targets" aria-label={translate("spades.plan")}>
          {plan.map((target, i) => (
            <li key={target.hex}>
              <span>
                <strong>{hexLabel(target.hex)}</strong>{" "}
                {label(current(target.hex))} → {label(target.terrain)} ·{" "}
                {translate("spades.cost", { n: cost(target) })}
                {i === 0 && mayBuild && (
                  <small>{translate("spades.buildSite")}</small>
                )}
              </span>
              <div>
                <button
                  type="button"
                  className="text-button"
                  disabled={disabled}
                  aria-label={translate("spades.edit", {
                    hex: hexLabel(target.hex),
                  })}
                  onClick={() => {
                    setTargets(plan);
                    onSelectHex(target.hex);
                  }}
                >
                  {translate("spades.editShort")}
                </button>
                <button
                  type="button"
                  className="text-button"
                  disabled={disabled}
                  aria-label={translate("spades.remove", {
                    hex: hexLabel(target.hex),
                  })}
                  onClick={() => {
                    setTargets(plan.filter((_, j) => j !== i));
                    onSelectHex("");
                    setDiscardConfirmation("");
                  }}
                >
                  {translate("ui.game.6135d4159e")}
                </button>
              </div>
            </li>
          ))}
        </ol>
      )}
      {remaining > 0 && !!plan.length && !preserveSurplus && (
        <>
          <button
            type="button"
            className="secondary"
            disabled={disabled || !canContinue}
            onClick={() => {
              setTargets(plan);
              onSelectHex("");
              setDiscardConfirmation("");
              onPickMap?.();
            }}
          >
            {translate("spades.continue", { n: remaining })}
          </button>
          {!sciencePhase && plan.at(-1)?.terrain !== native && (
            <p className="small">{translate("spades.finishFirst")}</p>
          )}
        </>
      )}
      {stepwise && canBuild && (
        <p className="small">{translate("spades.buildLater")}</p>
      )}
      {canBuild && !stepwise && (
        <label className="checkbox">
          <input
            type="checkbox"
            checked={!!mayBuild && build}
            disabled={disabled || !mayBuild}
            onChange={(e) => setBuild(e.target.checked)}
          />
          {translate("ui.game.af11d4eeea")}
        </label>
      )}
      {remaining > 0 && !!plan.length && (
        <p className="small spades-warning">
          {translate(preserveSurplus ? "spades.preserved" : "spades.unused", {
            n: remaining,
          })}
        </p>
      )}
      <GuidedAction
        state={state}
        seat={seat}
        action={action}
        disabled={disabled}
        onPreview={(a) => {
          if (remaining > 0 && !preserveSurplus)
            setDiscardConfirmation(signature);
          else onPreview(a);
        }}
      >
        {translate("ui.game.01e1e86d35")}
      </GuidedAction>
      {discardConfirmation === signature && remaining > 0 && legal && (
        <div
          className="spades-confirm"
          role="alertdialog"
          aria-label={translate("spades.confirmTitle")}
        >
          <p>{translate("spades.unused", { n: remaining })}</p>
          <button
            type="button"
            disabled={disabled}
            onClick={() => {
              setDiscardConfirmation("");
              if (action) onPreview(action);
            }}
          >
            {translate("spades.confirmDiscard", { n: remaining })}
          </button>
          <button
            type="button"
            className="text-button"
            onClick={() => setDiscardConfirmation("")}
          >
            {translate("spades.back")}
          </button>
        </div>
      )}
    </div>
  );
}
