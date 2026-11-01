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
export function TokenAction() {
  const {
    user,
    email,
    password,
    setPassword,
    setMessage,
    busy,
    actionToken,
    setActionToken,
    perform,
    refresh,
  } = usePortal();
  if (!actionToken) return null;
  return (
    <section className="token-action">
      <h2>
        {actionToken.kind === "verify"
          ? "Verify your email"
          : actionToken.kind === "reset"
            ? "Reset your password"
            : "Accept workspace invitation"}
      </h2>
      {actionToken.kind === "reset" && (
        <label>
          New password (at least 12 characters)
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
      )}
      <p>
        Confirm this action. Invitation acceptance requires a signed-in account
        matching the invited email.
      </p>
      <button
        className="primary"
        disabled={busy}
        onClick={() =>
          void perform(async () => {
            if (actionToken.kind === "invite")
              await api("/invitations/accept", "POST", {
                token: actionToken.token,
              });
            else
              await api(`/auth/${actionToken.kind}`, "POST", {
                token: actionToken.token,
                ...(actionToken.kind === "reset" ? { password } : {}),
              });
            setActionToken(null);
            setMessage("Action completed. You can now sign in.");
            if (user) await refresh();
          })
        }
      >
        Confirm {actionToken.kind}
      </button>
    </section>
  );
}
