import React, { useEffect, useRef, useState } from "react";
import type {
  GameAction,
  GameState,
  Discipline,
} from "../../../packages/rules/src/types";
import { applyAction } from "../../../packages/rules/src/engine";
import { officialLarge, bridgeSites } from "../../../packages/rules/src/map";
import { validBridgeGeometry } from "../../../packages/rules/src/actions/bridge";
import {
  GuidedAction,
  suggestBooks,
  terraformTargets,
} from "./action-guidance";
import { SpadesForm } from "./spades-form";
import type { BoardIntent } from "./board-actions";
import { innovations } from "./i18n/content";
import { t } from "./i18n";

const bookCosts: Record<string, number> = {
  power: 1,
  science: 1,
  coins: 2,
  upgrade: 2,
  "guild-score": 2,
  spades: 3,
};
const bookLabels: Record<string, string> = {
  power: "538cb7c542",
  science: "73a18ad965",
  coins: "58e38bac25",
  upgrade: "17a96b3917",
  "guild-score": "181aed2fe0",
  spades: "b48a468b27",
};
const powerLabels: Record<string, string> = {
  coins: "a36dd3e1ce",
  tools: "f694d01cb5",
  scholar: "8351691754",
  spade: "509960a119",
  spades: "ecbba994ba",
  bridge: "40af3d3dd3",
};
export function tableActionTitle(intent: BoardIntent) {
  if (intent.kind === "innovation")
    return innovations[intent.id!]?.name ?? intent.id!;
  return t(
    `ui.game.${(intent.kind === "book" ? bookLabels : powerLabels)[intent.id!]}`,
  );
}
export function tableBookPayment(
  state: GameState,
  seat: string,
  intent: BoardIntent,
) {
  const p = state.players[seat];
  const total =
    intent.kind === "innovation"
      ? 5 +
        (p.innovations.length === 1 && p.native === "wasteland"
          ? 0
          : p.innovations.length)
      : (bookCosts[intent.id!] ?? 0);
  const required =
    intent.kind === "innovation"
      ? (state.setup.innovationCosts?.[intent.id!] ??
        [0, 1, 2, 3].map((i) =>
          i === state.setup.innovations.indexOf(intent.id!) % 4 ? 2 : 0,
        ))
      : [0, 0, 0, 0];
  return {
    total,
    required,
    suggested: suggestBooks(p.resources.books, required, total),
  };
}
export function tableActionTargets(
  state: GameState,
  seat: string,
  intent: BoardIntent,
) {
  const p = state.players[seat];
  const result = new Set<string>();
  if (intent.kind === "book" && intent.id === "upgrade") {
    const books = tableBookPayment(state, seat, intent).suggested;
    if (books)
      for (const hex of Object.keys(state.board.buildings)) {
        if (
          applyAction(state, seat, {
            kind: "bookAction",
            id: "upgrade",
            books,
            hex,
          }).ok
        )
          result.add(hex);
      }
  } else if (
    intent.kind === "power" &&
    ["spade", "spades"].includes(intent.id!)
  ) {
    for (const hex of Object.keys(officialLarge.hexes)) {
      if (
        terraformTargets(state, hex, p.native).some((terrain) =>
          [
            undefined,
            ...(p.faction === "moles" ? ["tunnel" as const] : []),
            ...(p.palace === "flight" ? ["flight" as const] : []),
          ].some(
            (travel) =>
              applyAction(state, seat, {
                kind: "powerAction",
                id: intent.id!,
                hex,
                terrain,
                build: false,
                additional: [],
                travel,
              }).ok,
          ),
        )
      )
        result.add(hex);
    }
  }
  return result;
}

export function TableActionEditor({
  state,
  seat,
  intent,
  selected,
  stepwise,
  disabled,
  error,
  preview,
  onAction,
  onCancel,
  onPickMap,
}: {
  state: GameState;
  seat: string;
  intent: BoardIntent;
  selected: string;
  stepwise: boolean;
  disabled: boolean;
  error?: string;
  preview?: React.ReactNode;
  onAction: (action: GameAction) => void;
  onCancel: () => void;
  onPickMap: () => void;
}) {
  const p = state.players[seat];
  const payment = tableBookPayment(state, seat, intent);
  const [books, setBooks] = useState<[number, number, number, number]>(
    () => payment.suggested ?? [0, 0, 0, 0],
  );
  const [track, setTrack] = useState(0);
  const [bridge, setBridge] = useState("");
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
    ref.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, []);
  const isSpades =
    intent.kind === "power" && ["spade", "spades"].includes(intent.id!);
  const mapTarget =
    isSpades || (intent.kind === "book" && intent.id === "upgrade");
  const ids = Object.keys(officialLarge.hexes);
  const bridges =
    intent.kind === "power" && intent.id === "bridge"
      ? (p.faction === "moles"
          ? ids.flatMap((a) =>
              ids
                .filter((b) => a < b && validBridgeGeometry(a, b, true))
                .map((b) => [a, b]),
            )
          : bridgeSites
        ).filter(
          ([a, b]) =>
            (state.board.buildings[a]?.seat === seat ||
              state.board.buildings[b]?.seat === seat) &&
            !state.board.bridges.some(
              (v) => [v.a, v.b].includes(a) && [v.a, v.b].includes(b),
            ),
        )
      : [];
  let action: GameAction | null = null;
  if (intent.kind === "innovation")
    action = { kind: "innovation", id: intent.id!, books };
  else if (intent.kind === "book" && (intent.id !== "upgrade" || selected))
    action = {
      kind: "bookAction",
      id: intent.id!,
      books,
      track: track as Discipline,
      hex: selected || undefined,
    };
  else if (
    intent.kind === "power" &&
    !isSpades &&
    (intent.id !== "bridge" || bridge)
  )
    action = {
      kind: "powerAction",
      id: intent.id!,
      ...(intent.id === "bridge"
        ? { a: bridge.split(",")[0], b: bridge.split(",")[1] }
        : {}),
    };
  const title =
    intent.kind === "power" && p.faction === "illusionists"
      ? tableActionTitle(intent).replace(/^\d+/, (n) => String(Number(n) - 1))
      : tableActionTitle(intent);
  return (
    <section
      ref={ref}
      id="table-action-editor"
      className="table-action-editor"
      tabIndex={-1}
      aria-label={title}
      onKeyDown={(e) => {
        if (e.key === "Escape" && !disabled) {
          e.preventDefault();
          onCancel();
        }
      }}
    >
      <header>
        <h4>{title}</h4>
        <button
          type="button"
          className="text-button"
          disabled={disabled}
          onClick={onCancel}
        >
          {t("tableAction.cancel")}
        </button>
      </header>
      {error && (
        <p role="alert" className="unavailable">
          {error}
        </p>
      )}
      {preview || (
        <fieldset disabled={disabled}>
          {mapTarget && (
            <div className="table-target-picker">
              <p role="status">
                {selected
                  ? t("tableAction.selected", { hex: selected })
                  : t("tableAction.noTarget")}
              </p>
              <button className="secondary" onClick={onPickMap}>
                {t(
                  selected
                    ? "tableAction.changeTarget"
                    : "tableAction.pickTarget",
                )}
              </button>
            </div>
          )}
          {intent.kind === "power" && intent.id === "bridge" && (
            <label>
              {t("ui.game.a386240a3f")}
              <select
                value={bridge}
                onChange={(e) => setBridge(e.target.value)}
              >
                <option value="">{t("ui.game.34b87dc661")}</option>
                {bridges.map(([a, b]) => (
                  <option key={a + b} value={a + "," + b}>
                    {a} ↔ {b}
                  </option>
                ))}
              </select>
            </label>
          )}
          {intent.kind === "innovation" && (
            <p className="small">{innovations[intent.id!]?.description}</p>
          )}
          {intent.kind !== "power" && (
            <>
              <p className="small">
                {t("tableAction.payment", { n: payment.total })}
                {intent.kind === "innovation" &&
                  t("tableAction.coins", { n: p.palace ? 0 : 5 })}
              </p>
              <div className="book-payment">
                {books.map((n, i) => (
                  <label key={i} className={`book${i}`}>
                    <span>
                      {
                        [
                          "c732e4d7e3",
                          "52f354ecfc",
                          "3eb2456f3b",
                          "3366645622",
                        ].map((k) => t(`ui.table-experience.${k}`))[i]
                      }{" "}
                      ·{" "}
                      {t("tableAction.available", { n: p.resources.books[i] })}
                      {payment.required[i] > 0 && (
                        <small>
                          {t("tableAction.minimum", { n: payment.required[i] })}
                        </small>
                      )}
                    </span>
                    <input
                      type="number"
                      min={0}
                      max={p.resources.books[i]}
                      step={1}
                      value={n}
                      onChange={(e) =>
                        setBooks(
                          (v) =>
                            v.map((x, j) =>
                              i === j
                                ? Math.max(
                                    0,
                                    Math.min(
                                      p.resources.books[i],
                                      Math.trunc(Number(e.target.value) || 0),
                                    ),
                                  )
                                : x,
                            ) as typeof books,
                        )
                      }
                    />
                  </label>
                ))}
              </div>
              <div className="table-payment-summary">
                <span role="status">
                  {t("tableAction.total", {
                    n: books.reduce((a, b) => a + b, 0),
                    total: payment.total,
                  })}
                </span>
                <button
                  className="text-button"
                  disabled={!payment.suggested}
                  onClick={() =>
                    payment.suggested && setBooks(payment.suggested)
                  }
                >
                  {t("ui.game.1c93f83617")}
                </button>
              </div>
            </>
          )}
          {intent.kind === "book" && intent.id === "science" && (
            <label>
              {t("ui.game.20f236b416")}
              <select
                value={track}
                onChange={(e) => setTrack(Number(e.target.value))}
              >
                {["b1eff676a2", "b237c80398", "e9f3d305ff", "8cff79bb4f"].map(
                  (k, i) => (
                    <option key={i} value={i}>
                      {t(`ui.game.${k}`)}
                    </option>
                  ),
                )}
              </select>
            </label>
          )}
          {isSpades ? (
            <SpadesForm
              key={intent.nonce}
              state={state}
              seat={seat}
              selected={selected}
              native={p.native}
              amount={intent.id === "spade" ? 1 : 2}
              stepwise={stepwise}
              travelOptions={[
                ...(p.faction === "moles" ? ["tunnel" as const] : []),
                ...(p.palace === "flight" ? ["flight" as const] : []),
              ]}
              disabled={disabled}
              onPreview={onAction}
              toAction={(input) => ({
                kind: "powerAction",
                id: intent.id!,
                ...input,
              })}
            />
          ) : (
            <GuidedAction
              state={state}
              seat={seat}
              action={action}
              disabled={disabled}
              onPreview={onAction}
            >
              {t("tableAction.execute")}
            </GuidedAction>
          )}
        </fieldset>
      )}
    </section>
  );
}
