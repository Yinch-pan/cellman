import { t as translate } from "./i18n";
import React, { useEffect, useState } from "react";
import { api, label } from "./api";
type Summary = {
  count: number;
  wins: number;
  winRate: number;
  average: number;
  best: number;
};
type Group = Summary & { name: string };
function StatsTable({
  rows,
  position = false,
}: {
  rows: Group[];
  position?: boolean;
}) {
  return (
    <div className="stats-scroll">
      <table>
        <thead>
          <tr>
            <th>
              {position
                ? translate("ui.statistics-page.93573861b1")
                : translate("ui.statistics-page.b49377b38c")}
            </th>
            <th>{translate("ui.statistics-page.6ba51a5291")}</th>
            <th>{translate("ui.statistics-page.092b5766db")}</th>
            <th>{translate("ui.statistics-page.62a878c582")}</th>
            <th>{translate("ui.statistics-page.866e992787")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name}>
              <th>
                {position
                  ? translate("ui.statistics-page.98b77da468", { p0: r.name })
                  : label(r.name)}
              </th>
              <td>{r.count}</td>
              <td>{r.winRate.toFixed(1)}%</td>
              <td>{r.average.toFixed(1)}</td>
              <td>{r.best}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
export function StatisticsPage() {
  const [mine, setMine] = useState<
    | (Summary & {
        factions: Group[];
        timeouts: number;
        forfeits: number;
        inactive: number;
        consensual: number;
        games: {
          id: string;
          date: string;
          faction: string;
          players: number;
          score: number | null;
          rank: number | null;
          reason: "normal" | "forfeit" | "inactive" | "consensus";
          forfeited: boolean;
        }[];
      })
    | null
  >(null);
  const [site, setSite] = useState<{
    count: number;
    factions: Group[];
    positions: Group[];
    forfeits: number;
    inactive: number;
    consensual: number;
  } | null>(null);
  const [count, setCount] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setError("");
    setSite(null);
    Promise.all([
      api("/me/stats"),
      api("/stats" + (count ? `?count=${count}` : "")),
    ])
      .then(([a, b]) => {
        if (active) {
          setMine(a);
          setSite(b);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [count]);
  return (
    <main className="statistics-page">
      <h1>{translate("ui.statistics-page.1c5586836c")}</h1>
      <p className="muted">{translate("ui.statistics-page.43f825c4af")}</p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <section>
        <h2>{translate("ui.statistics-page.c24443f60e")}</h2>
        {mine ? (
          <>
            <p>
              {translate("ui.statistics-page.fcdb6e3b04")}
              {mine.count} {translate("ui.statistics-page.0e7fa8bab4")}
              {mine.winRate.toFixed(1)}
              {translate("ui.statistics-page.26d75e1d32")}{" "}
              {mine.average.toFixed(1)}{" "}
              {translate("ui.statistics-page.a2eeed8c98")}
              {mine.best} {translate("ui.statistics-page.b75a03ace7")}
            </p>
            <p>
              {translate("ui.statistics-page.31fce2b03f")}
              {mine.timeouts ?? 0} {translate("ui.statistics-page.ca776a16a6")}
              {mine.forfeits ?? 0} {translate("ui.statistics-page.9cbc8e710a")}
              {mine.inactive ?? 0} {translate("ui.statistics-page.cd6f79fbed")}
              {" · "}
              {translate("endGame.statCount", { count: mine.consensual ?? 0 })}
            </p>
            {mine.count ? (
              <>
                <StatsTable rows={mine.factions} />
                <details>
                  <summary>
                    {translate("ui.statistics-page.e385daaa2b")}
                  </summary>
                  {mine.games.map((g) => (
                    <p key={g.id}>
                      <a href={`#/game/${g.id}`}>
                        {new Date(g.date).toLocaleDateString("zh-CN")} ·{" "}
                        {g.players} {translate("ui.statistics-page.dbc3a8dfd7")}{" "}
                        {g.reason === "consensus"
                          ? translate("endGame.statResult")
                          : g.reason === "inactive"
                            ? translate("ui.statistics-page.e5f1a31a8e")
                            : g.reason === "forfeit"
                              ? translate("ui.statistics-page.484620936e", {
                                  p0: g.forfeited
                                    ? translate("ui.statistics-page.e80bc913c0")
                                    : translate(
                                        "ui.statistics-page.45d8b78ca2",
                                      ),
                                })
                              : translate("ui.statistics-page.36793e1c45", {
                                  p0: label(g.faction),
                                  p1: g.score,
                                  p2: g.rank,
                                })}
                      </a>
                    </p>
                  ))}
                </details>
              </>
            ) : (
              <p>{translate("ui.statistics-page.9cb1b5a7e8")}</p>
            )}
          </>
        ) : (
          <p>{translate("ui.statistics-page.21bd738e0d")}</p>
        )}
      </section>
      <section>
        <h2>{translate("ui.statistics-page.37f4a3829d")}</h2>
        <label>
          {translate("ui.statistics-page.2b6d4ff9b5")}
          <select value={count} onChange={(e) => setCount(e.target.value)}>
            <option value="">
              {translate("ui.statistics-page.14a2b2c8c8")}
            </option>
            {[3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n} {translate("ui.statistics-page.d63842643d")}
              </option>
            ))}
          </select>
        </label>
        {site ? (
          <>
            <p>
              {translate("ui.statistics-page.307d597263")}
              {site.count} {translate("ui.statistics-page.b61e16a817")}
            </p>
            <p>
              {translate("ui.statistics-page.dc8e0f337f")}
              {site.forfeits ?? 0} {translate("ui.statistics-page.b72db29618")}{" "}
              {site.inactive ?? 0} {translate("ui.statistics-page.a017f70a75")}{" "}
              {translate("endGame.statCount", { count: site.consensual ?? 0 })}
            </p>
            {site.count > 0 && <StatsTable rows={site.factions} />}
            {count ? (
              <>
                <h3>{translate("ui.statistics-page.1639126da9")}</h3>
                <StatsTable rows={site.positions} />
              </>
            ) : (
              <p>{translate("ui.statistics-page.3d5c9de29d")}</p>
            )}
          </>
        ) : (
          <p>{translate("ui.statistics-page.21bd738e0d")}</p>
        )}
      </section>
    </main>
  );
}
