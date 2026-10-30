import { it, expect } from "vitest";
// @ts-expect-error Plain Node module also runs outside the TypeScript application.
import { alertDue, validBackup } from "./ops-policy.mjs";

it("rejects backup path traversal and incomplete metadata", () => {
  const good = {
    name: "cellman-20261026T120000Z.dump",
    sha256: "a".repeat(64),
    bytes: 12,
    mtime: 1000,
  };
  expect(validBackup(good)).toBe(true);
  for (const name of [
    "../cellman-a.dump",
    "cellman-a.dump/evil",
    "cellman-a.dump;id",
    "other.dump",
  ])
    expect(validBackup({ ...good, name })).toBe(false);
  expect(validBackup({ ...good, bytes: 0 })).toBe(false);
  expect(validBackup({ ...good, sha256: "bad" })).toBe(false);
});

it("alerts only confirmed failures, recovers once, and bounds retries", () => {
  expect(alertDue([], {}, 100000)).toBe(false);
  expect(alertDue(["down"], {}, 100000)).toBe(false);
  expect(alertDue(["down"], { failureStreak: 1 }, 100000)).toBe(true);
  const notified = {
    failureStreak: 2,
    notifiedWarnings: ["down"],
    lastNotifiedAt: 100000,
    lastAlertAttemptAt: 100000,
  };
  expect(alertDue(["down"], notified, 101000)).toBe(false);
  expect(alertDue(["down"], notified, 122000)).toBe(true);
  expect(alertDue([], notified, 101000)).toBe(true);
  expect(alertDue(["new"], notified, 100100)).toBe(false);
});
