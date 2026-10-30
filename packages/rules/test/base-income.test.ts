import { expect, it } from "vitest";
import { actionState } from "./fixtures/actions";
import { incomeSources } from "../src/income";
import { giveIncome } from "../src/rounds";

it.each([0, 1, 2])(
  "rulebook p10: %i workshops add to one always-visible tool",
  (workshops) => {
    const s = actionState();
    const p = s.players.p1;
    s.board.buildings = { A4: { seat: "p1", kind: "workshop", neutral: true } };
    for (let i = 1; i <= workshops; i++)
      s.board.buildings[`A${i}`] = { seat: "p1", kind: "workshop" };
    const before = p.resources.tools;
    expect(incomeSources(s, p).reduce((n, r) => n + (r.tools ?? 0), 0)).toBe(
      1 + workshops,
    );
    giveIncome(s);
    expect(p.resources.tools).toBe(before + 1 + workshops);
  },
);

it("engine 7 retains historical displayed and settled income", () => {
  const s = actionState();
  s.rulesVersion = s.setup.rulesVersion = "aoi-1.1+2024-09.engine-7";
  const p = s.players.p1;
  const before = p.resources.tools;
  expect(incomeSources(s, p).reduce((n, r) => n + (r.tools ?? 0), 0)).toBe(1);
  giveIncome(s);
  expect(p.resources.tools).toBe(before + 1);
});
