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
export function AdminConfiguration() {
  const {
    name,
    setMessage,
    busy,
    plans,
    setPlans,
    contact,
    setContact,
    plan,
    members,
    perform,
  } = usePortal();
  return (
    <section>
      <h2>Payment configuration</h2>
      <form
        className="inline-form"
        onSubmit={(e) => {
          e.preventDefault();
          void perform(async () => {
            await api("/admin/configuration", "PATCH", {
              paymentContact: contact,
            });
            setMessage("Payment contact updated and action audited.");
          });
        }}
      >
        <label>
          Manual payment contact
          <input
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            required
          />
        </label>
        <button className="primary" disabled={busy}>
          Save configuration
        </button>
      </form>
      <h2>Subscription plans</h2>
      <p>
        Pricing is not assumed. Set rates only after establishing your
        commercial policy.
      </p>
      {plans.map((p) => (
        <div className="plan-row" key={p.id}>
          <strong>{p.name}</strong>
          <span>
            {p.max_members} members ·{" "}
            {p.price_minor === null
              ? "Contact for pricing"
              : `${p.price_minor / 100} ${p.currency}`}
          </span>
          <button
            onClick={() =>
              void perform(async () => {
                const rate = prompt(
                  "Price in minor currency units (leave empty for contact pricing)",
                  p.price_minor?.toString() ?? "",
                );
                if (rate === null) return;
                const maxMembers = Number(
                  prompt("Maximum members", String(p.max_members)),
                );
                await api(`/admin/plans/${p.id}`, "PATCH", {
                  active: true,
                  maxMembers,
                  priceMinor: rate === "" ? null : Number(rate),
                  currency: p.currency,
                });
                setPlans((await api<{ plans: Plan[] }>("/plans")).plans);
                setMessage("Plan updated.");
              })
            }
          >
            Edit plan
          </button>
        </div>
      ))}
    </section>
  );
}
