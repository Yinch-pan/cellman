import React from "react";
import type { Player } from "../../../packages/rules/src/types";
import { t } from "./i18n";

export type TechnologyTrack = "sailing" | "terraform";
export type TechnologyControls = {
  onAdvance?: (track: TechnologyTrack) => void;
  advanceEnabled?: Partial<Record<TechnologyTrack, boolean>>;
};
export function PlayerTechnology({
  player,
  onAdvance,
  advanceEnabled,
}: { player: Player } & TechnologyControls) {
  return (
    <div className="player-technology">
      {(["sailing", "terraform"] as const).map((track) => {
        const sailing = track === "sailing";
        const max = sailing ? (player.native === "lake" ? 4 : 3) : 2;
        const current = sailing ? player.sailing : player.terraformLevel;
        const rewards = sailing
          ? [
              "—",
              t("playerTech.points", { n: 2 }),
              t("playerTech.books", { n: 2 }),
              t("playerTech.points", { n: 4 }),
              t("playerTech.books", { n: 2 }),
            ]
          : [
              "—",
              t("playerTech.books", { n: 2 }),
              t("playerTech.points", { n: 6 }),
            ];
        const name = t(`playerIncome.${track}`);
        return (
          <section key={track} aria-label={t("playerTech.track", { name })}>
            <div className="tech-track-heading">
              <span>
                {name} <b>{current}</b>
              </span>
              <small>{t("playerTech.current")}</small>
            </div>
            <ol
              className="tech-track"
              style={{
                gridTemplateColumns: `repeat(${max + 1}, minmax(0, 1fr))`,
              }}
            >
              {Array.from({ length: max + 1 }, (_, level) => (
                <li
                  key={level}
                  aria-current={level === current ? "step" : undefined}
                  className={
                    level === current
                      ? "current"
                      : level < current
                        ? "reached"
                        : ""
                  }
                >
                  {onAdvance && level === current + 1 ? (
                    <button
                      className="tech-advance"
                      type="button"
                      aria-label={t("playerTech.advanceTo", { name, level })}
                      disabled={!advanceEnabled?.[track]}
                      onClick={() => onAdvance(track)}
                    >
                      <b>{level}</b>
                      <small>{rewards[level]}</small>
                    </button>
                  ) : (
                    <>
                      <b>{level}</b>
                      <small>{rewards[level]}</small>
                    </>
                  )}
                </li>
              ))}
            </ol>
            {!sailing && (
              <p className="tech-track-note">
                {t("playerTech.spadeCost", { n: 3 - current })}
              </p>
            )}
            {current >= max && (
              <p className="tech-track-note">{t("playerTech.max")}</p>
            )}
          </section>
        );
      })}
    </div>
  );
}
