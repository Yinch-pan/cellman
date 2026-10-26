import { t as translate } from "./i18n";
import { incomeSources } from "./i18n/presentation";
import React from "react";
import type { GameState, Player } from "../../../packages/rules/src/types";
import { buildingInventory } from "../../../packages/rules/src/income";
import { label } from "./api";
const names: Record<string, string> = {
  coins: translate("ui.personal-board.bbece6f829"),
  tools: translate("ui.personal-board.5ca6730d44"),
  scholars: translate("ui.personal-board.230cc1d6c8"),
  power: translate("ui.personal-board.522148a1fd"),
  books: translate("ui.personal-board.944a6ce847"),
  science: translate("ui.personal-board.e5112278cb"),
  vp: translate("ui.personal-board.b6a993c256"),
};
export function PersonalBoard({
  state,
  player,
}: {
  state: GameState;
  player: Player;
}) {
  const rows = incomeSources(state, player);
  const total: Record<string, number> = {};
  for (const row of rows)
    for (const [key, value] of Object.entries(row))
      if (key !== "source") total[key] = (total[key] ?? 0) + Number(value);
  const slots = state.shared.scholarSlots
    .flat()
    .filter((s) => s === player.seat).length;
  return (
    <section
      className="income-board"
      aria-label={translate("ui.personal-board.bd3189ae34")}
    >
      <div className="inventory-strip">
        {buildingInventory(state, player.seat).map((b) => (
          <span key={b.kind}>
            {label(b.kind)} <b>{b.remaining}</b>
            <small>
              {" "}
              / {b.total} {translate("ui.personal-board.875aee3adb")}
            </small>
          </span>
        ))}
        <span>
          {translate("ui.personal-board.a1e218ec8e")}{" "}
          <b>
            {3 -
              state.board.bridges.filter((b) => b.seat === player.seat).length}
          </b>{" "}
          / 3
        </span>
        <span>
          {translate("ui.personal-board.a16183206a")}
          <b>{Math.max(0, 7 - slots - player.resources.scholars)}</b>
        </span>
      </div>
      <details>
        <summary>
          {state.round === 6
            ? translate("ui.personal-board.7f4368129c")
            : translate("ui.personal-board.c994aa3e93")}
          <span className="income-totals">
            {Object.entries(total).map(([k, v]) => (
              <span key={k}>
                +{v} {names[k]}
              </span>
            ))}
          </span>
        </summary>
        <p className="small muted">
          {translate("ui.personal-board.649247e731")}
        </p>
        <table>
          <thead>
            <tr>
              <th>{translate("ui.personal-board.a488e93d69")}</th>
              <th>{translate("ui.personal-board.117d8f914d")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i}>
                <td>{row.source}</td>
                <td>
                  {Object.entries(row)
                    .filter(([k]) => k !== "source")
                    .map(([k, v]) => `+${v} ${names[k]}`)
                    .join(" · ")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  );
}
