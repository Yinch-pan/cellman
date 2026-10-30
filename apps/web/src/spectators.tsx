import React, { useEffect, useRef, useState } from "react";
import { hexLabel } from "./map-coordinates";
import type { GameState, RuleEvent } from "../../../packages/rules/src/types";
import { getWaitingSeats } from "../../../packages/rules/src/engine";
import { officialLarge } from "../../../packages/rules/src/map";
import { api, label } from "./api";
import { t } from "./i18n";
import { eventText } from "./i18n/presentation";
import { GamePage, MapBoard } from "./game";
import {
  PlayerResources,
  terrainPresentation,
  FinalScores,
} from "./table-experience";
import { PlayerIncome } from "./player-income";
import { AbilityReference, SetupPanel } from "./table-panels";
import { ScienceBoard } from "./science-board";
import { RoundRibbon } from "./round-ribbon";
import { BoardActions } from "./board-actions";
import "./spectators.css";

type Summary = {
  id: string;
  round: number;
  phase: string;
  names: string[];
  waiting: string[];
};
type Snapshot = { state: GameState; memberSeat: string | null };
type HistoryRow = { revision: number; events: RuleEvent[]; created_at: string };
const noop = () => {};

export function PublicGames() {
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [page, setPage] = useState(0),
    [data, setData] = useState<{ games: Summary[]; hasMore: boolean } | null>(
      null,
    ),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true,
      busy = false;
    const refresh = async () => {
      if (busy) return;
      busy = true;
      try {
        const next = await api(`/public-games?page=${page}`);
        if (active) {
          setData(next);
          setError("");
        }
      } catch (e) {
        if (active) setError((e as Error).message);
      } finally {
        busy = false;
      }
    };
    setData(null);
    void refresh();
    const timer = setInterval(() => {
      if (!document.hidden) void refresh();
    }, 30000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [page, refreshVersion]);
  return (
    <section className="public-games" aria-label={t("watch.listTitle")}>
      <h2>{t("watch.listTitle")}</h2>
      <button
        className="text-button"
        onClick={() => setRefreshVersion((v) => v + 1)}
      >
        {t("watch.refresh")}
      </button>
      <p className="muted">{t("watch.listHint")}</p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {!data ? (
        <p>{t("watch.loading")}</p>
      ) : data.games.length ? (
        <div className="watch-list">
          {data.games.map((g) => (
            <a className="watch-card" href={`#/game/${g.id}`} key={g.id}>
              <strong>{g.names.join(" · ")}</strong>
              <span>
                {t("watch.round", { n: g.round })} ·{" "}
                {t(`watch.phase.${g.phase}`)}
              </span>
              <span>
                {t("watch.waiting", {
                  names: g.waiting.join("、") || t("watch.none"),
                })}
              </span>
              <b>{t("watch.enter")}</b>
            </a>
          ))}
        </div>
      ) : (
        <p className="empty-panel">{t("watch.empty")}</p>
      )}
      <div className="inline watch-pagination">
        <button disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
          {t("watch.previous")}
        </button>
        <span>{t("watch.page", { n: page + 1 })}</span>
        <button disabled={!data?.hasMore} onClick={() => setPage((p) => p + 1)}>
          {t("watch.next")}
        </button>
      </div>
    </section>
  );
}

// A shared link resolves identity without weakening any player-only API.
export function GameAccess({ id }: { id: string }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    api(`/watch/${id}`)
      .then((d) => {
        if (active) setSnapshot(d);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [id]);
  if (!snapshot)
    return (
      <main className="empty" role={error ? "alert" : "status"}>
        {error || t("watch.loading")}
      </main>
    );
  return snapshot.memberSeat ? (
    <GamePage id={id} />
  ) : (
    <SpectatorPage id={id} initial={snapshot.state} />
  );
}

function mergeHistory(before: HistoryRow[], next: HistoryRow[]) {
  return [
    ...new Map([...before, ...next].map((r) => [r.revision, r])).values(),
  ].sort((a, b) => a.revision - b.revision);
}
function SpectatorPage({ id, initial }: { id: string; initial: GameState }) {
  const [state, setState] = useState(initial),
    [seat, setSeat] = useState(initial.turnOrder[0]),
    [selected, setSelected] = useState("");
  const [history, setHistory] = useState<HistoryRow[]>([]),
    [error, setError] = useState(""),
    [connected, setConnected] = useState(false),
    [olderBusy, setOlderBusy] = useState(false),
    [hasOlder, setHasOlder] = useState(false);
  const cursor = useRef<number | undefined>(undefined);
  useEffect(() => {
    let active = true,
      busy = false,
      again = false;
    const refresh = async () => {
      if (busy) {
        again = true;
        return;
      }
      busy = true;
      try {
        const next: Snapshot = await api(`/watch/${id}`);
        if (!active) return;
        setState((s) => (next.state.revision >= s.revision ? next.state : s));
        for (
          let i = 0;
          i < 5 &&
          (cursor.current === undefined ||
            cursor.current < next.state.revision);
          i++
        ) {
          const first = cursor.current === undefined;
          const rows: HistoryRow[] = await api(
            `/watch/${id}/history${first ? "" : `?after=${cursor.current}`}`,
          );
          if (!active) return;
          if (first) setHasOlder(rows.length === 100);
          setHistory((h) => mergeHistory(h, rows));
          cursor.current = rows.at(-1)?.revision ?? next.state.revision;
          if (rows.length < 100) break;
        }
        setError("");
      } catch (e) {
        if (active) setError((e as Error).message);
      } finally {
        busy = false;
        if (again && active) {
          again = false;
          void refresh();
        }
      }
    };
    const stream = new EventSource(`/api/watch/${id}/events`);
    stream.onopen = () => setConnected(true);
    stream.onerror = () => setConnected(false);
    stream.onmessage = () => {
      setConnected(true);
      void refresh();
    };
    const wake = () => {
      if (!document.hidden) void refresh();
    };
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("online", wake);
    const timer = setInterval(wake, 30000);
    void refresh();
    return () => {
      active = false;
      stream.close();
      clearInterval(timer);
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("online", wake);
    };
  }, [id]);
  const older = async () => {
    if (olderBusy || !history.length) return;
    setOlderBusy(true);
    try {
      const rows = await api(
        `/watch/${id}/history?before=${history[0].revision}`,
      );
      setHistory((h) => mergeHistory(h, rows));
      setHasOlder(rows.length === 100);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setOlderBusy(false);
    }
  };
  const waiting = getWaitingSeats(state),
    player = state.players[seat];
  const building = state.board.buildings[selected];
  return (
    <main className="game-page spectator-page">
      <section className="notice spectator-banner" aria-label={t("watch.mode")}>
        <h1>{t("watch.mode")}</h1>
        <p>{t("watch.readOnly")}</p>
        <div className="inline">
          <a href="#/">{t("watch.back")}</a>
          <span role="status">
            {t(connected ? "watch.live" : "watch.reconnecting")}
          </span>
          <span>{t("watch.revision", { n: state.revision })}</span>
        </div>
      </section>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="turn-bar">
        <strong>
          {t("watch.round", { n: state.round })} ·{" "}
          {t(`watch.phase.${state.phase}`)}
        </strong>
        <span>
          {t("watch.waiting", {
            names:
              waiting.map((s) => state.players[s].name).join("、") ||
              t("watch.none"),
          })}
        </span>
      </div>
      <div className="player-bar">
        {Object.values(state.players).map((p) => (
          <div
            className={`player-chip ${waiting.includes(p.seat) ? "active" : ""}`}
            key={p.seat}
          >
            <span
              className="player-dot"
              style={{ background: terrainPresentation[p.native].color }}
            />
            <div className="player-identity">
              <strong>{p.name}</strong>
              <span>
                {label(p.native)} · {label(p.faction)}
              </span>
            </div>
            <strong className="score">
              {p.vp}
              <small>{t("symbol.vp")}</small>
            </strong>
            {state.phase !== "draft" && (
              <>
                <PlayerResources player={p} />
                <PlayerIncome state={state} player={p} />
              </>
            )}
          </div>
        ))}
      </div>
      <label className="watch-perspective">
        {t("watch.perspective")}
        <select value={seat} onChange={(e) => setSeat(e.target.value)}>
          {Object.values(state.players).map((p) => (
            <option value={p.seat} key={p.seat}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <div className="table-grid">
        <section className="board-column">
          <RoundRibbon state={state} />
          <MapBoard state={state} selected={selected} onSelect={setSelected} />
          {selected && (
            <p className="notice watch-map-detail" role="status">
              {hexLabel(selected)} ·{" "}
              {label(
                state.board.terrain[selected] ??
                  officialLarge.hexes[selected]?.terrain,
              )}
              {building
                ? ` · ${state.players[building.seat]?.name} · ${label(building.kind)}`
                : ""}
            </p>
          )}
          <ScienceBoard state={state} seat={seat} />
          {state.phase !== "draft" && (
            <BoardActions
              state={state}
              seat={seat}
              disabled
              onPreview={noop}
              onIntent={noop}
            />
          )}
        </section>
        <aside className="control-column">
          {state.phase === "draft" ? (
            <SetupPanel state={state} disabled onPreview={noop} />
          ) : (
            <AbilityReference state={state} seat={seat} />
          )}
          {state.status === "finished" && <FinalScores state={state} />}
          <section className="watch-log" aria-label={t("watch.log")}>
            <h2>{t("watch.log")}</h2>
            {hasOlder && (
              <button disabled={olderBusy} onClick={older}>
                {t("watch.older")}
              </button>
            )}
            {!history.length && <p>{t("watch.noLog")}</p>}
            <ol>
              {history.map((row) => (
                <li key={row.revision}>
                  <strong>#{row.revision}</strong>
                  {row.events.map((event, index) => (
                    <p key={index}>{eventText(event, state)}</p>
                  ))}
                </li>
              ))}
            </ol>
          </section>
        </aside>
      </div>
    </main>
  );
}
