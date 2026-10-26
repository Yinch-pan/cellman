import { t as translate } from "./i18n";
import React from "react";
import { BookMarket } from "./book-market";
import { CompetencyMarket } from "./competency-market";
import type {
  GameAction,
  GameState,
  Discipline,
} from "../../../packages/rules/src/types";
import { applyAction } from "../../../packages/rules/src/engine";
import { bonusDescriptions } from "./i18n/content";
import { specialOptions } from "./i18n/presentation";
import { label, RequestError } from "./api";
export interface BoardIntent {
  kind: "power" | "book" | "innovation" | "build";
  id?: string;
  nonce: number;
}
export function BoardActions({
  state,
  seat,
  disabled,
  onPreview,
  onIntent,
  activeIntent,
  renderEditor,
  choiceDisabled = disabled,
}: {
  state: GameState;
  seat: string;
  disabled: boolean;
  onPreview: (a: GameAction) => void;
  onIntent: (i: Omit<BoardIntent, "nonce">) => void;
  activeIntent?: BoardIntent | null;
  renderEditor?: (kind: BoardIntent["kind"]) => React.ReactNode;
  choiceDisabled?: boolean;
}) {
  const p = state.players[seat];
  const direct = (title: string, action: GameAction) => {
    const result = applyAction(state, seat, action);
    const reason = result.ok ? "" : new RequestError(result.error.code).message;
    return (
      <button
        key={title}
        className="board-tile"
        disabled={disabled || !result.ok}
        title={reason || title}
        onClick={() => onPreview(action)}
      >
        <strong>{title}</strong>
        {reason && <small>{reason}</small>}
      </button>
    );
  };
  return (
    <section
      className="board-actions"
      aria-label={translate("ui.board-actions.10429500e2")}
    >
      <section
        id="table-public-actions"
        tabIndex={-1}
        className="public-actions"
      >
        <h3>{translate("market.publicActions")}</h3>
        <h4>{translate("ui.board-actions.93530554d7")}</h4>
        <div className="board-tile-grid">
          {Object.entries({
            scholar: [3, translate("ui.board-actions.4d30b0e728")],
            bridge: [3, translate("ui.board-actions.dcf6c4fe40")],
            tools: [4, translate("ui.board-actions.0b9845024c")],
            coins: [4, translate("ui.board-actions.fb411e98fe")],
            spade: [4, translate("ui.board-actions.683515bf85")],
            spades: [6, translate("ui.board-actions.901d6f3c8d")],
          }).map(([id, [cost, reward]]) => {
            const price = Number(cost) - (p.faction === "illusionists" ? 1 : 0);
            const used = state.shared.usedActions.includes(id),
              lack = p.resources.power[2] < price;
            return (
              <button
                className="board-tile"
                key={id}
                data-table-action={`power:${id}`}
                aria-expanded={
                  activeIntent?.kind === "power" && activeIntent.id === id
                }
                aria-controls={
                  activeIntent?.kind === "power" && activeIntent.id === id
                    ? "table-action-editor"
                    : undefined
                }
                disabled={disabled || p.primaryDone || used}
                aria-label={translate("ui.board-actions.ffe425b271", {
                  p0: reward,
                })}
                onClick={() =>
                  ["scholar", "tools", "coins"].includes(id) && !lack
                    ? onPreview({ kind: "powerAction", id })
                    : onIntent({ kind: "power", id })
                }
              >
                <strong>
                  {price} {translate("ui.board-actions.b981de7fa8")}
                  {reward}
                </strong>
                <small>
                  {used
                    ? translate("ui.board-actions.f2f683d25a")
                    : lack
                      ? translate("ui.board-actions.5f3a0074e0")
                      : translate("ui.board-actions.8689c9b993")}
                </small>
              </button>
            );
          })}
        </div>
        {renderEditor?.("power")}
        <BookMarket
          section="books"
          state={state}
          seat={seat}
          disabled={disabled}
          onIntent={onIntent}
          activeIntent={activeIntent}
          renderEditor={renderEditor}
        />
      </section>
      <h3>{translate("ui.board-actions.1e5ab81c90")}</h3>
      <div className="scholar-board">
        {[
          translate("ui.board-actions.b1eff676a2"),
          translate("ui.board-actions.b237c80398"),
          translate("ui.board-actions.e9f3d305ff"),
          translate("ui.board-actions.8cff79bb4f"),
        ].map((name, t) => (
          <div key={name}>
            <strong>{name}</strong>
            {[0, 1, 2, 3, null].map((slot) => {
              const owner =
                slot === null ? null : state.shared.scholarSlots[t][slot];
              const action: GameAction = {
                kind: "scholar",
                track: t as Discipline,
                slot,
              };
              const result = applyAction(state, seat, action);
              return (
                <button
                  key={String(slot)}
                  title={
                    !result.ok
                      ? new RequestError(result.error.code).message
                      : translate("ui.board-actions.95ad8a65f7")
                  }
                  disabled={disabled || !result.ok}
                  onClick={() => onPreview(action)}
                  aria-label={`${name} ${slot === null ? translate("ui.board-actions.d803de198c") : translate("ui.board-actions.313facfcac", { p0: slot + 1, p1: slot === 0 ? 3 : 2 })}`}
                >
                  {owner
                    ? state.players[owner].name
                    : slot === null
                      ? "↩ +1"
                      : `+${slot === 0 ? 3 : 2}`}
                </button>
              );
            })}
          </div>
        ))}
      </div>
      <h3>{translate("ui.board-actions.4aa1a3c674")}</h3>
      <div className="board-tile-grid">
        {direct(
          translate("ui.board-actions.1bf02e45b3", {
            p0: p.sailing,
            p1: p.sailing + 1,
          }),
          {
            kind: "advance",
            track: "sailing",
          },
        )}
        {direct(
          translate("ui.board-actions.439f8a5a90", {
            p0: p.terraformLevel,
            p1: p.terraformLevel + 1,
          }),
          {
            kind: "advance",
            track: "terraform",
          },
        )}
      </div>
      <BookMarket
        section="innovations"
        state={state}
        seat={seat}
        disabled={disabled}
        onIntent={onIntent}
        activeIntent={activeIntent}
        renderEditor={renderEditor}
      />
      <CompetencyMarket
        state={state}
        seat={seat}
        disabled={choiceDisabled}
        onChoose={onPreview}
      />
      <h3>{translate("ui.board-actions.d89e8bb520")}</h3>
      <p className="small muted">{bonusDescriptions[p.bonus]}</p>
      <div className="board-tile-grid">
        {specialOptions(p)
          .filter((o) => !o.target && !o.track)
          .map((o) => direct(o.label, { kind: "special", source: o.id }))}
      </div>
    </section>
  );
}
