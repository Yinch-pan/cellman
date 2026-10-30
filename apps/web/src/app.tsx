import { t as translate } from "./i18n";
import { LanguageSelector } from "./i18n/language";
import React, { useEffect, useState } from "react";
import { api, setCsrf, label, RequestError } from "./api";
import { GamePage } from "./game";
import { StatisticsPage } from "./statistics-page";
import { Tutorial } from "./tutorial";
import { Room } from "./room-page";
import {
  RoomOptions,
  RoomSummary,
  type RoomOptionsValue,
} from "./room-settings";
import { defaultGameSettings } from "../../../packages/contracts/src/room";
import { AccountEmail, EmailRecovery, EmailLink } from "./email";
import { SupportPage } from "./support";
import { GameAccess, PublicGames } from "./spectators";
import { GameHistoryPage } from "./game-history";
const route = () => location.hash.slice(1) || "/";
export function go(path: string) {
  location.hash = path;
}
export function App() {
  const [path, setPath] = useState(route),
    [navigation, setNavigation] = useState(0),
    [user, setUser] = useState<any>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [loggingOut, setLoggingOut] = useState(false);
  useEffect(() => {
    const onHash = () => {
      setPath(route());
      // Email pages scrub the token from browser history. Reopening that same
      // original link must still mount a fresh verification page.
      setNavigation((n) => n + 1);
    };
    addEventListener("hashchange", onHash);
    api("/auth/me")
      .then((d) => {
        setUser(d.user);
        setCsrf(d.csrf ?? "");
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
    return () => removeEventListener("hashchange", onHash);
  }, []);
  const logout = async () => {
    setLoggingOut(true);
    setError("");
    try {
      await api("/auth/logout", {});
      setUser(null);
      setCsrf("");
      go("/");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoggingOut(false);
    }
  };
  return (
    <>
      <header className="site-header">
        <a href="#/" className="brand">
          <span className="brand-mark" aria-hidden="true">
            ⬡
          </span>
          cellman
        </a>
        <nav>
          <LanguageSelector />
          <a href="#/">{translate("ui.app.20ae1929b5")}</a>
          <a href="#/games">{translate("ui.app.1ca69d5606")}</a>
          <a href="#/history">{translate("gameHistory.title")}</a>
          <a href="#/stats">{translate("ui.app.497ad856f6")}</a>
          <a href="#/tutorial">{translate("ui.app.61a2cda8c7")}</a>
          {user && <a href="#/account">{translate("ui.app.5ce662ac8d")}</a>}
          {user ? (
            <button
              className="text-button"
              onClick={logout}
              disabled={loggingOut}
            >
              {user.name} {translate("ui.app.8093d32b01")}
            </button>
          ) : null}
        </nav>
      </header>
      {error && <div className="notice error">{error}</div>}
      {loading ? (
        <div className="empty">{translate("ui.app.4927a53bcc")}</div>
      ) : path.startsWith("/email/verify") ||
        path.startsWith("/email/signup") ||
        path.startsWith("/email/reset") ? (
        <EmailLink
          key={`${path}:${navigation}`}
          kind={
            path.startsWith("/email/signup")
              ? "signup"
              : path.startsWith("/email/verify")
                ? "verify"
                : "reset"
          }
          onReset={() => setUser(null)}
        />
      ) : path === "/email/forgot" ? (
        <EmailRecovery />
      ) : path === "/tutorial" ? (
        <Tutorial />
      ) : path === "/support" ? (
        <SupportPage />
      ) : path === "/demo" ? (
        <GamePage key="local-demo" demo />
      ) : path.startsWith("/game/") ? (
        <GameAccess
          key={`${path.split("/")[2]}:${user?.id ?? "guest"}`}
          id={path.split("/")[2]}
        />
      ) : !user ? (
        <>
          <Auth
            onLogin={(d) => {
              setUser(d.user);
              setCsrf(d.csrf);
            }}
          />
          <PublicGames />
        </>
      ) : path === "/history" ? (
        <GameHistoryPage />
      ) : path === "/account" ? (
        <AccountEmail />
      ) : path === "/stats" ? (
        <StatisticsPage />
      ) : path.startsWith("/room/") ? (
        <Room
          key={path.split("/")[2].split("?")[0]}
          id={path.split("/")[2].split("?")[0]}
          invite={
            new URLSearchParams(path.split("?")[1]).get("invite") ?? undefined
          }
          user={user}
        />
      ) : (
        <Lobby user={user} onlyGames={path === "/games"} />
      )}
      <footer>
        {translate("ui.app.888f567269")} ·{" "}
        <a href="#/support">{translate("ui.app.bb654a440e")}</a>
      </footer>
    </>
  );
}
function Auth({ onLogin }: { onLogin: (data: any) => void }) {
  const [email, setEmail] = useState(""),
    [mailAvailable, setMailAvailable] = useState<boolean | null>(null),
    [emailNotice, setEmailNotice] = useState("");
  useEffect(() => {
    api("/auth/mail-status")
      .then((s) => setMailAvailable(s.available))
      .catch(() => setMailAvailable(false));
  }, []);
  const [mode, setMode] = useState<"login" | "register" | "pending">("login"),
    [username, setUsername] = useState(""),
    [password, setPassword] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [editingEmail, setEditingEmail] = useState(false),
    [cooldown, setCooldown] = useState(0);
  useEffect(() => {
    if (!cooldown) return;
    const timer = setTimeout(() => setCooldown(cooldown - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);
  async function sendVerification() {
    const result = await api(
      mode === "register" ? "/auth/register" : "/auth/register/resend",
      {
        username,
        password,
        email,
      },
    );
    setEmail(result.email);
    setMode("pending");
    setEditingEmail(false);
    setCooldown(60);
    setEmailNotice(translate("ui.app.fc4881d4fa"));
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (mode !== "login") {
        await sendVerification();
        return;
      }
      const data = await api("/auth/login", { username, password });
      setCsrf(data.csrf);
      onLogin(data);
    } catch (e) {
      setError((e as Error).message);
      if (e instanceof RequestError && e.code === "REGISTRATION_PENDING") {
        setMode("pending");
        setEditingEmail(true);
        setEmailNotice(translate("ui.app.0bd4d01f29"));
      }
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="welcome">
      <section className="auth-card">
        <h1>
          {mode === "pending"
            ? translate("ui.app.7ccdc52ef3")
            : mode === "register"
              ? translate("ui.app.c4fb62202b")
              : translate("ui.app.1e2df9c307")}
        </h1>
        {emailNotice && (
          <p className="notice" role="status">
            {emailNotice}
          </p>
        )}
        {mode !== "login" && !mailAvailable && (
          <p className="notice" role="status">
            {mailAvailable === null
              ? translate("ui.app.bc2b09de8c")
              : translate("ui.app.4ab8340cf6")}
          </p>
        )}
        <form onSubmit={submit}>
          {mode === "pending" ? (
            <>
              <p>
                {translate("ui.app.3f662b6d5a")}
                {username}
              </p>
              {!editingEmail && (
                <p>
                  {translate("ui.app.b647dc9ed5")}
                  {email}
                </p>
              )}
            </>
          ) : (
            <>
              <label>
                {mode === "login"
                  ? translate("ui.app.d5445276c3")
                  : translate("ui.app.1a3f0617d6")}
                <input
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  pattern={
                    mode === "register" ? "[a-zA-Z0-9_]{3,24}" : undefined
                  }
                  placeholder={
                    mode === "login"
                      ? translate("ui.app.d5445276c3")
                      : translate("ui.app.6836e3c9f4")
                  }
                />
              </label>
              <label>
                {translate("ui.app.a621ab606d")}
                <input
                  type="password"
                  autoComplete={
                    mode === "login" ? "current-password" : "new-password"
                  }
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={mode === "login" ? 1 : 6}
                  maxLength={128}
                  placeholder={translate("ui.app.bff75c65ca")}
                />
              </label>
            </>
          )}
          {(mode === "register" || (mode === "pending" && editingEmail)) && (
            <label>
              {translate("ui.app.73075237fd")}
              <input
                type="email"
                autoComplete="email"
                maxLength={254}
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={translate("ui.app.bde256979b")}
              />
            </label>
          )}
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          {mode === "register" && (
            <p className="muted">{translate("ui.app.13e0b7c079")}</p>
          )}
          <button
            className="primary full"
            disabled={
              busy ||
              (mode !== "login" && !mailAvailable) ||
              (mode === "pending" && cooldown > 0)
            }
          >
            {busy
              ? translate("ui.app.8be0ea36a9")
              : mode === "login"
                ? translate("ui.app.1e2df9c307")
                : mode === "register"
                  ? translate("ui.app.a2f0554531")
                  : cooldown > 0
                    ? translate("ui.app.4f34e37061", { p0: cooldown })
                    : editingEmail
                      ? translate("ui.app.94d5bba8d2")
                      : translate("ui.app.4dd824fd0e")}
          </button>
          {mode === "pending" && !editingEmail && (
            <button
              type="button"
              className="text-button"
              disabled={busy}
              onClick={() => {
                setEditingEmail(true);
                setError("");
              }}
            >
              {translate("ui.app.da0f5e37e8")}
            </button>
          )}
        </form>
        <div className="auth-links">
          <button
            className="text-button"
            disabled={busy}
            onClick={() => {
              setMode(mode === "login" ? "register" : "login");
              setError("");
              setEmailNotice("");
            }}
          >
            {mode === "login"
              ? translate("ui.app.f48d12cf53")
              : translate("ui.app.747b0f9082")}
          </button>
          <a className="text-button" href="#/email/forgot">
            {translate("ui.app.d5ae661696")}
          </a>
        </div>
      </section>
    </main>
  );
}
function Lobby({ user, onlyGames }: { user: any; onlyGames: boolean }) {
  const [settings, setSettings] = useState(defaultGameSettings);
  const [creating, setCreating] = useState(false);
  const [seats, setSeats] = useState(3),
    [setupMode, setSetupMode] =
      useState<RoomOptionsValue["setupMode"]>("snake-reverse");
  const [rooms, setRooms] = useState<any[]>([]),
    [games, setGames] = useState<any[]>([]),
    [visibility, setVisibility] =
      useState<RoomOptionsValue["visibility"]>("public"),
    [error, setError] = useState("");
  const refresh = async () => {
    try {
      const [r, g] = await Promise.all([api("/rooms"), api("/me/games")]);
      setRooms(r);
      setGames(g);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  useEffect(() => {
    refresh();
    const t = setInterval(() => {
      if (!document.hidden) refresh();
    }, 15000);
    return () => clearInterval(t);
  }, []);
  const create = async () => {
    if (creating) return;
    setCreating(true);
    setError("");
    try {
      const room = await api("/rooms", {
        visibility,
        seats,
        setupMode,
        settings,
      });
      sessionStorage.setItem("room-invite:" + room.id, room.inviteToken);
      go(
        "/room/" +
          room.id +
          (visibility === "private" ? "?invite=" + room.inviteToken : ""),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCreating(false);
    }
  };
  return (
    <main className="lobby">
      <div className="page-heading">
        <div>
          <h1>
            {onlyGames
              ? translate("ui.app.1ca69d5606")
              : translate("ui.app.20ae1929b5")}
          </h1>
        </div>
        <span className="status-pill">
          <i />
          {games.filter((g) => g.needAction).length}{" "}
          {translate("ui.app.84c9548de8")}
        </span>
      </div>
      {error && <p className="error">{error}</p>}
      {!onlyGames && <PublicGames />}
      {!onlyGames && (
        <section className="game-feature">
          <div>
            <h2>{translate("ui.app.bf3a0186fa")}</h2>
            <fieldset className="settings-fieldset" disabled={creating}>
              <RoomOptions
                value={{ visibility, seats, setupMode, settings }}
                onChange={(next) => {
                  setVisibility(next.visibility);
                  setSeats(next.seats);
                  setSetupMode(next.setupMode);
                  setSettings(next.settings);
                }}
              />
            </fieldset>
            <div className="inline">
              <button
                className="primary"
                disabled={
                  creating || !/^[a-zA-Z0-9_-]{0,32}$/.test(settings.seed)
                }
                onClick={create}
              >
                {translate("ui.app.294e868dd0")}
              </button>
            </div>
          </div>
        </section>
      )}
      <section aria-label={translate("ui.app.1ca69d5606")}>
        <div className="section-heading">
          <h2>{translate("ui.app.1ca69d5606")}</h2>
          <a href="#/history">{translate("gameHistory.link")}</a>
          <span>
            {games.length} {translate("ui.app.cd6f79fbed")}
          </span>
        </div>
        {games.length ? (
          <div className="card-grid">
            {games.map((g) => (
              <button
                className="game-card"
                data-game-id={g.id}
                key={g.id}
                onClick={() => go("/game/" + g.id)}
              >
                <span className={"tag " + (g.needAction ? "attention" : "")}>
                  {g.status === "finished"
                    ? translate("ui.app.d79b1d0e5c")
                    : g.needAction
                      ? translate("ui.app.792c11bc85")
                      : translate("ui.app.db87dc9b7d")}
                </span>
                <h3>{translate("ui.app.bf3a0186fa")}</h3>
                <p>{g.names.join(" · ")}</p>
                <span>
                  {translate("ui.app.9552fe3bd3")}
                  {g.round} {translate("ui.app.97f8658eeb")}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <div className="empty-panel">{translate("ui.app.46691788b6")}</div>
        )}
      </section>
      {!onlyGames && (
        <section>
          <div className="section-heading">
            <h2>{translate("ui.app.1b384a7a97")}</h2>
            <button className="text-button" onClick={refresh}>
              {translate("ui.app.aee8874341")}
            </button>
          </div>
          {rooms.length ? (
            <div className="room-list">
              {rooms.map((r) => (
                <button
                  key={r.id}
                  className="room-list-card"
                  onClick={() => go("/room/" + r.id)}
                >
                  <span className="room-icon" aria-hidden="true">
                    ⬡
                  </span>
                  <span className="room-list-info">
                    <strong>
                      {r.host} {translate("ui.app.a09722b422")}
                    </strong>
                    <RoomSummary
                      visibility={r.visibility}
                      capacity={r.capacity}
                      setupMode={r.setupMode}
                      settings={r.settings}
                    />
                  </span>
                  <span className="room-list-occupancy">
                    {r.count} / {r.capacity} {translate("ui.app.d63842643d")}
                  </span>
                  <span className="room-list-open">
                    {translate("ui.app.12ab391b1a")}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div className="empty-panel">{translate("ui.app.34fa00ba5a")}</div>
          )}
        </section>
      )}
    </main>
  );
}
