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
export function PaymentTable({
  payments,
  review,
}: {
  payments: Payment[];
  review?: (payment: Payment, decision: "approved" | "rejected") => void;
}) {
  return payments.length ? (
    <table>
      <thead>
        <tr>
          <th>Reference</th>
          <th>Plan / workspace</th>
          <th>Status</th>
          <th>Submitted</th>
          {review && <th>Verification</th>}
        </tr>
      </thead>
      <tbody>
        {payments.map((p) => (
          <tr key={p.id}>
            <td>
              <code>{p.reference}</code>
              {p.review_note && <small>{p.review_note}</small>}
            </td>
            <td>
              {p.plan_id}
              {p.workspace_name && (
                <small>
                  {p.workspace_name} · {p.email}
                </small>
              )}
            </td>
            <td>
              <span className={`badge ${p.status}`}>{p.status}</span>
            </td>
            <td>{new Date(p.created_at).toLocaleDateString()}</td>
            {review && (
              <td>
                {p.status === "pending" ? (
                  <div className="actions">
                    <button onClick={() => review(p, "approved")}>
                      Approve
                    </button>
                    <button onClick={() => review(p, "rejected")}>
                      Reject
                    </button>
                  </div>
                ) : (
                  "Reviewed"
                )}
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  ) : (
    <p className="muted">No payment references submitted.</p>
  );
}
