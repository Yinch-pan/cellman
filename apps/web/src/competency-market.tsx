import React from "react";
import type { GameAction, GameState } from "../../../packages/rules/src/types";
import {
  applyAction,
  getAvailableChoices,
} from "../../../packages/rules/src/engine";
import { competencyDescriptions } from "./i18n/content";
import { label } from "./api";
import { t } from "./i18n";

export function CompetencyMarket({
  state,
  seat,
  disabled = true,
  onChoose,
}: {
  state: GameState;
  seat: string;
  disabled?: boolean;
  onChoose?: (action: GameAction) => void;
}) {
  const choice = getAvailableChoices(state).find(
    (c) => c.seat === seat && c.kind === "competency",
  );
  const disciplines = [
    "b1eff676a2",
    "b237c80398",
    "e9f3d305ff",
    "8cff79bb4f",
  ].map((k) => t(`ui.game.${k}`));
  const books = ["c732e4d7e3", "52f354ecfc", "3eb2456f3b", "3366645622"].map(
    (k) => t(`ui.table-experience.${k}`),
  );
  return (
    <section
      id="table-competencies"
      className="competency-market"
      tabIndex={-1}
      aria-label={t("competency.market")}
    >
      <h3>{t("competency.market")}</h3>
      <p className="small muted">{t("competency.help")}</p>
      {choice && (
        <p className="competency-prompt" role="status">
          {t("competency.chooseNow")}
        </p>
      )}
      <div className="competency-columns">
        {disciplines.map((name, color) => (
          <div key={color} className={`competency-column book${color}`}>
            <h4>
              {name} · {books[color]}
            </h4>
            {state.shared.competencies
              .filter((c) => c.color === color)
              .sort((a, b) => a.row - b.row)
              .map((c) => {
                const owners = Object.values(state.players).filter((p) =>
                  p.competencies.includes(c.id),
                );
                const action: GameAction | null = choice
                  ? { kind: "respond", choiceId: choice.id, option: c.id }
                  : null;
                const available =
                  !!action &&
                  choice!.options.includes(c.id) &&
                  applyAction(state, seat, action).ok;
                return (
                  <article
                    key={c.id}
                    className="competency-card"
                    data-owned={state.players[seat].competencies.includes(c.id)}
                    data-empty={c.remaining === 0}
                    data-selectable={available && !disabled}
                  >
                    <strong>{label("competency:" + c.id)}</strong>
                    <p>{competencyDescriptions[c.id]}</p>
                    <small>
                      {t("competency.gain", {
                        discipline: name,
                        steps: 3 - c.row,
                        books: books[color],
                        count:
                          c.row +
                          (state.players[seat].faction === "philosophers"
                            ? 1
                            : 0),
                      })}
                    </small>
                    <span>{t("competency.remaining", { n: c.remaining })}</span>
                    {choice && (
                      <button
                        className="secondary"
                        disabled={disabled || !available || !onChoose}
                        onClick={() => action && onChoose?.(action)}
                      >
                        {t("competency.take", {
                          code: label("competency:" + c.id),
                        })}
                      </button>
                    )}
                    {owners.length > 0 && (
                      <small>
                        {t("competency.owners", {
                          names: owners.map((p) => p.name).join("、"),
                        })}
                      </small>
                    )}
                  </article>
                );
              })}
          </div>
        ))}
      </div>
    </section>
  );
}
