import React, { useEffect, useMemo, useRef, useState } from "react";
import { applyAction } from "../../../packages/rules/src/engine";
import type {
  FreeConversion,
  GameAction,
  GameState,
} from "../../../packages/rules/src/types";
import { t } from "./i18n";
import { RequestError } from "./api";
import "./conversion-sheet.css";

export function ConversionSheet({
  state,
  seat,
  disabled,
  onPreview,
  onClose,
}: {
  state: GameState;
  seat: string;
  disabled: boolean;
  onPreview: (action: GameAction) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [steps, setSteps] = useState<FreeConversion[]>([]);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  const result = useMemo(
    () =>
      steps.length
        ? applyAction(state, seat, { kind: "convertBatch", actions: steps })
        : null,
    [state, seat, steps],
  );
  const preview = result?.ok ? result.state : state;
  const before = state.players[seat].resources,
    after = preview.players[seat].resources;
  const colors = [
    t("ui.game.61e85f6baf"),
    t("ui.game.56541f587b"),
    t("ui.game.9fb0d52f93"),
    t("ui.game.6575322492"),
  ];
  const choices: { name: string; action: FreeConversion }[] = [
    {
      name: t("conversion.powerScholar"),
      action: { kind: "convert", from: "power", to: "scholar", count: 1 },
    },
    {
      name: t("conversion.powerTool"),
      action: { kind: "convert", from: "power", to: "tool", count: 1 },
    },
    {
      name: t("conversion.powerCoin"),
      action: { kind: "convert", from: "power", to: "coin", count: 1 },
    },
    {
      name: t("conversion.scholarTool"),
      action: { kind: "convert", from: "scholar", to: "tool", count: 1 },
    },
    {
      name: t("conversion.toolCoin"),
      action: { kind: "convert", from: "tool", to: "coin", count: 1 },
    },
    { name: t("conversion.burn"), action: { kind: "burn", count: 1 } },
    ...colors.flatMap((color, i) => [
      {
        name: t("conversion.powerBook", { color }),
        action: {
          kind: "convert" as const,
          from: "power" as const,
          to: "book" as const,
          color: i as 0 | 1 | 2 | 3,
          count: 1,
        },
      },
      {
        name: t("conversion.bookCoin", { color }),
        action: {
          kind: "convert" as const,
          from: "book" as const,
          to: "coin" as const,
          color: i as 0 | 1 | 2 | 3,
          count: 1,
        },
      },
    ]),
  ];
  const names = new Map(choices.map((c) => [JSON.stringify(c.action), c.name]));
  return (
    <dialog
      className="conversion-sheet"
      ref={ref}
      aria-labelledby="conversion-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!disabled) onClose();
      }}
    >
      <header>
        <h2 id="conversion-title">{t("conversion.title")}</h2>
        <button disabled={disabled} onClick={onClose}>
          {t("conversion.cancel")}
        </button>
      </header>
      <p>{t("conversion.instructions")}</p>
      <div
        className="conversion-balances"
        role="status"
        aria-label={t("conversion.balance")}
      >
        <span>
          {t("conversion.coins")}: {before.coins} → {after.coins}
        </span>
        <span>
          {t("conversion.tools")}: {before.tools} → {after.tools}
        </span>
        <span>
          {t("conversion.scholars")}: {before.scholars} → {after.scholars}
        </span>
        <span>
          {t("conversion.bowls")}: {before.power.join(" / ")} →{" "}
          {after.power.join(" / ")}
        </span>
        {colors.map((color, i) => (
          <span key={color}>
            {color}: {before.books[i]} → {after.books[i]}
          </span>
        ))}
      </div>
      {result && !result.ok && (
        <p role="alert">{new RequestError(result.error.code).message}</p>
      )}
      <div className="conversion-grid">
        {choices.map(({ name, action }) => {
          const valid = applyAction(preview, seat, action);
          const count = steps.filter(
            (s) => JSON.stringify(s) === JSON.stringify(action),
          ).length;
          return (
            <button
              key={name}
              aria-label={name}
              disabled={
                disabled ||
                !valid.ok ||
                steps.length >= 100 ||
                (!!result && !result.ok)
              }
              title={
                valid.ok ? name : new RequestError(valid.error.code).message
              }
              onClick={() => setSteps([...steps, action])}
            >
              <span>{name}</span>
              <strong>×{count}</strong>
            </button>
          );
        })}
      </div>
      <details className="conversion-steps">
        <summary>{t("conversion.steps", { count: steps.length })}</summary>
        <ol>
          {steps.map((s, i) => (
            <li key={i}>{names.get(JSON.stringify(s))}</li>
          ))}
        </ol>
      </details>
      <footer>
        <button
          disabled={disabled || !steps.length}
          onClick={() => setSteps(steps.slice(0, -1))}
        >
          {t("conversion.undo")}
        </button>
        <button
          disabled={disabled || !steps.length}
          onClick={() => setSteps([])}
        >
          {t("conversion.reset")}
        </button>
        <button
          className="primary"
          disabled={disabled || (!!result && !result.ok)}
          onClick={() => {
            if (steps.length)
              onPreview({ kind: "convertBatch", actions: steps });
            onClose();
          }}
        >
          {t("conversion.finish")}
        </button>
      </footer>
    </dialog>
  );
}
