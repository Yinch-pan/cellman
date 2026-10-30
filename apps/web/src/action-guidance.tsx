import { t as translate } from "./i18n";
import React, { useState } from "react";
import type {
  GameAction,
  GameState,
  Terrain,
  BuildingKind,
} from "../../../packages/rules/src/types";
import {
  applyAction,
  getAvailableChoices,
} from "../../../packages/rules/src/engine";
import { placementOptions } from "../../../packages/rules/src/setup";
import {
  officialLarge,
  terrainCycle,
  terrainDistance,
} from "../../../packages/rules/src/map";
import { label, RequestError } from "./api";
import { withPowerBurn } from "./power-payment";
import { ConversionSheet } from "./conversion-sheet";
import { supportsBatchActions } from "../../../packages/rules/src/state";
import { hexLabel } from "./map-coordinates";

export function PlacementTypeReview({
  state,
  seat,
  selected,
  disabled,
  onCommit,
  onCancel,
}: {
  state: GameState;
  seat: string;
  selected: string;
  disabled: boolean;
  onCommit: (action: GameAction) => void;
  onCancel: () => void;
}) {
  const [confirmed, setConfirmed] = useState(false);
  const options = placementOptions(state, seat).filter(
    (building) =>
      applyAction(state, seat, {
        kind: "place",
        hex: selected,
        building: building as "tower" | "workshop",
      }).ok,
  );
  if (!selected || !options.length) return null;
  return (
    <div
      className="preview-panel draft-confirmation"
      id="table-placement-review"
    >
      <strong>
        {translate("placement.position", { hex: hexLabel(selected) })}
      </strong>
      {confirmed ? (
        <>
          <p>{translate("placement.chooseType")}</p>
          {options.map((building) => (
            <button
              key={building}
              className="primary"
              disabled={disabled}
              onClick={() =>
                onCommit({
                  kind: "place",
                  hex: selected,
                  building: building as "tower" | "workshop",
                })
              }
            >
              {label(building)}
            </button>
          ))}
        </>
      ) : (
        <button
          className="primary"
          disabled={disabled}
          onClick={() => setConfirmed(true)}
        >
          {translate("ui.game.9ebe36f8cf")}
        </button>
      )}
      <button className="text-button" disabled={disabled} onClick={onCancel}>
        {translate("placement.changePosition")}
      </button>
    </div>
  );
}

export function terraformTargets(
  state: GameState,
  hex: string,
  native: Terrain,
) {
  const current = state.board.terrain[hex] ?? officialLarge.hexes[hex]?.terrain;
  if (!current || current === "river" || state.board.buildings[hex]) return [];
  return terrainCycle.filter(
    (target) =>
      (target !== current || target === native) &&
      terrainDistance(current, target) + terrainDistance(target, native) ===
        terrainDistance(current, native),
  );
}

export function suggestBooks(
  available: number[],
  required: number[],
  total: number,
): [number, number, number, number] | null {
  const result = [...required] as [number, number, number, number];
  if (result.some((n, i) => n > available[i])) return null;
  let remaining = total - result.reduce((a, b) => a + b, 0);
  for (const i of [0, 1, 2, 3].sort(
    (a, b) => available[b] - result[b] - available[a] + result[a],
  )) {
    const n = Math.min(remaining, available[i] - result[i]);
    result[i] += n;
    remaining -= n;
  }
  return remaining === 0 ? result : null;
}

export function scholarKeyLimited(
  state: GameState,
  seat: string,
  action: GameAction,
) {
  if (action.kind !== "scholar") return false;
  const p = state.players[seat];
  const gain = action.slot === null ? 1 : action.slot === 0 ? 3 : 2;
  return (
    p.science[action.track] < 8 &&
    p.science[action.track] + gain >= 8 &&
    p.keysUsed >= p.keys
  );
}

export function buildHighlights(state: GameState, seat: string) {
  const p = state.players[seat];
  const result = new Set<string>();
  if (p && state.pending.length) {
    for (const c of getAvailableChoices(state).filter((c) => c.seat === seat)) {
      if (c.kind === "city") {
        for (const [id, b] of Object.entries(state.board.buildings))
          if (b.cityId === c.source) result.add(id);
      } else if (["neutral", "freeGuild", "freeWorkshop"].includes(c.kind)) {
        for (const id of c.options)
          if (
            officialLarge.hexes[id] &&
            applyAction(state, seat, {
              kind: "respond",
              choiceId: c.id,
              option: id,
            }).ok
          )
            result.add(id);
      } else if (c.kind === "buildWorkshop" && officialLarge.hexes[c.source])
        for (const hex of c.buildHexes ?? [c.source]) result.add(hex);
      else if (c.kind === "spades") {
        for (const h of Object.values(officialLarge.hexes)) {
          if (h.terrain === "river") continue;
          if (
            terraformTargets(state, h.id, p.native).some(
              (terrain) =>
                applyAction(state, seat, {
                  kind: "respond",
                  choiceId: c.id,
                  option: "terraform",
                  terraform: {
                    hex: h.id,
                    terrain,
                    build: false,
                    additional: [],
                  },
                }).ok,
            )
          )
            result.add(h.id);
        }
      }
    }
    return result;
  }
  if (
    !p ||
    state.status === "finished" ||
    state.pending.length ||
    state.activeSeat !== seat
  )
    return result;
  for (const h of Object.values(officialLarge.hexes)) {
    if (h.terrain === "river") continue;
    const actions: GameAction[] = [];
    if (state.phase === "placement") actions.push({ kind: "place", hex: h.id });
    else if (state.phase === "actions" && !p.primaryDone) {
      const b = state.board.buildings[h.id];
      if (b?.seat === seat && !b.neutral) {
        const paths: Partial<Record<BuildingKind, BuildingKind[]>> = {
          workshop: ["guild"],
          guild: ["school", "palace"],
          school: ["university"],
        };
        for (const to of paths[b.kind] ?? [])
          actions.push({
            kind: "upgrade",
            hex: h.id,
            to,
            palace: p.draftPalace ?? state.shared.palaces[0],
          });
      } else if (!b) {
        for (const terrain of terraformTargets(state, h.id, p.native)) {
          actions.push({
            kind: "terraform",
            hex: h.id,
            terrain,
            build: terrain === p.native,
          });
          if (terrain === p.native)
            actions.push({
              kind: "terraform",
              hex: h.id,
              terrain,
              build: false,
            });
        }
      }
    }
    if (actions.some((a) => applyAction(state, seat, a).ok)) result.add(h.id);
  }
  return result;
}

// Use the exact engine (including frozen versions) to explain availability.
// Resource figures are net outcomes, not a duplicated implementation of costs.
export function GuidedAction({
  state,
  seat,
  action,
  disabled,
  onPreview,
  children,
}: {
  state: GameState;
  seat: string;
  action: GameAction | null;
  disabled: boolean;
  onPreview: (a: GameAction) => void;
  children: React.ReactNode;
}) {
  action = action ? withPowerBurn(state, seat, action) : null;
  const result = action ? applyAction(state, seat, action) : null;
  const p = state.players[seat];
  const after = result?.ok ? result.state.players[seat] : null;
  const changes: string[] = [];
  if (after) {
    for (const [key, name] of [
      ["coins", translate("ui.action-guidance.bbece6f829")],
      ["tools", translate("ui.action-guidance.5ca6730d44")],
      ["scholars", translate("ui.action-guidance.230cc1d6c8")],
    ] as const) {
      if (p.resources[key] !== after.resources[key])
        changes.push(`${name} ${p.resources[key]} → ${after.resources[key]}`);
    }
    if (p.resources.power.join() !== after.resources.power.join())
      changes.push(
        translate("ui.action-guidance.1f3ff88a6d", {
          p0: after.resources.power.join(" / "),
        }),
      );
    if (p.resources.books.join() !== after.resources.books.join())
      changes.push(
        translate("ui.action-guidance.eac9f58187", {
          p0: after.resources.books.join(" / "),
        }),
      );
    if (p.science.join() !== after.science.join())
      changes.push(
        translate("ui.action-guidance.6e7bd1fb47", {
          p0: after.science.join(" / "),
        }),
      );
    if (p.vp !== after.vp)
      changes.push(
        translate("ui.action-guidance.0b1379fde6", { p0: p.vp, p1: after.vp }),
      );
  }
  return (
    <div className="guided-action">
      {action?.kind === "powerAction" && !!action.burn && (
        <p className="power-burn-quote">
          {translate("powerPayment.burn", { count: action.burn })}
        </p>
      )}
      {!disabled && result && (
        <p className={"action-quote small " + (result.ok ? "" : "unavailable")}>
          {result.ok
            ? changes.length
              ? translate("ui.action-guidance.c1a9605ce1", {
                  p0: changes.join("；"),
                })
              : translate("ui.action-guidance.3ad8b9b631")
            : new RequestError(result.error.code).message}
        </p>
      )}
      <button
        className="secondary full"
        disabled={disabled || !result?.ok}
        onClick={() => action && onPreview(action)}
      >
        {children}
      </button>
    </div>
  );
}

export function PlacementPanel({
  state,
  seat,
  selected,
  disabled,
  onPreview,
}: {
  state: GameState;
  seat: string;
  selected: string;
  disabled: boolean;
  onPreview: (a: GameAction) => void;
}) {
  const options = placementOptions(state, seat);
  const building = options.length === 1 ? options[0] : undefined;
  return (
    <>
      <div className="eyebrow">
        {translate("ui.action-guidance.319e12f577")}
      </div>
      <h2>
        {translate("ui.action-guidance.9c92c6fe1b")}
        {building
          ? label(building)
          : translate("ui.action-guidance.5b46860a8e")}
      </h2>
      <p className="placement-progress">
        {translate("ui.action-guidance.6cb3f23879")}{" "}
        {
          Object.values(state.board.buildings).filter((b) => b.seat === seat)
            .length
        }{" "}
        {translate("ui.action-guidance.6ee9346756")}{" "}
        {
          state.placementOrder
            .slice(state.placementIndex)
            .filter((s) => s === seat).length
        }{" "}
        {translate("ui.action-guidance.a646285d2d")}
      </p>
      <p className="small muted">
        {translate("ui.action-guidance.363a463aab")}
        {label(state.players[seat].native)}
        {translate("ui.action-guidance.a1699952f9")}
        {options.length > 1 ? translate("placement.positionFirst") : ""}
      </p>
      {options.length === 1 && (
        <GuidedAction
          state={state}
          seat={seat}
          action={
            selected && building
              ? {
                  kind: "place",
                  hex: selected,
                  building: building as "workshop" | "tower" | "university",
                }
              : null
          }
          disabled={disabled}
          onPreview={onPreview}
        >
          {translate("ui.action-guidance.3960edc1d7")}
        </GuidedAction>
      )}
    </>
  );
}

const conversions = [
  ["power", "coin", translate("ui.action-guidance.20c475c2ac")],
  ["power", "tool", translate("ui.action-guidance.c82f134d05")],
  ["power", "scholar", translate("ui.action-guidance.af618a54e7")],
  ["power", "book", translate("ui.action-guidance.0bcd667661")],
  ["scholar", "tool", translate("ui.action-guidance.9490838286")],
  ["tool", "coin", translate("ui.action-guidance.617bcc2296")],
  ["book", "coin", translate("ui.action-guidance.ccbc05d82e")],
] as const;
export function FreeActions({
  state,
  seat,
  disabled,
  onPreview,
}: {
  state: GameState;
  seat: string;
  disabled: boolean;
  onPreview: (a: GameAction) => void;
}) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [index, setIndex] = useState(0),
    [count, setCount] = useState(1),
    [color, setColor] = useState(0);
  const [from, to] = conversions[index];
  const resources = state.players[seat].resources;
  const unitCost =
    from === "power" ? (to === "coin" ? 1 : to === "tool" ? 3 : 5) : 1;
  const balance =
    from === "power"
      ? resources.power[2]
      : from === "tool"
        ? resources.tools
        : from === "scholar"
          ? resources.scholars
          : resources.books[color];
  const maximum = Math.floor(balance / unitCost);
  return (
    <details
      className="free-actions"
      open={state.players[seat].primaryDone || undefined}
    >
      <summary>{translate("ui.action-guidance.a3cf0766f5")}</summary>
      <div className="form-stack">
        {supportsBatchActions(state.rulesVersion) && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => setSheetOpen(true)}
          >
            {translate("conversion.open")}
          </button>
        )}
        {sheetOpen && (
          <ConversionSheet
            key={`${seat}:${state.revision}`}
            state={state}
            seat={seat}
            disabled={disabled}
            onPreview={onPreview}
            onClose={() => setSheetOpen(false)}
          />
        )}
        <label>
          {translate("ui.action-guidance.aa21376766")}
          <select
            value={index}
            onChange={(e) => setIndex(Number(e.target.value))}
          >
            {conversions.map(([, , text], i) => (
              <option key={i} value={i}>
                {text}
              </option>
            ))}
          </select>
        </label>
        <label>
          {translate("ui.action-guidance.496e93ddfa")}
          <input
            type="number"
            min="1"
            max={Math.max(1, maximum)}
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
          />
        </label>
        <p className="small">
          {translate("ui.action-guidance.343568f8aa")}
          {count * unitCost}{" "}
          {from === "power"
            ? translate("ui.action-guidance.522148a1fd")
            : from === "tool"
              ? translate("ui.action-guidance.5ca6730d44")
              : from === "scholar"
                ? translate("ui.action-guidance.230cc1d6c8")
                : translate("ui.action-guidance.1ee4e22b2e")}
          {translate("ui.action-guidance.9329a45b33")}
          {count}{" "}
          {to === "coin"
            ? translate("ui.action-guidance.bbece6f829")
            : to === "tool"
              ? translate("ui.action-guidance.5ca6730d44")
              : to === "scholar"
                ? translate("ui.action-guidance.230cc1d6c8")
                : translate("ui.action-guidance.1ee4e22b2e")}
          {translate("ui.action-guidance.1af3fec2a1")}
          {maximum} {translate("ui.action-guidance.3b0770bdec")}
        </p>
        <button
          className="text-button"
          disabled={disabled || maximum < 1}
          onClick={() => setCount(maximum)}
        >
          {translate("ui.action-guidance.20e9d79f1a")}
        </button>
        {(from === "book" || to === "book") && (
          <label>
            {translate("ui.action-guidance.751b14a7d7")}
            <select
              value={color}
              onChange={(e) => setColor(Number(e.target.value))}
            >
              {[
                translate("ui.action-guidance.c732e4d7e3"),
                translate("ui.action-guidance.52f354ecfc"),
                translate("ui.action-guidance.3eb2456f3b"),
                translate("ui.action-guidance.3366645622"),
              ].map((name, i) => (
                <option key={i} value={i}>
                  {name}
                </option>
              ))}
            </select>
          </label>
        )}
        <GuidedAction
          state={state}
          seat={seat}
          action={{
            kind: "convert",
            from,
            to,
            count,
            color: color as 0 | 1 | 2 | 3,
          }}
          disabled={disabled}
          onPreview={onPreview}
        >
          {translate("ui.action-guidance.3b1cfbbaa9")}
        </GuidedAction>
        <p className="small muted">
          {translate("ui.action-guidance.36444d2cb0")}
        </p>
        <GuidedAction
          state={state}
          seat={seat}
          action={{ kind: "burn", count: 1 }}
          disabled={disabled}
          onPreview={onPreview}
        >
          {translate("ui.action-guidance.4e0036c53b")}
        </GuidedAction>
      </div>
    </details>
  );
}
