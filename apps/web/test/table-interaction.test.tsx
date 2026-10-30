// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { GamePage } from "../src/game";
import { actionState } from "../../../packages/rules/test/fixtures/actions";
import type { GameState } from "../../../packages/rules/src/types";
import { tableActionTargets } from "../src/table-action-editor";
import { queueChoice } from "../../../packages/rules/src/responses";
import { competencyOptions } from "../../../packages/rules/src/actions/competency";
import { bgaFinalState } from "../../../packages/rules/test/fixtures/bga-final";
import { finishGame } from "../../../packages/rules/src/scoring";
import { finalPlayerDisplay } from "../src/final-player-display";

let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  vi.spyOn(HTMLElement.prototype, "scrollIntoView").mockImplementation(
    () => {},
  );
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});
function stateWithResources() {
  const state = actionState();
  state.players.p1.resources.books = [5, 5, 5, 5];
  state.players.p1.resources.coins = 30;
  state.players.p1.resources.tools = 20;
  state.players.p1.resources.power = [0, 0, 12];
  state.shared.bookActions = ["coins", "science", "upgrade", "spades"];
  return state;
}
async function mount(state: GameState, planning = false) {
  localStorage.setItem("boardgame-demo-v1", JSON.stringify(state));
  localStorage.setItem("cellman-turn-planning", planning ? "on" : "off");
  await act(async () => root.render(<GamePage demo />));
}
function button(text: string, scope: ParentNode = container) {
  const element = [...scope.querySelectorAll<HTMLButtonElement>("button")].find(
    (b) => b.textContent?.trim() === text,
  );
  expect(element, text).toBeTruthy();
  return element!;
}
async function click(element: Element | null) {
  expect(element).toBeTruthy();
  expect((element as HTMLButtonElement).disabled).not.toBe(true);
  await act(async () => {
    element!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}
const saved = () =>
  JSON.parse(localStorage.getItem("boardgame-demo-v1")!) as GameState;

it("BGA Omar placement confirms a legal position before committing a building type", async () => {
  const state = actionState();
  state.phase = "placement";
  state.setup.offers = [];
  state.board.buildings = {};
  state.players.p1.faction = "omar";
  state.players.p1.native = "forest";
  state.placementOrder = ["p1", "p2", "p3", "p3", "p2", "p1", "p1"];
  state.placementIndex = 0;
  await mount(state);
  await click(container.querySelector('.hex[aria-label^="A1 "]'));
  let review = container.querySelector("#table-placement-review")!;
  expect(review.textContent).toContain("已选择的位置：A1");
  expect(review.textContent).not.toContain("选择要放置的建筑");
  await click(button("确认提交", review));
  expect(saved().board.buildings).toEqual({});
  expect(review.textContent).toContain("选择要放置的建筑");
  await click(button("选择另一个位置", review));
  expect(container.querySelector("#table-placement-review")).toBeNull();
  await click(container.querySelector('.hex[aria-label^="B1 "]'));
  expect(container.querySelector("#table-placement-review")).toBeNull();
  await click(container.querySelector('.hex[aria-label^="A1 "]'));
  review = container.querySelector("#table-placement-review")!;
  expect(review.textContent).not.toContain("选择要放置的建筑");
  await click(button("确认提交", review));
  const tower = [...review.querySelectorAll("button")].find((b) =>
    /塔/.test(b.textContent ?? ""),
  )!;
  await click(tower);
  expect(saved().board.buildings.A1).toMatchObject({
    seat: "p1",
    kind: "tower",
    neutral: true,
  });
  expect(saved().placementIndex).toBe(1);
  expect(container.querySelector("#table-placement-review")).toBeNull();
});

it("shows BGA endgame converted holdings while preserving the scoring ledger", async () => {
  const state = bgaFinalState();
  expect(finalPlayerDisplay(state, state.players.p1)).toBe(state.players.p1);
  finishGame(state);
  expect(
    Object.values(state.players).map(
      (p) => finalPlayerDisplay(state, p).resources,
    ),
  ).toEqual([
    { coins: 75, tools: 0, scholars: 0, books: [0, 0, 0, 0], power: [8, 1, 0] },
    {
      coins: 43,
      tools: 0,
      scholars: 0,
      books: [0, 0, 0, 0],
      power: [11, 0, 0],
    },
    {
      coins: 42,
      tools: 0,
      scholars: 0,
      books: [0, 0, 0, 0],
      power: [11, 1, 0],
    },
  ]);
  await mount(state);
  const chips = [...container.querySelectorAll(".player-chip")];
  expect(
    chips.map(
      (chip) => chip.querySelector(".chip-resources span b")?.textContent,
    ),
  ).toEqual(["75", "43", "42"]);
  expect(
    chips.map((chip) =>
      chip.querySelector(".score")?.textContent?.trim().replace(/\s+/g, " "),
    ),
  ).toEqual(["61 分", "79 分", "67 分"]);
  expect(container.querySelector(".final-scores")?.textContent).toContain("55");
  expect(saved().players.p1.resources.coins).toBe(55);
  state.matchResult = { reason: "consensus" } as GameState["matchResult"];
  expect(finalPlayerDisplay(state, state.players.p1)).toBe(state.players.p1);
});

it.each([
  [
    [0, 5, 0, 0],
    [0, 5, 0, 0],
  ],
  [
    [0, 8, 0, 0],
    [0, 5, 0, 0],
  ],
  [
    [1, 4, 0, 0],
    [1, 4, 0, 0],
  ],
  [
    [1, 5, 0, 0],
    [0, 2, 0, 0],
  ],
])(
  "prefills only forced innovation payments: available %j",
  async (available, expected) => {
    const state = stateWithResources();
    state.players.p1.resources.books = available as [
      number,
      number,
      number,
      number,
    ];
    state.setup.innovations = ["steam-power"];
    state.setup.innovationCosts = { "steam-power": [0, 2, 0, 0] };
    state.shared.innovations = ["steam-power"];
    await mount(state);
    await click(
      container.querySelector('[data-table-action="innovation:steam-power"]'),
    );
    const editor = container.querySelector("#table-action-editor")!;
    await click(button("继续选择支付书籍", editor));
    expect(
      [
        ...editor.querySelectorAll<HTMLInputElement>('input[type="number"]'),
      ].map((input) => Number(input.value)),
    ).toEqual(expected);
    expect(saved()).toEqual(state);
    await click(button("取消操作", editor));
    expect(saved()).toEqual(state);
  },
);

async function fillPayment() {
  const editor = container.querySelector("#table-action-editor")!;
  await click(button("继续选择支付书籍", editor));
  await click(button("填入一组可用书籍", editor));
}

it("opens book payments beside the clicked tile, cancels without changes, then executes locally", async () => {
  const state = stateWithResources();
  await mount(state);
  const tile = container.querySelector('[data-table-action="book:coins"]')!;
  await click(tile);
  let editor = container.querySelector<HTMLElement>("#table-action-editor")!;
  expect(editor.closest("#table-book-actions")).not.toBeNull();
  expect(document.activeElement).toBe(editor);
  expect(editor.querySelectorAll('input[type="number"]')).toHaveLength(0);
  await fillPayment();
  expect(
    [
      ...editor.querySelectorAll<HTMLInputElement>('input[type="number"]'),
    ].reduce((n, i) => n + Number(i.value), 0),
  ).toBe(2);
  await click(button("取消操作", editor));
  expect(container.querySelector("#table-action-editor")).toBeNull();
  expect(saved().revision).toBe(state.revision);
  await click(tile);
  editor = container.querySelector("#table-action-editor")!;
  await fillPayment();
  await click(button("执行此行动", editor));
  expect(saved().players.p1.resources.coins).toBe(36);
  expect(saved().shared.usedActions).toContain("book:coins");
  expect(container.querySelector("#table-action-editor")).toBeNull();
});

it("retains payment while picking a book-upgrade target and does not open the normal map menu", async () => {
  await mount(stateWithResources());
  await click(container.querySelector('[data-table-action="book:upgrade"]'));
  const editor = container.querySelector("#table-action-editor")!;
  const payment = [...editor.querySelectorAll<HTMLInputElement>("input")].map(
    (i) => i.value,
  );
  await click(button("到地图选择目标", editor));
  expect(container.querySelector(".table-map-prompt")).not.toBeNull();
  await click(container.querySelector('.hex[aria-label^="A1 "]'));
  expect(container.querySelector(".map-context-panel")).toBeNull();
  expect(container.querySelector(".table-map-prompt")).toBeNull();
  expect(editor.textContent).toContain("已选地块：A1");
  expect(
    [...editor.querySelectorAll<HTMLInputElement>("input")].map((i) => i.value),
  ).toEqual(payment);
  await click(button("执行此行动", editor));
  expect(saved().board.buildings.A1.kind).toBe("guild");
});

it("opens map upgrade actions from the pass tab, independent of the action form", async () => {
  await mount(stateWithResources());
  const tabs = container.querySelectorAll<HTMLButtonElement>(
    ".action-tabs button",
  );
  await click(tabs[tabs.length - 1]);
  await click(container.querySelector('.hex[aria-label^="A1 "]'));
  expect(container.querySelector(".map-context-panel")).not.toBeNull();
});

it("acquires a FAV from its supply card and disables tiles already owned", async () => {
  const state = stateWithResources();
  state.players.p1.competencies = [
    state.shared.competencies.find((c) => c.id !== "income-vp-coins")!.id,
  ];
  queueChoice(
    state,
    "p1",
    "competency",
    1,
    competencyOptions(state, state.players.p1),
    "school",
  );
  await mount(state);
  const market = container.querySelector("#table-competencies")!;
  expect(
    market
      .querySelector('[data-owned="true"] button')
      ?.hasAttribute("disabled"),
  ).toBe(true);
  await click(button("领取 FAV9", market));
  expect(saved().players.p1.competencies).toContain("income-vp-coins");
  expect(saved().pending.some((c) => c.kind === "competency")).toBe(false);
});

it("keeps an innovation's payment and acquisition in its market", async () => {
  const state = stateWithResources();
  state.setup.innovations = ["sewerage"];
  state.setup.innovationCosts = { sewerage: [0, 2, 0, 0] };
  state.shared.innovations = ["sewerage"];
  await mount(state);
  await click(
    container.querySelector('[data-table-action="innovation:sewerage"]'),
  );
  const editor = container.querySelector("#table-action-editor")!;
  expect(editor.closest("#table-innovations")).not.toBeNull();
  await fillPayment();
  await click(button("执行此行动", editor));
  expect(saved().players.p1.innovations).toContain("sewerage");
  expect(saved().shared.innovations).not.toContain("sewerage");
});

it("offers only legal targets for a public upgrade", () => {
  const state = stateWithResources();
  expect([
    ...tableActionTargets(state, "p1", {
      kind: "book",
      id: "upgrade",
      nonce: 1,
    }),
  ]).toEqual(["A1"]);
});

it("keeps a planned action reversible and ignores a double click", async () => {
  const state = stateWithResources();
  await mount(state, true);
  await click(container.querySelector('[data-table-action="book:coins"]'));
  await fillPayment();
  const execute = button(
    "执行此行动",
    container.querySelector("#table-action-editor")!,
  );
  await act(async () => {
    execute.click();
    execute.click();
  });
  const plan = JSON.parse(localStorage.getItem("cellman-turn:demo:p1")!);
  expect(plan.actions).toHaveLength(1);
  expect(plan.actions[0]).toMatchObject({ kind: "bookAction", id: "coins" });
  expect(saved().players.p1.resources.coins).toBe(30);
});

it("keeps optional detailed confirmation inside the same inline editor", async () => {
  localStorage.setItem("cellman-step-review", "on");
  const state = stateWithResources();
  await mount(state);
  await click(container.querySelector('[data-table-action="book:coins"]'));
  await fillPayment();
  await click(
    button("执行此行动", container.querySelector("#table-action-editor")!),
  );
  expect(container.querySelectorAll("#table-preview")).toHaveLength(1);
  expect(
    container.querySelector("#table-preview")!.closest("#table-action-editor"),
  ).not.toBeNull();
  expect(saved().revision).toBe(state.revision);
  await click(
    button("取消操作", container.querySelector("#table-action-editor")!),
  );
  expect(saved().revision).toBe(state.revision);
});

it("continues a public book spade reward in the public area without a second payment", async () => {
  const state = stateWithResources();
  state.players.p1.sailing = 3;
  await mount(state);
  await click(container.querySelector('[data-table-action="book:spades"]'));
  await click(
    button("执行此行动", container.querySelector("#table-action-editor")!),
  );
  const choice = saved().pending.find((c) => c.kind === "spades")!;
  expect(choice.source).toBe("book-action");
  const editor = container.querySelector("#table-action-editor")!;
  expect(editor.closest("#table-book-actions")).not.toBeNull();
  expect(editor.querySelectorAll('input[type="number"]')).toHaveLength(0);
  expect(button("放弃剩余铲子", editor).disabled).toBe(false);
  await click(button("到地图选择目标", editor));
  const target = container.querySelector('.hex[data-available="true"]')!;
  const hex = target.getAttribute("aria-label")!.split(" ")[0];
  await click(target);
  expect(editor.textContent).toContain(`已选地块：${hex}`);
  expect(saved().players.p1.resources.books.reduce((a, b) => a + b, 0)).toBe(
    17,
  );
});

it("does not allow a power-spade action without choosing its map target", async () => {
  await mount(stateWithResources());
  await click(container.querySelector('[data-table-action="power:spade"]'));
  const editor = container.querySelector("#table-action-editor")!;
  expect(editor.closest("#table-public-actions")).not.toBeNull();
  expect(
    editor.querySelector<HTMLButtonElement>(".guided-action button")!.disabled,
  ).toBe(true);
  await act(async () => {
    editor.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
  });
  expect(container.querySelector("#table-action-editor")).toBeNull();
  expect(saved().shared.usedActions).not.toContain("spade");
});
