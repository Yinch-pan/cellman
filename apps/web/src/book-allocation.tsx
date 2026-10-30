import React, { useState } from "react";
import type {
  GameAction,
  PendingChoice,
} from "../../../packages/rules/src/types";
import { t } from "./i18n";
import "./book-allocation.css";

export function BookAllocation({
  choices,
  disabled,
  onPreview,
}: {
  choices: PendingChoice[];
  disabled: boolean;
  onPreview: (action: GameAction) => void;
}) {
  const [counts, setCounts] = useState([0, 0, 0, 0]);
  const total = counts.reduce((sum, count) => sum + count, 0);
  const names = [
    t("ui.game.61e85f6baf"),
    t("ui.game.56541f587b"),
    t("ui.game.9fb0d52f93"),
    t("ui.game.6575322492"),
  ];
  return (
    <section className="book-allocation" aria-label={t("bookAllocation.title")}>
      <p role="status">
        {t("bookAllocation.progress", {
          selected: total,
          total: choices.length,
          remaining: choices.length - total,
        })}
      </p>
      <div className="choice-buttons book-allocation-colors">
        {names.map((name, color) => (
          <div className={`book-allocation-color book${color}`} key={color}>
            <strong>{name}</strong>
            <div className="book-allocation-counter">
              <button
                type="button"
                aria-label={t("bookAllocation.decrease", { color: name })}
                disabled={disabled || counts[color] === 0}
                onClick={() =>
                  setCounts(counts.map((n, i) => (i === color ? n - 1 : n)))
                }
              >
                −
              </button>
              <output aria-label={t("bookAllocation.count", { color: name })}>
                {counts[color]}
              </output>
              <button
                type="button"
                aria-label={name}
                disabled={
                  disabled ||
                  total >= choices.length ||
                  !choices[0].options.includes(String(color))
                }
                onClick={() =>
                  setCounts(counts.map((n, i) => (i === color ? n + 1 : n)))
                }
              >
                +
              </button>
            </div>
          </div>
        ))}
      </div>
      <p className="small muted">{t("bookAllocation.partial")}</p>
      <div className="book-allocation-actions">
        <button
          className="primary"
          disabled={disabled || total === 0 || total > choices.length}
          onClick={() => {
            const colors = counts.flatMap(
              (count, color) =>
                Array(count).fill(String(color)) as ("0" | "1" | "2" | "3")[],
            );
            onPreview({
              kind: "collectBooks",
              selections: colors.map((option, i) => ({
                choiceId: choices[i].id,
                option,
              })),
            });
          }}
        >
          {t("ui.game.9ebe36f8cf")}
        </button>
        <button
          className="secondary"
          disabled={disabled || total === 0}
          onClick={() => setCounts([0, 0, 0, 0])}
        >
          {t("bookAllocation.cancel")}
        </button>
      </div>
    </section>
  );
}
