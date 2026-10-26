import { t as translate } from "./i18n";
import React from "react";
import type { GameState } from "../../../packages/rules/src/types";
export function jumpToTable(id: string) {
  const target = document.getElementById(id);
  target?.scrollIntoView({ block: "start", behavior: "instant" });
  target?.focus({ preventScroll: true });
}
export function TableHelp({ state }: { state: GameState }) {
  const setup = ["draft", "setup", "placement"].includes(state.phase);
  return (
    <details className="table-help" id="table-help">
      <summary>{translate("ui.table-help.36278c7bd4")}</summary>
      <p>
        <strong>
          {setup
            ? translate("ui.table-help.3bd61a1ef9")
            : translate("ui.table-help.82d3dd2876")}
        </strong>
        ：
        {state.phase === "draft"
          ? translate("ui.table-help.31f2a1ba43")
          : setup
            ? translate("ui.table-help.4df37ef8ef")
            : translate("ui.table-help.0a3942dfc7")}
      </p>
      <ol>
        <li>{translate("ui.table-help.3b6e17291f")}</li>
        <li>{translate("ui.table-help.8a9ce64113")}</li>
        <li>{translate("ui.table-help.416b156d70")}</li>
        <li>{translate("ui.table-help.400c84dcad")}</li>
        <li>{translate("ui.table-help.f3f32ee4d9")}</li>
      </ol>
      <p>{translate("ui.table-help.9399178758")}</p>
      <p className="small">{translate("ui.table-help.947855855b")}</p>
      <a
        className="text-button"
        href="https://www.feuerland-spiele.de/fileadmin/game/Age_of_Innovation/Age_of_Innovation_rules_EN_V1-1_low.pdf"
        target="_blank"
        rel="noreferrer"
      >
        {translate("ui.table-help.d62ac326a3")}
      </a>
    </details>
  );
}
