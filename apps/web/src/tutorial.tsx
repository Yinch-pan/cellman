import { t as translate } from "./i18n";
import React, { useState } from "react";
import { MapBoard } from "./game";
import { createGame } from "../../../packages/rules/src/state";
import { developmentSetup } from "../../../packages/rules/src/preset";
import { applyAction } from "../../../packages/rules/src/engine";
import { queueChoice } from "../../../packages/rules/src/responses";
import type { GameState, GameAction } from "../../../packages/rules/src/types";
import { PersonalBoard } from "./personal-board";
import { RequestError } from "./api";
export function tutorialStart() {
  return createGame(
    developmentSetup("tutorial", [
      { id: "1", name: translate("ui.tutorial.a0c7716669") },
      { id: "2", name: translate("ui.tutorial.bc635dad44") },
      { id: "3", name: translate("ui.tutorial.d9301d3642") },
    ]),
  );
}
function practiceState() {
  const s = tutorialStart();
  s.phase = "actions";
  s.board.buildings = { B4: { seat: "p1", kind: "workshop" } };
  s.players.p1.bonus = "spade-bonus";
  s.players.p1.resources.tools = 0;
  s.players.p1.resources.power = [0, 0, 3];
  return s;
}
const lessons = [
  [translate("ui.tutorial.5fad1469e4"), translate("ui.tutorial.4a18f25a04")],
  [translate("ui.tutorial.ee1fa28f95"), translate("ui.tutorial.861b1c1017")],
  [translate("ui.tutorial.094047ce4d"), translate("ui.tutorial.c8f123b7da")],
  [translate("ui.tutorial.826f70c6da"), translate("ui.tutorial.a0af810d75")],
  [translate("ui.tutorial.984c84c07d"), translate("ui.tutorial.be49eb9147")],
  [translate("ui.tutorial.975778d990"), translate("ui.tutorial.963017c523")],
  [translate("ui.tutorial.13903ed28c"), translate("ui.tutorial.ee993c45db")],
  [translate("ui.tutorial.9db57eae70"), translate("ui.tutorial.25c22b003e")],
  [translate("ui.tutorial.40778fd0fb"), translate("ui.tutorial.9a2f7c0b80")],
];
export function Tutorial() {
  const [lesson, setLesson] = useState(0),
    [state, setState] = useState(tutorialStart),
    [selected, setSelected] = useState(""),
    [pending, setPending] = useState<GameAction | null>(null),
    [error, setError] = useState("");
  const [history, setHistory] = useState<
    { lesson: number; state: GameState }[]
  >([]);
  const target = lesson === 0 ? "B4" : lesson === 2 ? "C5" : "";
  let action: GameAction | null = null;
  if (lesson === 0 && selected === target)
    action = { kind: "place", hex: target };
  if (lesson === 1) action = { kind: "special", source: "bonus:spade-bonus" };
  if (lesson === 2 && selected === target)
    action = {
      kind: "respond",
      choiceId: state.pending.find((c) => c.kind === "spades")!.id,
      option: "terraform",
      terraform: {
        hex: target,
        terrain: "forest",
        build: false,
        deferBuild: true,
      },
    };
  if (lesson === 3)
    action = { kind: "convert", from: "power", to: "tool", count: 1 };
  if (lesson === 4)
    action = {
      kind: "respond",
      choiceId: state.pending.find((c) => c.kind === "buildWorkshop")!.id,
      option: "build",
    };
  if (lesson === 5) action = { kind: "endTurn" };
  if (lesson === 6)
    action = {
      kind: "respond",
      choiceId: state.pending[0].id,
      option: "accept",
    };
  if (lesson === 7) action = { kind: "pass", bonus: "scholar" };
  const actor = lesson === 7 ? "p3" : "p1";
  const preview = pending ? applyAction(state, actor, pending) : null;
  const reset = () => {
    setState(tutorialStart());
    setLesson(0);
    setSelected("");
    setPending(null);
    setHistory([]);
    setError("");
  };
  const confirm = () => {
    if (!preview?.ok) return;
    setHistory((h) => [...h, { lesson, state }]);
    let next = preview.state;
    if (lesson === 0) next = practiceState();
    if (lesson === 5) {
      next = practiceState();
      next.activeSeat = "p2";
      next.players.p1.resources.power = [4, 8, 0];
      queueChoice(
        next,
        "p1",
        "leech",
        2,
        ["accept", "decline"],
        translate("ui.tutorial.18a6aaa5c5"),
      );
    }
    if (lesson === 6) {
      next = practiceState();
      next.round = 1;
      next.activeSeat = "p3";
      next.passOrder = ["p1", "p2"];
      next.players.p1.passed = true;
      next.players.p2.passed = true;
      next.players.p1.bonus = "coins";
      next.players.p1.resources.tools = 0;
    }
    setState(next);
    setLesson(lesson + 1);
    setPending(null);
    setSelected("");
    setError("");
  };
  return (
    <main className="tutorial-page">
      <div className="section-heading">
        <h1>{translate("ui.tutorial.238501d48e")}</h1>
        <button onClick={reset}>{translate("ui.tutorial.1066bb68ee")}</button>
      </div>
      <p className="small muted">{translate("ui.tutorial.d7723b5be8")}</p>
      <progress
        aria-label={translate("ui.tutorial.c871f4ee57")}
        max={8}
        value={lesson}
      />
      <section className="tutorial-instruction" aria-live="polite">
        <small>
          {translate("ui.tutorial.2a45ec27e5")}
          {Math.min(lesson + 1, 8)} / 8
        </small>
        <h2>{lessons[lesson][0]}</h2>
        <p>{lessons[lesson][1]}</p>
        {lesson < 8 && (
          <button
            className="primary"
            disabled={!action}
            onClick={() => {
              setPending(action);
              setError("");
            }}
          >
            {
              [
                translate("ui.tutorial.39230df1b8"),
                translate("ui.tutorial.eb11f6369a"),
                translate("ui.tutorial.645bb6b871"),
                translate("ui.tutorial.b099df2117"),
                translate("ui.tutorial.915c1ca155"),
                translate("ui.tutorial.b9dbe24762"),
                translate("ui.tutorial.f18391a1ee"),
                translate("ui.tutorial.a26208b2fc"),
              ][lesson]
            }
          </button>
        )}
        {lesson === 6 && (
          <button
            onClick={() =>
              setPending({ ...action!, option: "decline" } as GameAction)
            }
          >
            {translate("ui.tutorial.29380c7983")}
          </button>
        )}
        {lesson === 8 && (
          <a className="primary button" href="#/">
            {translate("ui.tutorial.e370ab2196")}
          </a>
        )}
        {history.length > 0 && (
          <button
            onClick={() => {
              const h = history.at(-1)!;
              setState(h.state);
              setLesson(h.lesson);
              setHistory(history.slice(0, -1));
              setPending(null);
              setSelected("");
            }}
          >
            {translate("ui.tutorial.a9948ff014")}
          </button>
        )}
      </section>
      {pending && (
        <section className="tutorial-preview">
          <h3>{translate("ui.tutorial.23a7807b5e")}</h3>
          {preview?.ok ? (
            <>
              <p>
                {translate("ui.tutorial.f34e4daa0c")}
                {state.players.p1.resources.coins} →{" "}
                {preview.state.players.p1.resources.coins}{" "}
                {translate("ui.tutorial.8d1be30da4")}{" "}
                {state.players.p1.resources.tools} →{" "}
                {preview.state.players.p1.resources.tools}{" "}
                {translate("ui.tutorial.6a4b0d1c89")} {state.players.p1.vp} →{" "}
                {preview.state.players.p1.vp}
              </p>
              <button className="primary" onClick={confirm}>
                {translate("ui.tutorial.d0062e2417")}
              </button>
            </>
          ) : (
            <p role="alert">
              {preview && !preview.ok
                ? new RequestError(preview.error.code).message
                : error}
            </p>
          )}
          <button onClick={() => setPending(null)}>
            {translate("ui.tutorial.3160fc9159")}
          </button>
        </section>
      )}
      <p>
        {translate("tutorial.resources", {
          round: state.round,
          coins: state.players.p1.resources.coins,
          tools: state.players.p1.resources.tools,
          power: state.players.p1.resources.power.join(" / "),
        })}
      </p>
      <MapBoard
        state={state}
        selected={selected}
        onSelect={(hex) => {
          setSelected(hex);
          setPending(null);
        }}
        highlighted={new Set(target ? [target] : [])}
      />
      <PersonalBoard state={state} player={state.players.p1} />
    </main>
  );
}
