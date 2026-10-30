import React, { useRef, useState } from "react";
import { i18n, t } from "./i18n";
import type { GameState } from "../../../packages/rules/src/types";
import "./end-game.css";
export type EndRequest = {
  id: string;
  requester_seat: string;
  base_revision: number;
  reason: string;
  votes: Record<string, boolean>;
  status:
    "pending" | "applied" | "rejected" | "cancelled" | "expired" | "changed";
  created_at: string;
  expires_at: string;
};
export type EndProposal = {
  requestId: string;
  expectedRevision: number;
  reason: string;
};
export function EndGamePanel({
  state,
  requests,
  seat,
  disabled,
  undoPending,
  onRequest,
  onVote,
}: {
  state: GameState;
  requests: EndRequest[];
  seat: string;
  disabled: boolean;
  undoPending: boolean;
  onRequest: (input: EndProposal) => Promise<boolean>;
  onVote: (
    requestId: string,
    decision: "approve" | "reject" | "cancel",
  ) => Promise<boolean>;
}) {
  const [reason, setReason] = useState("");
  const attempt = useRef<EndProposal | null>(null);
  const pending = requests.find(
    (r) =>
      r.status === "pending" &&
      r.base_revision === state.revision &&
      Date.parse(r.expires_at) > Date.now(),
  );
  const canPropose = state.status !== "finished" && !state.matchResult;
  const latest = requests[0];
  if (!canPropose && !requests.length) return null;
  return (
    <section className="end-game-panel" aria-label={t("endGame.section")}>
      {pending && canPropose ? (
        <div className="end-game-vote" role="status">
          <h3>
            {t("endGame.pending", {
              name: state.players[pending.requester_seat]?.name,
            })}
          </h3>
          <p>{t("endGame.effect")}</p>
          {pending.reason && (
            <p className="end-game-reason">{pending.reason}</p>
          )}
          <p className="muted">{t("endGame.votingRule")}</p>
          <p>
            {t("endGame.progress", {
              approved: Object.keys(state.players).filter(
                (s) => pending.votes[s] === true,
              ).length,
              total: Object.keys(state.players).length,
            })}
          </p>
          <ul className="end-game-voters">
            {Object.values(state.players).map((p) => (
              <li key={p.seat}>
                <strong>{p.name}</strong> ·{" "}
                {t(
                  pending.votes[p.seat] === true
                    ? "endGame.approved"
                    : "endGame.waiting",
                )}
              </li>
            ))}
          </ul>
          <p className="small muted">
            {t("endGame.expires", {
              time: new Date(pending.expires_at).toLocaleString(
                i18n.getLocale(),
              ),
            })}
          </p>
          <div className="inline">
            {!pending.votes[seat] && (
              <button
                className="primary"
                disabled={disabled}
                onClick={() => onVote(pending.id, "approve")}
              >
                {t("endGame.approve")}
              </button>
            )}
            {pending.requester_seat === seat ? (
              <button
                className="secondary"
                disabled={disabled}
                onClick={() => onVote(pending.id, "cancel")}
              >
                {t("endGame.cancel")}
              </button>
            ) : (
              <button
                className="secondary"
                disabled={disabled}
                onClick={() => onVote(pending.id, "reject")}
              >
                {t("endGame.reject")}
              </button>
            )}
          </div>
        </div>
      ) : canPropose ? (
        <details className="end-game-propose">
          <summary>{t("endGame.propose")}</summary>
          {latest && latest.status !== "pending" && (
            <p role="status">{t(`endGame.status.${latest.status}`)}</p>
          )}
          <p>{t("endGame.effect")}</p>
          <p className="muted">{t("endGame.votingRule")}</p>
          {undoPending && <p className="notice">{t("endGame.undoPending")}</p>}
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (disabled || undoPending) return;
              const text = reason.trim();
              if (
                !attempt.current ||
                attempt.current.expectedRevision !== state.revision ||
                attempt.current.reason !== text
              )
                attempt.current = {
                  requestId: crypto.randomUUID(),
                  expectedRevision: state.revision,
                  reason: text,
                };
              if (await onRequest(attempt.current)) {
                attempt.current = null;
                setReason("");
              }
            }}
          >
            <label>
              {t("endGame.reason")}
              <textarea
                rows={2}
                maxLength={200}
                value={reason}
                disabled={disabled || undoPending}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
            <button className="secondary" disabled={disabled || undoPending}>
              {t("endGame.submit")}
            </button>
          </form>
        </details>
      ) : null}
      {!!requests.length && (
        <details className="end-game-history">
          <summary>{t("endGame.history")}</summary>
          <ul>
            {requests.map((r) => (
              <li key={r.id}>
                <p>
                  {state.players[r.requester_seat]?.name} ·{" "}
                  {new Date(r.created_at).toLocaleString(i18n.getLocale())} ·{" "}
                  {t(`endGame.status.${r.status}`)}
                </p>
                {r.reason && <p className="end-game-reason">{r.reason}</p>}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
