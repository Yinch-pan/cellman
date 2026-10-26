import React from "react";
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { actionState } from "../../../packages/rules/test/fixtures/actions";
import { advanceScience } from "../../../packages/rules/src/actions/science";
import { gainPower } from "../../../packages/rules/src/actions/power";
import { incomeSources } from "../../../packages/rules/src/income";
import {
  ScienceBoard,
  scienceIncome,
  sciencePower,
} from "../src/science-board";

describe("visual effects agree with settlement", () => {
  it("marks exactly the steps that grant power, including crossing multiple steps", () => {
    for (let before = 0; before < 12; before++) {
      for (let end = before + 1; end <= 12; end++) {
        const state = actionState(),
          player = state.players.p1;
        player.science[0] = before;
        player.keys = 4;
        player.resources.power = [12, 0, 0];
        advanceScience(state, player, 0, end - before, true);
        let expected: [number, number, number] = [12, 0, 0];
        for (const [level, amount] of Object.entries(sciencePower))
          if (+level > before && +level <= end)
            expected = gainPower(expected, amount);
        expect(player.resources.power, `${before} → ${end}`).toEqual(expected);
      }
    }
  });
  it("shows ninth-level income only when settlement grants it", () => {
    for (let track = 0; track < 4; track++) {
      const s = actionState(),
        p = s.players.p1;
      p.science = [0, 0, 0, 0];
      p.science[track] = 8;
      expect(
        incomeSources(s, p).filter((r) => r.source.endsWith(" 9")),
      ).toEqual([]);
      p.science[track] = 9;
      const { source: _, ...actual } = incomeSources(s, p).find((r) =>
        r.source.endsWith(" 9"),
      )!;
      expect(actual).toEqual({
        [scienceIncome[track].kind]: scienceIncome[track].amount,
      });
    }
  });
  it("retains accessible descriptions, the gate, and the final-round exception", () => {
    const s = actionState();
    const html = renderToStaticMarkup(<ScienceBoard state={s} seat="p1" />);
    expect(html).toContain('data-level="8"');
    expect(html).toContain("进入8级使用钥匙");
    expect(html).toContain("终局 · 无轮末科学奖励");
    expect(html.match(/仅1人/g)).toHaveLength(4);
  });
});
