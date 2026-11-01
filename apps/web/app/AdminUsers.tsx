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
export function AdminUsers() {
  const { user, email, busy, adminUsers, setAdminUsers, perform } = usePortal();
  if (!user) return null;
  return (
    <section>
      <h2>Accounts</h2>
      <table>
        <thead>
          <tr>
            <th>Email</th>
            <th>Name</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {adminUsers.map((account) => (
            <tr key={account.id}>
              <td>{account.email}</td>
              <td>{account.display_name}</td>
              <td>
                {account.suspended ? "Suspended" : "Active"}
                {account.is_admin ? " · Admin" : ""}
              </td>
              <td>
                <button
                  disabled={account.id === user.id || busy}
                  onClick={() =>
                    void perform(async () => {
                      if (
                        confirm(
                          `${account.suspended ? "Restore" : "Suspend"} this account?`,
                        )
                      ) {
                        await api(`/admin/users/${account.id}`, "PATCH", {
                          suspended: !account.suspended,
                        });
                        setAdminUsers(
                          (await api<{ users: AdminUser[] }>("/admin/users"))
                            .users,
                        );
                      }
                    })
                  }
                >
                  {account.suspended ? "Restore" : "Suspend"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
