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
export function MembersPanel() {
  const {
    email,
    setMessage,
    busy,
    workspaces,
    selected,
    members,
    setMembers,
    inviteEmail,
    setInviteEmail,
    inviteRole,
    setInviteRole,
    perform,
    refresh,
  } = usePortal();
  return (
    <section>
      <h2>Workspace members</h2>
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>Role</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {members.map((member) => (
            <tr key={member.id}>
              <td>{member.display_name}</td>
              <td>{member.email}</td>
              <td>{member.role}</td>
              <td>
                {workspaces.find((w) => w.id === selected)?.role === "owner" &&
                  member.role !== "owner" && (
                    <div className="actions">
                      <button
                        onClick={() =>
                          void perform(async () => {
                            const role = prompt(
                              "New role: admin, editor, or viewer",
                              member.role,
                            );
                            if (role) {
                              await api(
                                `/workspaces/${selected}/members/${member.id}`,
                                "PATCH",
                                { role },
                              );
                              setMembers(
                                (
                                  await api<{
                                    members: Member[];
                                  }>(`/workspaces/${selected}/members`)
                                ).members,
                              );
                            }
                          })
                        }
                      >
                        Change role
                      </button>
                      <button
                        onClick={() =>
                          void perform(async () => {
                            if (confirm("Transfer ownership to this member?")) {
                              await api(
                                `/workspaces/${selected}/transfer`,
                                "POST",
                                { userId: member.id },
                              );
                              await refresh();
                            }
                          })
                        }
                      >
                        Transfer ownership
                      </button>
                      <button
                        onClick={() =>
                          void perform(async () => {
                            if (confirm("Remove this member?")) {
                              await api(
                                `/workspaces/${selected}/members/${member.id}`,
                                "DELETE",
                              );
                              setMembers(
                                (
                                  await api<{
                                    members: Member[];
                                  }>(`/workspaces/${selected}/members`)
                                ).members,
                              );
                            }
                          })
                        }
                      >
                        Remove
                      </button>
                    </div>
                  )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <form
        className="inline-form"
        onSubmit={(e) => {
          e.preventDefault();
          void perform(async () => {
            await api(`/workspaces/${selected}/invitations`, "POST", {
              email: inviteEmail,
              role: inviteRole,
            });
            setInviteEmail("");
            setMessage("Invitation queued for email delivery.");
          });
        }}
      >
        <label>
          Email address
          <input
            type="email"
            required
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
          />
        </label>
        <label>
          Role
          <select
            value={inviteRole}
            onChange={(e) => setInviteRole(e.target.value)}
          >
            {["editor", "viewer", "admin"].map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </label>
        <button className="primary" disabled={busy}>
          Invite member
        </button>
      </form>
      <p>
        Free and Pro support one member. Team membership requires an active
        approved Team subscription.
      </p>
    </section>
  );
}
