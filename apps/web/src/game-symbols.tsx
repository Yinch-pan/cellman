import React from "react";
import { t } from "./i18n";

// Original vector symbols. Shape and accessible names accompany every color.
export const symbolPaths = {
  coins: "M12 2a10 10 0 1 0 0 20a10 10 0 1 0 0-20 M9 7h6v10H9z",
  power: "M14 2L5 14h6l-1 8 9-13h-6z",
  tools: "M4 4h16v16H4z M4 4l8 5 8-5 M12 9v11",
  books: "M3 3h8l2 2h8v17h-8l-2-2H3z M11 3v17 M16 8h3 M16 12h3",
  scholars: "M12 2a4 4 0 1 0 0 8a4 4 0 1 0 0-8 M8 11h8l4 10H4z",
  vp: "M12 2l3 6 7 1-5 5 1 8-6-4-6 4 1-8-5-5 7-1z",
  science: "M8 2h8 M10 2v7L3 21h18L14 9V2 M7 15h10",
  spades: "M16 2l5 5 M18 4L8 14 M5 11l8 8-4 3-7-7z",
  key: "M8 3a5 5 0 1 0 0 10a5 5 0 1 0 0-10 M12 12l9 9 M16 16l3-3 M19 19l3-3",
  workshop: "M3 11l9-9 9 9v11H3z M9 22v-7h6v7",
  guild: "M2 9h20L18 3H6z M4 10v12h16V10 M9 22v-8h6v8",
  school: "M2 8l10-6 10 6z M5 10v9 M12 10v9 M19 10v9 M2 22h20",
  palace: "M3 22V4h4v5h3V2h4v7h3V4h4v18z M10 22v-7h4v7",
  university: "M2 9l10-7 10 7 M5 9h14v13H5z M9 12v7 M15 12v7",
  bridge: "M2 18V8 M22 18V8 M2 10h20 M2 18q10-13 20 0",
  ship: "M3 15h18l-4 6H7z M12 3v12 M12 3l7 9h-7",
  city: "M2 22V10h6v12 M8 22V3h8v19 M16 22V8h6v14 M11 7h2 M11 12h2",
  tower: "M6 22V8H4V2h4v3h3V2h3v3h3V2h3v6h-2v14z",
  annex: "M12 2l10 5v10l-10 5-10-5V7z M7 12h10 M12 7v10",
} as const;
export type SymbolKind = keyof typeof symbolPaths;
export function GameSymbol({
  kind,
  amount,
}: {
  kind: SymbolKind;
  amount?: number | string;
}) {
  const name = t(`symbol.${kind}`);
  return (
    <span
      className={`game-symbol symbol-${kind}`}
      role="img"
      aria-label={`${amount ?? ""} ${name}`.trim()}
      title={name}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d={symbolPaths[kind]} />
      </svg>
      {amount !== undefined && <b aria-hidden="true">{amount}</b>}
    </span>
  );
}
