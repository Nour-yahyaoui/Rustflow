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
export function ActivityPanel() {
  const { adminMode, activity } = usePortal();
  return (
    <section>
      <h2>{adminMode ? "Security audit log" : "Workspace activity"}</h2>
      {activity.length ? (
        <div className="audit-list">
          {activity.map((event, i) => (
            <div key={i}>
              <strong>{String(event.action)}</strong>
              <time>{new Date(String(event.created_at)).toLocaleString()}</time>
              <pre>{JSON.stringify(event.details, null, 2)}</pre>
            </div>
          ))}
        </div>
      ) : (
        <p>No recorded activity.</p>
      )}
    </section>
  );
}
