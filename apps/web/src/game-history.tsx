import React, { useEffect, useState } from "react";
import { api } from "./api";
import { i18n, t } from "./i18n";

type FinishedGame = {
  id: string;
  round: number;
  names: string[];
  endedAt: string;
  reason: "normal" | "forfeit" | "inactive" | "consensus";
};
export function GameHistoryPage() {
  const [page, setPage] = useState(0),
    [version, setVersion] = useState(0),
    [error, setError] = useState("");
  const [data, setData] = useState<{
    games: FinishedGame[];
    hasMore: boolean;
  } | null>(null);
  useEffect(() => {
    let active = true,
      busy = false;
    const refresh = async () => {
      if (busy) return;
      busy = true;
      try {
        const next = await api(`/me/game-history?page=${page}`);
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
    const wake = () => {
      if (!document.hidden) void refresh();
    };
    const timer = setInterval(wake, 30000);
    document.addEventListener("visibilitychange", wake);
    return () => {
      active = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", wake);
    };
  }, [page, version]);
  return (
    <main className="lobby game-history-page">
      <div className="page-heading">
        <h1>{t("gameHistory.title")}</h1>
        <a href="#/games">{t("gameHistory.active")}</a>
      </div>
      <p className="muted">{t("gameHistory.hint")}</p>
      <button className="text-button" onClick={() => setVersion((v) => v + 1)}>
        {t("gameHistory.refresh")}
      </button>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {!data ? (
        <p>{t("watch.loading")}</p>
      ) : data.games.length ? (
        <div className="card-grid">
          {data.games.map((g) => (
            <button
              className="game-card"
              data-game-id={g.id}
              key={g.id}
              onClick={() => {
                location.hash = `/game/${g.id}`;
              }}
            >
              <span className="tag">{t(`gameHistory.reason.${g.reason}`)}</span>
              <h3>{g.names.join(" · ")}</h3>
              <p>
                {t("watch.round", { n: g.round })} ·{" "}
                {new Date(g.endedAt).toLocaleString(i18n.getLocale())}
              </p>
              <span>{t("gameHistory.open")}</span>
            </button>
          ))}
        </div>
      ) : (
        <p className="empty-panel">{t("gameHistory.empty")}</p>
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
    </main>
  );
}
