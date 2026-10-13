import React, { useCallback, useEffect, useState } from "react";
import type {
  GameAction,
  GameState,
  Terrain,
  Discipline,
  BoardMap,
} from "../../../packages/rules/src/types";
import type { CommandEnvelope } from "../../../packages/contracts/src/game";
import { createGame } from "../../../packages/rules/src/state";
import { developmentSetup } from "../../../packages/rules/src/preset";
import {
  applyAction,
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
const seatColors = ["#e9bd53", "#397d91", "#b85543", "#665ea0", "#284837"];
function freshDemo() {
  return createGame(
    developmentSetup("local-demo", [
      { id: "1", name: "你" },
      { id: "2", name: "林间客" },
      { id: "3", name: "远行者" },
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
  const [state, setState] = useState<GameState | null>(() =>
      demo ? getDemo() : null,
    ),
    [seat, setSeat] = useState("p1"),
    [selected, setSelected] = useState(""),
    [draft, setDraft] = useState<CommandEnvelope | null>(null),
    [preview, setPreview] = useState<any>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [uncertain, setUncertain] = useState(false),
    [history, setHistory] = useState<any[]>([]),
    [tab, setTab] = useState("build");
  const refresh = useCallback(async () => {
    if (demo) return;
    try {
      const data = await api("/games/" + id);
      setState(data.state);
      setSeat(data.seat);
      const h = await api("/games/" + id + "/history");
      setHistory(h);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [id, demo]);
  useEffect(() => {
    refresh();
    if (demo) return;
    const stream = new EventSource("/api/games/" + id + "/events");
    stream.onmessage = () => refresh();
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
    };
  }, [refresh, id, demo]);
  const previewAction = async (action: GameAction) => {
    if (!state) return;
    setError("");
    setBusy(true);
    try {
      const command = {
        commandId: crypto.randomUUID(),
        expectedRevision: state.revision,
        action,
      };
      let result;
      if (demo) {
        const transition = applyAction(state, seat, action);
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
    } catch (e) {
      setError((e as Error).message);
      if (e instanceof RequestError && e.code === "REVISION_CONFLICT")
        refresh();
    } finally {
      setBusy(false);
    }
  };
  const confirm = async () => {
    if (!draft || !state) return;
    setBusy(true);
    setError("");
    try {
      if (demo) {
        const result = applyAction(state, seat, draft.action);
        if (!result.ok) throw new RequestError(result.error.code);
        result.state.revision++;
        setState(result.state);
        setSeat(getWaitingSeats(result.state)[0] ?? seat);
        localStorage.setItem("boardgame-demo-v1", JSON.stringify(result.state));
        setHistory((h) => [
          ...h,
          { revision: result.state.revision, events: result.events },
        ]);
      } else {
        await api("/games/" + id + "/commands", draft);
        await refresh();
      }
      setDraft(null);
      setPreview(null);
      setUncertain(false);
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
  if (!state) return <main className="empty">{error || "正在恢复对局…"}</main>;
  const player = state.players[seat],
    waiting = getWaitingSeats(state),
    myTurn = waiting.includes(seat),
    r = player.resources;
  return (
    <main className="game-page">
      <div className="table-heading">
        <div>
          <a href="#/" className="back-link">
            ← 大厅
          </a>
          <h1>
            大创造时代 <span>AGE OF INNOVATION</span>
          </h1>
        </div>
        <div className="table-meta">
          <span className="tag">{demo ? "本地演示" : "联机开发预览"}</span>
          <strong>
            第 {state.round} <small>/ 6 轮</small>
          </strong>
          <span className="muted">局面版本 {state.revision}</span>
        </div>
      </div>
      {demo && (
        <div className="demo-strip">
          <span>本地演示 · 提交后自动切换到待行动座位，不是联机对局</span>
          <select
            aria-label="演示座位"
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
              setState(next);
              setSeat("p1");
              setDraft(null);
              setPreview(null);
              setHistory([]);
              localStorage.setItem("boardgame-demo-v1", JSON.stringify(next));
            }}
          >
            重新开始
          </button>
        </div>
      )}
      <div className="player-bar">
        {Object.values(state.players).map((p, i) => (
          <div
            key={p.seat}
            className={
              "player-chip " + (waiting.includes(p.seat) ? "active" : "")
            }
          >
            <span
              className="player-dot"
              style={{ background: seatColors[i] }}
            />
            <div>
              <strong>
                {p.name}
                {p.seat === seat ? "（你）" : ""}
              </strong>
              <span>
                {label(p.native)} · {label(p.faction)}
              </span>
            </div>
            <strong className="score">
              {p.vp}
              <small> 分</small>
            </strong>
            <span className="turn-tag">
              {state.status === "finished"
                ? "终局"
                : waiting.includes(p.seat)
                  ? "待行动"
                  : p.passed
                    ? "已结束本轮"
                    : "等待"}
            </span>
          </div>
        ))}
      </div>
      <details className="opponent-resources">
        <summary>查看所有玩家资源</summary>
        <div className="resource-table">
          {Object.values(state.players).map((p) => (
            <div key={p.seat}>
              <strong>{p.name}</strong>
              <span>金币 {p.resources.coins}</span>
              <span>工具 {p.resources.tools}</span>
              <span>学者 {p.resources.scholars}</span>
              <span>书籍 {p.resources.books.join(" / ")}</span>
              <span>魔力 {p.resources.power.join(" / ")}</span>
            </div>
          ))}
        </div>
      </details>
      <div className="table-grid">
        <section className="board-column">
          <div className="board-toolbar">
            <span>
              <i className={"status-dot " + (myTurn ? "on" : "")} />
              {state.status === "finished"
                ? "对局结束"
                : myTurn
                  ? "轮到你行动"
                  : `等待 ${waiting.map((s) => state.players[s].name).join("、")}`}
            </span>
            <span className="muted">
              {selected
                ? selected +
                  " · " +
                  label(
                    state.board.terrain[selected] ??
                      officialLarge.hexes[selected]?.terrain,
                  )
                : "点击地图选择地块"}
            </span>
          </div>
          <div className="round-ribbon">
            {state.setup.roundTiles.map((id, i) => (
              <div key={i} className={state.round === i + 1 ? "current" : ""}>
                <small>第 {i + 1} 轮</small>
                <strong>{roundNames[id] ?? id}</strong>
              </div>
            ))}
          </div>
          <MapBoard state={state} selected={selected} onSelect={setSelected} />
          <div className="terrain-legend">
            {terrainCycle.map((t) => (
              <span key={t}>
                <i style={{ background: colors[t] }} />
                {label(t)}
              </span>
            ))}
          </div>
          <section className="science-panel">
            <div className="section-heading">
              <h3>学科进展</h3>
              <span className="muted">
                城市钥匙 {player.keysUsed} / {player.keys}
              </span>
            </div>
            {["银行学", "法学", "工程学", "医学"].map((name, t) => (
              <div className="science-row" key={name}>
                <strong>{name}</strong>
                <div className="track">
                  {Array.from({ length: 13 }, (_, n) => (
                    <span className={n === 8 ? "key-step" : ""} key={n}>
                      {n}
                      <div>
                        {Object.values(state.players)
                          .filter((p) => p.science[t] === n)
                          .map((p) => (
                            <i
                              title={p.name}
                              key={p.seat}
                              style={{
                                background:
                                  seatColors[
                                    Object.keys(state.players).indexOf(p.seat)
                                  ],
                              }}
                            />
                          ))}
                      </div>
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </section>
          <details className="history-panel">
            <summary>行动记录 · {history.length} 条</summary>
            {history
              .slice(-30)
              .reverse()
              .map((h) => (
                <div className="history-row" key={h.revision}>
                  <span>#{h.revision}</span>
                  {h.events.map((e: any, i: number) => (
                    <p key={i}>{e.text}</p>
                  ))}
                </div>
              ))}
          </details>
        </section>
        <aside className="control-column">
          <section className="resource-panel">
            <div className="section-heading">
              <h3>你的个人板</h3>
              <span>{label(player.native)}</span>
            </div>
            <p className="personal-bonus">本轮奖励：{label(player.bonus)}</p>
            <div className="resource-grid">
              <Resource icon="◉" name="金币" value={r.coins} />
              <Resource icon="⚒" name="工具" value={r.tools} />
              <Resource icon="♟" name="学者" value={r.scholars} />
            </div>
            <div className="books">
              <span>书籍</span>
              {r.books.map((n, i) => (
                <span
                  key={i}
                  className={"book book" + i}
                  title={["黄色书籍", "蓝色书籍", "棕色书籍", "白色书籍"][i]}
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
                  <small>{["待充能", "待激活", "可使用"][i]}</small>
                </div>
              ))}
            </div>
            <div className="mini-stats">
              <span>
                航行 <b>{player.sailing}</b>
              </span>
              <span>
                改造 <b>{3 - player.terraformLevel} 工具 / 铲</b>
              </span>
            </div>
          </section>
          {state.status === "finished" ? (
            <section className="action-panel">
              <h2>终局成绩</h2>
              {[...state.scores]
                .sort((a, b) => b.total - a.total)
                .map((score) => (
                  <details key={score.seat}>
                    <summary>
                      {state.players[score.seat].name} · {score.total} 分
                    </summary>
                    {score.items.map((item) => (
                      <p key={item.reason}>
                        {item.reason}
                        <b className="float-right">{item.points}</b>
                      </p>
                    ))}
                  </details>
                ))}
            </section>
          ) : (
            <section className="action-panel">
              {state.pending.some((c) => c.seat === seat) ? (
                <>
                  <div className="eyebrow">需要你的选择</div>
                  {state.pending
                    .filter(
                      (c) =>
                        c.seat === seat &&
                        (state.phase !== "science" ||
                          c.kind !== "spades" ||
                          state.pending.find((other) => other.kind === "spades")
                            ?.id === c.id) &&
                        (c.kind === "key" ||
                          !state.pending.some(
                            (other) =>
                              other.seat === seat && other.kind === "key",
                          )),
                    )
                    .map((c) => (
                      <div key={c.id}>
                        <h3>
                          {c.kind === "key"
                            ? `使用城市钥匙？${["银行学", "法学", "工程学", "医学"][c.scienceTrack!]}继续推进 ${c.amount} 格`
                            : c.kind === "leech"
                              ? `蹭魔：${c.amount} 魔力`
                              : "请选择奖励"}
                        </h3>
                        {c.kind === "leech" && (
                          <p>接受需要支付 {Math.max(0, c.amount - 1)} 分。</p>
                        )}
                        {c.kind === "neutral" && (
                          <>
                            <p className="small">
                              在可达空地放置{label(c.buildingKind ?? "tower")}
                              ，改造费用将自动计算。
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
                              预览放置 {selected}
                            </button>
                          </>
                        )}
                        {c.kind === "spades" && (
                          <SpadesForm
                            selected={selected}
                            native={player.native}
                            amount={c.amount}
                            canBuild={c.canBuild !== false}
                            disabled={busy || uncertain}
                            onPreview={(terraform) =>
                              previewAction({
                                kind: "respond",
                                choiceId: c.id,
                                option: "terraform",
                                terraform,
                              })
                            }
                          />
                        )}
                        <div className="choice-buttons">
                          {c.options
                            .filter(
                              (option) =>
                                option !== "terraform" && c.kind !== "neutral",
                            )
                            .map((option) => (
                              <button
                                className="secondary"
                                key={option}
                                disabled={busy || uncertain}
                                onClick={() =>
                                  previewAction({
                                    kind: "respond",
                                    choiceId: c.id,
                                    option,
                                  })
                                }
                              >
                                {c.kind === "key"
                                  ? option === "use"
                                    ? "使用钥匙并继续"
                                    : "保留钥匙，停在 7 级"
                                  : option === "accept"
                                    ? "接受"
                                    : option === "decline"
                                      ? "放弃"
                                      : ["0", "1", "2", "3"].includes(option)
                                        ? [
                                            "银行 / 黄",
                                            "法学 / 蓝",
                                            "工程 / 棕",
                                            "医学 / 白",
                                          ][Number(option)]
                                        : label(option)}
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
                                        return `${["银行", "法学", "工程", "医学"][cell.color]} +${3 - cell.row} · ${["黄", "蓝", "棕", "白"][cell.color]}书 +${cell.row} · 剩余 ${cell.remaining}`;
                                      })()}
                                    </small>
                                  )}
                              </button>
                            ))}
                        </div>
                      </div>
                    ))}
                </>
              ) : state.phase === "placement" ? (
                <>
                  <div className="eyebrow">开局准备</div>
                  <h2>放置起始工坊</h2>
                  <p className="muted">
                    选择一个空置的{label(player.native)}
                    地块。每人先后放置两座工坊，第二轮按反向顺序。
                  </p>
                  <button
                    className="primary full"
                    disabled={!myTurn || !selected || busy || uncertain}
                    onClick={() =>
                      previewAction({ kind: "place", hex: selected })
                    }
                  >
                    预览行动
                  </button>
                </>
              ) : (
                <>
                  <div className="section-heading">
                    <h3>
                      {player.primaryDone ? "主要行动已完成" : "选择你的行动"}
                    </h3>
                  </div>
                  <div className="action-tabs">
                    {[
                      ["build", "建设"],
                      ["research", "研究"],
                      ["power", "魔力"],
                      ["pass", "轮次"],
                    ].map(([id, name]) => (
                      <button
                        className={tab === id ? "selected" : ""}
                        key={id}
                        onClick={() => setTab(id)}
                      >
                        {name}
                      </button>
                    ))}
                  </div>
                  <ActionForm
                    tab={tab}
                    state={state}
                    seat={seat}
                    selected={selected}
                    disabled={!myTurn || busy || uncertain}
                    onPreview={previewAction}
                  />
                  {(player.annexes > 0 ||
                    player.competencies.includes("power-special")) && (
                    <div className="form-stack">
                      <h4>能力行动</h4>
                      {player.annexes > 0 && (
                        <button
                          className="secondary"
                          disabled={
                            !myTurn ||
                            player.primaryDone ||
                            !selected ||
                            busy ||
                            uncertain
                          }
                          onClick={() =>
                            previewAction({
                              kind: "special",
                              source: "annex",
                              hex: selected,
                            })
                          }
                        >
                          放置附属建筑（余 {player.annexes}）
                        </button>
                      )}
                      {player.competencies.includes("power-special") && (
                        <button
                          className="secondary"
                          disabled={
                            !myTurn ||
                            player.primaryDone ||
                            player.usedSpecials.includes(
                              "competency:power-special",
                            ) ||
                            busy ||
                            uncertain
                          }
                          onClick={() =>
                            previewAction({
                              kind: "special",
                              source: "competency:power-special",
                            })
                          }
                        >
                          能力：获得 4 魔力
                        </button>
                      )}
                    </div>
                  )}
                  {player.primaryDone && (
                    <button
                      className="primary full"
                      disabled={!myTurn || busy || uncertain}
                      onClick={() => previewAction({ kind: "endTurn" })}
                    >
                      结束回合
                    </button>
                  )}
                </>
              )}
              {error && (
                <p className="error" role="alert">
                  {error}
                </p>
              )}
              {preview && draft && (
                <div className="preview-panel">
                  <strong>行动预览</strong>
                  <p>确认提交后生效</p>
                  <PreviewChanges
                    before={state}
                    after={preview.state}
                    seat={seat}
                  />
                  <p className="small">提交后不能撤回。</p>
                  {draft.expectedRevision !== state.revision && !uncertain && (
                    <p className="error">局面已更新，请保留选择并重新预览。</p>
                  )}
                  <button
                    className="primary full"
                    disabled={
                      busy ||
                      (!uncertain && draft.expectedRevision !== state.revision)
                    }
                    onClick={confirm}
                  >
                    {uncertain ? "安全重试提交" : "确认提交"}
                  </button>
                  {!uncertain && (
                    <button
                      className="text-button full"
                      onClick={() => {
                        setDraft(null);
                        setPreview(null);
                      }}
                    >
                      返回修改
                    </button>
                  )}
                </div>
              )}
            </section>
          )}
          <details className="settings-panel">
            <summary>自动蹭魔设置</summary>
            <p className="small muted">仅对这局生效。超过阈值仍然等你选择。</p>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={player.leechPolicy.enabled}
                onChange={(e) =>
                  previewAction({
                    kind: "setLeech",
                    enabled: e.target.checked,
                    maxVpCost: player.leechPolicy.maxVpCost,
                  })
                }
              />
              启用自动接受
            </label>
            <label>
              最多支付分数
              <input
                type="number"
                min="0"
                max="999"
                defaultValue={player.leechPolicy.maxVpCost}
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
          </details>
        </aside>
      </div>
    </main>
  );
}
function Resource({
  icon,
  name,
  value,
}: {
  icon: string;
  name: string;
  value: number;
}) {
  return (
    <div>
      <span>{icon}</span>
      <strong>{value}</strong>
      <small>{name}</small>
    </div>
  );
}
export function MapBoard({
  state,
  selected,
  onSelect,
}: {
  state: GameState;
  selected: string;
  onSelect: (id: string) => void;
}) {
  const [overview, setOverview] = useState(false);
  return (
    <div className="map-frame" data-overview={overview}>
      <div className="map-mobile-tools">
        <span>{overview ? "全图总览" : "左右滑动地图选择地块"}</span>
        <button className="text-button" onClick={() => setOverview(!overview)}>
          {overview ? "放大选格" : "缩小总览"}
        </button>
      </div>
      <div className="map-scroll">
        <svg viewBox="0 0 850 535" role="group" aria-label="大创造时代地图">
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
              isRiver = terrain === "river";
            const pts = Array.from({ length: 6 }, (_, i) => {
              const a = ((i * 60 + 30) * Math.PI) / 180;
              return `${h.x + 34 * Math.cos(a)},${h.y + 34 * Math.sin(a)}`;
            }).join(" ");
            return (
              <g
                key={h.id}
                role={isRiver ? undefined : "button"}
                tabIndex={isRiver ? -1 : 0}
                aria-label={h.id + " " + label(terrain)}
                onClick={() => !isRiver && onSelect(h.id)}
                onKeyDown={(e) => {
                  if (!isRiver && (e.key === "Enter" || e.key === " ")) {
                    e.preventDefault();
                    onSelect(h.id);
                  }
                }}
                className={!isRiver ? "hex" : ""}
              >
                <polygon
                  points={pts}
                  fill={colors[terrain]}
                  stroke={selected === h.id ? "#143f3d" : "#f2f2e8"}
                  strokeWidth={selected === h.id ? 4 : 1.8}
                />
                {isRiver ? (
                  <polygon points={pts} fill="url(#water)" />
                ) : (
                  <>
                    <text x={h.x} y={h.y + 23} className="hex-id">
                      {h.id}
                    </text>
                    {b ? (
                      <>
                        <path
                          d={`M${h.x - 12} ${h.y + 7} v-15 l12 -10 l12 10 v15 z`}
                          fill={
                            seatColors[
                              Object.keys(state.players).indexOf(b.seat)
                            ]
                          }
                          stroke="#273c38"
                          strokeWidth="1.5"
                        />
                        <text x={h.x} y={h.y + 2} className="building-letter">
                          {label(b.kind).slice(0, 1)}
                        </text>
                        {b.cityId && (
                          <circle
                            cx={h.x + 18}
                            cy={h.y - 16}
                            r="4"
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
          {state.board.bridges.map((bridge, i) => {
            const a = officialLarge.hexes[bridge.a],
              b = officialLarge.hexes[bridge.b];
            return (
              <g
                key={i}
                aria-label={`桥梁 ${bridge.a} 到 ${bridge.b}`}
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
                  stroke={
                    seatColors[Object.keys(state.players).indexOf(bridge.seat)]
                  }
                  strokeWidth="5"
                  strokeDasharray="5 2"
                />
              </g>
            );
          })}
          <text x="40" y="515" className="map-caption">
            3–5 人地图 · 地形与建筑使用自制图形
          </text>
        </svg>
      </div>
    </div>
  );
}
function ActionForm({
  tab,
  state,
  seat,
  selected,
  disabled,
  onPreview,
}: {
  tab: string;
  state: GameState;
  seat: string;
  selected: string;
  disabled: boolean;
  onPreview: (a: GameAction) => void;
}) {
  const p = state.players[seat];
  const [terrain, setTerrain] = useState<Terrain>(p.native),
    [build, setBuild] = useState(true),
    [upgrade, setUpgrade] = useState("guild"),
    [palace, setPalace] = useState("workshop-score"),
    [track, setTrack] = useState(0),
    [slot, setSlot] = useState("0"),
    [power, setPower] = useState("coins"),
    [from, setFrom] = useState("power"),
    [to, setTo] = useState("coin"),
    [count, setCount] = useState(1),
    [bonus, setBonus] = useState(""),
    [innovation, setInnovation] = useState("colleges"),
    [books, setBooks] = useState<[number, number, number, number]>([
      0, 0, 0, 0,
    ]);
  useEffect(() => setTerrain(p.native), [p.native]);
  const [bridge, setBridge] = useState("");
  const [bookActionId, setBookActionId] = useState("power");
  const blocked = disabled || p.primaryDone;
  if (tab === "build")
    return (
      <div className="form-stack">
        <label>
          地形改造目标
          <select
            value={terrain}
            onChange={(e) => setTerrain(e.target.value as Terrain)}
          >
            {terrainCycle.map((t) => (
              <option value={t} key={t}>
                {label(t)}
                {t === p.native ? "（家园）" : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={build}
            onChange={(e) => setBuild(e.target.checked)}
          />
          同时建造工坊
        </label>
        <button
          className="secondary full"
          disabled={blocked || !selected}
          onClick={() =>
            onPreview({ kind: "terraform", hex: selected, terrain, build })
          }
        >
          预览改造与建造
        </button>
        <div className="divider" />
        <label>
          升级为
          <select value={upgrade} onChange={(e) => setUpgrade(e.target.value)}>
            {["guild", "school", "palace", "university"].map((k) => (
              <option key={k} value={k}>
                {label(k)}
              </option>
            ))}
          </select>
        </label>
        {upgrade === "palace" && (
          <select
            aria-label="宫殿能力"
            value={palace}
            onChange={(e) => setPalace(e.target.value)}
          >
            {state.shared.palaces.map((id) => (
              <option key={id} value={id}>
                {label(id)}
              </option>
            ))}
          </select>
        )}
        <button
          className="secondary full"
          disabled={blocked || !selected}
          onClick={() =>
            onPreview({
              kind: "upgrade",
              hex: selected,
              to: upgrade as any,
              palace,
            })
          }
        >
          预览升级
        </button>
      </div>
    );
  if (tab === "research")
    return (
      <div className="form-stack">
        <label>
          派遣学者
          <select
            value={track}
            onChange={(e) => setTrack(Number(e.target.value))}
          >
            {["银行学", "法学", "工程学", "医学"].map((name, i) => (
              <option value={i} key={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <select
          aria-label="学者位置"
          value={slot}
          onChange={(e) => setSlot(e.target.value)}
        >
          <option value="return">返回供应：推进 1 格</option>
          {state.shared.scholarSlots[track].map((owner, i) => (
            <option key={i} value={i} disabled={owner !== null}>
              永久位置 {i + 1}：推进 {i === 0 ? 3 : 2} 格
              {owner ? "（已占用）" : ""}
            </option>
          ))}
        </select>
        <button
          className="secondary full"
          disabled={blocked}
          onClick={() =>
            onPreview({
              kind: "scholar",
              track: track as Discipline,
              slot: slot === "return" ? null : Number(slot),
            })
          }
        >
          预览派遣
        </button>
        <div className="inline">
          <button
            className="secondary"
            disabled={blocked}
            onClick={() => onPreview({ kind: "advance", track: "sailing" })}
          >
            推进航行
          </button>
          <button
            className="secondary"
            disabled={blocked}
            onClick={() => onPreview({ kind: "advance", track: "terraform" })}
          >
            推进改造
          </button>
        </div>
        <div className="divider" />
        <label>
          获得创新
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
          按黄、蓝、棕、白顺序选择支付书籍。基础 5 本，其中 2 本必须匹配所在列。
        </p>
        <div className="book-payment">
          {books.map((n, i) => (
            <input
              key={i}
              aria-label={["支付黄书", "支付蓝书", "支付棕书", "支付白书"][i]}
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
          ))}
        </div>
        <button
          className="secondary full"
          disabled={blocked}
          onClick={() =>
            onPreview({ kind: "innovation", id: innovation, books })
          }
        >
          预览创新
        </button>
      </div>
    );
  if (tab === "power")
    return (
      <div className="form-stack">
        <label>
          公共魔力动作
          <select value={power} onChange={(e) => setPower(e.target.value)}>
            {[
              ["coins", "4 魔力 → 7 金币"],
              ["tools", "4 魔力 → 2 工具"],
              ["scholar", "3 魔力 → 1 学者"],
              ["spade", "4 魔力 → 1 铲"],
              ["spades", "6 魔力 → 2 铲"],
              ["bridge", "3 魔力 → 桥梁"],
            ].map(([id, name]) => (
              <option
                key={id}
                value={id}
                disabled={state.shared.usedActions.includes(id)}
              >
                {name}
                {state.shared.usedActions.includes(id) ? "（已使用）" : ""}
              </option>
            ))}
          </select>
        </label>
        {power === "spade" || power === "spades" ? (
          <SpadesForm
            selected={selected}
            native={p.native}
            amount={power === "spade" ? 1 : 2}
            disabled={blocked}
            onPreview={(input) =>
              onPreview({ kind: "powerAction", id: power, ...input })
            }
          />
        ) : (
          <>
            {power === "bridge" && (
              <label>
                桥梁位置
                <select
                  value={bridge}
                  onChange={(e) => setBridge(e.target.value)}
                >
                  <option value="">请选择两岸</option>
                  {bridgeSites
                    .filter(
                      ([a, b]) =>
                        state.board.buildings[a]?.seat === seat ||
                        state.board.buildings[b]?.seat === seat,
                    )
                    .map(([a, b]) => (
                      <option key={a + b} value={a + "," + b}>
                        {a} ↔ {b}
                      </option>
                    ))}
                </select>
              </label>
            )}
            <button
              className="secondary full"
              disabled={blocked || (power === "bridge" && !bridge)}
              onClick={() =>
                onPreview({
                  kind: "powerAction",
                  id: power,
                  a: bridge.split(",")[0],
                  b: bridge.split(",")[1],
                })
              }
            >
              预览公共动作
            </button>
          </>
        )}
        <div className="divider" />
        <h4>书籍公共动作</h4>
        <select
          aria-label="书籍公共动作"
          value={bookActionId}
          onChange={(e) => setBookActionId(e.target.value)}
        >
          {(state.shared.bookActions ?? ["power", "science", "coins"]).map(
            (id) => (
              <option
                key={id}
                value={id}
                disabled={state.shared.usedActions.includes("book:" + id)}
              >
                {
                  {
                    power: "1 本书 → 5 魔力",
                    science: "1 本书 → 2 学科",
                    coins: "2 本书 → 6 金币",
                    upgrade: "2 本书 → 免费升级商会",
                    "guild-score": "2 本书 → 每商会 2 分",
                    spades: "3 本书 → 3 铲",
                  }[id]
                }
              </option>
            ),
          )}
        </select>
        {bookActionId === "science" && (
          <label>
            学科
            <select
              value={track}
              onChange={(e) => setTrack(Number(e.target.value))}
            >
              {["银行学", "法学", "工程学", "医学"].map((name, i) => (
                <option key={i} value={i}>
                  {name}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="book-payment">
          {books.map((n, i) => (
            <input
              key={i}
              aria-label={
                [
                  "公共动作黄书",
                  "公共动作蓝书",
                  "公共动作棕书",
                  "公共动作白书",
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
          ))}
        </div>
        <button
          className="secondary full"
          disabled={blocked || (bookActionId === "upgrade" && !selected)}
          onClick={() =>
            onPreview({
              kind: "bookAction",
              id: bookActionId,
              books,
              track: track as Discipline,
              hex: selected || undefined,
            })
          }
        >
          预览书籍动作
        </button>
        <div className="divider" />
        <h4>自由转换</h4>
        <div className="inline">
          <select
            aria-label="转换来源"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          >
            {[
              ["power", "魔力"],
              ["tool", "工具"],
              ["scholar", "学者"],
              ["book", "书籍"],
            ].map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
          <span>→</span>
          <select
            aria-label="转换目标"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          >
            {[
              ["coin", "金币"],
              ["tool", "工具"],
              ["scholar", "学者"],
              ["book", "书籍"],
            ].map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </div>
        <label>
          获得数量
          <input
            type="number"
            min="1"
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
          />
        </label>
        {(from === "book" || to === "book") && (
          <label>
            书籍颜色
            <select
              value={track}
              onChange={(e) => setTrack(Number(e.target.value))}
            >
              {["黄", "蓝", "棕", "白"].map((n, i) => (
                <option key={i} value={i}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        )}
        <button
          className="secondary full"
          disabled={disabled}
          onClick={() =>
            onPreview({
              kind: "convert",
              from: from as any,
              to: to as any,
              count,
              color: track as Discipline,
            })
          }
        >
          预览转换
        </button>
        <button
          className="text-button full"
          disabled={disabled}
          onClick={() => onPreview({ kind: "burn", count: 1 })}
        >
          燃烧 1 枚魔力标记
        </button>
      </div>
    );
  return (
    <div className="form-stack">
      <p className="muted">
        结束本轮后，本轮不能再行动。下一轮的顺序按结束先后决定。
      </p>
      {state.round < 6 && (
        <label>
          下一轮奖励
          <select value={bonus} onChange={(e) => setBonus(e.target.value)}>
            <option value="">请选择一张空闲奖励板</option>
            {state.setup.bonusPool
              .filter(
                (id) =>
                  !Object.values(state.players).some((p) => p.bonus === id),
              )
              .map((id) => (
                <option key={id} value={id}>
                  {label(id)}
                  {state.shared.bonusCoins[id]
                    ? ` +${state.shared.bonusCoins[id]} 金币`
                    : ""}
                </option>
              ))}
          </select>
        </label>
      )}
      <button
        className="secondary full"
        disabled={blocked || (state.round < 6 && !bonus)}
        onClick={() => onPreview({ kind: "pass", bonus: bonus || undefined })}
      >
        结束本轮
      </button>
    </div>
  );
}

function SpadesForm({
  selected,
  native,
  amount,
  canBuild = true,
  disabled,
  onPreview,
}: {
  selected: string;
  native: Terrain;
  amount: number;
  canBuild?: boolean;
  disabled: boolean;
  onPreview: (input: {
    hex: string;
    terrain: Terrain;
    build: boolean;
    additional: { hex: string; terrain: Terrain }[];
  }) => void;
}) {
  const [terrain, setTerrain] = useState<Terrain>(native),
    [targets, setTargets] = useState<{ hex: string; terrain: Terrain }[]>([]),
    [build, setBuild] = useState(false);
  return (
    <div className="form-stack">
      <p className="small">
        获得 {amount}{" "}
        把铲子。依次选择地块；只有第一个改造成家园后，才能把剩余铲子分给下一块。
      </p>
      <label>
        改造目标
        <select
          value={terrain}
          onChange={(e) => setTerrain(e.target.value as Terrain)}
        >
          {terrainCycle.map((t) => (
            <option key={t} value={t}>
              {label(t)}
            </option>
          ))}
        </select>
      </label>
      <button
        className="secondary"
        disabled={
          disabled ||
          !selected ||
          targets.length >= amount ||
          targets.some((t) => t.hex === selected)
        }
        onClick={() => setTargets((t) => [...t, { hex: selected, terrain }])}
      >
        添加地块 {selected}
      </button>
      {targets.map((t, i) => (
        <p className="small" key={t.hex}>
          {i + 1}. {t.hex} → {label(t.terrain)}{" "}
          <button
            className="text-button"
            onClick={() => setTargets((v) => v.filter((_, j) => i !== j))}
          >
            移除
          </button>
        </p>
      ))}
      {canBuild && (
        <label className="checkbox">
          <input
            type="checkbox"
            checked={build}
            onChange={(e) => setBuild(e.target.checked)}
          />
          在第一个地块建造工坊
        </label>
      )}
      <button
        className="secondary full"
        disabled={disabled || !targets.length}
        onClick={() =>
          onPreview({
            ...targets[0],
            build: canBuild && build,
            additional: targets.slice(1),
          })
        }
      >
        预览铲子分配
      </button>
    </div>
  );
}

const roundNames: Record<string, string> = {
  "workshop-law": "工坊 +2 分",
  "workshop-bank": "工坊 +2 分",
  "guild-law": "商会 +3 分",
  "guild-medicine": "商会 +3 分",
  "school-bank": "学校 +4 分",
  "big-medicine": "宫殿 / 大学 +5 分",
  "big-bank": "宫殿 / 大学 +5 分",
  "spade-engineering": "每铲 +2 分",
  "science-medicine": "学科每格 +1 分",
  "city-engineering": "城市 +5 分",
  "advance-engineering": "技术推进 +3 分",
  "innovation-law": "创新 +5 分",
};
function PreviewChanges({
  before,
  after,
  seat,
}: {
  before: GameState;
  after: GameState;
  seat: string;
}) {
  const p = before.players[seat],
    n = after.players[seat];
  const changes: [string, string][] = [];
  for (const [key, name] of [
    ["coins", "金币"],
    ["tools", "工具"],
    ["scholars", "学者"],
  ] as const) {
    const delta = n.resources[key] - p.resources[key];
    if (delta) changes.push([name, (delta > 0 ? "+" : "") + delta]);
  }
  if (n.vp !== p.vp)
    changes.push(["分数", (n.vp > p.vp ? "+" : "") + (n.vp - p.vp)]);
  for (let i = 0; i < 4; i++) {
    if (p.resources.books[i] !== n.resources.books[i])
      changes.push([
        ["黄书", "蓝书", "棕书", "白书"][i],
        `${p.resources.books[i]} → ${n.resources.books[i]}`,
      ]);
    if (p.science[i] !== n.science[i])
      changes.push([
        ["银行学", "法学", "工程学", "医学"][i],
        `${p.science[i]} → ${n.science[i]}`,
      ]);
  }
  if (p.resources.power.join() !== n.resources.power.join())
    changes.push([
      "魔力碗",
      `${p.resources.power.join("/")} → ${n.resources.power.join("/")}`,
    ]);
  for (const [hex, b] of Object.entries(after.board.buildings)) {
    if (
      b.seat === seat &&
      (before.board.buildings[hex]?.kind !== b.kind ||
        before.board.buildings[hex]?.annex !== b.annex)
    )
      changes.push([hex, label(b.kind) + (b.annex ? "＋附属建筑" : "")]);
  }
  if (before.round !== after.round)
    changes.push(["轮次", `第 ${before.round} → ${after.round} 轮`]);
  return (
    <>
      <div className="preview-changes">
        {changes.map(([name, value]) => (
          <div key={name}>
            <span>{name}</span>
            <b>{value}</b>
          </div>
        ))}
      </div>
      {after.pending.length > 0 && (
        <p className="small">
          提交后还有 {after.pending.length} 项奖励或蹭魔选择。
        </p>
      )}
    </>
  );
}
