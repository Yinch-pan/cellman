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
import { terraform, upgrade, checkSupply } from "./actions/build";
import { acceptLeech, autoLeech, queueChoice, offerLeech } from "./responses";
import { officialLarge, reachable } from "./map";
import { giveIncome, pass, awardRound, settlePhase } from "./rounds";
import { findCities, takeCity } from "./actions/city";
import { publicPower, innovate } from "./actions/public";
import { takeCompetency } from "./actions/competency";
import { special } from "./actions/special";
import { bookAction } from "./actions/books";
import { placeNeutral } from "./actions/neutral";
import { competencyMarket } from "./catalog";
import { gainScholar } from "./internal";
import { gainPower } from "./actions/power";
import { RULES_VERSION } from "./state";
import { ledgerEntry } from "./ledger";
import { applyAction as legacyAction } from "../v1/engine";
import { applyAction as v2Action } from "../v2/engine";
import { applyAction as v3Action } from "../v3/engine";
import { canonicalState } from "./serialization";
import type {
  GameAction as LegacyAction,
  GameState as LegacyState,
} from "../v1/types";
import { chooseSetup, finishPlacement, placementOptions } from "./setup";
import { advanceTechnology } from "./technology";
import { placeBridge } from "./actions/bridge";
import { buildingRewards } from "./effects";
import { ownBuildings } from "./internal";
export { gainPower } from "./actions/power";
export function getAvailableChoices(s: GameState) {
  return s.pending.filter(
    (c) =>
      (!s.activeEffectBatch || c.batch === s.activeEffectBatch) &&
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
export function canConvertDuringChoice(s: GameState, seat: SeatId) {
  return (
    s.rulesVersion === RULES_VERSION &&
    s.status !== "finished" &&
    s.phase === "actions" &&
    s.activeSeat === seat &&
    !s.players[seat]?.passed &&
    s.pending.some((c) => c.seat === seat)
  );
}
export function getLegalActions(s: GameState, seat: SeatId): ActionOption[] {
  if (!s.players[seat] || s.status === "finished") return [];
  if (s.phase === "science" && !getWaitingSeats(s).includes(seat)) return [];
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
    return [{ kind: "chooseSetup", label: "选择种族与家园" }];
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
  const result =
    state.rulesVersion === "aoi-1.1+2024-09"
      ? (legacyAction(
          state as LegacyState,
          seat,
          action as LegacyAction,
        ) as Transition)
      : state.rulesVersion === "aoi-1.1+2024-09.engine-2"
        ? v2Action(state, seat, action)
        : state.rulesVersion === "aoi-1.1+2024-09.engine-3"
          ? v3Action(state, seat, action)
          : applyCurrentAction(state, seat, action);
  if (result.ok) {
    for (const c of result.state.pending)
      if (!state.pending.some((old) => old.id === c.id))
        c.triggerRevision = state.revision + 1;
    // Frozen v2 and v3 emit their own ledger.
    if (
      !["aoi-1.1+2024-09.engine-2", "aoi-1.1+2024-09.engine-3"].includes(
        state.rulesVersion,
      )
    )
      result.events.push(ledgerEntry(state, result.state, seat, action));
  }
  return result;
}
function applyCurrentAction(
  state: GameState,
  seat: SeatId,
  action: GameAction,
): Transition {
  if (state.rulesVersion !== RULES_VERSION)
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
      p.leechPolicy = { enabled: action.enabled, maxVpCost: action.maxVpCost };
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
      requireRule(c.seat === seat, "WRONG_RESPONDER");
      requireRule(
        !s.activeEffectBatch || c.batch === s.activeEffectBatch,
        "FINISH_EFFECT_BATCH",
      );
      if (c.batch) s.activeEffectBatch = c.batch;
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
        requireRule(
          c.canBuild !== false || !action.terraform.build,
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
        if (c.source !== "round-science") {
          awardRound(s, p, "spade", result.spades);
          if (result.built) awardRound(s, p, "workshop");
        }
        findCities(s, p);
      } else if (c.kind === "city") takeCity(s, p, action.option);
      else if (c.kind === "bridge" && action.option !== "discard") {
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
      } else if (c.kind === "competency") takeCompetency(s, p, action.option);
      else if (c.kind === "neutral") {
        requireRule(c.buildingKind, "INVALID_CHOICE");
        placeNeutral(s, p, c.buildingKind, action.option);
      }
      s.pending.splice(i, 1);
      if (c.batch)
        for (const child of s.pending)
          if (!priorChoices.has(child.id)) child.batch = c.batch;
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
        if (s.setup.offers) {
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
        advanceScience(s, p, action.track, gain);
        if (p.bonus === "scholar") p.vp += 2;
        if (p.competencies.includes("scholar-score")) p.vp += 2;
      } else if (action.kind === "advance") {
        advanceTechnology(s, p, action.track);
      } else if (action.kind === "powerAction") publicPower(s, p, action);
      else if (action.kind === "innovation") innovate(s, p, action);
      else if (action.kind === "special") special(s, p, action);
      else if (action.kind === "bookAction") bookAction(s, p, action);
      else if (action.kind === "pass") pass(s, p, action.bonus);
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
