import { t as translate } from "./i18n";
import { translateRuleText } from "./i18n/presentation";
import React, { useEffect, useState } from "react";
import {
  replayRecord,
  type ReplayRecord,
  type HistoryRow,
} from "../../../packages/rules/src/replay";
import { gameStatistics } from "../../../packages/rules/src/statistics";
import { actionNames, fieldLabels } from "./i18n/presentation";
import type { GameState, GameAction } from "../../../packages/rules/src/types";
import { LedgerPanel } from "./table-panels";
import { api, label } from "./api";
export interface UndoRequest {
  id: string;
  requester_seat: string;
  base_revision: number;
  target_revision: number;
  reason: string;
  votes: Record<string, boolean>;
  status: string;
  applied_revision: number | null;
}
const statuses: Record<string, string> = {
  pending: translate("ui.review.e5d2184f2f"),
  applied: translate("ui.review.3617f737f4"),
  rejected: translate("ui.review.f098218a30"),
  cancelled: translate("ui.review.a37778f17c"),
};
export function UndoNotice({
  requests,
  state,
  seat,
  onVote,
  busy,
}: {
  requests: UndoRequest[];
  state: GameState;
  seat: string;
  busy: boolean;
  onVote: (
    request: UndoRequest,
    decision: "approve" | "reject" | "cancel",
  ) => void;
}) {
  const pending = requests.find((r) => r.status === "pending");
  if (!pending) return null;
  return (
    <section className="notice undo-notice" role="status">
      <strong>
        {state.players[pending.requester_seat]?.name}
        {translate("ui.review.7ccbeca704")}
      </strong>
      <p>
        {translate("ui.review.6d81dbf37d")}
        {pending.target_revision}
        {translate("ui.review.e3ba7e43f6")}
        {pending.target_revision + 1}–#
        {pending.base_revision} {translate("ui.review.6b4a81082c")}
      </p>
      <p>
        {translate("ui.review.b9fbb8ede4")}
        {pending.reason}
      </p>
      <p>
        {Object.values(state.players)
          .map(
            (p) =>
              `${p.name}：${pending.votes[p.seat] ? translate("ui.review.5961a7938f") : translate("ui.review.a8b0bd9c65")}`,
          )
          .join(" · ")}
      </p>
      <div className="inline">
        {!pending.votes[seat] && (
          <button disabled={busy} onClick={() => onVote(pending, "approve")}>
            {translate("ui.review.1db8db68d1")}
          </button>
        )}
        <button
          disabled={busy}
          className="secondary"
          onClick={() =>
            onVote(
              pending,
              pending.requester_seat === seat ? "cancel" : "reject",
            )
          }
        >
          {pending.requester_seat === seat
            ? translate("ui.review.681e6d641e")
            : translate("ui.review.16a9695264")}
        </button>
      </div>
    </section>
  );
}
export function ReviewPanel({
  state,
  seat,
  history,
  requests,
  demo,
  id,
  onView,
  onExport,
  onOlder,
  onRefresh,
  onLocalRestore,
  disabled,
  viewedRevision,
  allowUndo = true,
}: {
  state: GameState;
  seat: string;
  history: HistoryRow[];
  requests: UndoRequest[];
  demo: boolean;
  id?: string;
  onView: (state: GameState | null) => void;
  onExport: () => void;
  onOlder?: () => void;
  onRefresh: () => Promise<void>;
  onLocalRestore: (record: ReplayRecord) => void;
  disabled: boolean;
  viewedRevision?: number;
  allowUndo?: boolean;
}) {
  const [record, setRecord] = useState<ReplayRecord | null>(null);
  const [stats, setStats] = useState<ReturnType<typeof gameStatistics> | null>(
    null,
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [target, setTarget] = useState<{
    revision: number;
    base: number;
    requestId: string;
  } | null>(null);
  const [reason, setReason] = useState("");
  useEffect(() => {
    setRecord(null);
    setStats(null);
  }, [state.revision, state.setup.id]);
  async function load() {
    if (record?.revision === state.revision) return record;
    const value = demo
      ? JSON.parse(localStorage.getItem("boardgame-demo-record") ?? "null")
      : await api(`/games/${id}/replay`);
    const next: ReplayRecord = value ?? {
      initial: state,
      commands: [],
      revision: state.revision,
    };
    setRecord(next);
    return next;
  }
  async function view(revision: number) {
    setBusy(true);
    setError("");
    try {
      const r = await load();
      if (revision < r.initial.revision)
        throw Error(translate("ui.review.668da6a8d2"));
      onView(replayRecord(r, revision).state);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function submit() {
    if (!target) return;
    setBusy(true);
    setError("");
    try {
      if (demo) {
        const r = await load();
        if (r.revision !== target.base)
          throw Error(translate("ui.review.4397434ffa"));
        r.commands.push({
          revision: target.base + 1,
          seat,
          action: { kind: "restore", targetRevision: target.revision },
        });
        r.revision = target.base + 1;
        onLocalRestore(r);
        setRecord(null);
        setStats(null);
      } else
        await api(`/games/${id}/undo/request`, {
          requestId: target.requestId,
          expectedRevision: target.base,
          targetRevision: target.revision,
          reason,
        });
      setTarget(null);
      setReason("");
      await onRefresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const restored = history.flatMap((h) =>
    h.events
      .filter((e) => e.kind === "restore")
      .map((e) => ({
        target: Number(e.details?.targetRevision),
        end: h.revision - 1,
      })),
  );
  const revoked = history
    .filter(
      (h) =>
        restored.some((r) => h.revision > r.target && h.revision <= r.end) ||
        requests.some(
          (r) =>
            r.status === "applied" &&
            h.revision > r.target_revision &&
            h.revision <= r.base_revision,
        ),
    )
    .map((h) => h.revision);
  return (
    <section className="review-panel" id="table-records" tabIndex={-1}>
      {viewedRevision !== undefined && record && (
        <div
          className="inline history-controls"
          aria-label={translate("ui.review.fd0a5ab431")}
        >
          <button
            disabled={busy || viewedRevision <= record.initial.revision}
            onClick={() => view(viewedRevision - 1)}
          >
            {translate("ui.review.da336fdc0d")}
          </button>
          <span>
            {translate("ui.review.d609c36f4a")}
            {viewedRevision}
          </span>
          <button
            disabled={
              busy || viewedRevision >= (record.revision ?? state.revision)
            }
            onClick={() => view(viewedRevision + 1)}
          >
            {translate("ui.review.acfc4e74a6")}
          </button>
        </div>
      )}
      <LedgerPanel
        state={state}
        seat={seat}
        history={history}
        onExport={onExport}
        onOlder={onOlder}
        revoked={revoked}
        onView={busy ? undefined : view}
        onUndo={
          disabled || busy || !allowUndo
            ? undefined
            : (revision) => {
                setTarget({
                  revision,
                  base: state.revision,
                  requestId: crypto.randomUUID(),
                });
                setReason("");
              }
        }
      />
      {target && (
        <section
          className="undo-form"
          aria-label={translate("ui.review.61b464ad94")}
        >
          <h3>
            {demo
              ? translate("ui.review.39400ac272")
              : translate("ui.review.fb87e5ff16")}
          </h3>
          <p>
            {translate("ui.review.6d81dbf37d")}
            {target.revision}
            {translate("ui.review.ec67f5582c")}
            {target.revision + 1}–#
            {target.base} {translate("ui.review.edbfd2c1ed")}
            {demo
              ? translate("ui.review.aaf3fadbc6")
              : translate("ui.review.d59a1ef2b2")}
          </p>
          <button className="text-button" onClick={() => view(target.revision)}>
            {translate("ui.review.73cd445f38")}
          </button>
          <label>
            {translate("ui.review.348c17c8f9")}
            <textarea
              value={reason}
              maxLength={300}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <button
            disabled={
              busy ||
              disabled ||
              !allowUndo ||
              !reason.trim() ||
              state.revision !== target.base
            }
            onClick={submit}
          >
            {demo
              ? translate("ui.review.5d1bfe12f4")
              : translate("ui.review.adb32d1530")}
          </button>
          <button
            className="text-button"
            disabled={busy}
            onClick={() => setTarget(null)}
          >
            {translate("ui.review.2cd0f3be87")}
          </button>
        </section>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <details
        className="statistics-panel"
        onToggle={async (e) => {
          if (!e.currentTarget.open) return;
          setError("");
          try {
            setStats(gameStatistics(await load()));
          } catch (e) {
            setError((e as Error).message);
          }
        }}
      >
        <summary>{translate("ui.review.6543a8c878")}</summary>
        {!stats ? (
          <button
            className="text-button"
            onClick={async () => {
              try {
                setStats(gameStatistics(await load()));
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            {translate("ui.review.8786384a43")}
          </button>
        ) : (
          <>
            <p className="small muted">
              {translate("ui.review.8f72c457bd")}
              {record?.initial.revision ?? 0}{" "}
              {translate("ui.review.0db77c1bf2")}
              {record?.revision ?? state.revision}{" "}
              {translate("ui.review.7fd7554a4e")} {stats.activeCount}{" "}
              {translate("ui.review.3546e80e2a")}
              {stats.totalCount} {translate("ui.review.07bf4488cb")}
            </p>
            {stats.players.map((p) => (
              <details key={p.seat} open>
                <summary>
                  {p.name} {translate("ui.review.d6be1a3b80")}
                  {stats.state.players[p.seat].vp}{" "}
                  {translate("ui.review.b75a03ace7")}
                  {stats.state.status === "finished"
                    ? translate("ui.review.74ed1b217c", {
                        p0: stats.state.scores.find((s) => s.seat === p.seat)
                          ?.total,
                      })
                    : ""}
                </summary>
                <div className="stats-scroll">
                  <table>
                    <caption>{translate("ui.review.d5d7d2b098")}</caption>
                    <thead>
                      <tr>
                        <th>{translate("ui.review.4890584bb5")}</th>
                        <th>{translate("ui.review.07f60e0e25")}</th>
                        <th>{translate("ui.review.bbece6f829")}</th>
                        <th>{translate("ui.review.5ca6730d44")}</th>
                        <th>{translate("ui.review.230cc1d6c8")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(p.rounds).map(([round, r]) => (
                        <tr key={round}>
                          <th>
                            {round === "0"
                              ? translate("ui.review.036d65598b")
                              : round}
                          </th>
                          <td>{r.vp}</td>
                          {["coins", "tools", "scholars"].map((k) => (
                            <td key={k}>{r.changes[k] ?? 0}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <details>
                  <summary>{translate("ui.review.e5b39064de")}</summary>
                  {Object.entries(p.actions).map(([kind, n]) => (
                    <p key={kind}>
                      {actionNames[kind as GameAction["kind"]]}：{n}
                    </p>
                  ))}
                </details>
                <details>
                  <summary>{translate("ui.review.9b861805c4")}</summary>
                  <p>
                    {translate("ui.review.9949e36afb")}
                    {p.initialVp} {translate("ui.review.b75a03ace7")}
                  </p>
                  {Object.entries(p.scoreSources).map(([source, n]) => (
                    <p key={source}>
                      {label(source)}：{n > 0 ? "+" : ""}
                      {n}
                    </p>
                  ))}
                  <p className="small muted">
                    {translate("ui.review.243615862a")}
                  </p>
                  {stats.state.scores
                    .find((s) => s.seat === p.seat)
                    ?.items.filter(
                      (i) => i.reason !== translate("ui.review.f3ee1bd368"),
                    )
                    .map((i) => (
                      <p key={i.reason}>
                        {translate("ui.review.dcf8136635")}
                        {translateRuleText(i.reason)}：{i.points}
                      </p>
                    ))}
                </details>
                <details>
                  <summary>{translate("ui.review.f8fd741876")}</summary>
                  {Object.entries(p.rounds).map(([round, r]) => (
                    <p key={round}>
                      {translate("ui.review.9552fe3bd3")}
                      {round} {translate("ui.review.53453a636e")}
                      {Object.entries(r.changes)
                        .map(
                          ([k, v]) =>
                            `${fieldLabels[k] ?? k} ${v > 0 ? "+" : ""}${v}`,
                        )
                        .join("；")}
                    </p>
                  ))}
                </details>
              </details>
            ))}
          </>
        )}
      </details>
      {requests.length > 0 && (
        <details>
          <summary>{translate("ui.review.21a1533f34")}</summary>
          {requests.map((r) => (
            <p key={r.id}>
              {state.players[r.requester_seat]?.name} · #{r.target_revision + 1}
              –#{r.base_revision} · {statuses[r.status]} · {r.reason}
            </p>
          ))}
        </details>
      )}
    </section>
  );
}
