import { it, expect } from "vitest";
import { applyAction } from "../src/engine";
import { actionState } from "./fixtures/actions";
it("never applies current rules to a persisted unknown rule version", () => {
  const s = actionState();
  s.rulesVersion = "future-version";
  const before = structuredClone(s);
  const result = applyAction(s, "p1", {
    kind: "setLeech",
    enabled: true,
    maxVpCost: 0,
  });
  expect(result).toMatchObject({
    ok: false,
    error: { code: "RULESET_UNAVAILABLE" },
  });
  expect(s).toEqual(before);
});
