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
export function AdminPayments() {
  const { contact, reference, adminPayments, perform, review } = usePortal();
  return (
    <section>
      <h2>Manual payment verification</h2>
      <p>
        Verify payment independently using contact {contact}. Never approve
        based solely on a submitted reference.
      </p>
      <PaymentTable
        payments={adminPayments}
        review={(payment, decision) =>
          void perform(() => review(payment, decision))
        }
      />
    </section>
  );
}
