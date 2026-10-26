import React from "react";
import type { GameState } from "../../../packages/rules/src/types";
import { terrainPresentation } from "./table-experience";
import { GameSymbol, type SymbolKind } from "./game-symbols";
import { t } from "./i18n";

export const sciencePower: Record<number, number> = { 3: 1, 5: 2, 7: 2, 12: 3 };
export const scienceIncome: { kind: SymbolKind; amount: number }[] = [
  { kind: "coins", amount: 3 },
  { kind: "power", amount: 6 },
  { kind: "tools", amount: 1 },
  { kind: "scholars", amount: 3 },
];
export const roundScienceRewards: Record<
  string,
  [number, number, SymbolKind, number]
> = {
  "workshop-law": [1, 3, "scholars", 1],
  "workshop-bank": [0, 3, "power", 4],
  "guild-law": [1, 3, "books", 1],
  "guild-medicine": [3, 4, "spades", 1],
  "city-engineering": [2, 4, "spades", 1],
  "school-bank": [0, 1, "coins", 1],
  "big-medicine": [3, 2, "tools", 1],
  "big-bank": [0, 2, "tools", 1],
  "spade-engineering": [2, 1, "coins", 1],
  "science-medicine": [3, 3, "books", 1],
  "advance-engineering": [2, 3, "scholars", 1],
  "innovation-law": [1, 2, "power", 3],
};
export function ScienceBoard({
  state,
  seat,
}: {
  state: GameState;
  seat: string;
}) {
  const player = state.players[seat];
  const names = ["b1eff676a2", "b237c80398", "e9f3d305ff", "8cff79bb4f"].map(
    (k) => t(`ui.game.${k}`),
  );
  return (
    <section
      className="science-panel illustrated-science"
      aria-label={t("science.board")}
    >
      <div className="section-heading">
        <h3>{t("science.board")}</h3>
        <span>
          <GameSymbol kind="key" amount={player.keys - player.keysUsed} />{" "}
          {t("science.availableKeys")}
        </span>
      </div>
      <div className="science-legend">
        <span>
          <GameSymbol kind="power" /> {t("science.crossing")}
        </span>
        <span>↻ {t("science.income")}</span>
        <span>
          <GameSymbol kind="key" /> {t("science.gate")}
        </span>
      </div>
      <div className="science-scroll" tabIndex={0}>
        {names.map((name, track) => (
          <div className="science-row" key={name} data-discipline={track}>
            <strong>{name}</strong>
            <div className="track">
              {Array.from({ length: 13 }, (_, level) => {
                const occupants = Object.values(state.players).filter(
                  (p) => p.science[track] === level,
                );
                const reward = scienceIncome[track];
                return (
                  <span
                    className={`${level === 8 ? "key-step" : ""} ${player.science[track] === level ? "own-level" : ""}`}
                    key={level}
                    data-level={level}
                  >
                    <b>{level}</b>
                    <span className="science-space-reward">
                      {sciencePower[level] && (
                        <GameSymbol kind="power" amount={sciencePower[level]} />
                      )}
                      {level === 8 && <GameSymbol kind="key" amount={-1} />}
                      {level === 9 && (
                        <span title={t("science.income")}>
                          <small>↻</small>
                          <GameSymbol {...reward} />
                        </span>
                      )}
                    </span>
                    <span className="science-markers">
                      {occupants.map((p) => (
                        <i
                          key={p.seat}
                          title={p.name}
                          aria-label={p.name}
                          style={{
                            background: terrainPresentation[p.native].color,
                          }}
                        >
                          {state.turnOrder.indexOf(p.seat) + 1}
                        </i>
                      ))}
                    </span>
                    {level === 12 && (
                      <small className="science-exclusive">
                        {t("science.exclusive")}
                      </small>
                    )}
                  </span>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      {player.faction === "blessed" && (
        <p className="small muted">{t("science.blessed")}</p>
      )}
      <div className="science-round-rewards">
        {state.setup.roundTiles.map((id, index) => {
          const reward = roundScienceRewards[id];
          if (!reward) return null;
          const [track, step, kind, amount] = reward;
          const total =
            index === 5
              ? 0
              : Math.floor(
                  (player.science[track] +
                    (player.faction === "blessed" ? 3 : 0)) /
                    step,
                ) * amount;
          return (
            <div
              key={index}
              className={index + 1 === state.round ? "current" : ""}
            >
              <b>{t("science.round", { n: index + 1 })}</b>
              {index === 5 ? (
                <small>{t("science.final")}</small>
              ) : (
                <>
                  <span>
                    {names[track]} {step} →{" "}
                    <GameSymbol kind={kind} amount={amount} />
                  </span>
                  <small>
                    {index + 1 < state.round ? (
                      t("science.settled")
                    ) : (
                      <>
                        {t("science.currentReward")}{" "}
                        <GameSymbol kind={kind} amount={total} />
                      </>
                    )}
                  </small>
                </>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
