import React from "react";
import type { GameState } from "../../../packages/rules/src/types";
import { t as translate } from "./i18n";

const roundNames: Record<string, string> = {
  "workshop-law": translate("ui.game.88d52c81cb"),
  "workshop-bank": translate("ui.game.88d52c81cb"),
  "guild-law": translate("ui.game.c8d75c5db1"),
  "guild-medicine": translate("ui.game.c8d75c5db1"),
  "school-bank": translate("ui.game.e945511f3d"),
  "big-medicine": translate("ui.game.9b69738ae8"),
  "big-bank": translate("ui.game.9b69738ae8"),
  "spade-engineering": translate("ui.game.ee093150dc"),
  "science-medicine": translate("ui.game.fce4bcc21d"),
  "city-engineering": translate("ui.game.019889d261"),
  "advance-engineering": translate("ui.game.34822c83e7"),
  "innovation-law": translate("ui.game.15ae8c892f"),
};

const finalRoundNames: Record<string, string> = {
  workshop: translate("ui.game.88d52c81cb"),
  guild: translate("ui.game.c8d75c5db1"),
  school: translate("ui.game.e945511f3d"),
  border: translate("round.finalBorder"),
};

export function RoundRibbon({ state }: { state: GameState }) {
  return (
    <div className="round-ribbon" aria-label={translate("round.scoring")}>
      {state.setup.roundTiles.map((id, i) => (
        <div key={i} className={state.round === i + 1 ? "current" : ""}>
          <small>
            {translate("ui.game.9552fe3bd3")}
            {i + 1} {translate("ui.game.c3af8aafb1")}
          </small>
          <strong>{roundNames[id] ?? id}</strong>
          {i === 5 && state.setup.finalRoundTile && (
            <div className="final-round-score">
              <small>{translate("round.additional")}</small>
              <strong>
                {finalRoundNames[state.setup.finalRoundTile] ??
                  state.setup.finalRoundTile}
              </strong>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
