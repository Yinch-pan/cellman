import { officialLarge } from "../../../packages/rules/src/map";
import type { GameAction, RuleEvent } from "../../../packages/rules/src/types";

// Display labels count land hexes only, as on BGA. Persisted IDs never change.
const labels = new Map<string, string>();
for (let row = 0; row < 9; row++) {
  let land = 0;
  for (let column = 1; column <= 13; column++) {
    const id = String.fromCharCode(65 + row) + column;
    labels.set(
      id,
      officialLarge.hexes[id].terrain === "river"
        ? `~${id}`
        : String.fromCharCode(65 + row) + ++land,
    );
  }
}
export const hexLabel = (id: string) => labels.get(id) ?? id;
export const bridgeLabel = (pair: string) =>
  pair.split(":").map(hexLabel).join(" ↔ ");

/** Read structured ledger targets, never coordinates from player-authored text. */
export function eventHexes(event: RuleEvent): string[] {
  const action = event.details?.action as GameAction | undefined;
  const result = new Set<string>();
  const add = (id?: string) => {
    if (id && officialLarge.hexes[id]) result.add(id);
  };
  const visit = (a: GameAction) => {
    if ("hex" in a) add(a.hex);
    if ("a" in a) add(a.a);
    if ("b" in a) add(a.b);
    if (a.kind === "respond") {
      add(a.cityHex);
      add(a.buildHex);
      a.option.split(":").forEach(add);
      add(a.terraform?.hex);
      a.terraform?.additional?.forEach((target) => add(target.hex));
    }
    if (a.kind === "turn" || a.kind === "convertBatch")
      a.actions.forEach(visit);
  };
  if (action) visit(action);
  add(event.details?.choiceSource as string | undefined);
  return [...result];
}
