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
import { TokenAction } from "./TokenAction";
import { AuthPanel } from "./AuthPanel";
import { BillingPanel } from "./BillingPanel";
import { MembersPanel } from "./MembersPanel";
import { AccountPanel } from "./AccountPanel";
import { AdminPayments } from "./AdminPayments";
import { AdminUsers } from "./AdminUsers";
import { AdminConfiguration } from "./AdminConfiguration";
import { ActivityPanel } from "./ActivityPanel";
import {
  PortalProvider,
  usePortalController,
  usePortal,
} from "./portal-controller";
export default function Portal({ adminMode = false }: { adminMode?: boolean }) {
  const controller = usePortalController(adminMode);
  return (
    <PortalProvider value={controller}>
      <PortalView />
    </PortalProvider>
  );
}
function PortalView() {
  const {
    adminMode,
    user,
    setUser,
    checking,
    email,
    setPassword,
    name,
    message,
    error,
    busy,
    workspaces,
    selected,
    setSelected,
    contact,
    billing,
    tab,
    setTab,
    members,
    activity,
    actionToken,
    perform,
    refresh,
    isAdmin,
  } = usePortal();
  return (
    <div className="portal">
      <header>
        <a className="portal-brand" href="/">
          ⚗ <strong>RequestLab</strong>
          <span>{adminMode ? "ADMIN" : "CLOUD"}</span>
        </a>
        <nav>
          {user && (
            <>
              <a href={adminMode ? "/" : "/admin"}>
                {adminMode ? "Cloud portal" : isAdmin ? "Administration" : ""}
              </a>
              <span>{user.email}</span>
              <button
                disabled={busy}
                onClick={() =>
                  void perform(async () => {
                    await api("/auth/logout", "POST");
                    setUser(null);
                    setPassword("");
                  })
                }
              >
                Sign out
              </button>
            </>
          )}
        </nav>
      </header>
      <main>
        {checking ? (
          <p className="muted">Checking your session…</p>
        ) : (
          <>
            {error && (
              <div role="alert" className="notice error">
                {error}
              </div>
            )}
            {message && (
              <div role="status" className="notice">
                {message}
              </div>
            )}
            {actionToken && <TokenAction />}
            {!user ? (
              <AuthPanel />
            ) : adminMode && !isAdmin ? (
              <section>
                <h1>Administrator access required</h1>
                <p>
                  All administrative endpoints enforce this permission on the
                  server.
                </p>
              </section>
            ) : (
              <>
                <div className="portal-heading">
                  <div>
                    <span className="eyebrow">
                      {adminMode
                        ? "RESTRICTED ADMINISTRATION"
                        : "YOUR CLOUD WORKSPACE"}
                    </span>
                    <h1>
                      {adminMode ? "Administration" : "Workspace settings"}
                    </h1>
                    <p>
                      {adminMode
                        ? "Every sensitive action is authorized and audited."
                        : "Manage your team and optional subscription."}
                    </p>
                  </div>
                  {!adminMode && (
                    <div className="actions">
                      <select
                        value={selected}
                        onChange={(e) => setSelected(e.target.value)}
                        aria-label="Workspace"
                      >
                        <option value="">Select a workspace</option>
                        {workspaces.map((w) => (
                          <option key={w.id} value={w.id}>
                            {w.name} · {w.role}
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={() =>
                          void perform(async () => {
                            const name = prompt("Workspace name");
                            if (name) {
                              await api("/workspaces", "POST", { name });
                              await refresh();
                            }
                          })
                        }
                      >
                        + New workspace
                      </button>
                    </div>
                  )}
                </div>
                <div className="portal-tabs">
                  {(adminMode
                    ? ["payments", "users", "configuration", "audit"]
                    : ["billing", "members", "activity", "account"]
                  ).map((item) => (
                    <button
                      key={item}
                      className={tab === item ? "active" : ""}
                      onClick={() => setTab(item)}
                    >
                      {item}
                    </button>
                  ))}
                </div>
                {!adminMode && tab === "billing" && <BillingPanel />}
                {!adminMode && tab === "members" && selected && (
                  <MembersPanel />
                )}
                {!adminMode && tab === "account" && <AccountPanel />}
                {adminMode && tab === "payments" && <AdminPayments />}
                {adminMode && tab === "users" && <AdminUsers />}
                {adminMode && tab === "configuration" && <AdminConfiguration />}
                {(tab === "activity" || tab === "audit") && <ActivityPanel />}
              </>
            )}
          </>
        )}
      </main>
      <footer>
        <strong>RequestLab</strong>
        <span>Local-first desktop. Optional cloud.</span>
        <a href={`tel:${contact}`}>Payment contact: {contact}</a>
      </footer>
    </div>
  );
}
