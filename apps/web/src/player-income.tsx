import React from "react";
import type { GameState, Player } from "../../../packages/rules/src/types";
import {
  incomeSources,
  type IncomeSource,
} from "../../../packages/rules/src/income";
import { t } from "./i18n";
import { PlayerTechnology, type TechnologyControls } from "./player-technology";

const resources = [
  "coins",
  "tools",
  "scholars",
  "power",
  "books",
  "science",
  "vp",
] as const;

export function PlayerIncome({
  state,
  player,
  onAdvance,
  advanceEnabled,
}: {
  state: GameState;
  player: Player;
} & TechnologyControls) {
  const rows = incomeSources(state, player);
  const total = (key: Exclude<keyof IncomeSource, "source">) =>
    rows.reduce((sum, row) => sum + (row[key] ?? 0), 0);
  const noNextIncome = state.round >= 6 || state.status === "finished";
  return (
    <section
      className="player-income"
      aria-label={t("playerIncome.label", { name: player.name })}
    >
      <PlayerTechnology
        player={player}
        onAdvance={onAdvance}
        advanceEnabled={advanceEnabled}
      />
      {noNextIncome ? (
        <p className="player-income-title">{t("playerIncome.noNext")}</p>
      ) : (
        <>
          <p
            className="player-income-title"
            title={t("playerIncome.explanation")}
          >
            {t(
              state.phase === "placement"
                ? "playerIncome.initial"
                : "playerIncome.next",
            )}
          </p>
          <div className="player-income-totals">
            {resources
              .filter(
                (key) => !["science", "vp"].includes(key) || total(key) > 0,
              )
              .map((key) => (
                <span key={key}>
                  {t(`symbol.${key}`)} <b>+{total(key)}</b>
                </span>
              ))}
          </div>
        </>
      )}
    </section>
  );
}
