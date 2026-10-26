import { t as translate } from "./i18n";
import React, { useEffect, useState, useRef } from "react";
import { api, setCsrf } from "./api";
type EmailState = {
  available: boolean;
  email: string | null;
  pendingEmail: string | null;
  delivery: string | null;
  notifyTurn: boolean;
  notifyOverdue: boolean;
};
export function AccountEmail() {
  const operation = useRef(0),
    saving = useRef(false);
  const [state, setState] = useState<EmailState | null>(null),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const refresh = async () => {
    const s = await api<EmailState>("/account/email");
    setState(s);
  };
  useEffect(() => {
    let live = true;
    const read = () => {
      if (saving.current) return;
      const generation = operation.current;
      return api<EmailState>("/account/email")
        .then((s) => {
          if (live && generation === operation.current && !saving.current)
            setState(s);
        })
        .catch((e) => {
          if (live) setError(e.message);
        });
    };
    read();
    const t = setInterval(() => {
      if (!document.hidden) read();
    }, 10000);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, []);
  async function act(path: string, body: object, message: string) {
    saving.current = true;
    operation.current++;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api(path, body);
      setNotice(message);
      setPassword("");
      await refresh();
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  const delivery: Record<string, string> = {
    pending: translate("ui.email.99721a0d0e"),
    sending: translate("ui.email.2d88d503d0"),
    sent: translate("ui.email.1e0f1c067e"),
    failed: translate("ui.email.126b5e2786"),
    expired: translate("ui.email.c71c1a57ff"),
    cancelled: translate("ui.email.a37778f17c"),
  };
  async function preferences(notifyTurn: boolean, notifyOverdue: boolean) {
    const previous = state!;
    setState({ ...previous, notifyTurn, notifyOverdue });
    if (
      !(await act(
        "/account/email/preferences",
        { notifyTurn, notifyOverdue },
        translate("ui.email.ae0bafc430"),
      ))
    )
      setState(previous);
  }
  return (
    <main className="account-page">
      <a className="back-link" href="#/">
        {translate("ui.email.1bf207be9b")}
      </a>
      <h1>{translate("ui.email.5ce662ac8d")}</h1>
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
      {!state ? (
        <p>{translate("ui.email.4927a53bcc")}</p>
      ) : (
        <>
          <section className="account-card">
            <h2>{translate("ui.email.73075237fd")}</h2>
            <p>
              {state.email
                ? translate("ui.email.d1f6bfa16c", { p0: state.email })
                : translate("ui.email.531a0cc72a")}
            </p>
            {!state.available && (
              <p className="notice" role="status">
                {translate("ui.email.3b3803d7a3")}
              </p>
            )}
            {state.pendingEmail && (
              <div className="notice">
                <p>
                  {translate("ui.email.1bd538643b")}
                  {state.pendingEmail}
                </p>
                <p>{delivery[state.delivery ?? "pending"]}</p>
                <p>{translate("ui.email.e82e66c009")}</p>
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={() =>
                    act(
                      "/account/email/cancel",
                      {},
                      translate("ui.email.551b1ca117"),
                    )
                  }
                >
                  {translate("ui.email.434ee8e7d8")}
                </button>
              </div>
            )}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                act(
                  "/account/email",
                  { email, password },
                  translate("ui.email.560a2aa63d"),
                );
              }}
            >
              <label>
                {translate("ui.email.6d4b7dce1e")}
                <input
                  type="email"
                  autoComplete="email"
                  maxLength={254}
                  value={email}
                  required
                  disabled={!state.available || busy}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
              <label>
                {translate("ui.email.a114cfb687")}
                <input
                  type="password"
                  autoComplete="current-password"
                  maxLength={128}
                  value={password}
                  required
                  disabled={!state.available || busy}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
              <button className="primary" disabled={!state.available || busy}>
                {busy
                  ? translate("ui.email.d3d21191f3")
                  : state.pendingEmail
                    ? translate("ui.email.ae1447138c")
                    : translate("ui.email.94d5bba8d2")}
              </button>
            </form>
            <p className="muted">{translate("ui.email.dde176a558")}</p>
          </section>
          <section className="account-card">
            <h2>{translate("ui.email.b8c3d9bf8d")}</h2>
            <p className="muted">{translate("ui.email.3c7ac39cde")}</p>
            <label className="inline">
              <input
                type="checkbox"
                checked={state.notifyTurn}
                disabled={
                  busy ||
                  !state.email ||
                  (!state.available && !state.notifyTurn)
                }
                onChange={(e) =>
                  preferences(e.target.checked, state.notifyOverdue)
                }
              />
              {translate("ui.email.86b3a6478c")}
            </label>
            <label className="inline">
              <input
                type="checkbox"
                checked={state.notifyOverdue}
                disabled={
                  busy ||
                  !state.email ||
                  (!state.available && !state.notifyOverdue)
                }
                onChange={(e) =>
                  preferences(state.notifyTurn, e.target.checked)
                }
              />
              {translate("ui.email.fe97ce28c4")}
            </label>
            {!state.email && (
              <p className="muted">{translate("ui.email.20368b2238")}</p>
            )}
          </section>
        </>
      )}
    </main>
  );
}
export function EmailRecovery() {
  const [email, setEmail] = useState(""),
    [available, setAvailable] = useState<boolean | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  useEffect(() => {
    api("/auth/mail-status")
      .then((s) => setAvailable(s.available))
      .catch((e) => setError(e.message));
  }, []);
  return (
    <main className="account-page">
      <h1>{translate("ui.email.d5ae661696")}</h1>
      <section className="account-card">
        {available === false && (
          <p className="notice">{translate("ui.email.8af19f6dd3")}</p>
        )}
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              await api("/auth/email/forgot", { email });
              setNotice(translate("ui.email.19bb3c1b9b"));
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            {translate("ui.email.43ab720772")}
            <input
              type="email"
              value={email}
              maxLength={254}
              required
              onChange={(e) => setEmail(e.target.value)}
              disabled={!available || busy}
              autoComplete="email"
            />
          </label>
          <button className="primary" disabled={!available || busy}>
            {translate("ui.email.5bc3a26905")}
          </button>
        </form>
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
        <a className="back-link" href="#/">
          {translate("ui.email.747b0f9082")}
        </a>
      </section>
    </main>
  );
}
export function EmailLink({
  kind,
  onReset,
}: {
  kind: "verify" | "reset" | "signup";
  onReset: () => void;
}) {
  // Fragments never reach HTTP access logs. Remove the bearer token from the URL immediately.
  const [token] = useState(
    () => new URLSearchParams(location.hash.split("?")[1]).get("token") ?? "",
  );
  useEffect(() => {
    history.replaceState(
      null,
      "",
      location.pathname + location.search + "#/email/" + kind,
    );
  }, [kind]);
  const [password, setPassword] = useState(""),
    [confirmation, setConfirmation] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [done, setDone] = useState(false);
  return (
    <main className="account-page">
      <h1>
        {kind === "signup"
          ? translate("ui.email.7a58a49950")
          : kind === "verify"
            ? translate("ui.email.7f98620a54")
            : translate("ui.email.d70928debc")}
      </h1>
      <section className="account-card">
        {done ? (
          <>
            <p className="notice" role="status">
              {kind === "signup"
                ? translate("ui.email.09a3f6278a")
                : kind === "verify"
                  ? translate("ui.email.5719428128")
                  : translate("ui.email.73f14b1cb6")}
            </p>
            <a
              className="primary email-return"
              href={kind === "verify" ? "#/account" : "#/"}
            >
              {kind === "signup"
                ? translate("ui.email.747b0f9082")
                : translate("ui.email.26c8fe2777")}
            </a>
          </>
        ) : !token ? (
          <>
            <p className="error">{translate("ui.email.8f9bfc66e2")}</p>
            <a href="#/">{translate("ui.email.747b0f9082")}</a>
          </>
        ) : (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setError("");
              if (kind === "reset" && password !== confirmation) {
                setError(translate("ui.email.64eff9d196"));
                return;
              }
              setBusy(true);
              try {
                await api(
                  "/auth/email/" + kind,
                  kind === "signup" ? { token } : { token, password },
                );
                setDone(true);
                setPassword("");
                setConfirmation("");
                if (kind === "reset") {
                  setCsrf("");
                  onReset();
                }
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <p className="muted">
              {kind === "signup"
                ? translate("ui.email.f5c5ffcdcf")
                : kind === "verify"
                  ? translate("ui.email.52b2863a9b")
                  : translate("ui.email.3d71179840")}
            </p>
            {kind !== "signup" && (
              <label>
                {kind === "verify"
                  ? translate("ui.email.d92bfdd9f6")
                  : translate("ui.email.515e9c7cf7")}
                <input
                  type="password"
                  autoComplete={
                    kind === "verify" ? "current-password" : "new-password"
                  }
                  minLength={kind === "reset" ? 6 : 1}
                  placeholder={
                    kind === "reset"
                      ? translate("ui.email.bff75c65ca")
                      : undefined
                  }
                  maxLength={128}
                  value={password}
                  required
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
            )}
            {kind === "reset" && (
              <label>
                {translate("ui.email.b3c58fe4d4")}
                <input
                  type="password"
                  autoComplete="new-password"
                  minLength={6}
                  maxLength={128}
                  value={confirmation}
                  required
                  onChange={(e) => setConfirmation(e.target.value)}
                />
              </label>
            )}
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <button className="primary" disabled={busy}>
              {kind === "signup"
                ? translate("ui.email.7a58a49950")
                : kind === "verify"
                  ? translate("ui.email.6bbff18f20")
                  : translate("ui.email.226db62eac")}
            </button>
            {kind === "signup" && (
              <p>
                <a href="#/">{translate("ui.email.1cedb9510f")}</a>
              </p>
            )}
          </form>
        )}
      </section>
    </main>
  );
}
