import React from "react";
import type { GameState } from "../../../packages/rules/src/types";
import type { BoardIntent } from "./board-actions";
import { innovations } from "./i18n/content";
import { t } from "./i18n";
import { label } from "./api";

export function BookMarket({
  state,
  seat,
  disabled,
  onIntent,
  section = "all",
  activeIntent,
  renderEditor,
}: {
  section?: "all" | "books" | "innovations";
  state: GameState;
  seat: string;
  disabled: boolean;
  onIntent: (intent: Omit<BoardIntent, "nonce">) => void;
  activeIntent?: BoardIntent | null;
  renderEditor?: (kind: BoardIntent["kind"]) => React.ReactNode;
}) {
  const player = state.players[seat];
  const bookNames = [
    "c732e4d7e3",
    "52f354ecfc",
    "3eb2456f3b",
    "3366645622",
  ].map((key) => t(`ui.table-experience.${key}`));
  const total =
    5 +
    (player.innovations.length === 1 && player.native === "wasteland"
      ? 0
      : player.innovations.length);
  const bookActions: Record<string, string> = {
    power: "538cb7c542",
    science: "fd20aa4d0e",
    coins: "58e38bac25",
    upgrade: "17a96b3917",
    "guild-score": "181aed2fe0",
    spades: "b48a468b27",
  };
  return (
    <div className="book-market">
      {section !== "innovations" && (
        <section
          id="table-book-actions"
          tabIndex={-1}
          aria-label={t("market.publicBooks")}
        >
          <h3>{t("market.publicBooks")}</h3>
          <p className="small muted">{t("market.bookRule")}</p>
          <div className="board-tile-grid public-book-grid">
            {state.shared.bookActions.map((id) => {
              const used = state.shared.usedActions.includes(`book:${id}`);
              return (
                <button
                  key={id}
                  className="board-tile public-book-card"
                  data-used={used}
                  data-table-action={`book:${id}`}
                  aria-expanded={
                    activeIntent?.kind === "book" && activeIntent.id === id
                  }
                  aria-controls={
                    activeIntent?.kind === "book" && activeIntent.id === id
                      ? "table-action-editor"
                      : undefined
                  }
                  disabled={disabled || player.primaryDone || used}
                  onClick={() => onIntent({ kind: "book", id })}
                >
                  <strong>
                    {t("ui.board-actions.a628fb195d")}{" "}
                    {bookActions[id]
                      ? t(`ui.board-actions.${bookActions[id]}`)
                      : label(id)}
                  </strong>
                  <span className="market-status">
                    {t(used ? "market.used" : "market.available")}
                  </span>
                  <small>{t("ui.board-actions.db71191bc4")}</small>
                </button>
              );
            })}
          </div>
          {renderEditor?.("book")}
        </section>
      )}
      {section !== "books" && (
        <section
          id="table-innovations"
          tabIndex={-1}
          aria-label={t("market.innovations")}
        >
          <h3>{t("market.innovations")}</h3>
          <p className="small muted">{t("market.innovationRule")}</p>
          <div className="board-tile-grid innovation-market-grid">
            {state.setup.innovations.map((id, index) => {
              const owner = Object.values(state.players).find((p) =>
                p.innovations.includes(id),
              );
              const available = state.shared.innovations.includes(id);
              const required =
                state.setup.innovationCosts?.[id] ??
                [0, 1, 2, 3].map((i) => (i === index % 4 ? 2 : 0));
              return (
                <button
                  key={id}
                  className="board-tile innovation-card"
                  data-taken={!available}
                  data-table-action={`innovation:${id}`}
                  aria-expanded={
                    activeIntent?.kind === "innovation" &&
                    activeIntent.id === id
                  }
                  aria-controls={
                    activeIntent?.kind === "innovation" &&
                    activeIntent.id === id
                      ? "table-action-editor"
                      : undefined
                  }
                  disabled={
                    disabled ||
                    player.primaryDone ||
                    !available ||
                    player.innovations.length >= 3
                  }
                  onClick={() => onIntent({ kind: "innovation", id })}
                >
                  <strong>{innovations[id]?.name ?? label(id)}</strong>
                  <small>{innovations[id]?.description}</small>
                  {available ? (
                    <>
                      <span>
                        {t("market.price", {
                          books: total,
                          coins: player.palace ? 0 : 5,
                        })}
                      </span>
                      <span className="innovation-requirements">
                        {t("market.includes")}
                        {required.map(
                          (n, i) =>
                            n > 0 && (
                              <span
                                key={i}
                                className={`book-requirement book${i}`}
                              >
                                {bookNames[i]} ×{n}
                              </span>
                            ),
                        )}
                      </span>
                      <span className="market-status">
                        {t(
                          player.innovations.length >= 3
                            ? "market.limit"
                            : "market.choose",
                        )}
                      </span>
                    </>
                  ) : (
                    <span className="market-status">
                      {owner
                        ? t("market.takenBy", { name: owner.name })
                        : t("market.taken")}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          {renderEditor?.("innovation")}
        </section>
      )}
    </div>
  );
}
