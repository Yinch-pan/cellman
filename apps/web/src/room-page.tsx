import { t as translate } from "./i18n";
import React, { useState, useEffect, useRef } from "react";
import { api } from "./api";
import { RoomOptions, SettingsSummary } from "./room-settings";
import {
  defaultGameSettings,
  setupLabel,
  type GameSettings,
} from "../../../packages/contracts/src/room";
type Seat = { userId: string; displayName: string; ready: boolean };
type RoomData = {
  id: string;
  hostId: string;
  visibility: "public" | "private";
  capacity: number;
  status: string;
  setupMode: "snake-forward" | "snake-reverse" | "standard" | "training";
  gameId?: string;
  settings: GameSettings;
  settingsRevision: number;
  seats: Seat[];
};
type Edit = {
  visibility: RoomData["visibility"];
  seats: number;
  setupMode: RoomData["setupMode"];
  settings: GameSettings;
  expectedRevision: number;
};
const editOf = (r: RoomData): Edit => ({
  visibility: r.visibility,
  seats: r.capacity,
  setupMode: r.setupMode.startsWith("snake-") ? r.setupMode : "snake-reverse",
  settings:
    r.settings.time.mode === "incremental"
      ? r.settings
      : { ...r.settings, time: defaultGameSettings().time },
  expectedRevision: r.settingsRevision,
});
const go = (path: string) => {
  location.hash = path;
};
export function Room({
  id,
  invite,
  user,
}: {
  id: string;
  invite?: string;
  user: { id: string };
}) {
  const [room, setRoom] = useState<RoomData | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [edit, setEdit] = useState<Edit | null>(null),
    [inviteToken, setInviteToken] = useState(
      invite ?? sessionStorage.getItem("room-invite:" + id) ?? "",
    ),
    [confirm, setConfirm] = useState<{
      kind: "kick" | "transfer";
      userId: string;
      name: string;
    } | null>(null);
  const alive = useRef(true),
    request = useRef(0),
    seen = useRef<number | null>(null);
  const refresh = async () => {
    const serial = ++request.current;
    try {
      const data = await api<RoomData>("/rooms/" + id);
      if (!alive.current || serial !== request.current) return;
      data.settings ??= defaultGameSettings();
      data.settingsRevision ??= 0;
      if (seen.current !== null && seen.current !== data.settingsRevision)
        setNotice(translate("ui.room-page.184f051427"));
      seen.current = data.settingsRevision;
      setRoom(data);
      if (data.gameId) go("/game/" + data.gameId);
    } catch (e) {
      if (alive.current && serial === request.current) {
        setError((e as Error).message);
        if ((e as { code?: string }).code === "FORBIDDEN") setRoom(null);
      }
    }
  };
  useEffect(() => {
    alive.current = true;
    refresh();
    const t = setInterval(() => {
      if (!document.hidden) refresh();
    }, 2500);
    return () => {
      alive.current = false;
      clearInterval(t);
    };
  }, [id]);
  const act = async (path: string, body: object = {}) => {
    setBusy(true);
    setError("");
    ++request.current;
    try {
      const r = await api("/rooms/" + id + path, body);
      if (r.inviteToken) {
        setInviteToken(r.inviteToken);
        sessionStorage.setItem("room-invite:" + id, r.inviteToken);
        if (room?.visibility === "private")
          history.replaceState(
            null,
            "",
            location.pathname +
              location.search +
              "#/room/" +
              id +
              "?invite=" +
              r.inviteToken,
          );
      }
      if (path === "/leave") {
        go("/");
        return true;
      }
      if (r.gameId) go("/game/" + r.gameId);
      else await refresh();
      return true;
    } catch (e) {
      setError((e as Error).message);
      await refresh();
      return false;
    } finally {
      if (alive.current) setBusy(false);
    }
  };
  const own = room?.seats.find((s) => s.userId === user.id),
    host = room?.hostId === user.id,
    waiting = room?.status !== "closed" && !room?.gameId;
  const management = async (action: object) =>
    act("/manage", { expectedRevision: room!.settingsRevision, action });
  const link =
    location.origin +
    location.pathname +
    location.search +
    "#/room/" +
    id +
    (room?.visibility === "private" && inviteToken
      ? "?invite=" + inviteToken
      : "");
  return (
    <main className="room-page">
      <a href="#/" className="back-link">
        {translate("ui.room-page.1bf207be9b")}
      </a>
      <div className="eyebrow">
        {translate("ui.room-page.8e6833487c")}{" "}
        {room
          ? translate("ui.room-page.e844bc2fa5", {
              p0: room.capacity,
              p1: setupLabel(room.setupMode),
            })
          : translate("ui.room-page.178ad0425c")}
      </div>
      <h1>
        {waiting
          ? translate("ui.room-page.5ff0612e5c")
          : translate("ui.room-page.9121e106e6")}
      </h1>
      <p className="muted">{translate("ui.room-page.818a3c15b6")}</p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      {room && (
        <>
          <section className="room-settings">
            <div className="section-heading">
              <h2>{translate("ui.room-page.3485bff12f")}</h2>
              {host && waiting && !edit && (
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() => setEdit(editOf(room))}
                >
                  {translate("ui.room-page.f797b44cfd")}
                </button>
              )}
            </div>
            {edit && host ? (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (await act("/settings", edit)) setEdit(null);
                }}
              >
                {edit.expectedRevision !== room.settingsRevision && (
                  <p className="notice" role="status">
                    {translate("ui.room-page.2d7d80778c")}
                    <button type="button" onClick={() => setEdit(editOf(room))}>
                      {translate("ui.room-page.0d59bcf83d")}
                    </button>
                  </p>
                )}
                <fieldset disabled={busy} className="settings-fieldset">
                  <RoomOptions
                    value={edit}
                    minimumSeats={room.seats.length}
                    onChange={(next) => setEdit({ ...edit, ...next })}
                  />
                  <p className="muted">
                    {translate("ui.room-page.2bda31821d")}
                  </p>
                  <div className="inline">
                    <button
                      className="primary"
                      disabled={edit.expectedRevision !== room.settingsRevision}
                    >
                      {translate("ui.room-page.c8550237ba")}
                    </button>
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => setEdit(null)}
                    >
                      {translate("ui.room-page.fada4dfc38")}
                    </button>
                  </div>
                </fieldset>
              </form>
            ) : (
              <>
                <p>
                  {room.visibility === "private"
                    ? translate("ui.room-page.d1a1fdff92")
                    : translate("ui.room-page.1b384a7a97")}{" "}
                  · {room.capacity} {translate("ui.room-page.0b2bbc498d")}
                  {setupLabel(room.setupMode)}
                </p>
                <SettingsSummary
                  settings={room.settings}
                  mode={room.setupMode}
                />
              </>
            )}
          </section>
          <div className="seats">
            {Array.from({ length: room.capacity }, (_, i) => {
              const s = room.seats[i];
              return (
                <div
                  className={"seat " + (s ? "occupied" : "")}
                  key={s?.userId ?? i}
                >
                  <div className="avatar">
                    {s ? s.displayName.slice(0, 1) : "＋"}
                  </div>
                  <h3>
                    {s?.displayName ?? translate("ui.room-page.e0ea3ce0e4")}
                  </h3>
                  <p>
                    {s
                      ? s.ready
                        ? translate("ui.room-page.4b3c6e4c5e")
                        : translate("ui.room-page.19f9e72de5")
                      : translate("ui.room-page.dc4641eaff")}
                  </p>
                  {s?.userId === room.hostId && (
                    <span className="tag">
                      {translate("ui.room-page.bc35a81898")}
                    </span>
                  )}
                  {host && s && waiting && (
                    <div className="seat-management">
                      {i > 0 && (
                        <button
                          className="text-button"
                          disabled={busy || !!edit}
                          aria-label={translate("ui.room-page.c74c00c311", {
                            p0: s.displayName,
                          })}
                          onClick={() => {
                            const ids = room.seats.map((s) => s.userId);
                            [ids[i - 1], ids[i]] = [ids[i], ids[i - 1]];
                            management({ kind: "reorder", userIds: ids });
                          }}
                        >
                          {translate("ui.room-page.708c9687c7")}
                        </button>
                      )}
                      {s.userId !== user.id && (
                        <>
                          <button
                            className="text-button"
                            disabled={busy || !!edit}
                            onClick={() =>
                              setConfirm({
                                kind: "transfer",
                                userId: s.userId,
                                name: s.displayName,
                              })
                            }
                          >
                            {translate("ui.room-page.d7ec1bcd2b")}
                          </button>
                          <button
                            className="text-button"
                            disabled={busy || !!edit}
                            onClick={() =>
                              setConfirm({
                                kind: "kick",
                                userId: s.userId,
                                name: s.displayName,
                              })
                            }
                          >
                            {translate("ui.room-page.95861c4b5c")}
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {waiting && (
            <div className="room-controls">
              {own ? (
                <>
                  <button
                    className="secondary"
                    disabled={busy || !!edit}
                    onClick={() =>
                      act("/ready", {
                        ready: !own.ready,
                        expectedRevision: room.settingsRevision,
                      })
                    }
                  >
                    {own.ready
                      ? translate("ui.room-page.cf98b1208c")
                      : translate("ui.room-page.1bd1893c09")}
                  </button>
                  {host && (
                    <button
                      className="primary"
                      disabled={
                        busy ||
                        !!edit ||
                        room.seats.length !== room.capacity ||
                        !room.seats.every((s) => s.ready)
                      }
                      onClick={() =>
                        act("/start", {
                          expectedRevision: room.settingsRevision,
                        })
                      }
                    >
                      {translate("ui.room-page.a451c6435e")}
                    </button>
                  )}
                  <button
                    className="text-button"
                    disabled={busy}
                    onClick={() => act("/leave")}
                  >
                    {translate("ui.room-page.732982c52a")}
                  </button>
                </>
              ) : (
                <button
                  className="primary"
                  disabled={busy || room.seats.length >= room.capacity}
                  onClick={() => act("/join", { inviteToken: invite })}
                >
                  {translate("ui.room-page.e15dd29bea")}
                </button>
              )}
            </div>
          )}
          {own && waiting && (
            <details className="room-invitation">
              <summary>{translate("ui.room-page.d5b164f945")}</summary>
              {(room.visibility === "public" || inviteToken) && (
                <>
                  <input
                    aria-label={translate("ui.room-page.ee50f5516f")}
                    value={link}
                    readOnly
                    onFocus={(e) => e.target.select()}
                  />
                  <button
                    className="text-button"
                    onClick={() =>
                      navigator.clipboard
                        .writeText(link)
                        .then(() =>
                          setNotice(translate("ui.room-page.c2ecf9ccae")),
                        )
                        .catch(() =>
                          setNotice(translate("ui.room-page.80b10403a4")),
                        )
                    }
                  >
                    {translate("ui.room-page.16b16e2e3c")}
                  </button>
                </>
              )}
              {room.visibility === "private" && host && (
                <>
                  <p className="muted">
                    {translate("ui.room-page.f2defd70ad")}
                  </p>
                  <button
                    className="secondary"
                    disabled={busy || !!edit}
                    onClick={() => management({ kind: "invite" })}
                  >
                    {inviteToken
                      ? translate("ui.room-page.3cb73759ea")
                      : translate("ui.room-page.bd85d0c054")}
                  </button>
                </>
              )}
            </details>
          )}
        </>
      )}
      {!room && invite && (
        <button
          className="primary"
          disabled={busy}
          onClick={() => act("/join", { inviteToken: invite })}
        >
          {translate("ui.room-page.e15dd29bea")}
        </button>
      )}
      {confirm && (
        <div className="modal-backdrop">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label={translate("ui.room-page.18462cf70b")}
          >
            <h2>
              {confirm.kind === "kick"
                ? translate("ui.room-page.2365b16513")
                : translate("ui.room-page.d7ec1bcd2b")}
            </h2>
            <p>
              {confirm.kind === "kick"
                ? translate("ui.room-page.39746cc4a0", { p0: confirm.name })
                : translate("ui.room-page.445c066ad6", { p0: confirm.name })}
            </p>
            <p>{translate("ui.room-page.bacb0f7e2f")}</p>
            <button
              className="primary"
              disabled={busy}
              onClick={async () => {
                if (
                  await management({
                    kind: confirm.kind,
                    userId: confirm.userId,
                  })
                )
                  setConfirm(null);
              }}
            >
              {translate("ui.room-page.36f33adaf0")}
            </button>
            <button
              className="text-button"
              disabled={busy}
              onClick={() => setConfirm(null)}
            >
              {translate("ui.room-page.2cd0f3be87")}
            </button>
          </section>
        </div>
      )}
    </main>
  );
}
