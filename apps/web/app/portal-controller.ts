"use client";
import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useState,
} from "react";
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
export function usePortalController(adminMode: boolean) {
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);
  const [mode, setMode] = useState<"login" | "register" | "forgot">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [selected, setSelected] = useState("");
  const [plans, setPlans] = useState<Plan[]>([]);
  const [contact, setContact] = useState("56668672");
  const [plan, setPlan] = useState("pro");
  const [reference, setReference] = useState("");
  const [billing, setBilling] = useState<Billing | null>(null);
  const [tab, setTab] = useState(adminMode ? "payments" : "billing");
  const [members, setMembers] = useState<Member[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("editor");
  const [adminPayments, setAdminPayments] = useState<Payment[]>([]);
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
  const [activity, setActivity] = useState<Record<string, unknown>[]>([]);
  const [actionToken, setActionToken] = useState<{
    kind: string;
    token: string;
  } | null>(null);
  const perform = useCallback(async (action: () => Promise<void>) => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await action();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Operation failed");
    } finally {
      setBusy(false);
    }
  }, []);
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    for (const kind of ["verify", "reset", "invite"]) {
      const raw = params.get(kind);
      if (raw) {
        setActionToken({ kind, token: raw });
        history.replaceState(null, "", location.pathname);
        break;
      }
    }
    void api<{ user: User }>("/auth/session")
      .then((result) => setUser(result.user))
      .catch(() => setUser(null))
      .finally(() => setChecking(false));
  }, []);
  const refresh = useCallback(async () => {
    const result = await api<{ workspaces: Workspace[] }>("/workspaces");
    setWorkspaces(result.workspaces);
    setSelected((prev) =>
      result.workspaces.some((w) => w.id === prev)
        ? prev
        : (result.workspaces[0]?.id ?? ""),
    );
  }, []);
  useEffect(() => {
    if (user) {
      void perform(async () => {
        await refresh();
        const config = await api<{ plans: Plan[]; paymentContact: string }>(
          "/plans",
        );
        setPlans(config.plans);
        setContact(config.paymentContact);
      });
    }
  }, [user, refresh, perform]);
  const refreshBilling = useCallback(async () => {
    if (selected)
      setBilling(await api<Billing>(`/workspaces/${selected}/billing`));
  }, [selected]);
  useEffect(() => {
    if (!user) return;
    void perform(async () => {
      if (adminMode) {
        if (tab === "payments")
          setAdminPayments(
            (await api<{ payments: Payment[] }>("/admin/payments")).payments,
          );
        if (tab === "users")
          setAdminUsers(
            (await api<{ users: AdminUser[] }>("/admin/users")).users,
          );
        if (tab === "audit")
          setActivity(
            (await api<{ events: Record<string, unknown>[] }>("/admin/audit"))
              .events,
          );
      } else if (selected) {
        if (tab === "billing") await refreshBilling();
        if (tab === "members")
          setMembers(
            (
              await api<{ members: Member[] }>(
                `/workspaces/${selected}/members`,
              )
            ).members,
          );
        if (tab === "activity")
          setActivity(
            (
              await api<{ activity: Record<string, unknown>[] }>(
                `/workspaces/${selected}/activity`,
              )
            ).activity,
          );
      }
    });
  }, [user, selected, tab, adminMode, perform, refreshBilling]);
  async function review(payment: Payment, decision: "approved" | "rejected") {
    const note = prompt(
      "Verification note (required). Only approve after independently verifying the payment.",
    );
    if (!note) return;
    let expiresAt: string | undefined;
    if (decision === "approved") {
      const raw = prompt("Subscription expiry (YYYY-MM-DD)");
      if (!raw) return;
      expiresAt = new Date(raw + "T23:59:59.000Z").toISOString();
    }
    await api(`/admin/payments/${payment.id}/review`, "POST", {
      decision,
      note,
      expiresAt,
    });
    setAdminPayments(
      (await api<{ payments: Payment[] }>("/admin/payments")).payments,
    );
    setMessage(`Payment explicitly ${decision}.`);
  }
  const isAdmin = user?.is_admin || user?.isAdmin;
  return {
    adminMode,
    user,
    setUser,
    checking,
    setChecking,
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
    error,
    setError,
    busy,
    setBusy,
    workspaces,
    setWorkspaces,
    selected,
    setSelected,
    plans,
    setPlans,
    contact,
    setContact,
    plan,
    setPlan,
    reference,
    setReference,
    billing,
    setBilling,
    tab,
    setTab,
    members,
    setMembers,
    inviteEmail,
    setInviteEmail,
    inviteRole,
    setInviteRole,
    adminPayments,
    setAdminPayments,
    adminUsers,
    setAdminUsers,
    activity,
    setActivity,
    actionToken,
    setActionToken,
    perform,
    refresh,
    refreshBilling,
    review,
    isAdmin,
  };
}
const PortalContext = createContext<ReturnType<
  typeof usePortalController
> | null>(null);
export const PortalProvider = PortalContext.Provider;
export function usePortal() {
  const context = useContext(PortalContext);
  if (!context) throw new Error("Portal provider is missing");
  return context;
}
