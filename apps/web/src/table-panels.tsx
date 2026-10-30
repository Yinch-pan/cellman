import { t as translate } from "./i18n";
import { bridgeLabel, eventHexes, hexLabel } from "./map-coordinates";
import { fieldLabels, eventText } from "./i18n/presentation";
import React, { useState } from "react";
import type {
  GameAction,
  GameState,
  PendingChoice,
  RuleEvent,
} from "../../../packages/rules/src/types";
import {
  factions,
  palaces,
  innovations,
  bonusDescriptions,
  competencyDescriptions,
} from "./i18n/content";
import { type ResourceChange } from "../../../packages/rules/src/ledger";
import { specialOptions } from "./i18n/presentation";
import { label } from "./api";
import { draftOptions } from "../../../packages/rules/src/setup";
import { bonusTitles, terrainPresentation } from "./table-experience";
export function SetupPanel({
  state,
  disabled,
  onPreview,
  selectedPick,
}: {
  state: GameState;
  disabled: boolean;
  onPreview: (a: GameAction) => void;
  selectedPick?: { category: string; option: string };
}) {
  if (state.setup.draft) {
    const categories = ["faction", "native", "bonus", "palace"] as const;
    const resultCategories = ["faction", "native", "palace", "bonus"] as const;
    const names = {
      faction: translate("ui.table-panels.b49377b38c"),
      native: translate("ui.table-panels.51695ad45a"),
      palace: translate("ui.table-panels.c837854a57"),
      bonus: translate("ui.table-panels.d7fb5bfc83"),
    };
    const description = (
      category: (typeof categories)[number],
      option: string,
    ) =>
      category === "faction"
        ? factions[option]?.description
        : category === "palace"
          ? palaces[option]?.description
          : category === "bonus"
            ? bonusDescriptions[option]
            : terrainPresentation[option as keyof typeof terrainPresentation]
                ?.detail + translate("ui.table-panels.c776c00186");
    const title = (category: (typeof categories)[number], option?: string) =>
      !option
        ? translate("ui.table-panels.04fbe1f842")
        : category === "faction"
          ? factions[option]?.name
          : category === "palace"
            ? palaces[option]?.name
            : category === "bonus"
              ? (bonusTitles[option] ?? label(option))
              : label(option);
    return (
      <section
        className="setup-panel snake-draft"
        aria-label={translate("ui.table-panels.58ee85ad27")}
      >
        <h2>
          {state.setup.draft.direction === "forward"
            ? translate("ui.table-panels.81dc8bf7f7")
            : translate("ui.table-panels.e1e8017dd3")}{" "}
          {translate("ui.table-panels.ca0b53cf6f")}{" "}
          {Math.floor((state.draftIndex ?? 0) / state.turnOrder.length) + 1}{" "}
          {translate("ui.table-panels.7cbebfd6e2")}
        </h2>
        <p>
          {translate("ui.table-panels.1f4d1daca2")}
          {state.players[state.activeSeat].name}
          {translate("ui.table-panels.81b269215e")}
        </p>
        <p>
          {translate("ui.table-panels.f6209664ad")}
          {((Math.floor((state.draftIndex ?? 0) / state.turnOrder.length) %
            2 ===
            0) ===
          (state.setup.draft.direction === "reverse")
            ? [...state.turnOrder].reverse()
            : state.turnOrder
          )
            .map((seat) => state.players[seat].name)
            .join(" → ")}
        </p>
        {categories.map((category) => (
          <section
            className="draft-category"
            data-category={category}
            key={category}
            aria-label={names[category]}
          >
            <h3>{names[category]}</h3>
            <div className="setup-options">
              {state.setup.draft!.pools[category].map((option) => {
                const owner = Object.entries(state.draftPicks ?? {}).find(
                  ([, picks]) => picks[category] === option,
                )?.[0];
                return (
                  <button
                    className="setup-option"
                    data-category={category}
                    data-option={option}
                    data-selected={
                      selectedPick?.category === category &&
                      selectedPick.option === option
                    }
                    aria-pressed={
                      selectedPick?.category === category &&
                      selectedPick.option === option
                    }
                    key={option}
                    disabled={
                      disabled ||
                      !draftOptions(state, state.activeSeat, category).includes(
                        option,
                      )
                    }
                    onClick={() =>
                      onPreview({ kind: "draftPick", category, option })
                    }
                  >
                    <span
                      className="tile-emblem"
                      aria-hidden="true"
                      style={
                        category === "native"
                          ? {
                              color:
                                terrainPresentation[
                                  option as keyof typeof terrainPresentation
                                ]?.color,
                            }
                          : undefined
                      }
                    >
                      {category === "native"
                        ? terrainPresentation[
                            option as keyof typeof terrainPresentation
                          ]?.symbol
                        : { faction: "♟", palace: "♜", bonus: "✦" }[category]}
                    </span>
                    <strong>{title(category, option)}</strong>
                    <span className="tile-description">
                      {description(category, option)}
                    </span>
                    {owner && (
                      <small>
                        {state.players[owner].name}{" "}
                        {translate("ui.table-panels.eb0ca1c8f6")}
                      </small>
                    )}
                    {!owner &&
                      state.draftPicks?.[state.activeSeat]?.[category] && (
                        <small>{translate("ui.table-panels.7c8a63e57a")}</small>
                      )}
                  </button>
                );
              })}
            </div>
          </section>
        ))}
        <div className="draft-picked" tabIndex={0}>
          <table aria-label={translate("ui.table-panels.92b6003dc9")}>
            <thead>
              <tr>
                <th>{translate("ui.table-panels.991e63fe29")}</th>
                {resultCategories.map((c) => (
                  <th key={c}>{names[c]}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {state.turnOrder.map((seat) => (
                <tr key={seat} data-active={seat === state.activeSeat}>
                  <th>
                    {state.players[seat].name}
                    {seat === state.activeSeat && (
                      <small>{translate("ui.table-panels.c259fa9a3b")}</small>
                    )}
                  </th>
                  {resultCategories.map((category) => (
                    <td key={category}>
                      {title(category, state.draftPicks?.[seat]?.[category])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    );
  }
  return (
    <div className="setup-panel">
      <div className="eyebrow">{translate("ui.table-panels.a54084ef9e")}</div>
      <h2>{translate("ui.table-panels.571096246e")}</h2>
      <p className="small">{translate("ui.table-panels.923a212d0d")}</p>
      <div className="setup-options">
        {state.setup.offers?.map((o, i) => (
          <button
            key={i}
            className="setup-option"
            disabled={disabled || state.chosenOffers?.includes(i)}
            onClick={() => onPreview({ kind: "chooseSetup", offer: i })}
          >
            <strong>
              {label(o.native)} · {factions[o.faction]?.name}
            </strong>
            <span>{factions[o.faction]?.description}</span>
            <small>
              {label("bonus:" + o.bonus)}：{bonusDescriptions[o.bonus]}
            </small>
          </button>
        ))}
      </div>
    </div>
  );
}
export function SpecialPanel({
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
  const p = state.players[seat],
    options = specialOptions(p);
  const [track, setTrack] = useState(0);
  if (!options.length && p.palace !== "river-city") return null;
  return (
    <div className="form-stack">
      <h4>{translate("ui.table-panels.44ad253090")}</h4>
      {options.some((o) => o.track) && (
        <label>
          {translate("ui.table-panels.c9d10cdecb")}
          <select
            value={track}
            onChange={(e) => setTrack(Number(e.target.value))}
          >
            {[
              translate("ui.table-panels.b1eff676a2"),
              translate("ui.table-panels.b237c80398"),
              translate("ui.table-panels.e9f3d305ff"),
              translate("ui.table-panels.8cff79bb4f"),
            ].map((v, i) => (
              <option key={i} value={i}>
                {v}
              </option>
            ))}
          </select>
        </label>
      )}
      {options.length ? (
        options.map((o) => (
          <button
            className="secondary"
            key={o.id}
            disabled={
              disabled ||
              p.primaryDone ||
              (o.target && !selected) ||
              p.usedSpecials.includes(o.id)
            }
            onClick={() =>
              onPreview({
                kind: "special",
                source: o.id,
                hex: selected || undefined,
                track: track as 0 | 1 | 2 | 3,
              })
            }
          >
            {o.label}
            {p.usedSpecials.includes(o.id)
              ? translate("ui.table-panels.8efafeff8f")
              : ""}
          </button>
        ))
      ) : (
        <p className="small muted">{translate("ui.table-panels.544859e784")}</p>
      )}
      {p.palace === "river-city" && (
        <button
          className="secondary"
          disabled={disabled || !selected}
          onClick={() => onPreview({ kind: "riverCity", hex: selected })}
        >
          {translate("ui.table-panels.6226662e37")}
        </button>
      )}
    </div>
  );
}
export function AbilityReference({
  state,
  seat,
}: {
  state: GameState;
  seat: string;
}) {
  const p = state.players[seat];
  return (
    <details className="ability-reference">
      <summary>{translate("ui.table-panels.f4466bda52")}</summary>
      <p>
        <b>{label(p.faction)}</b> · {factions[p.faction]?.description}
      </p>
      <p>
        <b>{label("bonus:" + p.bonus)}</b> · {bonusDescriptions[p.bonus]}
      </p>
      {p.palace && (
        <p>
          <b>{label(p.palace)}</b> · {palaces[p.palace]?.description}
        </p>
      )}
      {p.draftPalace && !p.palace && (
        <p>
          <b>
            {translate("ui.table-panels.2669e7a740")}
            {palaces[p.draftPalace]?.name}
          </b>{" "}
          {translate("ui.table-panels.adf7811bd5")}
          {palaces[p.draftPalace]?.description}
        </p>
      )}
      {p.competencies.map((id) => (
        <p key={id}>
          <b>{label("competency:" + id)}</b> · {competencyDescriptions[id]}
        </p>
      ))}
      {p.innovations.map((id) => (
        <p key={id}>
          <b>{label(id)}</b> · {innovations[id]?.description}
        </p>
      ))}
      <p className="muted small">{translate("ui.table-panels.e3236b0e27")}</p>
    </details>
  );
}
export function LedgerPanel({
  history,
  state,
  onExport,
  onOlder,
  onView,
  onUndo,
  seat,
  revoked = [],
  onLocate,
}: {
  history: { revision: number; events: RuleEvent[] }[];
  state: GameState;
  onExport: () => void;
  onOlder?: () => void;
  onView?: (revision: number) => void;
  onUndo?: (revision: number) => void;
  seat?: string;
  revoked?: number[];
  onLocate?: (hex: string) => void;
}) {
  const [playerFilter, setPlayerFilter] = useState("");
  const [roundFilter, setRoundFilter] = useState("");
  const [recent, setRecent] = useState(false);
  const logRound = (e: RuleEvent) =>
    ["draft", "setup", "placement"].includes(String(e.details?.phase))
      ? "0"
      : String(e.details?.round);
  const lastOwn =
    [...history]
      .reverse()
      .find(
        (h) =>
          !revoked.includes(h.revision) &&
          h.events.some((e) => e.kind === "ledger" && e.seat === seat),
      )?.revision ?? 0;
  const filtered = history.filter(
    (h) =>
      (!recent || h.revision > lastOwn) &&
      h.events.some(
        (e) =>
          (!playerFilter || e.seat === playerFilter) &&
          (!roundFilter || logRound(e) === roundFilter),
      ),
  );
  return (
    <details className="history-panel">
      <summary>
        {translate("ui.table-panels.4405178eae")}
        {history.length} {translate("ui.table-panels.6fb2840d56")}
      </summary>
      <div className="inline">
        <button className="text-button" onClick={onExport}>
          {translate("ui.table-panels.406fe23bc7")}
        </button>
        {onOlder && (
          <button className="text-button" onClick={onOlder}>
            {translate("ui.table-panels.d1a640246f")}
          </button>
        )}
      </div>
      <div className="review-filters">
        <label>
          {translate("ui.table-panels.991e63fe29")}
          <select
            value={playerFilter}
            onChange={(e) => setPlayerFilter(e.target.value)}
          >
            <option value="">{translate("ui.table-panels.527b840b81")}</option>
            {Object.values(state.players).map((p) => (
              <option key={p.seat} value={p.seat}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          {translate("ui.table-panels.4890584bb5")}
          <select
            value={roundFilter}
            onChange={(e) => setRoundFilter(e.target.value)}
          >
            <option value="">{translate("ui.table-panels.ee302df5db")}</option>
            {[0, 1, 2, 3, 4, 5, 6].map((r) => (
              <option key={r} value={r}>
                {r === 0
                  ? translate("ui.table-panels.036d65598b")
                  : translate("ui.table-panels.9db1804608", { p0: r })}
              </option>
            ))}
          </select>
        </label>
        {seat && (
          <label className="checkbox">
            <input
              type="checkbox"
              checked={recent}
              onChange={(e) => setRecent(e.target.checked)}
            />
            {translate("ui.table-panels.643bc1effc")}
          </label>
        )}
      </div>
      {[...filtered].reverse().map((h) => (
        <div
          className="history-row"
          key={h.revision}
          data-revision={h.revision}
        >
          <span>
            #{h.revision}
            {revoked.includes(h.revision) && (
              <small className="muted">
                {" "}
                {translate("ui.table-panels.f4ef706e0b")}
              </small>
            )}
          </span>
          <div>
            {h.events
              .filter((e) => e.kind === "ledger")
              .slice(0, 1)
              .map((e) => (
                <small className="muted" key="round">
                  {logRound(e) === "0"
                    ? translate("ui.table-panels.036d65598b")
                    : translate("ui.table-panels.9db1804608", {
                        p0: e.details?.round ?? "?",
                      })}{" "}
                  ·{" "}
                </small>
              ))}
            {onView && (
              <button
                className="text-button"
                onClick={() => onView(h.revision)}
              >
                {translate("ui.table-panels.ca68775942")}
              </button>
            )}
            {onUndo &&
              !revoked.includes(h.revision) &&
              h.events.some((e) => e.kind === "ledger" && e.seat === seat) && (
                <button
                  className="text-button"
                  onClick={() => onUndo(h.revision - 1)}
                >
                  {translate("ui.table-panels.64e6f93032")}
                </button>
              )}
            {h.events
              .filter((e) => e.kind !== "ledger")
              .map((e, i) => (
                <p key={i}>{eventText(e, state)}</p>
              ))}
            {h.events
              .filter((e) => e.kind === "ledger")
              .map((e, i) => (
                <div key={i}>
                  <strong>{eventText(e, state)}</strong>
                  {onLocate &&
                    eventHexes(e).map((hex) => (
                      <button
                        className="text-button log-map-link"
                        key={hex}
                        onClick={() => onLocate(hex)}
                        aria-label={translate("history.locateHex", {
                          hex: hexLabel(hex),
                        })}
                      >
                        {hexLabel(hex)} ↗
                      </button>
                    ))}
                  {(
                    (e.details?.scoreSources ?? []) as {
                      seat: string;
                      source: string;
                      points: number;
                    }[]
                  ).map((s, j) => (
                    <p className="small" key={j}>
                      {state.players[s.seat]?.name} · {label(s.source)}{" "}
                      {s.points > 0 ? "+" : ""}
                      {s.points} {translate("ui.table-panels.b75a03ace7")}
                    </p>
                  ))}
                  <div className="ledger-changes">
                    {((e.details?.changes as ResourceChange[]) ?? []).map(
                      (c) => (
                        <span
                          className={c.delta > 0 ? "gain" : "spend"}
                          key={`${c.seat}:${c.field}`}
                        >
                          {state.players[c.seat]?.name} ·{" "}
                          {fieldLabels[c.field] ?? c.field}{" "}
                          {c.delta > 0 ? "+" : ""}
                          {c.delta}{" "}
                          <small>
                            （{c.before} → {c.after}）
                          </small>
                        </span>
                      ),
                    )}
                  </div>
                </div>
              ))}
          </div>
        </div>
      ))}
      {!filtered.length && history.length > 0 && (
        <p className="muted">{translate("ui.table-panels.7ea86a6b29")}</p>
      )}
      {!history.length && (
        <p className="muted">{translate("ui.table-panels.e420312962")}</p>
      )}
    </details>
  );
}
export function BridgeChoice({
  choice,
  disabled,
  onPreview,
}: {
  choice: PendingChoice;
  disabled: boolean;
  onPreview: (a: GameAction) => void;
}) {
  const [pair, setPair] = useState("");
  return (
    <label>
      {translate("ui.table-panels.337208fe00")}
      <select
        aria-label={translate("ui.table-panels.4720a4e4dc")}
        value={pair}
        onChange={(e) => setPair(e.target.value)}
      >
        <option value="">{translate("ui.table-panels.86254abd1f")}</option>
        {choice.options
          .filter((v) => v !== "discard")
          .map((v) => (
            <option key={v} value={v}>
              {bridgeLabel(v)}
            </option>
          ))}
      </select>
      <button
        className="secondary full"
        disabled={disabled || !pair}
        onClick={() =>
          onPreview({ kind: "respond", choiceId: choice.id, option: pair })
        }
      >
        {translate("ui.table-panels.920d5a203f")}
      </button>
    </label>
  );
}
