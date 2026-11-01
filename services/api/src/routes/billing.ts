import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { RouteContext } from "../context";
import { ApiError } from "../security";
import { id, record } from "../validation";
export function registerBillingRoutes(
  app: FastifyInstance,
  context: RouteContext,
) {
  const { db, user, admin, membership, audit } = context;
  app.get("/v1/plans", async () => ({
    plans: (
      await db.query(
        "SELECT * FROM plans WHERE active=true ORDER BY max_members,id",
      )
    ).rows,
    paymentContact: (
      await db.query<{ value: string }>(
        "SELECT value FROM configuration WHERE key='payment_contact'",
      )
    ).rows[0].value,
  }));
  app.get("/v1/workspaces/:id/billing", async (request) => {
    const actor = await user(request);
    const workspaceId = id.parse(record(request.params).id);
    await membership(db, workspaceId, actor, ["owner", "admin"]);
    const subscription = (
      await db.query(
        "SELECT *,CASE WHEN expires_at<=now() THEN 'expired' ELSE status END AS effective_status FROM subscriptions WHERE workspace_id=$1",
        [workspaceId],
      )
    ).rows[0] ?? { plan_id: "free", effective_status: "active" };
    const payments = (
      await db.query(
        "SELECT id,plan_id,reference,status,review_note,created_at,reviewed_at FROM payments WHERE workspace_id=$1 ORDER BY created_at DESC LIMIT 100",
        [workspaceId],
      )
    ).rows;
    return { subscription, payments };
  });
  app.post("/v1/workspaces/:id/payments", async (request) => {
    const actor = await user(request);
    const workspaceId = id.parse(record(request.params).id);
    const body = z
      .object({
        planId: z.enum(["pro", "team"]),
        reference: z.string().trim().min(3).max(200),
      })
      .parse(request.body);
    return db.transaction(async (connection) => {
      await membership(connection, workspaceId, actor, ["owner", "admin"]);
      const plan = await connection.query(
        "SELECT id FROM plans WHERE id=$1 AND active=true",
        [body.planId],
      );
      if (!plan.rows.length) throw new ApiError(400, "Plan is unavailable");
      const paymentId = randomUUID();
      await connection.query(
        "INSERT INTO payments(id,workspace_id,submitted_by,plan_id,reference) VALUES($1,$2,$3,$4,$5)",
        [paymentId, workspaceId, actor.id, body.planId, body.reference],
      );
      await audit(connection, actor.id, workspaceId, "payment.submitted", {
        paymentId,
      });
      return {
        id: paymentId,
        status: "pending",
        message:
          "Reference submitted. No payment is confirmed until an administrator approves it.",
      };
    });
  });
  app.post("/v1/workspaces/:id/subscription/cancel", async (request) => {
    const actor = await user(request);
    const workspaceId = id.parse(record(request.params).id);
    await db.transaction(async (connection) => {
      await membership(connection, workspaceId, actor, ["owner"]);
      await connection.query(
        "UPDATE subscriptions SET status='cancelled',updated_at=now() WHERE workspace_id=$1",
        [workspaceId],
      );
      await audit(connection, actor.id, workspaceId, "subscription.cancelled");
    });
    return { ok: true };
  });
}
