import React from "react";
import { palaces } from "../../../packages/rules/src/content";
import { GameSymbol, type SymbolKind } from "./game-symbols";
import { t } from "./i18n";

type Token = SymbolKind | [SymbolKind, number | string] | "→" | "+" | "/";
type Effect = {
  when: "income" | "action" | "once" | "pass" | "build" | "owned" | "dispatch";
  tokens: Token[];
  note?: string;
};
const row = (when: Effect["when"], tokens: Token[], note?: string): Effect => ({
  when,
  tokens,
  note,
});
export const bonusEffects: Record<string, Effect[]> = {
  coins: [row("income", [["coins", 6]])],
  power: [
    row("income", [
      ["power", 4],
      ["coins", 2],
    ]),
  ],
  guild: [
    row("income", [["power", 3]]),
    row("build", ["guild", "→", ["vp", 3]]),
  ],
  scholar: [
    row("income", [["scholars", 1]]),
    row("dispatch", ["scholars", "→", ["vp", 2]]),
  ],
  school: [
    row("income", [["coins", 4]]),
    row("pass", ["school", "→", ["science", 1]]),
  ],
  bigbuilding: [
    row("income", [["tools", 1]]),
    row("pass", ["palace", "/", "university", "→", ["vp", 4]]),
  ],
  river: [
    row("owned", [["ship", "+1"]], "riverRange"),
    row("build", ["workshop", "→", ["vp", 2]], "riverOnly"),
  ],
  "spade-bonus": [
    row("income", [["books", 1]]),
    row("action", [["spades", 1], "+", "workshop"], "optionalBuild"),
  ],
  "bridge-bonus": [
    row("income", [["books", 1]]),
    row("action", [["bridge", 1]]),
  ],
  "science-bonus": [
    row("income", [["tools", 2]]),
    row("action", [["science", 1]]),
  ],
};
export const competencyEffects: Record<string, Effect[]> = {
  "income-book-power": [
    row("income", [
      ["books", 1],
      ["power", 1],
    ]),
  ],
  "income-tool-science": [
    row("income", [
      ["tools", 1],
      ["science", 1],
    ]),
  ],
  "income-vp-coins": [
    row("income", [
      ["vp", 3],
      ["coins", 2],
    ]),
  ],
  tower: [
    row("once", [["tower", 1]]),
    row("income", [
      ["power", 2],
      ["coins", 2],
    ]),
  ],
  "two-spades": [row("once", [["spades", 2]])],
  "power-special": [row("action", [["power", 4]])],
  annexes: [row("once", [["annex", 2]])],
  "immediate-resources": [
    row("once", [
      ["tools", 1],
      ["coins", 2],
      ["vp", 5],
    ]),
  ],
  "city-pass": [row("pass", ["city", "→", ["vp", 2]])],
  "min-science-pass": [row("pass", ["science", "→", "vp"], "lowestScience")],
  "border-score": [row("build", ["workshop", "→", ["vp", 3]], "borderOnly")],
  "scholar-score": [row("dispatch", ["scholars", "→", ["vp", 2]])],
};
const palaceExtra: Record<string, Effect[]> = {
  "tools-special": [row("action", [["tools", 2]])],
  "spades-special": [
    row("action", [["spades", 2], "+", "workshop"], "optionalBuild"),
  ],
  "downgrade-special": [
    row("action", ["school", "→", "guild", ["vp", 3], ["tools", 1]]),
  ],
  "upgrade-special": [row("action", ["workshop", "→", "guild"], "free")],
  "science-special": [row("action", [["science", 2]], "sameTrack")],
  "school-pass": [row("pass", ["school", "→", ["vp", 3]])],
  "power-books": [
    row("once", [
      ["power", 12],
      ["books", 2],
    ]),
  ],
  "city-palace": [row("once", [["city", 1]])],
  "workshop-score": [row("build", ["workshop", "→", ["vp", 2]])],
  "guild-special": [
    row("build", ["guild", "→", ["vp", 3]]),
    row("action", [
      ["books", 1],
      ["coins", 3],
    ]),
  ],
  "engineering-palace": [
    row("once", [
      ["bridge", 2],
      ["spades", 2],
      ["books", 2],
    ]),
  ],
  "immediate-score": [row("once", [["vp", 10]])],
};
// Complex spatial abilities retain their exact text below their income symbols.
export function effectsFor(category: string, id: string): Effect[] {
  if (category === "bonus") return bonusEffects[id] ?? [];
  if (category === "competency") return competencyEffects[id] ?? [];
  if (category !== "palace") return [];
  const income = Object.entries(palaces[id]?.income ?? {}).map(
    ([kind, amount]) => [kind as SymbolKind, amount] as Token,
  );
  return [
    ...(income.length ? [row("income", income)] : []),
    ...(palaceExtra[id] ?? []),
  ];
}
export function TileEffects({
  category,
  id,
  description,
}: {
  category: string;
  id: string;
  description?: string;
}) {
  const effects = effectsFor(category, id);
  const complete =
    category === "bonus" || category === "competency" || !!palaceExtra[id];
  if (!effects.length) return <span>{description}</span>;
  return (
    <span className="tile-effects" title={description} aria-label={description}>
      {effects.map((effect, index) => (
        <span className={`effect-row effect-${effect.when}`} key={index}>
          <span className="effect-timing">{t(`effect.${effect.when}`)}</span>
          <span className="effect-tokens">
            {effect.tokens.map((token, i) =>
              typeof token === "string" && ["→", "+", "/"].includes(token) ? (
                <b key={i}>{token}</b>
              ) : (
                <GameSymbol
                  key={i}
                  kind={(Array.isArray(token) ? token[0] : token) as SymbolKind}
                  amount={Array.isArray(token) ? token[1] : undefined}
                />
              ),
            )}
          </span>
          {effect.note && <small>{t(`effect.${effect.note}`)}</small>}
        </span>
      ))}
      {!complete && <small>{description}</small>}
    </span>
  );
}
export function EffectDetails({ description }: { description?: string }) {
  return (
    <details className="effect-details">
      <summary>{t("effect.details")}</summary>
      <p>{description}</p>
    </details>
  );
}
