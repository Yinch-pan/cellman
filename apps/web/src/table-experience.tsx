import { t as translate } from "./i18n";
import { hexLabel } from "./map-coordinates";
import { translateRuleText } from "./i18n/presentation";
import React from "react";
import type {
  GameState,
  PendingChoice,
  Player,
  Terrain,
} from "../../../packages/rules/src/types";
import {
  getAvailableChoices,
  getWaitingSeats,
} from "../../../packages/rules/src/engine";
import { specialOptions } from "./i18n/presentation";
import { placementOptions } from "../../../packages/rules/src/setup";
import { label } from "./api";
import { GameSymbol } from "./game-symbols";

export const terrainPresentation: Record<
  Terrain,
  { color: string; symbol: string; detail: string }
> = {
  forest: {
    color: "#287444",
    symbol: "♣",
    detail: translate("ui.table-experience.34460f3876"),
  },
  lake: {
    color: "#2875b5",
    symbol: "≈",
    detail: translate("ui.table-experience.b214cf9558"),
  },
  swamp: {
    color: "#303d45",
    symbol: "≋",
    detail: translate("ui.table-experience.8a31fd1d83"),
  },
  mountain: {
    color: "#777777",
    symbol: "△",
    detail: translate("terrain.mountain.detail"),
  },
  desert: {
    color: "#b58a13",
    symbol: "☀",
    detail: translate("terrain.desert.detail"),
  },
  plains: {
    color: "#8b542e",
    symbol: "⌁",
    detail: translate("ui.table-experience.2702331389"),
  },
  wasteland: {
    color: "#be453c",
    symbol: "◇",
    detail: translate("ui.table-experience.f81f262091"),
  },
};
export { bonusCodes as bonusTitles } from "./i18n/tile-codes";
export function choiceTitle(c: PendingChoice) {
  const titles: Record<PendingChoice["kind"], string> = {
    leech: translate("ui.table-experience.87e8858095", { p0: c.amount }),
    book: translate("ui.table-experience.1e2a4e8aa3", { p0: c.amount }),
    science: translate("ui.table-experience.0d60b8d5b0", { p0: c.amount }),
    spades: translate("ui.table-experience.dd83c3346a", { p0: c.amount }),
    bridge: translate("ui.table-experience.ecad82034e"),
    city: translate("ui.table-experience.eeb837dfb8"),
    competency: translate("ui.table-experience.bfe8aa1cd9"),
    palace: translate("palace.choose"),
    bonus: translate("pass.chooseBonus"),
    passFinish: translate("pass.finishPrompt"),
    neutral: translate("ui.table-experience.e804d84983", {
      p0: label(c.buildingKind ?? "tower"),
    }),
    freeGuild: translate("ui.table-experience.d5d47a2859"),
    freeWorkshop: translate("ui.table-experience.2d9d54c8fd"),
    buildWorkshop: translate("ui.table-experience.2160848bdf"),
    key: translate("ui.table-experience.9e6899848a", {
      p0: [
        translate("ui.table-experience.b1eff676a2"),
        translate("ui.table-experience.b237c80398"),
        translate("ui.table-experience.e9f3d305ff"),
        translate("ui.table-experience.8cff79bb4f"),
      ][c.scienceTrack ?? 0],
      p1: c.amount,
    }),
  };
  return titles[c.kind];
}
export function choiceSource(state: GameState, c: PendingChoice) {
  const source = state.players[c.source]?.name;
  if (source)
    return translate("ui.table-experience.1af0ab601d", { p0: source });
  const building = state.board.buildings[c.source];
  if (building)
    return translate("ui.table-experience.ab82999718", {
      p0:
        state.players[building.seat]?.name ??
        translate("ui.table-experience.518b1e7736"),
      p1: hexLabel(c.source),
      p2: label(building.kind),
    });
  if (c.source.startsWith("city:")) {
    const hexes = Object.entries(state.board.buildings)
      .filter(([, b]) => b.cityId === c.source)
      .map(([id]) => id);
    return translate("ui.table-experience.bb42760d71", {
      p0:
        hexes.map(hexLabel).join("、") ||
        translate("ui.table-experience.85f5161056"),
    });
  }
  return translate("ui.table-experience.4801ccb5e0", {
    p0:
      c.kind === "buildWorkshop"
        ? (c.buildHexes ?? [c.source]).map(hexLabel).join(" / ")
        : label(c.source),
  });
}
export function currentTask(state: GameState, seat: string) {
  if (state.status === "finished")
    return translate("ui.table-experience.b350e2b996");
  const mine = getAvailableChoices(state).filter((c) => c.seat === seat);
  if (mine.length) return choiceTitle(mine[0]);
  const waiting = getWaitingSeats(state);
  if (!waiting.includes(seat)) {
    return translate("ui.table-experience.fed0d64172", {
      p0: waiting.map((s) => state.players[s]?.name).join("、"),
      p1: state.pending.length
        ? translate("ui.table-experience.e2ce919bd8")
        : state.phase === "draft"
          ? translate("ui.table-experience.4b86e2c09c")
          : state.phase === "placement"
            ? translate("ui.table-experience.76d5d61166")
            : translate("ui.table-experience.94b70b7dc1"),
    });
  }
  if (state.phase === "draft")
    return state.setup.draft
      ? translate("ui.table-experience.da0aab587d")
      : translate("ui.table-experience.2e34d13599");
  if (state.phase === "placement")
    return translate("ui.table-experience.999667a6ff", {
      p0: placementOptions(state, seat).map(label).join(" / "),
    });
  if (state.players[seat].primaryDone)
    return translate("ui.table-experience.cd37495031");
  return translate("ui.table-experience.06a82b6a57");
}
export function unusedSpecials(p: Player) {
  return specialOptions(p).filter((s) => !p.usedSpecials.includes(s.id));
}
export function ChoiceQueue({
  state,
  seat,
}: {
  state: GameState;
  seat: string;
}) {
  if (!state.pending.length) return null;
  const available = new Set(getAvailableChoices(state).map((c) => c.id));
  return (
    <section
      className="choice-queue"
      aria-label={translate("ui.table-experience.d5e323f41c")}
    >
      <strong>
        {state.phase === "income"
          ? translate("ui.table-experience.fe52799bb8")
          : state.phase === "science"
            ? translate("ui.table-experience.76c3e5d4f0")
            : translate("ui.table-experience.a92dc72a86")}{" "}
        · {state.pending.length} {translate("ui.table-experience.f9d529eacd")}
      </strong>
      <ol>
        {state.pending.map((c) => (
          <li key={c.id} data-current={available.has(c.id) && c.seat === seat}>
            <span>
              {state.players[c.seat]?.name}：{choiceTitle(c)}
            </span>
            <small>
              {choiceSource(state, c)} ·{" "}
              {available.has(c.id)
                ? c.seat === seat
                  ? translate("ui.table-experience.86d7db6c80")
                  : translate("ui.table-experience.cb6833fbc0")
                : translate("ui.table-experience.661671469f")}
            </small>
          </li>
        ))}
      </ol>
    </section>
  );
}
export const cityDetails: Record<string, string> = {
  tools: translate("ui.table-experience.f64911d17b"),
  spades: translate("ui.table-experience.76e15680ae"),
  books: translate("ui.table-experience.1882c9e9f5"),
  coins: translate("ui.table-experience.d122efe9ee"),
  science: translate("ui.table-experience.f12c920101"),
  power: translate("ui.table-experience.1b0fdf4790"),
  scholar: translate("ui.table-experience.6d0276414a"),
};
export function PlayerResources({ player }: { player: Player }) {
  const r = player.resources;
  return (
    <div
      className="chip-resources"
      aria-label={translate("ui.table-experience.1d02857b7d", {
        p0: player.name,
      })}
    >
      <span title={translate("ui.table-experience.bbece6f829")}>
        <GameSymbol kind="coins" /> <b>{r.coins}</b>
        <small>{translate("ui.table-experience.bbece6f829")}</small>
      </span>
      <span title={translate("ui.table-experience.5ca6730d44")}>
        <GameSymbol kind="tools" /> <b>{r.tools}</b>
        <small>{translate("ui.table-experience.5ca6730d44")}</small>
      </span>
      <span title={translate("ui.table-experience.230cc1d6c8")}>
        <GameSymbol kind="scholars" /> <b>{r.scholars}</b>
        <small>{translate("ui.table-experience.230cc1d6c8")}</small>
      </span>
      <span title={translate("ui.table-experience.dffc39f38f")}>
        <GameSymbol kind="key" />{" "}
        <b>{Math.max(0, player.keys - player.keysUsed)}</b>
        <small>{translate("ui.table-experience.6d132744a9")}</small>
      </span>
      <div
        className="chip-bowls"
        aria-label={translate("ui.table-experience.220708f94c", {
          p0: r.power.join(" / "),
        })}
      >
        {r.power.map((n, i) => (
          <span key={i}>
            <small>{["Ⅰ", "Ⅱ", "Ⅲ"][i]}</small>
            <b>{n}</b>
          </span>
        ))}
      </div>
      <div className="chip-books">
        {r.books.map((n, i) => (
          <span
            key={i}
            className={`book book${i}`}
            title={translate("ui.table-experience.f741ab42be", {
              p0: [
                translate("ui.table-experience.c732e4d7e3"),
                translate("ui.table-experience.52f354ecfc"),
                translate("ui.table-experience.3eb2456f3b"),
                translate("ui.table-experience.3366645622"),
              ][i],
              p1: n,
            })}
          >
            {n}
          </span>
        ))}
      </div>
    </div>
  );
}
export function FinalScores({ state }: { state: GameState }) {
  const scores = [...state.scores].sort((a, b) => b.total - a.total);
  return (
    <section
      className="action-panel final-scores"
      aria-label={translate("ui.table-experience.f729ac0040")}
    >
      <h2>
        {state.matchResult
          ? translate("ui.table-experience.96739aa233")
          : translate("ui.table-experience.2ca0069ec3")}
      </h2>
      {state.matchResult?.reason === "consensus" ? (
        <p>{translate("endGame.effect")}</p>
      ) : state.matchResult ? (
        <p>
          {translate("ui.table-experience.6b6cacca64")}
          {state.matchResult.reason === "inactive"
            ? translate("ui.table-experience.c9ef7e0eb2")
            : translate("ui.table-experience.7f640c2049")}
          {translate("ui.table-experience.3a70f74d86")}
        </p>
      ) : (
        <p>{translate("ui.table-experience.bc7bb8d451")}</p>
      )}
      {scores.map((score) => {
        const p = state.players[score.seat],
          r = p.resources;
        const rank = scores.filter((s) => s.total > score.total).length + 1;
        const resources =
          r.coins +
          r.tools +
          r.scholars +
          r.books.reduce((a, b) => a + b, 0) +
          r.power[2] +
          Math.floor(r.power[1] / 2);
        return (
          <details key={score.seat} open>
            <summary>
              <span>
                {translate("ui.table-experience.9552fe3bd3")}
                {rank} {translate("ui.table-experience.f3ddfbdb51")}
                {p.name}
              </span>
              <b>
                {score.total} {translate("ui.table-experience.b75a03ace7")}
              </b>
            </summary>
            <div className="score-items">
              {score.items.map((item) => (
                <p key={item.reason}>
                  <span>{translateRuleText(item.reason)}</span>
                  <b>
                    {item.points} {translate("ui.table-experience.b75a03ace7")}
                  </b>
                </p>
              ))}
            </div>
            <p className="small">
              {translate("ui.table-experience.03f418b976")}
              {r.coins}
              {translate("ui.table-experience.b4ad0574a6")}
              {r.tools}
              {translate("ui.table-experience.a740356fa4")}
              {r.scholars}
              {translate("ui.table-experience.5461d7d317")}{" "}
              {r.books.reduce((a, b) => a + b, 0)}
              {translate("ui.table-experience.f281b0f439")}
              {r.power[2]}
              {translate("ui.table-experience.b360102bce")}
              {Math.floor(r.power[1] / 2)}＝{resources}
              {translate("ui.table-experience.59c0cd80bc")}
              {resources % 5}。
            </p>
          </details>
        );
      })}
      <a href="#/stats">{translate("ui.table-experience.3bea6f921d")}</a>
    </section>
  );
}
