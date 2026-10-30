import { SpadesForm } from "./spades-form";
import { hexLabel, bridgeLabel } from "./map-coordinates";
import { BookAllocation } from "./book-allocation";
import { groupBookChoices } from "../../../packages/rules/src/book-choice";
import {
  TableActionEditor,
  tableActionTargets,
  powerBridgeOptions,
} from "./table-action-editor";
import { t as translate } from "./i18n";
import { MapBuilding, BuildingLegend } from "./map-building";
import { RoundRibbon } from "./round-ribbon";
import { ScienceBoard } from "./science-board";
import { GameSymbol, type SymbolKind } from "./game-symbols";
import { MapActionPanel, type MapAnchor } from "./map-actions";
import { fieldLabels } from "./i18n/presentation";
import {
  SetupPanel,
  SpecialPanel,
  AbilityReference,
  BridgeChoice,
} from "./table-panels";
import { ReviewPanel, UndoNotice, type UndoRequest } from "./review";
import { GameClockPanel, type ClockSnapshot } from "./game-clock";
import { EndGamePanel, type EndRequest, type EndProposal } from "./end-game";
import {
  defaultGameSettings,
  type GameSettings,
} from "../../../packages/contracts/src/room";
import { TableHelp, jumpToTable } from "./table-help";
import {
  GuidedAction,
  FreeActions,
  PlacementPanel,
  PlacementTypeReview,
  terraformTargets,
  buildHighlights,
  suggestBooks,
  scholarKeyLimited,
} from "./action-guidance";
import {
  ledgerEntry,
  type ResourceChange,
} from "../../../packages/rules/src/ledger";
import {
  standardSetup,
  snakeSetup,
  placementOptions,
} from "../../../packages/rules/src/setup";
import { validBridgeGeometry } from "../../../packages/rules/src/actions/bridge";
import {
  palaces,
  innovations,
  bonusDescriptions,
  competencyDescriptions,
} from "./i18n/content";
import {
  replayRecord,
  type ReplayRecord,
} from "../../../packages/rules/src/replay";
import React, {
  useCallback,
  useEffect,
  useState,
  useRef,
  useMemo,
} from "react";
import type {
  GameAction,
  GameState,
  Terrain,
  Discipline,
  BoardMap,
} from "../../../packages/rules/src/types";
import type { CommandEnvelope } from "../../../packages/contracts/src/game";
import {
  createGame,
  usesCurrentActionProtocol,
  supportsBatchActions,
} from "../../../packages/rules/src/state";
import { withPowerBurn } from "./power-payment";
import { developmentSetup } from "../../../packages/rules/src/preset";
import { supportsTurnPlanning } from "../../../packages/rules/src/state";
import {
  planTurn,
  submissionActions,
  isLeechResponse,
  type TurnDraft,
} from "./turn-planner";
import { PersonalBoard } from "./personal-board";
import { finalPlayerDisplay } from "./final-player-display";
import { PlayerIncome } from "./player-income";
import { BoardActions, type BoardIntent } from "./board-actions";
import {
  ChoiceQueue,
  choiceTitle,
  choiceSource,
  cityDetails,
  currentTask,
  PlayerResources,
  FinalScores,
  bonusTitles,
  unusedSpecials,
} from "./table-experience";
import "./table-experience.css";
import {
  applyAction,
  getAvailableChoices,
  canConvertDuringChoice,
  canYieldToLeech,
  getWaitingSeats,
} from "../../../packages/rules/src/engine";
import {
  officialLarge,
  terrainCycle,
  bridgeSites,
} from "../../../packages/rules/src/map";
import { api, label, RequestError } from "./api";
const colors: Record<string, string> = {
  forest: "#779b82",
  lake: "#76b9c5",
  mountain: "#a8aaa6",
  desert: "#e9c773",
  plains: "#b59a77",
  swamp: "#738c9b",
  wasteland: "#c88770",
  river: "#d3e7e5",
};
const factionColors: Record<Terrain, string> = {
  forest: "#287444",
  lake: "#2875b5",
  mountain: "#777777",
  desert: "#dfb534",
  plains: "#8b542e",
  swamp: "#303d45",
  wasteland: "#be453c",
};
function freshDemo() {
  return createGame(
    developmentSetup("local-demo", [
      { id: "1", name: translate("ui.game.a0c7716669") },
      { id: "2", name: translate("ui.game.e8edae9acc") },
      { id: "3", name: translate("ui.game.e602d38d33") },
    ]),
  );
}
function getDemo() {
  try {
    const s = JSON.parse(localStorage.getItem("boardgame-demo-v1") ?? "null");
    if (s?.schemaVersion === 1) return s as GameState;
  } catch {}
  return freshDemo();
}
export function GamePage({
  id,
  demo = false,
}: {
  id?: string;
  demo?: boolean;
}) {
  const [liveState, setState] = useState<GameState | null>(() =>
      demo ? getDemo() : null,
    ),
    [seat, setSeat] = useState(() =>
      demo && liveState ? (getWaitingSeats(liveState)[0] ?? "p1") : "p1",
    ),
    [selected, setSelected] = useState(""),
    [draft, setDraft] = useState<CommandEnvelope | null>(null),
    [preview, setPreview] = useState<any>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [uncertain, setUncertain] = useState(false),
    [history, setHistory] = useState<any[]>([]),
    [tab, setTab] = useState("build"),
    [localCount, setLocalCount] = useState(3);
  const [localSetup, setLocalSetup] = useState("reverse");
  const actionInFlight = useRef(false);
  const confirmedClick = useRef(false);
  const automaticPassFinish = useRef("");
  const historyCursor = useRef<number | null>(null);
  const [viewed, setViewed] = useState<GameState | null>(null);
  const [requests, setRequests] = useState<UndoRequest[]>([]);
  const [endRequests, setEndRequests] = useState<EndRequest[]>([]);
  const [sessionSettings, setSessionSettings] =
    useState<GameSettings>(defaultGameSettings);
  const [clock, setClock] = useState<ClockSnapshot | null>(null);
  const [inactiveDeadline, setInactiveDeadline] = useState<string>();
  const [online, setOnline] = useState(navigator.onLine);
  const [planning, setPlanning] = useState(
    () =>
      localStorage.getItem("cellman-turn-planning") === "on" ||
      (localStorage.getItem("cellman-turn-planning") !== "off" && !demo),
  );
  const [turnDraft, setTurnDraft] = useState<TurnDraft | null>(null);
  const [stepReview, setStepReview] = useState(
    () => localStorage.getItem("cellman-step-review") === "on",
  );
  const [conversionPrompt, setConversionPrompt] = useState(
    () => localStorage.getItem("cellman-conversion-prompt") ?? "always",
  );
  const [endPrompt, setEndPrompt] = useState(false);
  const [intent, setIntent] = useState<BoardIntent | null>(null);
  const [tableIntent, setTableIntent] = useState<BoardIntent | null>(null);
  const [pickingTableTarget, setPickingTableTarget] = useState(false);
  const tableTrigger = useRef<HTMLElement | null>(null);
  const [mapMenu, setMapMenu] = useState<MapAnchor | null>(null);
  const [locatedHex, setLocatedHex] = useState("");
  const [mapPreview, setMapPreview] = useState(false);
  const [cityPick, setCityPick] = useState<{
    choiceId: string;
    option: string;
  } | null>(null);
  const draftKey = `cellman-turn:${id ?? "demo"}:${seat}`;
  const loadedDraft = useRef("");
  useEffect(() => {
    if (!liveState || viewed) return;
    if (turnDraft && liveState.revision !== turnDraft.baseRevision) {
      setTurnDraft(null);
      setDraft(null);
      setPreview(null);
      localStorage.removeItem(draftKey);
      setError(translate("ui.game.310b2ad06b"));
      return;
    }
    if (loadedDraft.current === draftKey) return;
    loadedDraft.current = draftKey;
    setTurnDraft(null);
    try {
      const saved = JSON.parse(localStorage.getItem(draftKey) ?? "null");
      if (
        saved &&
        saved.gameId === liveState.setup.id &&
        saved.baseRevision === liveState.revision &&
        planning &&
        supportsTurnPlanning(liveState.rulesVersion)
      )
        setTurnDraft(planTurn(liveState, seat, saved.actions));
      else if (saved) localStorage.removeItem(draftKey);
    } catch {
      localStorage.removeItem(draftKey);
    }
  }, [liveState, seat, draftKey, planning, viewed]);
  const clearTurn = () => {
    setTurnDraft(null);
    setDraft(null);
    setPreview(null);
    setEndPrompt(false);
    localStorage.removeItem(draftKey);
  };
  const saveTurn = (next: TurnDraft) => {
    setTurnDraft(next);
    localStorage.setItem(
      draftKey,
      JSON.stringify({
        gameId: liveState?.setup.id,
        baseRevision: next.baseRevision,
        actions: next.actions,
      }),
    );
  };
  const [connection, setConnection] = useState("connecting");
  const refreshSerial = useRef(0);
  const state = viewed ?? turnDraft?.state ?? liveState;
  const tableSpadesChoice =
    state &&
    getAvailableChoices(state).find(
      (c) =>
        c.seat === seat && c.kind === "spades" && c.source === "book-action",
    );
  useEffect(() => {
    if (preview && !mapPreview && !tableIntent && !tableSpadesChoice)
      jumpToTable("table-preview");
  }, [preview, mapPreview, tableIntent, tableSpadesChoice]);
  useEffect(() => {
    setMapMenu(null);
    setCityPick(null);
    setMapPreview(false);
    setTableIntent(null);
    setPickingTableTarget(false);
  }, [state?.revision, turnDraft?.actions.length, seat, viewed]);
  const competencyChoiceId =
    state &&
    getAvailableChoices(state).find(
      (c) => c.seat === seat && c.kind === "competency",
    )?.id;
  useEffect(() => {
    if (competencyChoiceId && !viewed) jumpToTable("table-competencies");
  }, [competencyChoiceId, viewed]);
  useEffect(() => {
    if (tableSpadesChoice && !viewed) jumpToTable("table-action-editor");
  }, [tableSpadesChoice?.id, viewed]);
  useEffect(() => {
    if (pickingTableTarget) jumpToTable("table-map-target");
  }, [pickingTableTarget]);
  const closeTableEditor = () => {
    if (busy || uncertain) return;
    setTableIntent(null);
    setPickingTableTarget(false);
    setDraft(null);
    setPreview(null);
    setError("");
    tableTrigger.current?.focus({ preventScroll: true });
  };
  const closeMapMenu = () => {
    if (busy || uncertain) return;
    setMapMenu(null);
    if (mapPreview) {
      setDraft(null);
      setPreview(null);
      setMapPreview(false);
    }
  };
  const planningEnabled =
    planning && supportsTurnPlanning(liveState?.rulesVersion ?? "");
  const highlighted = useMemo(
    () =>
      state
        ? tableIntent &&
          ((tableIntent.kind === "book" && tableIntent.id === "upgrade") ||
            (tableIntent.kind === "power" &&
              ["spade", "spades"].includes(tableIntent.id!)))
          ? tableActionTargets(state, seat, tableIntent)
          : buildHighlights(state, seat)
        : undefined,
    [state, seat, tableIntent],
  );
  const frozen = requests.some((r) => r.status === "pending");
  const readOnly =
    !!viewed ||
    frozen ||
    (!demo && !online) ||
    liveState?.matchResult?.loser === seat;
  const viewState = (next: GameState | null) => {
    if (turnDraft) {
      setError(translate("ui.game.c2d7746e9e"));
      return;
    }
    if (uncertain) {
      setError(translate("ui.game.28ce1db800"));
      return;
    }
    setViewed(next);
    setDraft(null);
    setPreview(null);
  };
  const exportRecord = async () => {
    try {
      const record = demo
        ? JSON.parse(localStorage.getItem("boardgame-demo-record") ?? "null")
        : await api("/games/" + id + "/replay");
      if (!record) throw Error(translate("ui.game.f19d1c0c5b"));
      replayRecord(record);
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(record, null, 2)], {
          type: "application/json",
        }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = `yijian-${state?.setup.id}.json`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const olderHistory = async () => {
    try {
      const old = await api(
        "/games/" + id + "/history?before=" + (history[0]?.revision ?? 1),
      );
      setHistory((h) => [
        ...old.filter((r: any) => !h.some((x) => x.revision === r.revision)),
        ...h,
      ]);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const refresh = useCallback(async () => {
    const serial = ++refreshSerial.current;
    if (demo) {
      try {
        const record = JSON.parse(
          localStorage.getItem("boardgame-demo-record") ?? "null",
        );
        if (record) setHistory(replayRecord(record).history);
      } catch {}
      return;
    }
    try {
      const data = await api("/games/" + id);
      const receivedAt = performance.now();
      if (data.state.setup.id !== id) return;
      // Idle polling still refreshes clocks/undo votes, but does not repeatedly
      // transfer the same 100 log entries. Catch-up is bounded per refresh.
      let cursor = historyCursor.current;
      const h: any[] = [];
      for (
        let batch = 0;
        batch < 5 && (cursor === null || cursor < data.state.revision);
        batch++
      ) {
        const rows = await api(
          "/games/" +
            id +
            "/history" +
            (cursor === null ? "" : "?after=" + cursor),
        );
        h.push(...rows);
        cursor = rows.at(-1)?.revision ?? data.state.revision;
        if (rows.length < 100) break;
      }
      if (serial !== refreshSerial.current) return;
      historyCursor.current = cursor;
      setState((current) =>
        current && current.revision > data.state.revision
          ? current
          : data.state,
      );
      setSeat(data.seat);
      setSessionSettings(data.settings ?? defaultGameSettings());
      setClock(data.clock ? { ...data.clock, receivedAt } : null);
      setInactiveDeadline(data.inactiveDeadline);
      setRequests(data.undoRequests ?? []);
      setEndRequests(data.endRequests ?? []);
      setHistory((current) =>
        (current.at(-1)?.revision ?? 0) > (h.at(-1)?.revision ?? 0)
          ? current
          : [
              ...current.filter(
                (row) => !h.some((next: any) => next.revision === row.revision),
              ),
              ...h,
            ].sort((a, b) => a.revision - b.revision),
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }, [id, demo]);
  useEffect(() => {
    refresh();
    if (demo) return;
    const stream = new EventSource("/api/games/" + id + "/events");
    stream.onopen = () => setConnection("connected");
    stream.onerror = () => setConnection("reconnecting");
    stream.onmessage = () => {
      setConnection("connected");
      refresh();
    };
    const wentOffline = () => setOnline(false);
    const wentOnline = () => {
      setOnline(true);
      refresh();
    };
    addEventListener("offline", wentOffline);
    addEventListener("online", wentOnline);
    const t = setInterval(() => {
      if (!document.hidden) refresh();
    }, 30000);
    const visible = () => {
      if (!document.hidden) refresh();
    };
    addEventListener("visibilitychange", visible);
    return () => {
      stream.close();
      clearInterval(t);
      removeEventListener("visibilitychange", visible);
      removeEventListener("offline", wentOffline);
      removeEventListener("online", wentOnline);
    };
  }, [refresh, id, demo]);
  const previewAction = async (
    action: GameAction,
    forceReview = false,
    commitPlacement = false,
  ) => {
    if (!state || readOnly || busy || uncertain || actionInFlight.current)
      return;
    if (
      action.kind === "scholar" &&
      usesCurrentActionProtocol(state.rulesVersion)
    ) {
      action = { ...action, useKey: true };
      const p = state.players[seat];
      const gain = action.slot === null ? 1 : action.slot === 0 ? 3 : 2;
      if (p.science[action.track] < 8 && p.science[action.track] + gain >= 8)
        forceReview = true;
    }
    action = withPowerBurn(state, seat, action);
    actionInFlight.current = true;
    setError("");
    setBusy(true);
    try {
      const command = {
        commandId: crypto.randomUUID(),
        expectedRevision: state.revision,
        action,
      };
      let result;
      if (
        demo ||
        (planningEnabled &&
          action.kind !== "turn" &&
          action.kind !== "setLeech" &&
          !isLeechResponse(state, action) &&
          liveState?.phase === "actions" &&
          liveState.activeSeat === seat &&
          !liveState.players[seat].passed)
      ) {
        const transition = applyAction(
          action.kind === "turn" ? liveState! : state,
          seat,
          action,
        );
        if (!transition.ok) throw new RequestError(transition.error.code);
        result = {
          state: transition.state,
          events: transition.events,
          baseRevision: state.revision,
        };
      } else result = await api("/games/" + id + "/preview", command);
      setDraft(command);
      setPreview(result);
      setUncertain(false);
      // Setup tiles are selections; ordinary actions already display a live quote.
      // Keep an explicit review for passing and discarding rewards.
      const responseId = action.kind === "respond" ? action.choiceId : null;
      const choosingPalace = state.pending.some(
        (c) =>
          ["palace", "bonus", "passFinish"].includes(c.kind) &&
          c.id === responseId,
      );
      const choosingBridge = state.pending.some(
        (c) => c.kind === "bridge" && c.id === responseId,
      );
      if (commitPlacement && action.kind === "place") {
        await confirm(command);
      } else if (
        !forceReview &&
        !scholarKeyLimited(state, seat, action) &&
        !choosingBridge &&
        (!stepReview ||
          choosingPalace ||
          action.kind === "collectBooks" ||
          action.kind === "setLeech" ||
          action.kind === "convertBatch") &&
        !(action.kind === "powerAction" && action.burn) &&
        !["draftPick", "chooseSetup", "place", "pass", "restore"].includes(
          action.kind,
        ) &&
        !(action.kind === "respond" && action.option === "discard")
      ) {
        await confirm(command);
      }
    } catch (e) {
      setError((e as Error).message);
      if (e instanceof RequestError && e.code === "REVISION_CONFLICT")
        refresh();
    } finally {
      setBusy(false);
      actionInFlight.current = false;
    }
  };
  const confirm = async (command: CommandEnvelope | null = draft) => {
    const draft = command;
    if (!draft || !state || readOnly) return;
    confirmedClick.current = true;
    setBusy(true);
    setError("");
    try {
      if (
        planningEnabled &&
        draft.action.kind !== "turn" &&
        draft.action.kind !== "setLeech" &&
        !isLeechResponse(state, draft.action) &&
        liveState?.phase === "actions" &&
        liveState.activeSeat === seat &&
        !liveState.players[seat].passed
      ) {
        saveTurn(
          planTurn(liveState, seat, [
            ...(turnDraft?.actions ?? []),
            draft.action,
          ]),
        );
        setDraft(null);
        setPreview(null);
        return;
      }
      if (demo) {
        const base = draft.action.kind === "turn" ? liveState! : state;
        const result = applyAction(base, seat, draft.action);
        if (!result.ok) throw new RequestError(result.error.code);
        let record;
        try {
          record = JSON.parse(
            localStorage.getItem("boardgame-demo-record") ?? "null",
          );
        } catch {}
        if (
          !record ||
          record.revision !== base.revision ||
          record.initial.setup.id !== state.setup.id
        )
          record = {
            format: "yijian-replay-v1",
            initial: base,
            commands: [],
            revision: state.revision,
          };
        result.state.revision++;
        record.commands.push({
          revision: result.state.revision,
          seat,
          action: draft.action,
        });
        record.revision = result.state.revision;
        localStorage.setItem("boardgame-demo-record", JSON.stringify(record));
        setState(result.state);
        setSeat(getWaitingSeats(result.state)[0] ?? seat);
        localStorage.setItem("boardgame-demo-v1", JSON.stringify(result.state));
        setHistory((h) => [
          ...h,
          { revision: result.state.revision, events: result.events },
        ]);
      } else {
        await api("/games/" + id + "/commands", draft);
        clearTurn();
        await refresh();
      }
      clearTurn();
      setDraft(null);
      setPreview(null);
      setUncertain(false);
      if (draft.action.kind === "place") setSelected("");
    } catch (e) {
      setError((e as Error).message);
      setUncertain(e instanceof RequestError && e.code === "NETWORK_ERROR");
      if (e instanceof RequestError && e.code === "REVISION_CONFLICT") {
        setDraft(null);
        setPreview(null);
        await refresh();
      }
    } finally {
      setBusy(false);
    }
  };
  const passFinishChoice =
    state &&
    getAvailableChoices(state).find(
      (c) => c.seat === seat && c.kind === "passFinish",
    );
  useEffect(() => {
    if (
      !passFinishChoice ||
      conversionPrompt !== "never" ||
      readOnly ||
      busy ||
      uncertain
    )
      return;
    const key = `${state?.setup.id}:${seat}:${passFinishChoice.id}:${state?.revision}:${turnDraft?.actions.length ?? 0}`;
    if (automaticPassFinish.current === key) return;
    const timer = window.setTimeout(() => {
      if (actionInFlight.current) return;
      automaticPassFinish.current = key;
      void previewAction({
        kind: "respond",
        choiceId: passFinishChoice.id,
        option: "finish",
      });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [
    passFinishChoice?.id,
    conversionPrompt,
    readOnly,
    busy,
    uncertain,
    state?.revision,
    seat,
    turnDraft?.actions.length,
  ]);
  const localRestore = (record: ReplayRecord) => {
    const restored = replayRecord(record);
    record.format = "yijian-replay-v2";
    localStorage.setItem("boardgame-demo-record", JSON.stringify(record));
    localStorage.setItem("boardgame-demo-v1", JSON.stringify(restored.state));
    setState(restored.state);
    setViewed(null);
    setDraft(null);
    setPreview(null);
    setSeat(getWaitingSeats(restored.state)[0] ?? seat);
    setHistory(restored.history);
  };
  const vote = async (
    request: UndoRequest,
    decision: "approve" | "reject" | "cancel",
  ) => {
    setBusy(true);
    setError("");
    try {
      await api(`/games/${id}/undo/vote`, { requestId: request.id, decision });
      await refresh();
      setViewed(null);
      setDraft(null);
      setPreview(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const endMutation = async (
    path: "request" | "vote",
    input:
      | EndProposal
      | { requestId: string; decision: "approve" | "reject" | "cancel" },
  ) => {
    if (
      !liveState ||
      busy ||
      viewed ||
      !online ||
      uncertain ||
      actionInFlight.current
    )
      return false;
    setBusy(true);
    setError("");
    try {
      const result = await api(`/games/${id}/end/${path}`, input);
      if (result.status === "applied") {
        setDraft(null);
        setPreview(null);
        setTurnDraft(null);
      }
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      await refresh();
      setBusy(false);
    }
  };
  const adjudicate = async (reason: "forfeit" | "close", target?: string) => {
    if (!liveState || busy || viewed) return;
    setBusy(true);
    setError("");
    try {
      await api(`/games/${id}/adjudicate`, {
        expectedRevision: liveState.revision,
        reason,
        target,
      });
      setDraft(null);
      setPreview(null);
      setTurnDraft(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      await refresh();
      setBusy(false);
    }
  };
  if (!state)
    return (
      <main className="empty">{error || translate("ui.game.86dc53393e")}</main>
    );
  const player = state.players[seat],
    waiting = getWaitingSeats(state),
    myTurn =
      waiting.includes(seat) || (!!turnDraft && canYieldToLeech(state, seat)),
    r = finalPlayerDisplay(state, player).resources;
  const selectedBuilding = state.board.buildings[selected];
  const selectedDescription = selected
    ? `${hexLabel(selected)} · ${label(state.board.terrain[selected] ?? officialLarge.hexes[selected]?.terrain)} · ${selectedBuilding ? translate("ui.game.2704be0cde", { p0: state.players[selectedBuilding.seat]?.name, p1: label(selectedBuilding.kind), p2: selectedBuilding.neutral ? translate("ui.game.4e3c82b301") : "" }) : translate("ui.game.cb557c76d0")}`
    : translate("ui.game.36ed07fd6d");
  const task =
    turnDraft && canYieldToLeech(state, seat)
      ? translate("turn.beforeLeech")
      : currentTask(state, seat);
  const pendingBridge = getAvailableChoices(state).find(
    (c) => c.seat === seat && c.kind === "bridge",
  );
  const turnAction: GameAction | null = turnDraft
    ? { kind: "turn", actions: submissionActions(turnDraft, seat) }
    : null;
  const turnReady =
    !!turnAction && !!liveState && applyAction(liveState, seat, turnAction).ok;
  const canConvert = (
    [
      { kind: "burn", count: 1 },
      { kind: "convert", from: "power", to: "coin", count: 1 },
      { kind: "convert", from: "tool", to: "coin", count: 1 },
      { kind: "convert", from: "scholar", to: "tool", count: 1 },
      ...[0, 1, 2, 3].map((color) => ({
        kind: "convert",
        from: "book",
        to: "coin",
        count: 1,
        color,
      })),
    ] as GameAction[]
  ).some((a) => applyAction(state, seat, a).ok);
  const publishTurn = () => {
    if (!turnAction) return;
    const powerGained = turnDraft?.actions.some((_, i) => {
      const before = planTurn(liveState!, seat, turnDraft.actions.slice(0, i))
        .state.players[seat].resources.power;
      const after = planTurn(
        liveState!,
        seat,
        turnDraft.actions.slice(0, i + 1),
      ).state.players[seat].resources.power;
      return after[1] + 2 * after[2] > before[1] + 2 * before[2];
    });
    if (
      !endPrompt &&
      canConvert &&
      (!state.pending.length || canYieldToLeech(state, seat)) &&
      (conversionPrompt === "always" ||
        (conversionPrompt === "power" && powerGained))
    ) {
      setEndPrompt(true);
      return;
    }
    setEndPrompt(false);
    previewAction(turnAction);
  };
  const setupReview = state.phase === "draft" || state.phase === "placement";
  const bookGroups = supportsBatchActions(state.rulesVersion)
    ? groupBookChoices(getAvailableChoices(state), seat)
    : [];
  const bookGroupById = new Map(
    bookGroups.map((group) => [group[0].id, group]),
  );
  const groupedBookIds = new Set(
    bookGroups.flatMap((group) => group.slice(1).map((c) => c.id)),
  );
  const previewPanel = preview && draft && (
    <div
      className={`preview-panel ${setupReview ? "draft-confirmation" : ""}`}
      id="table-preview"
      tabIndex={-1}
    >
      {!setupReview && <strong>{translate("ui.game.db51313720")}</strong>}
      {scholarKeyLimited(state, seat, draft.action) && (
        <p className="action-warning">{translate("science.noKeyWarning")}</p>
      )}
      {draft.action.kind === "scholar" &&
        draft.action.useKey &&
        preview.state.players[seat].keysUsed > player.keysUsed && (
          <p className="action-warning">{translate("science.useKeyWarning")}</p>
        )}
      {draft.action.kind === "powerAction" && !!draft.action.burn && (
        <p className="power-burn-quote">
          {translate("powerPayment.burn", { count: draft.action.burn })}
        </p>
      )}
      {draft.action.kind === "respond" && draft.action.option === "discard" && (
        <p className="action-warning">
          {translate("ui.game.24487ff158")}
          {state.pending
            .filter(
              (c) =>
                draft.action.kind === "respond" &&
                c.id === draft.action.choiceId,
            )
            .map(choiceTitle)
            .join("、")}
          {translate("ui.game.49801b4d1c")}
        </p>
      )}
      {draft.action.kind === "pass" && (
        <div className="pass-review">
          <strong>
            {state.round === 6
              ? translate("ui.game.a60165e865")
              : translate("ui.game.819b05a67d")}
          </strong>
          {unusedSpecials(player).length > 0 && (
            <div className="action-warning">
              {translate("ui.game.452ec2f811")}
              <ul>
                {unusedSpecials(player).map((s) => (
                  <li key={s.id}>{s.label}</li>
                ))}
              </ul>
              {translate("ui.game.bf3c4cc0f4")}
            </div>
          )}
          <p className="small">
            {state.round < 6
              ? translate("ui.game.c9b39e706b", {
                  p0: state.passOrder.length + 1,
                })
              : translate("ui.game.d0c788951a")}
          </p>
        </div>
      )}
      {!setupReview && (
        <p>
          {planningEnabled &&
          draft.action.kind !== "turn" &&
          !isLeechResponse(state, draft.action) &&
          liveState?.phase === "actions" &&
          liveState.activeSeat === seat
            ? translate("ui.game.be41b95875")
            : translate("ui.game.0054637815")}
        </p>
      )}
      <div className="preview-summary">
        <PreviewChanges
          before={draft.action.kind === "turn" ? liveState! : state}
          after={preview.state}
          seat={seat}
          action={draft.action}
        />
      </div>
      {!setupReview && (
        <p className="small">
          {demo
            ? translate("ui.game.4afdd6b75a")
            : translate("ui.game.35af3ebaf3")}
        </p>
      )}
      {draft.expectedRevision !== state.revision && !uncertain && (
        <p className="error">{translate("ui.game.f52322b95e")}</p>
      )}
      <button
        className="primary full"
        disabled={
          busy ||
          readOnly ||
          (!uncertain && draft.expectedRevision !== state.revision)
        }
        onClick={() => confirm()}
      >
        {uncertain
          ? translate("ui.game.35814ebc91")
          : planningEnabled &&
              draft.action.kind !== "turn" &&
              draft.action.kind !== "setLeech" &&
              !isLeechResponse(state, draft.action) &&
              liveState?.phase === "actions" &&
              liveState.activeSeat === seat &&
              !liveState.players[seat].passed
            ? translate("ui.game.23a7807b5e")
            : translate("ui.game.9ebe36f8cf")}
      </button>
      {!uncertain && (
        <button
          className="text-button full"
          onClick={() => {
            if (
              draft.action.kind === "powerAction" &&
              draft.action.id === "bridge" &&
              tableIntent
            ) {
              closeTableEditor();
              return;
            }
            if (draft.action.kind === "place") setSelected("");
            setDraft(null);
            setPreview(null);
          }}
        >
          {translate("ui.game.3160fc9159")}
        </button>
      )}
    </div>
  );
  const powerPreview =
    tableIntent?.kind === "power" && tableIntent.id
      ? withPowerBurn(state, seat, { kind: "powerAction", id: tableIntent.id })
      : draft?.action;
  const previewBurn =
    !state.players[seat]?.primaryDone && powerPreview?.kind === "powerAction"
      ? (powerPreview.burn ?? 0)
      : 0;
  return (
    <main
      className={`game-page ${state.phase === "draft" && state.setup.draft ? "snake-drafting" : ""}`}
      onClickCapture={(event) => {
        // A confirmed panel can disappear between clicks of one double-click.
        // Do not let its second click activate the newly exposed control.
        if (event.detail > 1 && confirmedClick.current) {
          event.preventDefault();
          event.stopPropagation();
        } else if (event.detail <= 1) confirmedClick.current = false;
      }}
    >
      <div
        className="turn-bar"
        role="region"
        aria-label={translate("ui.game.ef26096871")}
      >
        <strong>
          {viewed
            ? translate("ui.game.d909d78ffc")
            : turnDraft
              ? translate("ui.game.b2c391591c", {
                  p0: turnDraft.actions.length,
                })
              : state.status === "finished"
                ? translate("ui.game.91456873df")
                : myTurn
                  ? task
                  : task}
        </strong>
        <span className="small">
          {turnDraft
            ? translate("ui.game.a6c160d88d")
            : state.phase === "draft"
              ? translate("ui.game.3dab827ed0")
              : selected
                ? selectedDescription
                : translate("ui.game.ed1a91890a", { p0: state.round })}
        </span>
        {turnDraft && (
          <div className="turn-buttons">
            <button
              disabled={busy || uncertain || readOnly}
              onClick={() => {
                const actions = turnDraft.actions.slice(0, -1);
                if (actions.length)
                  saveTurn(planTurn(liveState!, seat, actions));
                else clearTurn();
                setDraft(null);
                setPreview(null);
              }}
            >
              {translate("ui.game.c1ddffa2e6")}
            </button>
            <button
              disabled={busy || uncertain || readOnly}
              onClick={clearTurn}
            >
              {translate("ui.game.668eb0ca1f")}
            </button>
            <button
              className="primary"
              disabled={!turnReady || busy || uncertain || readOnly}
              onClick={publishTurn}
            >
              {state.pending.some((c) => c.seat !== seat)
                ? translate("ui.game.c1a6e94ba1")
                : translate("ui.game.4ee4fb9525")}
            </button>
          </div>
        )}
        {turnDraft && !turnReady && (
          <span className="small">{translate("ui.game.c0d24bce23")}</span>
        )}
        {turnDraft && canYieldToLeech(state, seat) && (
          <span className="small">{translate("turn.beforeLeech")}</span>
        )}
        {endPrompt && (
          <div className="end-turn-prompt" role="status">
            {translate("ui.game.f246e0be48")}
            <button
              onClick={() => {
                setEndPrompt(false);
                document
                  .querySelector<HTMLDetailsElement>(".free-actions")
                  ?.setAttribute("open", "");
                jumpToTable("table-actions");
              }}
            >
              {translate("ui.game.62ac572279")}
            </button>
            <button className="primary" onClick={publishTurn}>
              {translate("ui.game.bac8a62c6c")}
            </button>
          </div>
        )}
        {setupReview && previewPanel}
        {state.phase === "placement" &&
          myTurn &&
          !readOnly &&
          placementOptions(state, seat).length > 1 && (
            <PlacementTypeReview
              key={`${state.setup.id}:${state.revision}:${seat}:${selected}`}
              state={state}
              seat={seat}
              selected={selected}
              disabled={busy || uncertain}
              onCommit={(action) => void previewAction(action, false, true)}
              onCancel={() => setSelected("")}
            />
          )}
      </div>
      <div className="table-heading">
        <div>
          <a href="#/" className="back-link">
            {translate("ui.game.124c5815d6")}
          </a>
          <h1>
            {translate("ui.game.1518bcfff0")}
            <span>AGE OF INNOVATION</span>
          </h1>
        </div>
        <div className="table-meta">
          <span className="tag">
            {demo
              ? translate("ui.game.5f116605ca")
              : translate("ui.game.cc182c3389")}
          </span>
          <strong>
            {translate("ui.game.9552fe3bd3")}
            {state.round} <small>{translate("ui.game.773e0dc408")}</small>
          </strong>
          <span className="muted">
            {translate("ui.game.f1ac9351c7")}
            {state.revision}
          </span>
        </div>
      </div>
      {!demo && (
        <div className="connection-status" role="status">
          <span>
            {!online
              ? translate("ui.game.68b4fdcbf0")
              : connection === "connected"
                ? translate("ui.game.b08e587d5d")
                : connection === "reconnecting"
                  ? translate("ui.game.e959b869d2")
                  : translate("ui.game.f34374f220")}
          </span>
          {online && connection !== "connected" && (
            <button className="text-button" onClick={refresh}>
              {translate("ui.game.d5a8d22971")}
            </button>
          )}
        </div>
      )}
      <TableHelp state={state} />
      {viewed && (
        <section className="notice history-notice" role="status">
          <strong>
            {translate("ui.game.950a3ac361")}
            {viewed.revision} {translate("ui.game.74139b0130")}
          </strong>
          <p>
            {translate("ui.game.59b7f424e3")}
            {liveState?.revision}
            {translate("ui.game.76704a58b1")}
          </p>
          <button onClick={() => viewState(null)}>
            {translate("ui.game.4a507105ed")}
          </button>
        </section>
      )}
      {liveState && !demo && (
        <GameClockPanel
          state={liveState}
          settings={sessionSettings}
          clock={clock}
          seat={seat}
          inactiveDeadline={inactiveDeadline}
          disabled={busy || !!viewed || !online || uncertain}
          onAdjudicate={adjudicate}
        />
      )}
      {liveState && (
        <UndoNotice
          requests={requests}
          state={liveState}
          seat={seat}
          busy={busy}
          onVote={vote}
        />
      )}
      {liveState && !demo && (
        <EndGamePanel
          state={liveState}
          seat={seat}
          requests={endRequests}
          disabled={busy || !!viewed || !online || uncertain}
          undoPending={requests.some((r) => r.status === "pending")}
          onRequest={(input) => endMutation("request", input)}
          onVote={(requestId, decision) =>
            endMutation("vote", { requestId, decision })
          }
        />
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {demo && (
        <div className="demo-strip">
          <span>{translate("ui.game.f309a5a067")}</span>
          <select
            aria-label={translate("ui.game.a49049744f")}
            value={localCount}
            onChange={(e) => setLocalCount(Number(e.target.value))}
          >
            {[3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n} {translate("ui.game.d63842643d")}
              </option>
            ))}
          </select>
          <select
            aria-label={translate("demo.setupMode")}
            value={localSetup}
            onChange={(e) => setLocalSetup(e.target.value)}
          >
            <option value="standard">{translate("demo.standardSetup")}</option>
            <option value="forward">
              {translate("ui.table-panels.81dc8bf7f7")}
            </option>
            <option value="reverse">
              {translate("ui.table-panels.e1e8017dd3")}
            </option>
          </select>
          <button
            className="secondary"
            onClick={() => {
              const gameId = crypto.randomUUID();
              const players = Array.from({ length: localCount }, (_, i) => ({
                id: String(i),
                name: translate("ui.game.56bf69b861", { p0: i + 1 }),
              }));
              const next = createGame(
                localSetup === "standard"
                  ? standardSetup(gameId, players)
                  : snakeSetup(
                      gameId,
                      players,
                      localSetup === "forward" ? "forward" : "reverse",
                    ),
              );
              setState(next);
              clearTurn();
              setViewed(null);
              setSeat(next.activeSeat);
              setDraft(null);
              setPreview(null);
              setHistory([]);
              setError("");
              localStorage.setItem("boardgame-demo-v1", JSON.stringify(next));
              localStorage.removeItem("boardgame-demo-record");
            }}
          >
            {translate("ui.game.4716d348fe")}
          </button>
          <select
            aria-label={translate("ui.game.fd2cd0221d")}
            value={seat}
            onChange={(e) => {
              setSeat(e.target.value);
              setPreview(null);
              setDraft(null);
            }}
          >
            {Object.values(state.players).map((p) => (
              <option key={p.seat} value={p.seat}>
                {p.name}
              </option>
            ))}
          </select>
          <button
            className="text-button"
            onClick={() => {
              const next = freshDemo();
              clearTurn();
              setState(next);
              setViewed(null);
              setSeat("p1");
              setDraft(null);
              setPreview(null);
              setHistory([]);
              localStorage.setItem("boardgame-demo-v1", JSON.stringify(next));
              localStorage.removeItem("boardgame-demo-record");
            }}
          >
            {translate("ui.game.cc92cb4b89")}
          </button>
        </div>
      )}
      <div className="table-workspace">
        <aside className="table-player-rail">
          <div className="player-bar">
            {Object.values(state.players)
              .map((p) => finalPlayerDisplay(state, p))
              .map((p, i) => (
                <div
                  key={p.seat}
                  className={
                    "player-chip " + (waiting.includes(p.seat) ? "active" : "")
                  }
                >
                  <span
                    className="player-dot"
                    style={{ background: factionColors[p.native] }}
                  />
                  <div className="player-identity">
                    <strong>
                      {p.name}
                      {p.seat === seat ? translate("ui.game.4bb17ff691") : ""}
                    </strong>
                    <span>
                      {state.phase === "draft" && state.setup.draft
                        ? translate("ui.game.840c7c7418", {
                            p0: Object.keys(state.draftPicks?.[p.seat] ?? {})
                              .length,
                          })
                        : state.phase === "draft" &&
                            state.turnOrder.indexOf(p.seat) <
                              state.turnOrder.length - (state.draftIndex ?? 0)
                          ? translate("ui.game.451a9ef2ac")
                          : `${label(p.native)} · ${label(p.faction)}`}
                    </span>
                  </div>
                  <strong className="score">
                    {state.status === "finished"
                      ? (state.scores.find((score) => score.seat === p.seat)
                          ?.total ?? p.vp)
                      : p.vp}
                    <small> {translate("ui.game.b75a03ace7")}</small>
                  </strong>
                  <span className="turn-tag">
                    {state.status === "finished"
                      ? translate("ui.game.256404af25")
                      : waiting.includes(p.seat)
                        ? translate("ui.game.d03d3b10f9")
                        : p.passed
                          ? translate("ui.game.b1ad507761")
                          : translate("ui.game.251bc40e70")}
                  </span>
                  {state.phase !== "draft" && (
                    <>
                      <PlayerResources
                        player={
                          p.seat === seat && previewBurn
                            ? {
                                ...p,
                                resources: {
                                  ...p.resources,
                                  power: [
                                    p.resources.power[0],
                                    p.resources.power[1] - previewBurn * 2,
                                    p.resources.power[2] + previewBurn,
                                  ],
                                },
                              }
                            : p
                        }
                      />
                      {p.seat === seat && previewBurn > 0 && (
                        <small className="muted">
                          {translate("powerPayment.preview")}
                        </small>
                      )}
                    </>
                  )}
                  {state.phase !== "draft" && (
                    <PlayerIncome
                      state={state}
                      player={p}
                      onAdvance={
                        p.seat === seat && !readOnly
                          ? (track) => {
                              setTableIntent(null);
                              void previewAction(
                                { kind: "advance", track },
                                true,
                              ).then(() => jumpToTable("table-preview"));
                            }
                          : undefined
                      }
                      advanceEnabled={Object.fromEntries(
                        (["sailing", "terraform"] as const).map((track) => [
                          track,
                          p.seat === seat &&
                            !busy &&
                            !uncertain &&
                            myTurn &&
                            applyAction(state, seat, { kind: "advance", track })
                              .ok,
                        ]),
                      )}
                    />
                  )}
                </div>
              ))}
          </div>
          <details className="opponent-resources">
            <summary>{translate("ui.game.c332015814")}</summary>
            <div className="resource-table">
              {Object.values(state.players)
                .map((p) => finalPlayerDisplay(state, p))
                .map((p) => (
                  <div key={p.seat}>
                    <strong>{p.name}</strong>
                    <span>
                      {translate("ui.game.f34e4daa0c")}
                      {p.resources.coins}
                    </span>
                    <span>
                      {translate("ui.game.0d474170c7")}
                      {p.resources.tools}
                    </span>
                    <span>
                      {translate("ui.game.394bba8648")}
                      {p.resources.scholars}
                    </span>
                    <span>
                      {translate("ui.game.c59cf7d31e")}
                      {p.resources.books.join(" / ")}
                    </span>
                    <span>
                      {translate("ui.game.c9c1abba38")}
                      {p.resources.power.join(" / ")}
                    </span>
                  </div>
                ))}
            </div>
          </details>
        </aside>
        <div className="table-play-area">
          <ChoiceQueue state={state} seat={seat} />
          {state.status === "finished" && <FinalScores state={state} />}
          <div
            className={`table-grid ${state.phase === "draft" ? "draft-layout" : ""}`}
          >
            <section className="board-column">
              <div className="board-toolbar">
                <span>
                  <i className={"status-dot " + (myTurn ? "on" : "")} />
                  {task}
                </span>
                <span className="muted">
                  {selected
                    ? selected +
                      " · " +
                      label(
                        state.board.terrain[selected] ??
                          officialLarge.hexes[selected]?.terrain,
                      )
                    : state.phase === "draft"
                      ? translate("ui.game.9450e5a313")
                      : translate("ui.game.f3d3462f8d")}
                </span>
              </div>
              <nav
                hidden={state.phase === "draft"}
                className="market-shortcuts"
                aria-label={translate("market.navigation")}
              >
                <button
                  className="secondary"
                  onClick={() => jumpToTable("table-public-actions")}
                >
                  {translate("market.publicActions")}
                </button>
                <button
                  className="secondary"
                  onClick={() => jumpToTable("table-innovations")}
                >
                  {translate("market.innovations")}
                </button>
                <button
                  className="secondary"
                  onClick={() => jumpToTable("table-competencies")}
                >
                  {translate("competency.market")}
                </button>
              </nav>
              <RoundRibbon state={state} />
              {pickingTableTarget && (tableIntent || tableSpadesChoice) && (
                <div
                  id="table-map-target"
                  tabIndex={-1}
                  className="table-map-prompt"
                  role="status"
                >
                  <span>
                    {translate(
                      tableIntent?.kind === "power" &&
                        tableIntent.id === "bridge"
                        ? "bridge.mapPrompt"
                        : "tableAction.mapPrompt",
                    )}
                  </span>
                  <button
                    className="secondary"
                    onClick={() => {
                      setPickingTableTarget(false);
                      jumpToTable("table-action-editor");
                    }}
                  >
                    {translate("tableAction.return")}
                  </button>
                  {tableIntent && (
                    <button className="text-button" onClick={closeTableEditor}>
                      {translate("tableAction.cancel")}
                    </button>
                  )}
                </div>
              )}
              {cityPick && (
                <div className="action-notice" role="status">
                  <strong>
                    {translate("city.selectMarker", {
                      reward: label("city:" + cityPick.option),
                    })}
                  </strong>
                  <button
                    className="secondary"
                    onClick={() => {
                      setCityPick(null);
                      setDraft(null);
                      setPreview(null);
                      setSelected("");
                    }}
                    disabled={busy || uncertain}
                  >
                    {translate("tableAction.cancel")}
                  </button>
                </div>
              )}
              <MapBoard
                located={locatedHex}
                onClearLocation={() => setLocatedHex("")}
                state={state}
                selected={selected}
                onSelect={(hex, anchor) => {
                  const buildChoice = getAvailableChoices(state).find(
                    (c) =>
                      c.seat === seat &&
                      c.kind === "buildWorkshop" &&
                      (c.buildHexes?.length ?? 0) > 1,
                  );
                  if (buildChoice && !readOnly && !busy && !uncertain) {
                    if (!buildChoice.buildHexes?.includes(hex)) return;
                    setSelected(hex);
                    previewAction(
                      {
                        kind: "respond",
                        choiceId: buildChoice.id,
                        option: "build",
                        buildHex: hex,
                      },
                      true,
                    );
                    return;
                  }
                  if (cityPick && !readOnly && !busy && !uncertain) {
                    const choice = state.pending.find(
                      (c) => c.id === cityPick.choiceId,
                    );
                    if (
                      state.board.buildings[hex]?.seat !== seat ||
                      state.board.buildings[hex]?.cityId !== choice?.source
                    )
                      return;
                    setSelected(hex);
                    previewAction(
                      { kind: "respond", ...cityPick, cityHex: hex },
                      true,
                    );
                    return;
                  }
                  if (state.phase === "placement" && !readOnly) {
                    if (busy || uncertain) return;
                    setSelected(hex);
                    setDraft(null);
                    setPreview(null);
                    const options = placementOptions(state, seat);
                    if (
                      myTurn &&
                      !state.pending.length &&
                      options.length === 1
                    ) {
                      const action = {
                        kind: "place" as const,
                        hex,
                        building: options[0] as
                          "workshop" | "tower" | "university",
                      };
                      if (applyAction(state, seat, action).ok)
                        previewAction(action);
                    }
                    return;
                  }
                  if (mapMenu && (busy || uncertain)) return;
                  if ((tableIntent || tableSpadesChoice) && (busy || uncertain))
                    return;
                  setSelected(hex);
                  if (
                    tableSpadesChoice ||
                    (tableIntent?.kind === "book" &&
                      tableIntent.id === "upgrade") ||
                    (tableIntent?.kind === "power" &&
                      ["spade", "spades"].includes(tableIntent.id!))
                  ) {
                    setPickingTableTarget(false);
                    jumpToTable("table-action-editor");
                    return;
                  }
                  if (tableIntent) closeTableEditor();
                  if (
                    state.phase === "actions" &&
                    !state.pending.length &&
                    state.activeSeat === seat &&
                    !player.primaryDone
                  )
                    setIntent({ kind: "build", nonce: Date.now() });
                  if (
                    state.status === "active" &&
                    state.phase === "actions" &&
                    !state.pending.length &&
                    state.activeSeat === seat &&
                    !player.primaryDone &&
                    !readOnly &&
                    !busy &&
                    !uncertain &&
                    (state.board.terrain[hex] ??
                      officialLarge.hexes[hex]?.terrain) !== "river"
                  ) {
                    setMapMenu(anchor ?? { x: 20, y: 100 });
                    setMapPreview(false);
                    setDraft(null);
                    setPreview(null);
                  } else if (mapMenu) closeMapMenu();
                }}
                allowRiver={player.palace === "river-city"}
                highlighted={highlighted}
                selectedBridge={
                  draft?.action.kind === "powerAction" &&
                  draft.action.id === "bridge"
                    ? `${draft.action.a}:${draft.action.b}`
                    : undefined
                }
                bridgeOptions={
                  pendingBridge?.options.filter(
                    (pair) =>
                      pair !== "discard" &&
                      applyAction(state, seat, {
                        kind: "respond",
                        choiceId: pendingBridge.id,
                        option: pair,
                      }).ok,
                  ) ??
                  (tableIntent?.kind === "power" && tableIntent.id === "bridge"
                    ? powerBridgeOptions(state, seat)
                    : undefined)
                }
                onBridgeSelect={(pair) => {
                  if (readOnly || !myTurn || busy || uncertain) return;
                  if (pendingBridge)
                    previewAction({
                      kind: "respond",
                      choiceId: pendingBridge.id,
                      option: pair,
                    });
                  else if (
                    tableIntent?.kind === "power" &&
                    tableIntent.id === "bridge"
                  ) {
                    const [a, b] = pair.split(":");
                    setPickingTableTarget(false);
                    void previewAction(
                      { kind: "powerAction", id: "bridge", a, b },
                      true,
                    ).then(() => jumpToTable("table-action-editor"));
                  }
                }}
              />
              <div className="terrain-legend">
                {terrainCycle.map((t) => (
                  <span key={t}>
                    <i style={{ background: colors[t] }} />
                    {label(t)}
                  </span>
                ))}
              </div>
              <BuildingLegend />
              <ScienceBoard state={state} seat={seat} />
              {state.phase !== "draft" && (
                <BoardActions
                  state={state}
                  seat={seat}
                  disabled={
                    state.phase !== "actions" ||
                    !myTurn ||
                    busy ||
                    uncertain ||
                    readOnly ||
                    !!state.pending.length
                  }
                  choiceDisabled={busy || uncertain || readOnly}
                  activeIntent={tableIntent}
                  renderEditor={(kind) =>
                    tableIntent?.kind === kind ? (
                      <TableActionEditor
                        onSelectHex={setSelected}
                        key={seat + ":" + tableIntent.nonce}
                        state={state}
                        seat={seat}
                        intent={tableIntent}
                        selected={selected}
                        stepwise={
                          planningEnabled ||
                          usesCurrentActionProtocol(state.rulesVersion)
                        }
                        disabled={
                          !myTurn ||
                          busy ||
                          uncertain ||
                          readOnly ||
                          !!state.pending.length ||
                          player.primaryDone
                        }
                        error={error}
                        preview={previewPanel}
                        onAction={previewAction}
                        onCancel={closeTableEditor}
                        onPickMap={() => {
                          setPickingTableTarget(true);
                        }}
                      />
                    ) : kind === "book" && tableSpadesChoice ? (
                      <section
                        id="table-action-editor"
                        className="table-action-editor"
                        tabIndex={-1}
                        aria-label={choiceTitle(tableSpadesChoice)}
                      >
                        <h4>{choiceTitle(tableSpadesChoice)}</h4>
                        {error && (
                          <p className="unavailable" role="alert">
                            {error}
                          </p>
                        )}
                        {previewPanel || (
                          <>
                            <div className="table-target-picker">
                              <p role="status">
                                {selected
                                  ? translate("tableAction.selected", {
                                      hex: hexLabel(selected),
                                    })
                                  : translate("tableAction.noTarget")}
                              </p>
                              <button
                                className="secondary"
                                disabled={busy || uncertain || readOnly}
                                onClick={() => {
                                  setPickingTableTarget(true);
                                }}
                              >
                                {translate(
                                  selected
                                    ? "tableAction.changeTarget"
                                    : "tableAction.pickTarget",
                                )}
                              </button>
                            </div>
                            <SpadesForm
                              onSelectHex={setSelected}
                              onPickMap={() => setPickingTableTarget(true)}
                              key={tableSpadesChoice.id}
                              stepwise={
                                planningEnabled ||
                                usesCurrentActionProtocol(state.rulesVersion)
                              }
                              state={state}
                              seat={seat}
                              selected={selected}
                              native={player.native}
                              amount={tableSpadesChoice.amount}
                              canBuild={tableSpadesChoice.canBuild !== false}
                              travelOptions={[
                                ...(player.faction === "moles"
                                  ? ["tunnel" as const]
                                  : []),
                                ...(player.palace === "flight"
                                  ? ["flight" as const]
                                  : []),
                              ]}
                              disabled={busy || uncertain || readOnly}
                              onPreview={previewAction}
                              toAction={(terraform) => ({
                                kind: "respond",
                                choiceId: tableSpadesChoice.id,
                                option: "terraform",
                                terraform,
                              })}
                            />
                            {tableSpadesChoice.options.includes("discard") && (
                              <button
                                className="text-button"
                                disabled={busy || uncertain || readOnly}
                                onClick={() =>
                                  previewAction({
                                    kind: "respond",
                                    choiceId: tableSpadesChoice.id,
                                    option: "discard",
                                  })
                                }
                              >
                                {translate("tableAction.discardSpades")}
                              </button>
                            )}
                          </>
                        )}
                      </section>
                    ) : null
                  }
                  onPreview={(action) => {
                    if (tableIntent) closeTableEditor();
                    previewAction(action);
                  }}
                  onIntent={(next) => {
                    closeMapMenu();
                    tableTrigger.current =
                      document.activeElement as HTMLElement;
                    setDraft(null);
                    setPreview(null);
                    setError("");
                    setPickingTableTarget(
                      next.kind === "power" && next.id === "bridge",
                    );
                    setTableIntent({ ...next, nonce: Date.now() });
                  }}
                />
              )}
              <ReviewPanel
                onLocate={(hex) => {
                  setLocatedHex(hex);
                  requestAnimationFrame(() => {
                    document
                      .querySelector(`[data-hex="${hex}"]`)
                      ?.scrollIntoView({
                        block: "center",
                        inline: "center",
                        behavior: "smooth",
                      });
                    document
                      .getElementById("table-map")
                      ?.focus({ preventScroll: true });
                  });
                }}
                history={history}
                state={liveState!}
                seat={seat}
                requests={requests}
                viewedRevision={viewed?.revision}
                demo={demo}
                id={id}
                onView={viewState}
                onRefresh={refresh}
                onLocalRestore={localRestore}
                disabled={busy || uncertain || frozen}
                allowUndo={
                  !liveState?.matchResult &&
                  (demo || sessionSettings.undo !== "disabled")
                }
                onExport={exportRecord}
                onOlder={demo ? undefined : olderHistory}
              />
            </section>
            <fieldset
              className="control-column"
              id="table-actions"
              tabIndex={-1}
              disabled={readOnly}
            >
              {state.phase !== "draft" && state.status !== "finished" && (
                <div className="selected-target" role="status">
                  <strong>{selectedDescription}</strong>
                  <button
                    className="text-button"
                    onClick={() => jumpToTable("table-map")}
                  >
                    {translate("ui.game.52270c6fb7")}
                  </button>
                </div>
              )}
              <AbilityReference state={state} seat={seat} />
              <PersonalBoard state={state} player={player} />
              <details className="personal-board">
                <summary>
                  {translate("ui.game.89236446d4")}
                  {r.coins} {translate("ui.game.2be28b9ae0")}
                  {r.tools} {translate("ui.game.43a3d4600c")}
                  {r.scholars} {translate("ui.game.430c08d298")}
                  <br />
                  <span className="small">
                    {translate("ui.game.c9c1abba38")}
                    {r.power.join(" / ")} {translate("ui.game.4a2f6437ee")}
                    {r.books.join(" / ")} {translate("ui.game.c199965e92")}
                  </span>
                </summary>
                <section className="resource-panel">
                  <div className="section-heading">
                    <h3>{translate("ui.game.1721209593")}</h3>
                    <span>{label(player.native)}</span>
                  </div>
                  <p className="personal-bonus">
                    {translate("ui.game.b9e0e5b01a")}
                    {label("bonus:" + player.bonus)}
                  </p>
                  <div className="resource-grid">
                    <Resource
                      kind="coins"
                      name={translate("ui.game.bbece6f829")}
                      value={r.coins}
                    />
                    <Resource
                      kind="tools"
                      name={translate("ui.game.5ca6730d44")}
                      value={r.tools}
                    />
                    <Resource
                      kind="scholars"
                      name={translate("ui.game.230cc1d6c8")}
                      value={r.scholars}
                    />
                  </div>
                  <div className="books">
                    <span>{translate("ui.game.1ee4e22b2e")}</span>
                    {r.books.map((n, i) => (
                      <span
                        key={i}
                        className={"book book" + i}
                        title={
                          [
                            translate("ui.game.6c06e6a581"),
                            translate("ui.game.ed189de955"),
                            translate("ui.game.15d671e649"),
                            translate("ui.game.63f2313788"),
                          ][i]
                        }
                      >
                        {n}
                      </span>
                    ))}
                  </div>
                  <div className="power-bowls">
                    {r.power.map((n, i) => (
                      <div key={i}>
                        <span>{["Ⅰ", "Ⅱ", "Ⅲ"][i]}</span>
                        <strong>{n}</strong>
                        <small>
                          {
                            [
                              translate("ui.game.45f945b8ba"),
                              translate("ui.game.c263dac326"),
                              translate("ui.game.1f7ebcd3a8"),
                            ][i]
                          }
                        </small>
                      </div>
                    ))}
                  </div>
                  <div className="mini-stats">
                    <span>
                      {translate("ui.game.456ffcb111")}
                      <b>{player.sailing}</b>
                    </span>
                    <span>
                      {translate("ui.game.c0bb4ba199")}
                      <b>
                        {3 - player.terraformLevel}{" "}
                        {translate("ui.game.1f2307bd52")}
                      </b>
                    </span>
                  </div>
                </section>
              </details>
              {state.status !== "finished" && (
                <section className="action-panel">
                  {state.phase === "draft" ? (
                    <SetupPanel
                      state={state}
                      disabled={!myTurn || busy || uncertain}
                      onPreview={previewAction}
                      selectedPick={
                        draft?.action.kind === "draftPick"
                          ? draft.action
                          : undefined
                      }
                    />
                  ) : state.pending.some((c) => c.seat === seat) ? (
                    <>
                      <div className="eyebrow">
                        {translate("ui.game.34cffa29df")}
                      </div>
                      {getAvailableChoices(state)
                        .filter(
                          (c) => c.seat === seat && !groupedBookIds.has(c.id),
                        )
                        .map((c) => (
                          <div key={c.id} data-choice-id={c.id}>
                            <h3>
                              {bookGroupById.has(c.id)
                                ? translate("bookAllocation.heading", {
                                    count: bookGroupById.get(c.id)!.length,
                                  })
                                : choiceTitle(c)}
                            </h3>
                            <p className="small muted">
                              {choiceSource(state, c)}
                            </p>
                            {bookGroupById.has(c.id) && (
                              <BookAllocation
                                choices={bookGroupById.get(c.id)!}
                                disabled={busy || uncertain || readOnly}
                                onPreview={previewAction}
                              />
                            )}
                            {c.kind === "competency" && (
                              <button
                                className="secondary full"
                                onClick={() =>
                                  jumpToTable("table-competencies")
                                }
                              >
                                {translate("competency.chooseNow")}
                              </button>
                            )}
                            {c.kind === "leech" && (
                              <p>
                                {translate("ui.game.c51b321967")}
                                {c.amount} {translate("ui.game.72d4ebb69e")}{" "}
                                {Math.max(0, c.amount - 1)}{" "}
                                {translate("ui.game.c78ebb35e2")}
                              </p>
                            )}
                            {["neutral", "freeGuild", "freeWorkshop"].includes(
                              c.kind,
                            ) && (
                              <>
                                {c.kind === "neutral" &&
                                  c.options.every(
                                    (option) => option === "discard",
                                  ) && (
                                    <p role="status" className="action-hint">
                                      {translate("neutral.noAffordableSite")}
                                    </p>
                                  )}
                                <p className="small">
                                  {translate("ui.game.901d1623fc")}
                                  {label(
                                    c.kind === "freeGuild"
                                      ? "guild"
                                      : c.kind === "freeWorkshop"
                                        ? "workshop"
                                        : (c.buildingKind ?? "tower"),
                                  )}
                                  {translate("ui.game.023d7eb45d")}
                                </p>
                                <button
                                  className="secondary full"
                                  disabled={
                                    busy ||
                                    uncertain ||
                                    !c.options.includes(selected)
                                  }
                                  onClick={() =>
                                    previewAction({
                                      kind: "respond",
                                      choiceId: c.id,
                                      option: selected,
                                    })
                                  }
                                >
                                  {translate("ui.game.1afeee986c")}
                                  {hexLabel(selected)}
                                </button>
                              </>
                            )}
                            {c.kind === "bridge" && (
                              <BridgeChoice
                                choice={c}
                                disabled={busy || uncertain}
                                onPreview={previewAction}
                              />
                            )}
                            {c.id === tableSpadesChoice?.id && (
                              <button
                                className="secondary full"
                                onClick={() =>
                                  jumpToTable("table-action-editor")
                                }
                              >
                                {translate("tableAction.continueSpades")}
                              </button>
                            )}
                            {c.kind === "spades" &&
                              c.id !== tableSpadesChoice?.id && (
                                <SpadesForm
                                  onSelectHex={setSelected}
                                  onPickMap={() => jumpToTable("table-map")}
                                  stepwise={
                                    planningEnabled ||
                                    usesCurrentActionProtocol(
                                      state.rulesVersion,
                                    )
                                  }
                                  state={state}
                                  seat={seat}
                                  selected={selected}
                                  native={player.native}
                                  amount={c.amount}
                                  canBuild={c.canBuild !== false}
                                  sciencePhase={state.phase === "science"}
                                  travelOptions={
                                    state.phase === "actions" &&
                                    c.source !== "power-action-surplus"
                                      ? [
                                          ...(player.faction === "moles"
                                            ? ["tunnel" as const]
                                            : []),
                                          ...(player.palace === "flight"
                                            ? ["flight" as const]
                                            : []),
                                        ]
                                      : []
                                  }
                                  disabled={busy || uncertain}
                                  onPreview={previewAction}
                                  toAction={(terraform) => ({
                                    kind: "respond",
                                    choiceId: c.id,
                                    option: "terraform",
                                    terraform,
                                  })}
                                />
                              )}
                            {c.kind === "buildWorkshop" && (
                              <p className="small">
                                {(c.buildHexes ?? [c.source])
                                  .map(hexLabel)
                                  .join(" / ")}{" "}
                                {translate("ui.game.9c90061b92")}
                                {(c.buildHexes?.length ?? 0) > 1 &&
                                  translate("spades.chooseBuildHex")}
                              </p>
                            )}
                            <div className="choice-buttons">
                              {c.kind === "buildWorkshop" &&
                                (c.buildHexes?.length ?? 0) > 1 &&
                                c.buildHexes!.map((hex) => {
                                  const action: GameAction = {
                                    kind: "respond",
                                    choiceId: c.id,
                                    option: "build",
                                    buildHex: hex,
                                  };
                                  return (
                                    <button
                                      key={hex}
                                      className="secondary"
                                      disabled={
                                        busy ||
                                        uncertain ||
                                        !applyAction(state, seat, action).ok
                                      }
                                      onClick={() => {
                                        setSelected(hex);
                                        previewAction(action, true);
                                      }}
                                    >
                                      {hexLabel(hex)}{" "}
                                      {translate("ui.game.4c0b82be57")}
                                    </button>
                                  );
                                })}
                              {c.options
                                .filter(
                                  (option) =>
                                    !bookGroupById.has(c.id) &&
                                    c.kind !== "competency" &&
                                    c.id !== tableSpadesChoice?.id &&
                                    option !== "terraform" &&
                                    !(
                                      c.kind === "buildWorkshop" &&
                                      option === "build" &&
                                      (c.buildHexes?.length ?? 0) > 1
                                    ) &&
                                    (![
                                      "neutral",
                                      "freeGuild",
                                      "freeWorkshop",
                                      "bridge",
                                    ].includes(c.kind) ||
                                      option === "discard"),
                                )
                                .map((option) => (
                                  <button
                                    className="secondary"
                                    key={option}
                                    disabled={
                                      busy ||
                                      uncertain ||
                                      !applyAction(state, seat, {
                                        kind: "respond",
                                        choiceId: c.id,
                                        option,
                                      }).ok
                                    }
                                    onClick={() => {
                                      if (
                                        c.kind === "city" &&
                                        usesCurrentActionProtocol(
                                          state.rulesVersion,
                                        ) &&
                                        Object.values(
                                          state.board.buildings,
                                        ).some(
                                          (b) =>
                                            b.seat === seat &&
                                            b.cityId === c.source,
                                        )
                                      ) {
                                        setCityPick({ choiceId: c.id, option });
                                        setSelected("");
                                        setDraft(null);
                                        setPreview(null);
                                        jumpToTable("table-map-target");
                                        return;
                                      }
                                      previewAction({
                                        kind: "respond",
                                        choiceId: c.id,
                                        option,
                                      });
                                    }}
                                  >
                                    {c.kind === "passFinish"
                                      ? translate("pass.finish")
                                      : c.kind === "buildWorkshop"
                                        ? option === "build"
                                          ? translate("ui.game.4c0b82be57")
                                          : translate("ui.game.53994c91f5")
                                        : c.kind === "key"
                                          ? option === "use"
                                            ? translate("ui.game.15cbeeb744")
                                            : translate("ui.game.546faf8110")
                                          : option === "accept"
                                            ? translate("ui.game.329fcec618")
                                            : option === "decline"
                                              ? translate("ui.game.e7f51b070e")
                                              : option === "discard"
                                                ? translate(
                                                    "ui.game.c8279b05e5",
                                                    {
                                                      p0:
                                                        c.kind === "bridge"
                                                          ? translate(
                                                              "ui.game.8da7ebed00",
                                                            )
                                                          : c.kind === "spades"
                                                            ? translate(
                                                                "ui.game.07abcabde1",
                                                              )
                                                            : translate(
                                                                "ui.game.2c79f93423",
                                                              ),
                                                    },
                                                  )
                                                : ["0", "1", "2", "3"].includes(
                                                      option,
                                                    )
                                                  ? [
                                                      translate(
                                                        "ui.game.61e85f6baf",
                                                      ),
                                                      translate(
                                                        "ui.game.56541f587b",
                                                      ),
                                                      translate(
                                                        "ui.game.9fb0d52f93",
                                                      ),
                                                      translate(
                                                        "ui.game.6575322492",
                                                      ),
                                                    ][Number(option)]
                                                  : label(
                                                      (c.kind ===
                                                        "competency" ||
                                                      c.kind === "city" ||
                                                      c.kind === "palace" ||
                                                      c.kind === "bonus"
                                                        ? c.kind + ":"
                                                        : "") + option,
                                                    )}
                                    {c.kind === "city" && (
                                      <small className="choice-detail">
                                        {cityDetails[option]}
                                      </small>
                                    )}
                                    {c.kind === "palace" && (
                                      <small className="choice-detail">
                                        {palaces[option]?.description}
                                      </small>
                                    )}
                                    {c.kind === "bonus" && (
                                      <small className="choice-detail">
                                        {bonusDescriptions[option]} ·{" "}
                                        {translate("pass.bonusCoins", {
                                          count:
                                            state.shared.bonusCoins[option] ??
                                            0,
                                        })}
                                      </small>
                                    )}
                                    {c.kind === "competency" && (
                                      <small className="choice-detail">
                                        {competencyDescriptions[option]}
                                      </small>
                                    )}
                                    {c.kind === "competency" &&
                                      state.shared.competencies?.find(
                                        (cell) => cell.id === option,
                                      ) && (
                                        <small className="choice-detail">
                                          {(() => {
                                            const cell =
                                              state.shared.competencies.find(
                                                (cell) => cell.id === option,
                                              )!;
                                            return translate(
                                              "ui.game.4f64cf3802",
                                              {
                                                p0: [
                                                  translate(
                                                    "ui.game.920e88c5a6",
                                                  ),
                                                  translate(
                                                    "ui.game.b237c80398",
                                                  ),
                                                  translate(
                                                    "ui.game.85d56bf4d4",
                                                  ),
                                                  translate(
                                                    "ui.game.8cff79bb4f",
                                                  ),
                                                ][cell.color],
                                                p1: 3 - cell.row,
                                                p2: [
                                                  translate(
                                                    "ui.game.c732e4d7e3",
                                                  ),
                                                  translate(
                                                    "ui.game.52f354ecfc",
                                                  ),
                                                  translate(
                                                    "ui.game.3eb2456f3b",
                                                  ),
                                                  translate(
                                                    "ui.game.3366645622",
                                                  ),
                                                ][cell.color],
                                                p3: cell.row,
                                                p4: cell.remaining,
                                              },
                                            );
                                          })()}
                                        </small>
                                      )}
                                  </button>
                                ))}
                            </div>
                          </div>
                        ))}
                      {canConvertDuringChoice(state, seat) && (
                        <FreeActions
                          key={seat}
                          state={state}
                          seat={seat}
                          disabled={busy || uncertain}
                          onPreview={previewAction}
                        />
                      )}
                    </>
                  ) : state.phase === "placement" ? (
                    <PlacementPanel
                      state={state}
                      seat={seat}
                      selected={selected}
                      disabled={!myTurn || busy || uncertain}
                      onPreview={previewAction}
                    />
                  ) : (
                    <>
                      <div className="section-heading">
                        <h3>
                          {player.primaryDone
                            ? translate("ui.game.99797e1140")
                            : translate("ui.game.722f3315a9")}
                        </h3>
                      </div>
                      {player.primaryDone && (
                        <p className="action-hint">
                          {translate("ui.game.1924ed917f")}
                        </p>
                      )}
                      {!player.primaryDone && (
                        <>
                          <div className="action-tabs">
                            {[
                              ["build", translate("ui.game.1a58afef9f")],
                              ["research", translate("ui.game.4ff0f1dda8")],
                              ["power", translate("ui.game.41a9919720")],
                              ["pass", translate("ui.game.4890584bb5")],
                            ].map(([id, name]) => (
                              <button
                                className={tab === id ? "selected" : ""}
                                key={id}
                                onClick={() => {
                                  closeTableEditor();
                                  setTab(id);
                                }}
                              >
                                {name}
                              </button>
                            ))}
                          </div>
                          <ActionForm
                            onSelectHex={setSelected}
                            onPickMap={() => jumpToTable("table-map")}
                            stepwise={
                              planningEnabled ||
                              usesCurrentActionProtocol(state.rulesVersion)
                            }
                            intent={intent}
                            key={seat + ":" + state.round}
                            tab={tab}
                            state={state}
                            seat={seat}
                            selected={selected}
                            disabled={!myTurn || busy || uncertain}
                            onPreview={previewAction}
                          />
                          <SpecialPanel
                            state={state}
                            seat={seat}
                            selected={selected}
                            disabled={!myTurn || busy || uncertain}
                            onPreview={previewAction}
                          />
                        </>
                      )}
                      {player.primaryDone && (
                        <button
                          className="primary full"
                          disabled={!myTurn || busy || uncertain}
                          onClick={() => previewAction({ kind: "endTurn" })}
                        >
                          {translate("ui.game.975778d990")}
                        </button>
                      )}
                      <FreeActions
                        key={seat}
                        state={state}
                        seat={seat}
                        disabled={!myTurn || busy || uncertain}
                        onPreview={previewAction}
                      />
                    </>
                  )}
                  {!setupReview &&
                    !mapPreview &&
                    !tableIntent &&
                    !tableSpadesChoice &&
                    previewPanel}
                </section>
              )}
              <details className="settings-panel">
                <summary>{translate("ui.game.0feba9b41c")}</summary>
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={stepReview}
                    disabled={!!draft || !!turnDraft || busy || uncertain}
                    onChange={(e) => {
                      setStepReview(e.target.checked);
                      localStorage.setItem(
                        "cellman-step-review",
                        e.target.checked ? "on" : "off",
                      );
                    }}
                  />
                  {translate("action.stepReview")}
                </label>
                {supportsTurnPlanning(state.rulesVersion) && (
                  <label className="checkbox">
                    <input
                      type="checkbox"
                      checked={planning}
                      disabled={!!turnDraft || busy || uncertain}
                      onChange={(e) => {
                        setPlanning(e.target.checked);
                        localStorage.setItem(
                          "cellman-turn-planning",
                          e.target.checked ? "on" : "off",
                        );
                      }}
                    />
                    {translate("ui.game.44c50e9d8b")}
                  </label>
                )}
                <label>
                  {translate("ui.game.65ea0261cd")}
                  <select
                    value={conversionPrompt}
                    onChange={(e) => {
                      setConversionPrompt(e.target.value);
                      localStorage.setItem(
                        "cellman-conversion-prompt",
                        e.target.value,
                      );
                    }}
                  >
                    <option value="always">
                      {translate("ui.game.d568447147")}
                    </option>
                    <option value="power">
                      {translate("ui.game.64133ba30f")}
                    </option>
                    <option value="never">
                      {translate("ui.game.d1ca89547f")}
                    </option>
                  </select>
                </label>
              </details>
              <details className="settings-panel">
                <summary>{translate("ui.game.c98f62b9bc")}</summary>
                {usesCurrentActionProtocol(state.rulesVersion) && (
                  <fieldset
                    className="leech-presets"
                    disabled={
                      !!turnDraft ||
                      state.status === "finished" ||
                      busy ||
                      uncertain
                    }
                  >
                    <legend>{translate("leech.presetQuestion")}</legend>
                    {[0, 1, 2, 3].map((cost) => (
                      <label className="checkbox" key={cost}>
                        <input
                          type="radio"
                          name={`leech-preset-${seat}`}
                          checked={
                            player.leechPolicy.enabled &&
                            !player.leechPolicy.rejectPaid &&
                            player.leechPolicy.maxVpCost === cost
                          }
                          onChange={() =>
                            previewAction({
                              kind: "setLeech",
                              enabled: true,
                              maxVpCost: cost,
                              rejectPaid: false,
                            })
                          }
                        />
                        {translate(
                          cost === 0 ? "leech.presetFree" : "leech.presetPaid",
                          { cost, power: cost + 1 },
                        )}
                      </label>
                    ))}
                    <label className="checkbox">
                      <input
                        type="radio"
                        name={`leech-preset-${seat}`}
                        checked={
                          player.leechPolicy.enabled &&
                          !!player.leechPolicy.rejectPaid
                        }
                        onChange={() =>
                          previewAction({
                            kind: "setLeech",
                            enabled: true,
                            maxVpCost: 0,
                            rejectPaid: true,
                          })
                        }
                      />
                      {translate("leech.rejectPaid")}
                    </label>
                  </fieldset>
                )}
                <details
                  className="leech-custom"
                  open={
                    !player.leechPolicy.enabled ||
                    player.leechPolicy.maxVpCost > 3 ||
                    !usesCurrentActionProtocol(state.rulesVersion) ||
                    undefined
                  }
                >
                  <summary>{translate("leech.custom")}</summary>
                  <p className="small muted">
                    {translate(
                      player.leechPolicy.rejectPaid
                        ? "leech.rejectPaidHint"
                        : "ui.game.40f112cd63",
                    )}
                  </p>
                  <label className="checkbox">
                    <input
                      type="checkbox"
                      checked={player.leechPolicy.enabled}
                      disabled={
                        !!turnDraft ||
                        state.status === "finished" ||
                        busy ||
                        uncertain
                      }
                      onChange={(e) =>
                        previewAction({
                          kind: "setLeech",
                          enabled: e.target.checked,
                          maxVpCost: player.leechPolicy.maxVpCost,
                        })
                      }
                    />
                    {translate("ui.game.1347d09243")}
                  </label>
                  <label>
                    {translate("ui.game.252b862352")}
                    <input
                      type="number"
                      min="0"
                      max="999"
                      defaultValue={player.leechPolicy.maxVpCost}
                      disabled={
                        player.leechPolicy.rejectPaid ||
                        !!turnDraft ||
                        state.status === "finished" ||
                        busy ||
                        uncertain
                      }
                      onBlur={(e) => {
                        const n = Number(e.target.value);
                        if (n !== player.leechPolicy.maxVpCost)
                          previewAction({
                            kind: "setLeech",
                            enabled: player.leechPolicy.enabled,
                            maxVpCost: n,
                          });
                      }}
                    />
                  </label>
                  {usesCurrentActionProtocol(state.rulesVersion) && (
                    <label className="checkbox">
                      <input
                        type="checkbox"
                        checked={!!player.leechPolicy.rejectPaid}
                        disabled={
                          !player.leechPolicy.enabled ||
                          !!turnDraft ||
                          state.status === "finished" ||
                          busy ||
                          uncertain
                        }
                        onChange={(e) =>
                          previewAction({
                            kind: "setLeech",
                            enabled: player.leechPolicy.enabled,
                            maxVpCost: player.leechPolicy.maxVpCost,
                            rejectPaid: e.target.checked,
                          })
                        }
                      />
                      {translate("leech.rejectPaid")}
                    </label>
                  )}
                </details>
              </details>
            </fieldset>
          </div>
        </div>
      </div>
      <nav
        className="table-shortcuts"
        aria-label={translate("ui.game.4e7f7acd3e")}
      >
        <span>
          {viewed
            ? translate("ui.game.7ada721791", { p0: viewed.revision })
            : state.phase === "draft" || state.status === "finished"
              ? currentTask(state, seat)
              : selectedDescription}
        </span>
        <div>
          <button onClick={() => jumpToTable("table-map")}>
            {translate("ui.game.41ab2e0ecb")}
          </button>
          <button
            data-map-preview={mapPreview || undefined}
            onClick={() =>
              jumpToTable(
                tableIntent || tableSpadesChoice
                  ? "table-action-editor"
                  : preview
                    ? "table-preview"
                    : "table-actions",
              )
            }
          >
            {preview
              ? translate("ui.game.13495f8f19")
              : translate("ui.game.ed31fbb483")}
          </button>
          <button
            onClick={() => {
              const target =
                document.querySelector<HTMLDetailsElement>(".history-panel");
              if (target) target.open = true;
              jumpToTable("table-records");
            }}
          >
            {translate("ui.game.9fad24e2c3")}
          </button>
        </div>
      </nav>
      {mapMenu &&
        !readOnly &&
        myTurn &&
        state.status === "active" &&
        state.phase === "actions" &&
        !state.pending.length &&
        !player.primaryDone && (
          <MapActionPanel
            state={state}
            seat={seat}
            hex={selected}
            anchor={mapMenu}
            busy={busy}
            locked={uncertain}
            error={error}
            preview={mapPreview ? previewPanel : null}
            onPreview={(action) => {
              setMapPreview(true);
              previewAction(action);
            }}
            onClose={closeMapMenu}
            onDetails={() => {
              closeMapMenu();
              setTab("build");
              jumpToTable("table-actions");
            }}
          />
        )}
    </main>
  );
}
function Resource({
  kind,
  name,
  value,
}: {
  kind: SymbolKind;
  name: string;
  value: number;
}) {
  return (
    <div>
      <GameSymbol kind={kind} />
      <strong>{value}</strong>
      <small>{name}</small>
    </div>
  );
}
export function MapBoard({
  state,
  selected,
  onSelect,
  allowRiver = false,
  highlighted,
  bridgeOptions,
  selectedBridge,
  onBridgeSelect,
  located,
  onClearLocation,
}: {
  state: GameState;
  selected: string;
  onSelect: (id: string, anchor?: MapAnchor) => void;
  allowRiver?: boolean;
  highlighted?: Set<string>;
  bridgeOptions?: string[];
  selectedBridge?: string;
  onBridgeSelect?: (pair: string) => void;
  located?: string;
  onClearLocation?: () => void;
}) {
  const [overview, setOverview] = useState(false);
  return (
    <div
      className="map-frame"
      id="table-map"
      tabIndex={-1}
      data-overview={overview}
    >
      {located && (
        <div className="map-location-notice" role="status">
          {translate("history.locatedHex", { hex: hexLabel(located) })}
          <button className="text-button" onClick={onClearLocation}>
            {translate("history.clearLocation")}
          </button>
        </div>
      )}
      {!!highlighted?.size && (
        <p className="map-availability small">
          {state.phase === "placement"
            ? translate("ui.game.29c1ce7270")
            : state.pending.length
              ? translate("ui.game.97175b020b")
              : translate("ui.game.d688b49ba6")}
        </p>
      )}
      <div className="map-mobile-tools">
        <span>
          {overview
            ? translate("ui.game.ff2bbc3662")
            : translate("ui.game.f047e07042")}
        </span>
        <button className="text-button" onClick={() => setOverview(!overview)}>
          {overview
            ? translate("ui.game.74e5876c96")
            : translate("ui.game.ecb1a2e4ba")}
        </button>
      </div>
      <div className="map-scroll">
        <svg
          viewBox="0 0 850 535"
          role="group"
          aria-label={translate("ui.game.b9fb040247")}
        >
          <defs>
            <pattern
              id="water"
              width="20"
              height="20"
              patternUnits="userSpaceOnUse"
            >
              <path
                d="M0 10 Q5 6 10 10 T20 10"
                fill="none"
                stroke="#9ebfbd"
                strokeWidth="1"
              />
            </pattern>
          </defs>
          <rect width="850" height="535" rx="20" fill="#e7efea" />
          {Object.values(officialLarge.hexes).map((h) => {
            const terrain = state.board.terrain[h.id] ?? h.terrain,
              b = state.board.buildings[h.id],
              isRiver = terrain === "river",
              selectable = !isRiver || allowRiver;
            const pts = Array.from({ length: 6 }, (_, i) => {
              const a = ((i * 60 + 30) * Math.PI) / 180;
              return `${h.x + 34 * Math.cos(a)},${h.y + 34 * Math.sin(a)}`;
            }).join(" ");
            return (
              <g
                key={h.id}
                data-hex={h.id}
                data-located={located === h.id || undefined}
                role={selectable ? "button" : undefined}
                tabIndex={selectable ? 0 : -1}
                aria-label={
                  hexLabel(h.id) +
                  " " +
                  label(terrain) +
                  (b
                    ? translate("ui.game.9983fa8700", {
                        p0: state.players[b.seat]?.name,
                        p1: label(b.kind),
                        p2: b.neutral ? translate("ui.game.4e3c82b301") : "",
                        p3: b.cityId ? translate("ui.game.cf63dbc24d") : "",
                      })
                    : translate("ui.game.8cf2791007"))
                }
                aria-pressed={selectable ? selected === h.id : undefined}
                data-available={highlighted?.has(h.id) || undefined}
                onClick={(e) => {
                  if (!selectable) return;
                  const box = e.currentTarget.getBoundingClientRect();
                  onSelect(h.id, { x: box.right, y: box.top });
                }}
                onKeyDown={(e) => {
                  if (selectable && (e.key === "Enter" || e.key === " ")) {
                    e.preventDefault();
                    const box = e.currentTarget.getBoundingClientRect();
                    onSelect(h.id, { x: box.right, y: box.top });
                  }
                }}
                className={selectable ? "hex" : ""}
              >
                <title>
                  {hexLabel(h.id)} · {label(terrain)} ·{" "}
                  {b
                    ? translate("ui.game.73338fe506", {
                        p0: state.players[b.seat]?.name,
                        p1: label(b.kind),
                      })
                    : translate("ui.game.cb557c76d0")}
                </title>
                <polygon
                  points={pts}
                  fill={colors[terrain]}
                  stroke={
                    selected === h.id
                      ? "#143f3d"
                      : highlighted?.has(h.id)
                        ? "#537d3f"
                        : "#f2f2e8"
                  }
                  strokeWidth={
                    selected === h.id ? 5 : highlighted?.has(h.id) ? 3 : 1.8
                  }
                  strokeDasharray={
                    selected !== h.id && highlighted?.has(h.id)
                      ? "5 2"
                      : undefined
                  }
                />
                {isRiver ? (
                  <polygon points={pts} fill="url(#water)" />
                ) : (
                  <>
                    <text x={h.x} y={h.y + 23} className="hex-id">
                      {hexLabel(h.id)}
                    </text>
                    {b ? (
                      <>
                        <MapBuilding
                          kind={b.kind}
                          x={h.x}
                          y={h.y}
                          color={factionColors[state.players[b.seat].native]}
                          neutral={b.neutral}
                          annex={b.annex}
                        />
                        {b.cityId && (
                          <circle
                            cx={h.x + 18}
                            cy={h.y - 16}
                            r={b.cityTile ? 8 : 4}
                            fill="#edc75d"
                            stroke="#644b27"
                          />
                        )}
                      </>
                    ) : (
                      <text x={h.x} y={h.y + 1} className="terrain-symbol">
                        {
                          {
                            forest: "♣",
                            mountain: "△",
                            lake: "≈",
                            swamp: "≋",
                            desert: "·",
                            plains: "⌁",
                            wasteland: "◇",
                          }[terrain as Terrain]
                        }
                      </text>
                    )}
                  </>
                )}
              </g>
            );
          })}
          {bridgeOptions?.map((pair) => {
            const [a, b] = pair.split(":").map((id) => officialLarge.hexes[id]);
            if (!a || !b) return null;
            return (
              <g
                key={pair}
                className="bridge-target"
                aria-pressed={selectedBridge === pair}
                role="button"
                tabIndex={0}
                aria-label={translate("ui.game.105be2c648", {
                  p0: bridgeLabel(pair),
                })}
                onClick={() => onBridgeSelect?.(pair)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onBridgeSelect?.(pair);
                  }
                }}
              >
                <line
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke="transparent"
                  strokeWidth="20"
                />
                <line
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke="#196bb1"
                  strokeWidth="5"
                  strokeDasharray={selectedBridge === pair ? undefined : "7 4"}
                />
                <title>
                  {translate("ui.game.550378d18a")}
                  {bridgeLabel(pair)}
                </title>
              </g>
            );
          })}
          {state.board.bridges.map((bridge, i) => {
            const a = officialLarge.hexes[bridge.a],
              b = officialLarge.hexes[bridge.b];
            return (
              <g
                key={i}
                aria-label={translate("ui.game.121ee7034d", {
                  p0: hexLabel(bridge.a),
                  p1: hexLabel(bridge.b),
                })}
                pointerEvents="none"
              >
                <line
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke="#f7ebba"
                  strokeWidth="9"
                />
                <line
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke={factionColors[state.players[bridge.seat].native]}
                  strokeWidth="5"
                  strokeDasharray="5 2"
                />
              </g>
            );
          })}
          <text x="40" y="515" className="map-caption">
            {translate("ui.game.433a73f801")}
          </text>
        </svg>
      </div>
    </div>
  );
}
function ActionForm({
  onSelectHex,
  onPickMap,
  stepwise,
  intent,
  tab,
  state,
  seat,
  selected,
  disabled,
  onPreview,
}: {
  stepwise?: boolean;
  onSelectHex: (hex: string) => void;
  onPickMap: () => void;
  intent?: BoardIntent | null;
  tab: string;
  state: GameState;
  seat: string;
  selected: string;
  disabled: boolean;
  onPreview: (a: GameAction) => void;
}) {
  const p = state.players[seat];
  const deferPalace =
    usesCurrentActionProtocol(state.rulesVersion) && !p.draftPalace;
  const deferBonus = usesCurrentActionProtocol(state.rulesVersion);
  const palaceChoices = p.draftPalace ? [p.draftPalace] : state.shared.palaces;
  const [selectedTerrain, setTerrain] = useState<Terrain>(p.native),
    [build, setBuild] = useState(true),
    [selectedUpgrade, setUpgrade] = useState("guild"),
    [selectedPalace, setPalace] = useState(palaceChoices[0] ?? ""),
    [track, setTrack] = useState(0),
    [selectedSlot, setSlot] = useState("0"),
    [selectedPower, setPower] = useState("coins"),
    [selectedBonus, setBonus] = useState(""),
    [selectedInnovation, setInnovation] = useState(
      state.shared.innovations[0] ?? "",
    ),
    [books, setBooks] = useState<[number, number, number, number]>([
      0, 0, 0, 0,
    ]);
  useEffect(() => setTerrain(p.native), [p.native]);
  const [bridge, setBridge] = useState("");
  const [travel, setTravel] = useState<"" | "tunnel" | "flight">("");
  const [selectedBookAction, setBookActionId] = useState("");
  useEffect(() => {
    if (!intent) return;
    if (intent.kind === "power") setPower(intent.id!);
    if (intent.kind === "book") {
      setBookActionId(intent.id!);
      setBooks([0, 0, 0, 0]);
    }
    if (intent.kind === "innovation") {
      setInnovation(intent.id!);
      setBooks([0, 0, 0, 0]);
    }
  }, [intent]);
  const availableBooks = state.shared.bookActions.filter(
    (id) => !state.shared.usedActions.includes("book:" + id),
  );
  const availablePower = [
    "coins",
    "tools",
    "scholar",
    "spade",
    "spades",
    "bridge",
  ].filter((id) => !state.shared.usedActions.includes(id));
  const chooseAvailable = (selected: string, available: string[]) =>
    available.includes(selected) ? selected : (available[0] ?? "");
  const selectedBuilding = state.board.buildings[selected];
  const upgrades =
    selectedBuilding?.seat === seat && !selectedBuilding.neutral
      ? ((
          {
            workshop: ["guild"],
            guild: ["school", "palace"],
            school: ["university"],
          } as Record<string, string[]>
        )[selectedBuilding.kind] ?? [])
      : [];
  const upgrade = chooseAvailable(selectedUpgrade, upgrades);
  const bookActionId = chooseAvailable(selectedBookAction, availableBooks);
  const power = chooseAvailable(selectedPower, availablePower);
  const palace = chooseAvailable(selectedPalace, palaceChoices);
  const innovation = chooseAvailable(
    selectedInnovation,
    state.shared.innovations,
  );
  const bonus =
    state.setup.bonusPool.includes(selectedBonus) &&
    !Object.values(state.players).some(
      (player) => player.bonus === selectedBonus,
    )
      ? selectedBonus
      : "";
  const openSlots = state.shared.scholarSlots[track].flatMap((owner, i) =>
    owner === null ? [String(i)] : [],
  );
  const slot =
    selectedSlot === "return"
      ? "return"
      : chooseAvailable(selectedSlot, [...openSlots, "return"]);
  const blocked = disabled || p.primaryDone;
  const bridgeChoices = useMemo(() => {
    const ids = Object.keys(officialLarge.hexes);
    const sites =
      p.faction === "moles"
        ? ids.flatMap((a) =>
            ids
              .filter((b) => a < b && validBridgeGeometry(a, b, true))
              .map((b) => [a, b]),
          )
        : bridgeSites;
    return sites.filter(
      ([a, b]) =>
        (state.board.buildings[a]?.seat === seat ||
          state.board.buildings[b]?.seat === seat) &&
        !state.board.bridges.some(
          (bridge) =>
            [bridge.a, bridge.b].includes(a) &&
            [bridge.a, bridge.b].includes(b),
        ),
    );
  }, [state.board, seat, p.faction]);
  const terrains = terraformTargets(state, selected, p.native);
  const terrain = terrains.includes(selectedTerrain)
    ? selectedTerrain
    : terrains.includes(p.native)
      ? p.native
      : (terrains[0] ?? p.native);
  const terraformAction: GameAction | null =
    selected && !selectedBuilding && terrains.length
      ? {
          kind: "terraform",
          hex: selected,
          terrain,
          build:
            terrain === p.native &&
            (stepwise
              ? (state.board.terrain[selected] ??
                  officialLarge.hexes[selected]?.terrain) === p.native
              : build),
          deferBuild:
            stepwise &&
            terrain === p.native &&
            (state.board.terrain[selected] ??
              officialLarge.hexes[selected]?.terrain) !== p.native,
          travel: travel || undefined,
        }
      : null;
  const upgradeAction: GameAction | null =
    selected && upgrade
      ? {
          kind: "upgrade",
          hex: selected,
          to: upgrade as any,
          ...(["school", "university"].includes(upgrade) &&
          usesCurrentActionProtocol(state.rulesVersion)
            ? { deferCompetency: true }
            : {}),
          ...(upgrade === "palace" && deferPalace
            ? { deferPalace: true }
            : { palace }),
        }
      : null;
  const innovationTotal =
    5 +
    (p.innovations.length === 1 && p.native === "wasteland"
      ? 0
      : p.innovations.length);
  const innovationRequired =
    state.setup.innovationCosts?.[innovation] ??
    [0, 1, 2, 3].map((i) =>
      i === state.setup.innovations.indexOf(innovation) % 4 ? 2 : 0,
    );
  const innovationPayment = suggestBooks(
    p.resources.books,
    innovationRequired,
    innovationTotal,
  );
  const bookTotal =
    (
      {
        power: 1,
        science: 1,
        coins: 2,
        upgrade: 2,
        "guild-score": 2,
        spades: 3,
      } as Record<string, number>
    )[bookActionId] ?? 0;
  const publicPayment = suggestBooks(
    p.resources.books,
    [0, 0, 0, 0],
    bookTotal,
  );
  if (tab === "build")
    return (
      <div className="form-stack">
        {!selected && (
          <p className="action-hint">{translate("ui.game.c5dde2b957")}</p>
        )}
        {selectedBuilding && (
          <p className="action-hint">
            {translate("ui.game.af1ab71067")}
            {state.players[selectedBuilding.seat]?.name}
            {translate("ui.game.8af2350cfd")}
            {label(selectedBuilding.kind)}。
            {selectedBuilding.seat !== seat
              ? translate("ui.game.a6a480146c")
              : selectedBuilding.neutral
                ? translate("ui.game.98f46c9652")
                : upgrades.length
                  ? translate("ui.game.bbfc246ecb") +
                    upgrades.map(label).join("、")
                  : translate("ui.game.98348a8d5d")}
          </p>
        )}
        <label>
          {translate("ui.game.ec2b0dfbf7")}
          <select
            value={terrain}
            disabled={!terrains.length}
            onChange={(e) => setTerrain(e.target.value as Terrain)}
          >
            {!terrains.length && (
              <option value={p.native}>
                {translate("ui.game.1713b08c51")}
              </option>
            )}
            {terrains.map((t) => (
              <option value={t} key={t}>
                {label(t)}
                {t === p.native ? translate("ui.game.62be575967") : ""}
              </option>
            ))}
          </select>
        </label>
        {(p.faction === "moles" || p.palace === "flight") && (
          <label>
            {translate("ui.game.bfc00be234")}
            <select
              value={travel}
              onChange={(e) => setTravel(e.target.value as typeof travel)}
            >
              <option value="">{translate("ui.game.108ef16c8b")}</option>
              {p.faction === "moles" && (
                <option value="tunnel">
                  {translate("ui.game.f5bb9b1066")}
                </option>
              )}
              {p.palace === "flight" && (
                <option value="flight">
                  {translate("ui.game.196f468730")}
                </option>
              )}
            </select>
          </label>
        )}
        {!stepwise && (
          <label className="checkbox">
            <input
              type="checkbox"
              checked={build && terrain === p.native}
              disabled={terrain !== p.native || !terrains.length}
              onChange={(e) => setBuild(e.target.checked)}
            />
            {translate("ui.game.05683e0fba")}
          </label>
        )}
        {stepwise && <p className="small">{translate("ui.game.22b4b042ca")}</p>}
        {terrain !== p.native && (
          <p className="small muted">{translate("ui.game.5bf7c595b6")}</p>
        )}
        <GuidedAction
          state={state}
          seat={seat}
          action={terraformAction}
          disabled={blocked}
          onPreview={onPreview}
        >
          {translate("ui.game.019db0fa25")}
        </GuidedAction>
        <div className="divider" />
        <label>
          {translate("ui.game.9f2da771a5")}
          <select
            disabled={!upgrades.length}
            value={upgrade}
            onChange={(e) => setUpgrade(e.target.value)}
          >
            {!upgrades.length && (
              <option value="">{translate("ui.game.da8dd23005")}</option>
            )}
            {upgrades.map((k) => (
              <option key={k} value={k}>
                {label(k)}
              </option>
            ))}
          </select>
        </label>
        {upgrade === "palace" && !deferPalace && (
          <select
            aria-label={translate("ui.game.0e4a037f2f")}
            value={palace}
            onChange={(e) => setPalace(e.target.value)}
          >
            {palaceChoices.map((id) => (
              <option key={id} value={id}>
                {label("palace:" + id)}
              </option>
            ))}
          </select>
        )}
        {upgrade === "palace" && !deferPalace && (
          <p className="small">{palaces[palace]?.description}</p>
        )}
        {upgrade === "palace" && deferPalace && (
          <p className="small">{translate("palace.afterLeech")}</p>
        )}
        <GuidedAction
          state={state}
          seat={seat}
          action={upgradeAction}
          disabled={blocked}
          onPreview={onPreview}
        >
          {translate("ui.game.77fffeb97f")}
        </GuidedAction>
      </div>
    );
  if (tab === "research")
    return (
      <div className="form-stack">
        <label>
          {translate("ui.game.95ad8a65f7")}
          <select
            value={track}
            onChange={(e) => setTrack(Number(e.target.value))}
          >
            {[
              translate("ui.game.b1eff676a2"),
              translate("ui.game.b237c80398"),
              translate("ui.game.e9f3d305ff"),
              translate("ui.game.8cff79bb4f"),
            ].map((name, i) => (
              <option value={i} key={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <select
          aria-label={translate("ui.game.f3a68bfb56")}
          value={slot}
          onChange={(e) => setSlot(e.target.value)}
        >
          <option value="return">{translate("ui.game.dfd0a54dad")}</option>
          {state.shared.scholarSlots[track].map((owner, i) => (
            <option key={i} value={i} disabled={owner !== null}>
              {translate("ui.game.aab0b437e3")}
              {i + 1}
              {translate("ui.game.b734d31487")}
              {i === 0 ? 3 : 2} {translate("ui.game.6d1f8ad23e")}
              {owner ? translate("ui.game.3854a45773") : ""}
            </option>
          ))}
        </select>
        <GuidedAction
          state={state}
          seat={seat}
          action={{
            kind: "scholar",
            track: track as Discipline,
            slot: slot === "return" ? null : Number(slot),
          }}
          disabled={blocked}
          onPreview={onPreview}
        >
          {translate("ui.game.17f4039032")}
        </GuidedAction>
        <div className="technology-actions">
          <p className="small">
            {translate("ui.game.21342d0cfd")}
            {p.native === "plains" ? 1 : 5} {translate("ui.game.d9d9427396")}
          </p>
          <GuidedAction
            state={state}
            seat={seat}
            action={{ kind: "advance", track: "sailing" }}
            disabled={blocked}
            onPreview={onPreview}
          >
            {translate("ui.game.85c1e36bb5")}
          </GuidedAction>
          <GuidedAction
            state={state}
            seat={seat}
            action={{ kind: "advance", track: "terraform" }}
            disabled={blocked}
            onPreview={onPreview}
          >
            {translate("ui.game.baa9ece62f")}
          </GuidedAction>
        </div>
        <div className="divider" />
        <label>
          {translate("ui.game.11ff8464a7")}
          <select
            value={innovation}
            onChange={(e) => setInnovation(e.target.value)}
          >
            {state.shared.innovations.map((id) => (
              <option value={id} key={id}>
                {label(id)}
              </option>
            ))}
          </select>
        </label>
        <p className="small muted">
          {innovations[innovation]?.description}
          <br />
          {translate("ui.game.d65ceb4aeb")}{" "}
          {5 +
            (p.innovations.length === 1 && p.native === "wasteland"
              ? 0
              : p.innovations.length)}{" "}
          {translate("ui.game.e0d2c7380c")}
          {(
            state.setup.innovationCosts?.[innovation] ??
            [0, 1, 2, 3].map((i) =>
              i === state.setup.innovations.indexOf(innovation) % 4 ? 2 : 0,
            )
          ).join(" / ")}
          。
          {!p.palace
            ? translate("ui.game.e35841f60f")
            : translate("ui.game.fff03000af")}
        </p>
        <div className="book-payment">
          {books.map((n, i) => (
            <label key={i}>
              <span>
                {
                  [
                    translate("ui.game.0129eae620"),
                    translate("ui.game.452cb5bc11"),
                    translate("ui.game.9eafaa2881"),
                    translate("ui.game.c5f803c2fe"),
                  ][i]
                }{" "}
                {translate("ui.game.3705b74639")} {p.resources.books[i]}
              </span>
              <input
                aria-label={
                  [
                    translate("ui.game.f362481f9e"),
                    translate("ui.game.95363b47e8"),
                    translate("ui.game.42ebba5ade"),
                    translate("ui.game.dc4df2a898"),
                  ][i]
                }
                type="number"
                min="0"
                max={p.resources.books[i]}
                value={n}
                onChange={(e) =>
                  setBooks(
                    (v) =>
                      v.map((x, j) =>
                        i === j ? Number(e.target.value) : x,
                      ) as typeof books,
                  )
                }
              />
            </label>
          ))}
        </div>
        <p className="small">
          {translate("ui.game.52c963128e")}
          {books.reduce((a, b) => a + b, 0)} / {innovationTotal}{" "}
          {translate("ui.game.60fa7ec551")}
        </p>
        <button
          className="text-button"
          disabled={blocked || !innovationPayment}
          onClick={() => innovationPayment && setBooks(innovationPayment)}
        >
          {translate("ui.game.1c93f83617")}
        </button>
        <GuidedAction
          state={state}
          seat={seat}
          action={
            innovation ? { kind: "innovation", id: innovation, books } : null
          }
          disabled={blocked}
          onPreview={onPreview}
        >
          {translate("ui.game.18eb382c31")}
        </GuidedAction>
      </div>
    );
  if (tab === "power")
    return (
      <div className="form-stack">
        <label>
          {translate("ui.game.c31f14b604")}
          <select value={power} onChange={(e) => setPower(e.target.value)}>
            {!power && (
              <option value="">{translate("ui.game.7a8c788571")}</option>
            )}
            {[
              ["coins", translate("ui.game.a36dd3e1ce")],
              ["tools", translate("ui.game.f694d01cb5")],
              ["scholar", translate("ui.game.8351691754")],
              ["spade", translate("ui.game.509960a119")],
              ["spades", translate("ui.game.ecbba994ba")],
              ["bridge", translate("ui.game.40af3d3dd3")],
            ].map(([id, name]) => (
              <option
                key={id}
                value={id}
                disabled={state.shared.usedActions.includes(id)}
              >
                {p.faction === "illusionists"
                  ? name.replace(/^\d+/, (n) => String(Number(n) - 1))
                  : name}
                {state.shared.usedActions.includes(id)
                  ? translate("ui.game.83a69757de")
                  : ""}
              </option>
            ))}
          </select>
        </label>
        {power === "spade" || power === "spades" ? (
          <SpadesForm
            key={power}
            onSelectHex={onSelectHex}
            onPickMap={onPickMap}
            stepwise={stepwise}
            state={state}
            seat={seat}
            selected={selected}
            native={p.native}
            amount={power === "spade" ? 1 : 2}
            travelOptions={[
              ...(p.faction === "moles" ? ["tunnel" as const] : []),
              ...(p.palace === "flight" ? ["flight" as const] : []),
            ]}
            disabled={blocked}
            onPreview={onPreview}
            toAction={(input) => ({ kind: "powerAction", id: power, ...input })}
          />
        ) : (
          <>
            {power === "bridge" && (
              <label>
                {translate("ui.game.a386240a3f")}
                <select
                  value={bridge}
                  onChange={(e) => setBridge(e.target.value)}
                >
                  <option value="">{translate("ui.game.34b87dc661")}</option>
                  {bridgeChoices.map(([a, b]) => (
                    <option key={a + b} value={a + "," + b}>
                      {hexLabel(a)} ↔ {hexLabel(b)}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <GuidedAction
              state={state}
              seat={seat}
              disabled={blocked}
              onPreview={onPreview}
              action={
                !power || (power === "bridge" && !bridge)
                  ? null
                  : {
                      kind: "powerAction",
                      id: power,
                      ...(power === "bridge"
                        ? { a: bridge.split(",")[0], b: bridge.split(",")[1] }
                        : {}),
                    }
              }
            >
              {translate("ui.game.2cffd620ef")}
            </GuidedAction>
          </>
        )}
        <div className="divider" />
        <h4>{translate("ui.game.3503f101ce")}</h4>
        <select
          aria-label={translate("ui.game.3503f101ce")}
          value={bookActionId}
          onChange={(e) => setBookActionId(e.target.value)}
        >
          {!bookActionId && (
            <option value="">{translate("ui.game.39ae735833")}</option>
          )}
          {(state.shared.bookActions ?? ["power", "science", "coins"]).map(
            (id) => (
              <option
                key={id}
                value={id}
                disabled={state.shared.usedActions.includes("book:" + id)}
              >
                {
                  {
                    power: translate("ui.game.538cb7c542"),
                    science: translate("ui.game.73a18ad965"),
                    coins: translate("ui.game.58e38bac25"),
                    upgrade: translate("ui.game.17a96b3917"),
                    "guild-score": translate("ui.game.181aed2fe0"),
                    spades: translate("ui.game.b48a468b27"),
                  }[id]
                }
              </option>
            ),
          )}
        </select>
        {bookActionId === "science" && (
          <label>
            {translate("ui.game.20f236b416")}
            <select
              aria-label={translate("ui.game.20f236b416")}
              value={track}
              onChange={(e) => setTrack(Number(e.target.value))}
            >
              {[
                translate("ui.game.b1eff676a2"),
                translate("ui.game.b237c80398"),
                translate("ui.game.e9f3d305ff"),
                translate("ui.game.8cff79bb4f"),
              ].map((name, i) => (
                <option key={i} value={i}>
                  {name}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="book-payment">
          {books.map((n, i) => (
            <label key={i}>
              <span>
                {
                  [
                    translate("ui.game.0129eae620"),
                    translate("ui.game.452cb5bc11"),
                    translate("ui.game.9eafaa2881"),
                    translate("ui.game.c5f803c2fe"),
                  ][i]
                }{" "}
                {translate("ui.game.3705b74639")} {p.resources.books[i]}
              </span>
              <input
                aria-label={
                  [
                    translate("ui.game.60cb5c27f9"),
                    translate("ui.game.44c7110fe4"),
                    translate("ui.game.746605386c"),
                    translate("ui.game.ff29019c5d"),
                  ][i]
                }
                type="number"
                min="0"
                max={p.resources.books[i]}
                value={n}
                onChange={(e) =>
                  setBooks(
                    (v) =>
                      v.map((x, j) =>
                        i === j ? Number(e.target.value) : x,
                      ) as typeof books,
                  )
                }
              />
            </label>
          ))}
        </div>
        <p className="small">
          {translate("ui.game.52c963128e")}
          {books.reduce((a, b) => a + b, 0)} / {bookTotal}{" "}
          {translate("ui.game.60fa7ec551")}
        </p>
        <button
          className="text-button"
          disabled={blocked || !bookActionId || !publicPayment}
          onClick={() => publicPayment && setBooks(publicPayment)}
        >
          {translate("ui.game.1c93f83617")}
        </button>
        <GuidedAction
          state={state}
          seat={seat}
          disabled={blocked}
          onPreview={onPreview}
          action={
            !bookActionId || (bookActionId === "upgrade" && !selected)
              ? null
              : {
                  kind: "bookAction",
                  id: bookActionId,
                  books,
                  track: track as Discipline,
                  hex: selected || undefined,
                }
          }
        >
          {translate("ui.game.03baf147a0")}
        </GuidedAction>
      </div>
    );
  return (
    <div className="form-stack">
      <p className="muted">{translate("ui.game.6898d29e7d")}</p>
      {state.round < 6 && !deferBonus && (
        <>
          <label>
            {translate("ui.game.2efc930c74")}
            <select value={bonus} onChange={(e) => setBonus(e.target.value)}>
              <option value="">{translate("ui.game.0850f32146")}</option>
              {state.setup.bonusPool
                .filter(
                  (id) =>
                    !Object.values(state.players).some((p) => p.bonus === id),
                )
                .map((id) => (
                  <option key={id} value={id}>
                    {label("bonus:" + id)}
                    {state.shared.bonusCoins[id]
                      ? translate("ui.game.c42220e17c", {
                          p0: state.shared.bonusCoins[id],
                        })
                      : ""}
                  </option>
                ))}
            </select>
          </label>
          <div
            className="bonus-market"
            aria-label={translate("ui.game.eef45edf9d")}
          >
            {state.setup.bonusPool
              .filter(
                (id) =>
                  !Object.values(state.players).some(
                    (player) => player.bonus === id,
                  ),
              )
              .map((id) => (
                <button
                  type="button"
                  className="bonus-card"
                  key={id}
                  aria-pressed={bonus === id}
                  disabled={blocked}
                  onClick={() => setBonus(id)}
                >
                  <strong>{bonusTitles[id] ?? label(id)}</strong>
                  <span>{bonusDescriptions[id]}</span>
                  <small>
                    {translate("ui.game.691a04889d")}
                    {state.shared.bonusCoins[id] ?? 0}{" "}
                    {translate("ui.game.044ad9e1ca")}
                  </small>
                </button>
              ))}
          </div>
        </>
      )}
      <button
        className="secondary full"
        disabled={blocked || (!deferBonus && state.round < 6 && !bonus)}
        onClick={() =>
          onPreview(
            deferBonus
              ? { kind: "pass", deferBonus: true }
              : { kind: "pass", bonus: bonus || undefined },
          )
        }
      >
        {translate("ui.game.e597fd46fa")}
      </button>
    </div>
  );
}

function PreviewChanges({
  before,
  after,
  seat,
  action,
}: {
  before: GameState;
  after: GameState;
  seat: string;
  action: GameAction;
}) {
  const p = before.players[seat],
    n = after.players[seat];
  const changes: [string, string][] = [];
  if (action.kind === "draftPick") {
    const title =
      action.category === "bonus"
        ? (bonusTitles[action.option] ?? label(action.option))
        : label(action.option);
    changes.push([
      translate("ui.game.c11330b852") +
        {
          faction: translate("ui.game.b49377b38c"),
          native: translate("ui.game.51695ad45a"),
          palace: translate("ui.game.c837854a57"),
          bonus: translate("ui.game.d7fb5bfc83"),
        }[action.category],
      title,
    ]);
  }
  for (const [key, name] of [
    ["sailing", translate("ui.game.705b35125d")],
    ["terraformLevel", translate("ui.game.4de82a21d9")],
    ["keys", translate("ui.game.2be7ed8644")],
  ] as const)
    if (n[key] !== p[key]) changes.push([name, `${p[key]} → ${n[key]}`]);
  for (const id of n.innovations.filter((id) => !p.innovations.includes(id)))
    changes.push([translate("ui.game.11ff8464a7"), label(id)]);
  for (const id of n.competencies.filter((id) => !p.competencies.includes(id)))
    changes.push([translate("ui.game.4f9c08d4e0"), label("competency:" + id)]);
  if (n.palace && n.palace !== p.palace)
    changes.push([translate("ui.game.0bf1b46980"), label(n.palace)]);
  if (n.bonus !== p.bonus)
    changes.push([
      translate("ui.game.d7fb5bfc83"),
      bonusTitles[n.bonus] ?? label(n.bonus),
    ]);
  for (const bridge of after.board.bridges.filter(
    (b) => !before.board.bridges.some((old) => old.a === b.a && old.b === b.b),
  ))
    changes.push([
      translate("ui.game.111f29973b"),
      `${hexLabel(bridge.a)} ↔ ${hexLabel(bridge.b)}`,
    ]);
  for (const [key, name] of [
    ["coins", translate("ui.game.bbece6f829")],
    ["tools", translate("ui.game.5ca6730d44")],
    ["scholars", translate("ui.game.230cc1d6c8")],
  ] as const) {
    const delta = n.resources[key] - p.resources[key];
    if (delta)
      changes.push([
        name,
        `${p.resources[key]} → ${n.resources[key]}（${delta > 0 ? "+" : ""}${delta}）`,
      ]);
  }
  if (n.vp !== p.vp)
    changes.push([
      translate("ui.game.89e35e662a"),
      (n.vp > p.vp ? "+" : "") + (n.vp - p.vp),
    ]);
  for (let i = 0; i < 4; i++) {
    if (p.resources.books[i] !== n.resources.books[i])
      changes.push([
        [
          translate("ui.game.0129eae620"),
          translate("ui.game.452cb5bc11"),
          translate("ui.game.9eafaa2881"),
          translate("ui.game.c5f803c2fe"),
        ][i],
        `${p.resources.books[i]} → ${n.resources.books[i]}`,
      ]);
    if (p.science[i] !== n.science[i])
      changes.push([
        [
          translate("ui.game.b1eff676a2"),
          translate("ui.game.b237c80398"),
          translate("ui.game.e9f3d305ff"),
          translate("ui.game.8cff79bb4f"),
        ][i],
        `${p.science[i]} → ${n.science[i]}`,
      ]);
  }
  if (p.resources.power.join() !== n.resources.power.join())
    changes.push([
      translate("ui.game.5c5051a4d1"),
      `${p.resources.power.join("/")} → ${n.resources.power.join("/")}`,
    ]);
  for (const [hex, b] of Object.entries(after.board.buildings)) {
    if (
      b.seat === seat &&
      (before.board.buildings[hex]?.kind !== b.kind ||
        before.board.buildings[hex]?.annex !== b.annex)
    )
      changes.push([
        hexLabel(hex),
        label(b.kind) + (b.annex ? translate("ui.game.a082304076") : ""),
      ]);
  }
  if (before.round !== after.round)
    changes.push([
      translate("ui.game.4890584bb5"),
      translate("ui.game.331d71b27f", { p0: before.round, p1: after.round }),
    ]);
  return (
    <>
      <div className="preview-changes">
        {changes.map(([name, value], index) => (
          <div key={`${name}:${index}`}>
            <span>{name}</span>
            <b>{value}</b>
          </div>
        ))}
      </div>
      {after.pending.length > 0 && (
        <p className="small">
          {translate("ui.game.1b0ac7ded8")}
          {after.pending.length} {translate("ui.game.a3b26551c1")}
        </p>
      )}
      {after.pending.length > 0 && (
        <ul className="pending-preview">
          {after.pending.map((c) => (
            <li key={c.id}>
              {after.players[c.seat]?.name}：{choiceTitle(c)}
            </li>
          ))}
        </ul>
      )}
      {(() => {
        const changes = ledgerEntry(before, after, seat, action).details
          ?.changes as ResourceChange[];
        const others = changes.filter((c) => c.seat !== seat);
        return others.length ? (
          <details className="other-player-preview">
            <summary>
              {translate("ui.game.6f4f29521b")}
              {others.length} {translate("ui.game.22d36c0220")}
            </summary>
            {others.map((c) => (
              <p key={`${c.seat}:${c.field}`}>
                {after.players[c.seat].name} · {fieldLabels[c.field]}：
                {c.before} → {c.after}
              </p>
            ))}
          </details>
        ) : null;
      })()}
    </>
  );
}
