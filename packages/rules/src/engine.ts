import { awardPoints } from "./score-events";
import { sameBookReward } from "./book-choice";
import { advanceDeparted } from "./lifecycle";
import type {
  GameState,
  GameAction,
  SeatId,
  Transition,
  RuleEvent,
  ActionOption,
} from "./types";
import { RuleViolation, requireRule, pay, note, integer } from "./internal";
import { burnPower } from "./actions/power";
import { advanceScience } from "./actions/science";
import { convert } from "./actions/convert";
import { terraform, upgrade, checkSupply, takePalace } from "./actions/build";
import { acceptLeech, autoLeech, queueChoice, offerLeech } from "./responses";
import { officialLarge, reachable } from "./map";
import {
  giveIncome,
  pass,
  finishPass,
  takeBonus,
  awardRound,
  settlePhase,
} from "./rounds";
import { findCities, takeCity } from "./actions/city";
import { publicPower, innovate } from "./actions/public";
import { takeCompetency } from "./actions/competency";
import { special } from "./actions/special";
import { bookAction } from "./actions/books";
import { placeNeutral, refreshNeutralChoices } from "./actions/neutral";
import { competencyMarket } from "./catalog";
import { gainScholar } from "./internal";
import { gainPower } from "./actions/power";
import { usesCurrentActionProtocol, supportsTurnPlanning } from "./state";
import { ledgerEntry } from "./ledger";
import { applyAction as legacyAction } from "../legacy/v1/engine";
import {
  applyAction as v2Action,
  getAvailableChoices as v2Choices,
} from "../legacy/v2/engine";
import {
  applyAction as v3Action,
  getAvailableChoices as v3Choices,
} from "../legacy/v3/engine";
import {
  applyAction as v4Action,
  getAvailableChoices as v4Choices,
} from "../legacy/v4/engine";
import { canonicalState } from "./serialization";
import type {
  GameAction as LegacyAction,
  GameState as LegacyState,
} from "../legacy/v1/types";
import {
  chooseSetup,
  draftPick,
  finishPlacement,
  placementOptions,
} from "./setup";
import { advanceTechnology } from "./technology";
import { placeBridge } from "./actions/bridge";
import { buildingRewards } from "./effects";
import { ownBuildings } from "./internal";
import {
  applyActionRaw as v5Action,
  getAvailableChoices as v5Choices,
} from "../legacy/v5/engine";
import {
  applyActionRaw as v6Action,
  applyTurn as v6Turn,
  getAvailableChoices as v6Choices,
} from "../legacy/v6/engine";
export { gainPower } from "./actions/power";
function palaceRewardsFirst(
  s: GameState,
  choice: GameState["pending"][number],
) {
  return (
    choice.kind !== "leech" &&
    !choice.batch?.startsWith("engineering-palace:") &&
    s.pending.some(
      (c) =>
        c.seat === choice.seat && c.batch?.startsWith("engineering-palace:"),
    )
  );
}
export function getAvailableChoices(s: GameState): GameState["pending"] {
  if (s.rulesVersion.endsWith("engine-6"))
    return v6Choices(s as Parameters<typeof v6Choices>[0]);
  if (s.rulesVersion.endsWith("engine-5"))
    return v5Choices(s as Parameters<typeof v5Choices>[0]);
  if (s.rulesVersion.endsWith("engine-2"))
    return v2Choices(s as any) as GameState["pending"];
  if (s.rulesVersion.endsWith("engine-3"))
    return v3Choices(s as any) as GameState["pending"];
  if (s.rulesVersion.endsWith("engine-4"))
    return v4Choices(s as any) as GameState["pending"];
  const setupSeat =
    s.phase === "setup" && s.setupStage
      ? s.turnOrder.find((seat) => s.pending.some((c) => c.seat === seat))
      : undefined;
  return s.pending.filter(
    (c) =>
      (!setupSeat || c.seat === setupSeat) &&
      (!s.activeEffectBatch ||
        c.batch === s.activeEffectBatch ||
        c.kind === "leech") &&
      !palaceRewardsFirst(s, c) &&
      (c.kind === "palace" ||
        c.kind === "leech" ||
        !s.pending.some(
          (other) => other.seat === c.seat && other.kind === "palace",
        )) &&
      !c.dependsOn?.some((id) => s.pending.some((other) => other.id === id)) &&
      (!(["science", "setup"].includes(s.phase) && c.kind === "spades") ||
        s.pending.find((other) => other.kind === "spades")?.id === c.id) &&
      (c.kind === "key" ||
        !s.pending.some(
          (other) => other.seat === c.seat && other.kind === "key",
        )) &&
      (c.kind === "key" ||
        c.kind === "neutral" ||
        !s.pending.some(
          (other) => other.seat === c.seat && other.kind === "neutral",
        )),
  );
}
export const getWaitingSeats = (s: GameState): SeatId[] =>
  s.status === "finished"
    ? []
    : s.pending.length
      ? [...new Set(getAvailableChoices(s).map((c) => c.seat))]
      : [s.activeSeat];
export function canEndTurnWithLeech(s: GameState, seat: SeatId) {
  return (
    usesCurrentActionProtocol(s.rulesVersion) &&
    s.status === "active" &&
    s.phase === "actions" &&
    s.activeSeat === seat &&
    s.players[seat]?.primaryDone &&
    !s.players[seat].passed &&
    s.pending.length > 0 &&
    s.pending.every((choice) => choice.kind === "leech" && choice.seat !== seat)
  );
}
export function canYieldToLeech(s: GameState, seat: SeatId) {
  const available = getAvailableChoices(s);
  return (
    usesCurrentActionProtocol(s.rulesVersion) &&
    s.status === "active" &&
    s.phase === "actions" &&
    s.activeSeat === seat &&
    !!s.players[seat]?.primaryDone &&
    !s.players[seat].passed &&
    available.length > 0 &&
    available.every((c) => c.kind === "leech" && c.seat !== seat)
  );
}
export function canConvertDuringChoice(s: GameState, seat: SeatId) {
  return (
    supportsTurnPlanning(s.rulesVersion) &&
    s.status !== "finished" &&
    s.phase === "actions" &&
    s.activeSeat === seat &&
    (!s.players[seat]?.passed ||
      getAvailableChoices(s).some(
        (c) => c.seat === seat && c.kind === "passFinish",
      )) &&
    (s.pending.some((c) => c.seat === seat) || canEndTurnWithLeech(s, seat))
  );
}
export function getLegalActions(s: GameState, seat: SeatId): ActionOption[] {
  if (s.matchResult?.loser === seat) return [];
  if (!s.players[seat] || s.status === "finished") return [];
  if (s.phase === "science" && !getWaitingSeats(s).includes(seat)) return [];
  if (canEndTurnWithLeech(s, seat))
    return [
      { kind: "convert", label: "资源转换" },
      { kind: "burn", label: "燃烧魔力" },
      { kind: "endTurn", label: "结束回合" },
    ];
  if (s.pending.some((c) => c.seat === seat))
    return [
      { kind: "respond", label: "处理待响应" },
      ...(canConvertDuringChoice(s, seat)
        ? [
            { kind: "convert" as const, label: "资源转换" },
            { kind: "burn" as const, label: "燃烧魔力" },
          ]
        : []),
    ];
  if (s.pending.length || s.activeSeat !== seat) return [];
  if (s.phase === "draft")
    return [
      {
        kind: s.setup.draft ? "draftPick" : "chooseSetup",
        label: "选择开局配置",
      },
    ];
  if (s.phase === "placement")
    return [{ kind: "place", label: "放置起始工坊" }];
  const free: ActionOption[] = [
    { kind: "convert", label: "资源转换" },
    { kind: "burn", label: "燃烧魔力" },
  ];
  return [
    ...free,
    ...(s.players[seat].primaryDone
      ? [{ kind: "endTurn" as const, label: "结束回合" }]
      : [
          { kind: "terraform" as const, label: "改造与建造" },
          { kind: "upgrade" as const, label: "升级建筑" },
          { kind: "scholar" as const, label: "派遣学者" },
          { kind: "advance" as const, label: "推进技术" },
          { kind: "powerAction" as const, label: "公共魔力行动" },
          { kind: "bookAction" as const, label: "书籍行动" },
          { kind: "innovation" as const, label: "研发创新" },
          { kind: "special" as const, label: "特殊行动" },
          { kind: "pass" as const, label: "结束本轮" },
        ]),
  ];
}
export function applyAction(
  state: GameState,
  seat: SeatId,
  action: GameAction,
): Transition {
  if (state.matchResult?.loser === seat)
    return {
      ok: false,
      error: { code: "PLAYER_REMOVED", message: "PLAYER_REMOVED" },
    };
  return advanceDeparted(applyActionRaw(state, seat, action));
}
export function applyActionRaw(
  state: GameState,
  seat: SeatId,
  action: GameAction,
): Transition {
  if (
    action.kind === "scholar" &&
    action.useKey !== undefined &&
    !usesCurrentActionProtocol(state.rulesVersion)
  )
    return {
      ok: false,
      error: { code: "RULESET_UNAVAILABLE", message: "RULESET_UNAVAILABLE" },
    };
  if (
    action.kind === "powerAction" &&
    action.deferSpades &&
    !usesCurrentActionProtocol(state.rulesVersion)
  )
    return {
      ok: false,
      error: { code: "RULESET_UNAVAILABLE", message: "RULESET_UNAVAILABLE" },
    };
  if (
    action.kind === "respond" &&
    (action.cityHex !== undefined || action.buildHex !== undefined) &&
    !usesCurrentActionProtocol(state.rulesVersion)
  )
    return {
      ok: false,
      error: { code: "RULESET_UNAVAILABLE", message: "RULESET_UNAVAILABLE" },
    };
  if (
    action.kind === "pass" &&
    action.deferBonus &&
    !usesCurrentActionProtocol(state.rulesVersion)
  )
    return {
      ok: false,
      error: { code: "RULESET_UNAVAILABLE", message: "RULESET_UNAVAILABLE" },
    };
  if (
    action.kind === "upgrade" &&
    (action.deferPalace || action.deferCompetency) &&
    !usesCurrentActionProtocol(state.rulesVersion)
  )
    return {
      ok: false,
      error: { code: "RULESET_UNAVAILABLE", message: "RULESET_UNAVAILABLE" },
    };
  if (
    action.kind === "setLeech" &&
    action.rejectPaid !== undefined &&
    !usesCurrentActionProtocol(state.rulesVersion)
  )
    return {
      ok: false,
      error: { code: "RULESET_UNAVAILABLE", message: "RULESET_UNAVAILABLE" },
    };
  if (state.rulesVersion === "aoi-1.1+2024-09.engine-6")
    return v6Action(state as Parameters<typeof v6Action>[0], seat, action);
  if (action.kind === "convertBatch") {
    if (
      !usesCurrentActionProtocol(state.rulesVersion) ||
      !action.actions.length ||
      action.actions.length > 100 ||
      action.actions.some((a) => a.kind !== "burn" && a.kind !== "convert")
    )
      return {
        ok: false,
        error: { code: "INVALID_TURN", message: "INVALID_TURN" },
      };
    let next = state;
    const events: RuleEvent[] = [];
    for (const child of action.actions) {
      const result = applyActionRaw(next, seat, child);
      if (!result.ok) return result;
      next = result.state;
      events.push(...result.events);
    }
    return { ok: true, state: next, events };
  }
  if (action.kind === "powerAction" && action.burn !== undefined) {
    if (!usesCurrentActionProtocol(state.rulesVersion))
      return {
        ok: false,
        error: { code: "RULESET_UNAVAILABLE", message: "RULESET_UNAVAILABLE" },
      };
    const { burn, ...payment } = action;
    const burned = applyActionRaw(state, seat, { kind: "burn", count: burn });
    if (!burned.ok) return burned;
    const paid = applyActionRaw(burned.state, seat, payment);
    if (!paid.ok) return paid;
    return {
      ok: true,
      state: paid.state,
      events: [...burned.events, ...paid.events],
    };
  }
  if (action.kind === "collectBooks") {
    const invalid: Transition = {
      ok: false,
      error: { code: "INVALID_CHOICE", message: "INVALID_CHOICE" },
    };
    if (
      !usesCurrentActionProtocol(state.rulesVersion) ||
      !action.selections.length ||
      action.selections.length > 100
    )
      return invalid;
    const available = getAvailableChoices(state).filter(
      (c) => c.seat === seat && c.kind === "book" && c.amount === 1,
    );
    const first = available.find((c) => c.id === action.selections[0].choiceId);
    if (
      !first ||
      new Set(action.selections.map((s) => s.choiceId)).size !==
        action.selections.length
    )
      return invalid;
    if (
      action.selections.some(
        (selection) =>
          !available.some(
            (c) =>
              c.id === selection.choiceId &&
              sameBookReward(first, c) &&
              c.options.includes(selection.option) &&
              ["0", "1", "2", "3"].includes(selection.option),
          ),
      )
    )
      return invalid;
    let next = state;
    const events: RuleEvent[] = [];
    for (const selection of action.selections) {
      const result = applyActionRaw(next, seat, {
        kind: "respond",
        ...selection,
      });
      if (!result.ok) return result;
      next = result.state;
      events.push(...result.events);
    }
    return { ok: true, state: next, events };
  }
  if (state.rulesVersion === "aoi-1.1+2024-09.engine-5")
    return v5Action(
      state as Parameters<typeof v5Action>[0],
      seat,
      action as Parameters<typeof v5Action>[2],
    );
  if (action.kind === "turn") return applyTurn(state, seat, action.actions);
  const result =
    action.kind === "draftPick"
      ? applyCurrentAction(state, seat, action)
      : state.rulesVersion === "aoi-1.1+2024-09"
        ? (legacyAction(
            state as LegacyState,
            seat,
            action as LegacyAction,
          ) as Transition)
        : state.rulesVersion === "aoi-1.1+2024-09.engine-2"
          ? v2Action(state as Parameters<typeof v2Action>[0], seat, action)
          : state.rulesVersion === "aoi-1.1+2024-09.engine-3"
            ? v3Action(state as Parameters<typeof v3Action>[0], seat, action)
            : state.rulesVersion === "aoi-1.1+2024-09.engine-4"
              ? v4Action(state as Parameters<typeof v4Action>[0], seat, action)
              : applyCurrentAction(state, seat, action);
  if (result.ok) {
    if (usesCurrentActionProtocol(state.rulesVersion))
      refreshNeutralChoices(result.state);
    for (const c of result.state.pending)
      if (!state.pending.some((old) => old.id === c.id))
        c.triggerRevision = state.revision + 1;
    // Frozen v2 and v3 emit their own ledger.
    if (
      ![
        "aoi-1.1+2024-09.engine-2",
        "aoi-1.1+2024-09.engine-3",
        "aoi-1.1+2024-09.engine-4",
        "aoi-1.1+2024-09.engine-5",
      ].includes(state.rulesVersion)
    )
      result.events.push(ledgerEntry(state, result.state, seat, action));
  }
  return result;
}
// One atomic command: intermediate choices remain private until the turn is
// complete or another player's response is required. Each child is validated.
export function applyTurn(
  state: GameState,
  seat: SeatId,
  actions: Exclude<GameAction, { kind: "turn" }>[],
): Transition {
  if (state.rulesVersion === "aoi-1.1+2024-09.engine-6")
    return v6Turn(state as Parameters<typeof v6Turn>[0], seat, actions);
  const fail = (code: string): Transition => ({
    ok: false,
    error: { code, message: code },
  });
  if (!usesCurrentActionProtocol(state.rulesVersion))
    return fail("RULESET_UNAVAILABLE");
  if (
    state.phase !== "actions" ||
    state.activeSeat !== seat ||
    state.players[seat]?.passed ||
    state.status === "finished"
  )
    return fail("NOT_YOUR_TURN");
  if (!actions.length || actions.length > 100) return fail("INVALID_TURN");
  let next = state;
  const events: RuleEvent[] = [];
  let finishedPass = false;
  for (let i = 0; i < actions.length; i++) {
    const action = actions[i];
    if (
      ["turn", "setLeech", "place", "chooseSetup", "draftPick"].includes(
        action.kind,
      )
    )
      return fail("INVALID_TURN");
    if (next.pending.some((c) => c.seat !== seat && c.kind !== "leech"))
      return fail("TURN_RESPONSE_REQUIRED");
    if (
      i &&
      (next.activeSeat !== seat ||
        next.phase !== "actions" ||
        (next.players[seat].passed &&
          !next.pending.some(
            (c) => c.seat === seat && c.kind === "passFinish",
          )) ||
        actions[i - 1].kind === "endTurn")
    )
      return fail("TURN_ALREADY_ENDED");
    if (
      action.kind === "respond" &&
      next.pending.some(
        (c) => c.id === action.choiceId && c.kind === "passFinish",
      )
    )
      finishedPass = true;
    const result = applyActionRaw(next, seat, action);
    if (!result.ok) return result;
    next = result.state;
    events.push(...result.events);
  }
  const last = actions.at(-1)!;
  if (
    last.kind !== "endTurn" &&
    last.kind !== "pass" &&
    !finishedPass &&
    !next.pending.some((c) => c.seat !== seat) &&
    next.status !== "finished"
  )
    return fail("TURN_NOT_FINISHED");
  return { ok: true, state: next, events };
}
function applyCurrentAction(
  state: GameState,
  seat: SeatId,
  action: GameAction,
): Transition {
  if (!usesCurrentActionProtocol(state.rulesVersion))
    return {
      ok: false,
      error: {
        code: "RULESET_UNAVAILABLE",
        message: "This rules version is unavailable",
      },
    };
  const s = canonicalState(state);
  s.shared.competencies ??= competencyMarket();
  s.shared.bookActions ??= s.setup.bookActions ?? ["power", "science", "coins"];
  for (const player of Object.values(s.players)) player.annexes ??= 0;
  const events: RuleEvent[] = [];
  try {
    const p = s.players[seat];
    requireRule(p, "UNKNOWN_SEAT");
    requireRule(s.status !== "finished", "GAME_FINISHED");
    if (action.kind === "draftPick") {
      draftPick(s, seat, action.category, action.option);
      note(events, seat, "draftPick", `${p.name} 选择开局配置`, {
        category: action.category,
        option: action.option,
      });
      return { ok: true, state: s, events };
    }
    if (action.kind === "chooseSetup") {
      chooseSetup(s, seat, action.offer);
      return { ok: true, state: s, events };
    }
    if (action.kind === "setLeech") {
      integer(action.maxVpCost);
      requireRule(
        action.maxVpCost <= 999 && typeof action.enabled === "boolean",
        "INVALID_POLICY",
      );
      requireRule(
        action.rejectPaid === undefined ||
          typeof action.rejectPaid === "boolean",
        "INVALID_POLICY",
      );
      p.leechPolicy = {
        ...p.leechPolicy,
        enabled: action.enabled,
        maxVpCost: action.maxVpCost,
        ...(action.rejectPaid !== undefined
          ? { rejectPaid: action.rejectPaid }
          : {}),
      };
      autoLeech(s, events);
      if (
        s.activeEffectBatch &&
        !s.pending.some((c) => c.batch === s.activeEffectBatch)
      )
        delete s.activeEffectBatch;
      settlePhase(s);
      return { ok: true, state: s, events };
    }
    if (action.kind === "respond") {
      const i = s.pending.findIndex((c) => c.id === action.choiceId);
      requireRule(i >= 0, "STALE_CHOICE");
      const c = s.pending[i];
      requireRule(
        action.cityHex === undefined || c.kind === "city",
        "INVALID_CHOICE",
      );
      requireRule(
        action.buildHex === undefined ||
          (c.kind === "buildWorkshop" && action.option === "build"),
        "INVALID_CHOICE",
      );
      requireRule(c.seat === seat, "WRONG_RESPONDER");
      if (s.phase === "setup" && s.setupStage)
        requireRule(
          s.turnOrder.find((id) =>
            s.pending.some((choice) => choice.seat === id),
          ) === seat,
          "WAIT_SCIENCE_ORDER",
        );
      requireRule(
        !s.activeEffectBatch ||
          c.batch === s.activeEffectBatch ||
          c.kind === "leech",
        "FINISH_EFFECT_BATCH",
      );
      requireRule(!palaceRewardsFirst(s, c), "FINISH_PALACE_REWARDS");
      requireRule(
        c.kind === "palace" ||
          c.kind === "leech" ||
          !s.pending.some(
            (other) => other.seat === seat && other.kind === "palace",
          ),
        "RESOLVE_PALACE_FIRST",
      );
      if (c.batch && !c.canInterleave) s.activeEffectBatch = c.batch;
      const priorChoices = new Set(s.pending.map((c) => c.id));
      requireRule(
        !c.dependsOn?.some((id) => s.pending.some((other) => other.id === id)),
        "WAIT_DEPENDENCY",
      );
      if ((s.phase === "science" || s.phase === "setup") && c.kind === "spades")
        requireRule(
          s.pending.find((other) => other.kind === "spades")?.id === c.id,
          "WAIT_SCIENCE_ORDER",
        );
      requireRule(
        c.kind === "key" ||
          !s.pending.some(
            (other) => other.seat === seat && other.kind === "key",
          ),
        "RESOLVE_KEY_FIRST",
      );
      requireRule(
        c.kind === "key" ||
          c.kind === "neutral" ||
          !s.pending.some(
            (other) => other.seat === seat && other.kind === "neutral",
          ),
        "RESOLVE_NEUTRAL_FIRST",
      );
      requireRule(c.options.includes(action.option), "INVALID_OPTION");
      if (action.terraform?.travel)
        requireRule(s.phase === "actions", "TRAVEL_ACTION_PHASE_ONLY");
      if (c.kind === "leech" && action.option === "accept")
        acceptLeech(p, c.amount, events);
      else if (c.kind === "spades" && action.option === "terraform") {
        requireRule(action.terraform, "MISSING_TERRAFORM");
        if (c.source === "power-action-surplus")
          requireRule(!action.terraform.travel, "OUT_OF_REACH");
        requireRule(
          c.canBuild !== false ||
            (!action.terraform.build && !action.terraform.deferBuild),
          "CANNOT_BUILD_IN_SCIENCE_PHASE",
        );
        const before = p.resources.tools;
        const result = terraform(
          s,
          p,
          { kind: "terraform", ...action.terraform },
          c.amount,
        );
        if (c.canBuySpades === false)
          requireRule(p.resources.tools === before, "CANNOT_BUY_SPADES");
        if (
          c.source === "power-action-surplus" &&
          action.terraform.terrain === p.native
        ) {
          const build = s.pending.find(
            (choice) =>
              choice.kind === "buildWorkshop" &&
              choice.dependsOn?.includes(c.id),
          );
          if (build)
            build.buildHexes = [
              ...(build.buildHexes ?? [build.source]),
              action.terraform.hex,
            ];
        }
        if (c.source !== "round-science") {
          awardRound(s, p, "spade", result.spades);
          if (result.built) awardRound(s, p, "workshop");
        }
        findCities(s, p);
      } else if (c.kind === "buildWorkshop" && action.option === "build") {
        const buildHex = action.buildHex ?? c.source;
        requireRule(
          (c.buildHexes ?? [c.source]).includes(buildHex),
          "INVALID_CHOICE",
        );
        terraform(
          s,
          p,
          {
            kind: "terraform",
            hex: buildHex,
            terrain: p.native,
            build: true,
          },
          0,
          c.travelPaid === true && buildHex === c.source,
        );
        awardRound(s, p, "workshop");
        findCities(s, p);
      } else if (c.kind === "city") {
        if (action.cityHex !== undefined) {
          const marker = s.board.buildings[action.cityHex];
          requireRule(
            marker?.seat === seat && marker.cityId === c.source,
            "INVALID_CHOICE",
          );
          marker.cityTile = action.option;
        }
        takeCity(s, p, action.option);
      } else if (c.kind === "palace") {
        takePalace(s, p, action.option, true);
        findCities(s, p);
      } else if (c.kind === "bridge" && action.option !== "discard") {
        const [a, b] = action.option.split(":");
        placeBridge(s, p, a, b);
      } else if (
        (c.kind === "freeGuild" || c.kind === "freeWorkshop") &&
        action.option !== "discard"
      ) {
        const hex = action.option;
        requireRule(
          officialLarge.hexes[hex] &&
            (s.board.terrain[hex] ?? officialLarge.hexes[hex].terrain) ===
              p.native &&
            !s.board.buildings[hex],
          "INVALID_FREE_BUILD",
        );
        const kind = c.kind === "freeGuild" ? "guild" : "workshop";
        checkSupply(s, p, kind);
        if (c.kind === "freeWorkshop")
          requireRule(
            reachable(
              officialLarge,
              ownBuildings(s, seat).map(([id]) => id),
              hex,
              p.sailing + (p.bonus === "river" ? 1 : 0),
              s.board.bridges,
              seat,
            ),
            "OUT_OF_REACH",
          );
        s.board.buildings[hex] = { seat, kind };
        offerLeech(s, seat, hex);
        buildingRewards(s, p, hex);
        awardRound(s, p, kind);
        findCities(s, p);
      } else if (c.kind === "book")
        p.resources.books[Number(action.option) as 0 | 1 | 2 | 3] += c.amount;
      else if (c.kind === "science") {
        const track = Number(action.option) as 0 | 1 | 2 | 3;
        advanceScience(s, p, track, c.amount);
      } else if (c.kind === "key" && action.option === "use") {
        requireRule(c.scienceTrack !== undefined, "INVALID_CHOICE");
        requireRule(p.keysUsed < p.keys, "NO_CITY_KEY");
        advanceScience(s, p, c.scienceTrack, c.amount, true);
      } else if (c.kind === "bonus") takeBonus(s, p, action.option);
      else if (c.kind === "passFinish") finishPass(s, p);
      else if (c.kind === "competency") takeCompetency(s, p, action.option);
      else if (c.kind === "neutral" && action.option !== "discard") {
        requireRule(c.buildingKind, "INVALID_CHOICE");
        placeNeutral(s, p, c.buildingKind, action.option);
      }
      s.pending.splice(i, 1);
      if (c.batch)
        for (const child of s.pending)
          if (
            !priorChoices.has(child.id) &&
            (!c.batch.startsWith("engineering-palace:") ||
              child.kind === "buildWorkshop")
          )
            child.batch = c.batch;
      autoLeech(s, events);
      if (
        s.activeEffectBatch &&
        !s.pending.some((c) => c.batch === s.activeEffectBatch)
      )
        delete s.activeEffectBatch;
      if (s.phase === "setup")
        for (const pending of s.pending)
          if (pending.kind === "spades") pending.canBuild = false;
      settlePhase(s);
      note(events, seat, "response", `${p.name} 已处理选择`);
      return { ok: true, state: s, events };
    }
    requireRule(s.activeSeat === seat, "NOT_YOUR_TURN");
    requireRule(
      !s.pending.length ||
        (action.kind === "endTurn" && canEndTurnWithLeech(s, seat)) ||
        ((action.kind === "convert" || action.kind === "burn") &&
          canConvertDuringChoice(s, seat)),
      "PENDING_CHOICES",
    );
    if (s.phase === "placement") {
      requireRule(action.kind === "place", "INITIAL_PLACEMENT_REQUIRED");
      const h = officialLarge.hexes[action.hex];
      requireRule(h?.terrain === p.native, "NOT_NATIVE_TERRAIN");
      requireRule(!s.board.buildings[action.hex], "OCCUPIED");
      const options = placementOptions(s, seat);
      const kind = action.building ?? options[0];
      requireRule(options.includes(kind), "INVALID_STARTING_BUILDING");
      s.board.buildings[action.hex] = {
        seat,
        kind,
        ...(kind === "tower" ? { neutral: true } : {}),
      };
      s.placementIndex++;
      if (s.placementIndex === s.placementOrder.length) {
        if (s.setup.offers || s.setup.draft) {
          finishPlacement(s);
          settlePhase(s);
        } else {
          s.phase = "actions";
          s.activeSeat = s.turnOrder[0];
          giveIncome(s);
        }
      } else s.activeSeat = s.placementOrder[s.placementIndex];
      note(events, seat, "place", `${p.name} 放置起始建筑`);
      return { ok: true, state: s, events };
    }
    requireRule(s.phase === "actions", "INVALID_PHASE");
    if (action.kind === "riverCity") {
      requireRule(
        p.palace === "river-city" &&
          officialLarge.hexes[action.hex]?.terrain === "river",
        "INVALID_RIVER_CITY",
      );
      requireRule(
        !s.board.cityLinks?.some((l) => l.river === action.hex),
        "RIVER_CITY_USED",
      );
      s.board.cityLinks ??= [];
      s.board.cityLinks.push({ seat, river: action.hex });
      const before = s.pending.length;
      findCities(s, p);
      requireRule(s.pending.length > before, "NO_CITY_CREATED");
      return { ok: true, state: s, events };
    }
    if (action.kind === "convert") convert(s, p, action);
    else if (action.kind === "burn") burnPower(p, action.count);
    else if (action.kind === "endTurn") {
      requireRule(p.primaryDone, "PRIMARY_REQUIRED");
      p.primaryDone = false;
      let next = s.turnOrder.indexOf(seat);
      do {
        next = (next + 1) % s.turnOrder.length;
      } while (s.players[s.turnOrder[next]].passed);
      s.activeSeat = s.turnOrder[next];
    } else {
      requireRule(!p.primaryDone, "PRIMARY_ALREADY_USED");
      if (action.kind === "terraform") {
        const result = terraform(s, p, action);
        awardRound(s, p, "spade", result.spades);
        if (result.built) {
          awardRound(s, p, "workshop");
        }
        findCities(s, p);
      } else if (action.kind === "upgrade") {
        upgrade(s, p, action);
        awardRound(
          s,
          p,
          ["palace", "university"].includes(action.to) ? "big" : action.to,
        );
        findCities(s, p);
      } else if (action.kind === "scholar") {
        requireRule(
          Number.isInteger(action.track) &&
            action.track >= 0 &&
            action.track < 4,
          "INVALID_TRACK",
        );
        pay(p, { scholars: 1 });
        let gain = 1;
        if (action.slot !== null) {
          requireRule(
            Number.isInteger(action.slot) &&
              action.slot >= 0 &&
              action.slot < 4,
            "INVALID_SLOT",
          );
          requireRule(
            s.shared.scholarSlots[action.track][action.slot] === null,
            "SLOT_OCCUPIED",
          );
          s.shared.scholarSlots[action.track][action.slot] = seat;
          gain = action.slot === 0 ? 3 : 2;
        }
        advanceScience(s, p, action.track, gain, action.useKey === true);
        if (p.bonus === "scholar") awardPoints(s, p, 2, "学者奖励板");
        if (p.competencies.includes("scholar-score"))
          awardPoints(s, p, 2, "派遣学者能力");
      } else if (action.kind === "advance") {
        advanceTechnology(s, p, action.track);
      } else if (action.kind === "powerAction") publicPower(s, p, action);
      else if (action.kind === "innovation") innovate(s, p, action);
      else if (action.kind === "special") special(s, p, action);
      else if (action.kind === "bookAction") bookAction(s, p, action);
      else if (action.kind === "pass")
        pass(s, p, action.bonus, action.deferBonus);
      else requireRule(false, "UNSUPPORTED_ACTION");
      if (action.kind !== "pass") {
        if (p.extraActions) {
          p.extraActions--;
          p.primaryDone = false;
        } else p.primaryDone = true;
      }
    }
    autoLeech(s, events);
    note(events, seat, action.kind, `${p.name}：${action.kind}`);
    return { ok: true, state: s, events };
  } catch (e) {
    if (e instanceof RuleViolation)
      return { ok: false, error: { code: e.code, message: e.message } };
    throw e;
  }
}
