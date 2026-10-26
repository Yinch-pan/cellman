import { it, expect } from "vitest";
import { ConnectionBudget } from "../src/connection-budget";

it("shares user quota across IPs, frees closed streams once and permits reconnect", () => {
  const budget = new ConnectionBudget({ user: 2, ip: 4, total: 5 });
  const a = budget.acquire("a", "one")!;
  const b = budget.acquire("a", "two")!;
  expect(budget.acquire("a", "three")).toBeUndefined();
  a();
  a();
  expect(budget.acquire("a", "three")).toBeTypeOf("function");
  expect(budget.acquire("a", "four")).toBeUndefined();
  b();
});

it("limits shared IPs and all clients independently of account quota", () => {
  const budget = new ConnectionBudget({ user: 2, ip: 2, total: 3 });
  const a = budget.acquire("a", "one")!;
  budget.acquire("b", "one");
  expect(budget.acquire("c", "one")).toBeUndefined();
  budget.acquire("c", "two");
  expect(budget.acquire("d", "three")).toBeUndefined();
  a();
  expect(budget.acquire("d", "three")).toBeTypeOf("function");
});
