import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { RouteContext } from "../context";
import { ApiError } from "../security";
import { id, record } from "../validation";
export function registerAdminRoutes(
  app: FastifyInstance,
  context: RouteContext,
) {
  const { db, admin, audit } = context;
  app.get("/v1/admin/overview", async (request) => {
    await admin(request);
    return {
      users: (await db.query("SELECT count(*) count FROM users")).rows[0],
      workspaces: (await db.query("SELECT count(*) count FROM workspaces"))
        .rows[0],
      pendingPayments: (
        await db.query(
          "SELECT count(*) count FROM payments WHERE status='pending'",
        )
      ).rows[0],
    };
  });
  app.get("/v1/admin/users", async (request) => {
    await admin(request);
    return {
      users: (
        await db.query(
          "SELECT id,email,display_name,is_admin,suspended,verified_at,created_at FROM users ORDER BY created_at DESC LIMIT 200",
        )
      ).rows,
    };
  });
  app.patch("/v1/admin/users/:id", async (request) => {
    const actor = await admin(request);
    const target = id.parse(record(request.params).id);
    const body = z.object({ suspended: z.boolean() }).parse(request.body);
    if (target === actor.id)
      throw new ApiError(400, "Cannot suspend your own account");
    await db.transaction(async (connection) => {
      const result = await connection.query(
        "UPDATE users SET suspended=$1 WHERE id=$2 RETURNING id",
        [body.suspended, target],
      );
      if (!result.rows.length) throw new ApiError(404, "User not found");
      if (body.suspended)
        await connection.query("DELETE FROM sessions WHERE user_id=$1", [
          target,
        ]);
      await audit(connection, actor.id, null, "admin.user_suspension", {
        userId: target,
        suspended: body.suspended,
      });
    });
    return { ok: true };
  });
  app.get("/v1/admin/payments", async (request) => {
    await admin(request);
    return {
      payments: (
        await db.query(
          "SELECT p.*,u.email,w.name AS workspace_name FROM payments p LEFT JOIN users u ON u.id=p.submitted_by JOIN workspaces w ON w.id=p.workspace_id ORDER BY p.created_at DESC LIMIT 200",
        )
      ).rows,
    };
  });
  app.post("/v1/admin/payments/:id/review", async (request) => {
    const actor = await admin(request);
    const paymentId = id.parse(record(request.params).id);
    const body = z
      .object({
        decision: z.enum(["approved", "rejected"]),
        note: z.string().trim().min(1).max(1000),
        expiresAt: z.iso.datetime().optional(),
      })
      .parse(request.body);
    if (
      body.decision === "approved" &&
      (!body.expiresAt ||
        new Date(body.expiresAt).getTime() <= Date.now() ||
        new Date(body.expiresAt).getTime() > Date.now() + 366 * 86400000)
    )
      throw new ApiError(
        400,
        "Approval requires a future expiry within 366 days",
      );
    return db.transaction(async (connection) => {
      const result = await connection.query<{
        workspace_id: string;
        plan_id: string;
        status: string;
      }>(
        "SELECT workspace_id,plan_id,status FROM payments WHERE id=$1 FOR UPDATE",
        [paymentId],
      );
      const payment = result.rows[0];
      if (!payment) throw new ApiError(404, "Payment not found");
      if (payment.status !== "pending")
        throw new ApiError(409, "Payment was already reviewed");
      await connection.query(
        "UPDATE payments SET status=$1,reviewed_by=$2,review_note=$3,reviewed_at=now() WHERE id=$4",
        [body.decision, actor.id, body.note, paymentId],
      );
      if (body.decision === "approved")
        await connection.query(
          "INSERT INTO subscriptions(workspace_id,plan_id,status,expires_at) VALUES($1,$2,'active',$3) ON CONFLICT(workspace_id) DO UPDATE SET plan_id=excluded.plan_id,status='active',expires_at=excluded.expires_at,updated_at=now()",
          [payment.workspace_id, payment.plan_id, body.expiresAt],
        );
      await audit(
        connection,
        actor.id,
        payment.workspace_id,
        "admin.payment_reviewed",
        {
          paymentId,
          decision: body.decision,
          expiresAt: body.expiresAt ?? null,
        },
      );
      return { status: body.decision };
    });
  });
  app.get("/v1/admin/audit", async (request) => {
    await admin(request);
    return {
      events: (
        await db.query(
          "SELECT * FROM audit_log ORDER BY created_at DESC LIMIT 200",
        )
      ).rows,
    };
  });
  app.patch("/v1/admin/configuration", async (request) => {
    const actor = await admin(request);
    const body = z
      .object({ paymentContact: z.string().regex(/^[+\d ()-]{5,30}$/) })
      .parse(request.body);
    await db.transaction(async (connection) => {
      await connection.query(
        "UPDATE configuration SET value=$1 WHERE key='payment_contact'",
        [body.paymentContact],
      );
      await audit(connection, actor.id, null, "admin.payment_contact_changed");
    });
    return { ok: true };
  });
  app.patch("/v1/admin/plans/:id", async (request) => {
    const actor = await admin(request);
    const planId = z
      .enum(["free", "pro", "team"])
      .parse(record(request.params).id);
    const body = z
      .object({
        active: z.boolean(),
        maxMembers: z.number().int().min(1).max(1000),
        priceMinor: z.number().int().min(0).nullable(),
        currency: z.string().regex(/^[A-Z]{3}$/),
      })
      .parse(request.body);
    await db.transaction(async (connection) => {
      await connection.query(
        "UPDATE plans SET active=$1,max_members=$2,price_minor=$3,currency=$4 WHERE id=$5",
        [body.active, body.maxMembers, body.priceMinor, body.currency, planId],
      );
      await audit(connection, actor.id, null, "admin.plan_updated", { planId });
    });
    return { ok: true };
  });
}
