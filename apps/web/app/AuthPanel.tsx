"use client";
import type {
  User,
  Workspace,
  Plan,
  Payment,
  Member,
  AdminUser,
  Billing,
} from "./portal-types";
import { api } from "./portal-api";
import { usePortal } from "./portal-controller";
import { PaymentTable } from "./PaymentTable";
export function AuthPanel() {
  const {
    user,
    setUser,
    mode,
    setMode,
    email,
    setEmail,
    password,
    setPassword,
    name,
    setName,
    message,
    setMessage,
    busy,
    workspaces,
    billing,
    perform,
  } = usePortal();
  return (
    <div className="auth-layout">
      <div className="auth-intro">
        <span className="eyebrow">
          LOCAL FIRST. CONNECTED WHEN YOU NEED IT.
        </span>
        <h1>
          Your APIs.
          <br />
          <em>Your team.</em>
          <br />
          One workspace.
        </h1>
        <p>
          Optional cloud services for RequestLab. Your desktop client stays
          useful, online or offline.
        </p>
        <div className="auth-features">
          <span>✓ Shared workspaces & role-based access</span>
          <span>✓ Versioned changes with conflict detection</span>
          <span>✓ Manual billing. No automatic charges.</span>
        </div>
      </div>
      <section className="auth-card">
        <div className="auth-tabs">
          {(["login", "register", "forgot"] as const).map((item) => (
            <button
              key={item}
              onClick={() => setMode(item)}
              className={mode === item ? "active" : ""}
            >
              {item === "login"
                ? "Sign in"
                : item === "register"
                  ? "Create account"
                  : "Reset"}
            </button>
          ))}
        </div>
        <h2>
          {mode === "login"
            ? "Welcome back"
            : mode === "register"
              ? "Start your workspace"
              : "Forgot your password?"}
        </h2>
        <p>
          {mode === "register"
            ? "Verify your email to activate your account."
            : "Use your RequestLab account to continue."}
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void perform(async () => {
              if (mode === "register") {
                const result = await api<{ message: string }>(
                  "/auth/register",
                  "POST",
                  { email, password, name },
                );
                setMessage(result.message);
              } else if (mode === "forgot") {
                const result = await api<{ message: string }>(
                  "/auth/forgot",
                  "POST",
                  { email },
                );
                setMessage(result.message);
              } else {
                const result = await api<{ user: User }>(
                  "/auth/login",
                  "POST",
                  { email, password },
                );
                setUser(result.user);
                setPassword("");
              }
            });
          }}
        >
          {mode === "register" && (
            <label>
              Your name
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
              />
            </label>
          )}
          <label>
            Email address
            <input
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </label>
          {mode !== "forgot" && (
            <label>
              Password
              <input
                required
                type="password"
                minLength={mode === "register" ? 12 : 1}
                maxLength={256}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={
                  mode === "register" ? "new-password" : "current-password"
                }
              />
            </label>
          )}
          <button className="primary" disabled={busy}>
            {busy
              ? "Please wait…"
              : mode === "login"
                ? "Sign in →"
                : mode === "register"
                  ? "Create account →"
                  : "Send reset instructions"}
          </button>
        </form>
        <small>
          No cloud account is required to use the desktop application.
        </small>
      </section>
    </div>
  );
}
