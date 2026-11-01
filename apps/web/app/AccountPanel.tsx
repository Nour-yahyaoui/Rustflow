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
export function AccountPanel() {
  const {
    user,
    setUser,
    password,
    name,
    setName,
    setMessage,
    busy,
    workspaces,
    selected,
    members,
    perform,
    refresh,
  } = usePortal();
  if (!user) return null;
  return (
    <section>
      <h2>Your account</h2>
      <form
        className="inline-form"
        onSubmit={(e) => {
          e.preventDefault();
          void perform(async () => {
            await api("/account", "PATCH", { name });
            setMessage("Account name updated.");
          });
        }}
      >
        <label>
          Display name
          <input
            required
            value={name}
            placeholder={user.display_name ?? user.name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <button disabled={busy}>Save name</button>
      </form>
      <hr />
      <h2>Delete workspace</h2>
      <p>
        Only its owner may delete a workspace. This permanently deletes cloud
        entities, members, payments, and subscription records.
      </p>
      <button
        className="danger"
        disabled={!selected || busy}
        onClick={() =>
          void perform(async () => {
            if (confirm("Permanently delete this cloud workspace?")) {
              await api(`/workspaces/${selected}`, "DELETE");
              await refresh();
              setMessage("Workspace deleted.");
            }
          })
        }
      >
        Delete selected workspace
      </button>
      <hr />
      <h2>Delete account</h2>
      <p>
        Transfer or delete all owned workspaces first. Account deletion requires
        your password.
      </p>
      <button
        className="danger"
        onClick={() =>
          void perform(async () => {
            const password = prompt(
              "Confirm your password to permanently delete your account",
            );
            if (password && confirm("Permanently delete your account?")) {
              await api("/account", "DELETE", { password });
              setUser(null);
            }
          })
        }
      >
        Delete my account
      </button>
    </section>
  );
}
