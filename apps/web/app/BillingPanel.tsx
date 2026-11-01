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
export function BillingPanel() {
  const {
    name,
    setMessage,
    busy,
    workspaces,
    selected,
    plans,
    contact,
    plan,
    setPlan,
    reference,
    setReference,
    billing,
    perform,
    refreshBilling,
    review,
  } = usePortal();
  return (
    <>
      {selected ? (
        <>
          <div className="billing-grid">
            <section>
              <span className="eyebrow">CURRENT SUBSCRIPTION</span>
              <h2>
                {billing?.subscription.plan_id ?? "free"}{" "}
                <span className="badge">
                  {billing?.subscription.effective_status ?? "Loading"}
                </span>
              </h2>
              <p>
                {billing?.subscription.expires_at
                  ? `Expires ${new Date(billing.subscription.expires_at).toLocaleDateString()}`
                  : "Core local features are free. No payment required."}
              </p>
              {billing?.subscription.plan_id !== "free" && (
                <button
                  disabled={busy}
                  onClick={() =>
                    void perform(async () => {
                      if (confirm("Cancel this subscription immediately?")) {
                        await api(
                          `/workspaces/${selected}/subscription/cancel`,
                          "POST",
                        );
                        await refreshBilling();
                      }
                    })
                  }
                >
                  Cancel subscription
                </button>
              )}
            </section>
            <section>
              <span className="eyebrow">MANUAL PAYMENT</span>
              <h2>Talk to a real person.</h2>
              <a className="payment-phone" href={`tel:${contact}`}>
                {contact}
              </a>
              <p>
                Contact us for payment instructions and current pricing. We
                never charge automatically. Submit a reference only after
                arranging your payment.
              </p>
            </section>
          </div>
          <section>
            <h2>Submit a payment reference</h2>
            <p>
              A submission is pending—not a confirmed transaction. Access
              activates only after explicit administrator approval.
            </p>
            <form
              className="inline-form"
              onSubmit={(e) => {
                e.preventDefault();
                void perform(async () => {
                  await api(`/workspaces/${selected}/payments`, "POST", {
                    planId: plan,
                    reference,
                  });
                  setReference("");
                  await refreshBilling();
                  setMessage(
                    "Reference submitted for review. Your subscription has not been activated.",
                  );
                });
              }}
            >
              <label>
                Requested plan
                <select value={plan} onChange={(e) => setPlan(e.target.value)}>
                  {plans
                    .filter((p) => p.id !== "free")
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} · {p.max_members} member
                        {p.max_members > 1 ? "s" : ""}
                        {p.price_minor !== null
                          ? ` · ${(p.price_minor / 100).toFixed(2)} ${p.currency}`
                          : " · Contact for pricing"}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Payment reference
                <input
                  required
                  minLength={3}
                  maxLength={200}
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                />
              </label>
              <button className="primary" disabled={busy}>
                Submit for review
              </button>
            </form>
          </section>
          <section>
            <h2>Payment history</h2>
            <PaymentTable payments={billing?.payments ?? []} />
          </section>
        </>
      ) : (
        <section>
          <p>Create a workspace to manage its billing.</p>
        </section>
      )}
    </>
  );
}
