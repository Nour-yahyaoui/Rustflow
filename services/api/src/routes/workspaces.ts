import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { RouteContext } from "../context";
import { ApiError, hash, token } from "../security";
import { email, id, record } from "../validation";
export function registerWorkspaceRoutes(
  app: FastifyInstance,
  context: RouteContext,
) {
  const { db, config, user, admin, membership, audit, enqueue } = context;
  app.get("/v1/workspaces", async (request) => {
    const actor = await user(request);
    return {
      workspaces: (
        await db.query(
          "SELECT w.*,m.role FROM workspaces w JOIN memberships m ON m.workspace_id=w.id WHERE m.user_id=$1 ORDER BY w.created_at",
          [actor.id],
        )
      ).rows,
    };
  });
  app.post("/v1/workspaces", async (request, reply) => {
    const actor = await user(request);
    const body = z
      .object({ name: z.string().trim().min(1).max(100) })
      .parse(request.body);
    const workspaceId = randomUUID();
    await db.transaction(async (connection) => {
      await connection.query(
        "INSERT INTO workspaces(id,name,owner_id) VALUES($1,$2,$3)",
        [workspaceId, body.name, actor.id],
      );
      await connection.query("INSERT INTO memberships VALUES($1,$2,'owner')", [
        workspaceId,
        actor.id,
      ]);
      await audit(connection, actor.id, workspaceId, "workspace.created");
    });
    return reply.code(201).send({ id: workspaceId, name: body.name });
  });
  app.patch("/v1/workspaces/:id", async (request) => {
    const actor = await user(request);
    const workspaceId = id.parse(record(request.params).id);
    const body = z
      .object({ name: z.string().trim().min(1).max(100) })
      .parse(request.body);
    await db.transaction(async (connection) => {
      await membership(connection, workspaceId, actor, ["owner", "admin"]);
      await connection.query("UPDATE workspaces SET name=$1 WHERE id=$2", [
        body.name,
        workspaceId,
      ]);
      await audit(connection, actor.id, workspaceId, "workspace.renamed");
    });
    return { ok: true };
  });
  app.delete("/v1/workspaces/:id", async (request) => {
    const actor = await user(request);
    const workspaceId = id.parse(record(request.params).id);
    await db.transaction(async (connection) => {
      await membership(connection, workspaceId, actor, ["owner"]);
      await audit(connection, actor.id, workspaceId, "workspace.deleted");
      await connection.query("DELETE FROM workspaces WHERE id=$1", [
        workspaceId,
      ]);
    });
    return { ok: true };
  });
  app.get("/v1/workspaces/:id/members", async (request) => {
    const actor = await user(request);
    const workspaceId = id.parse(record(request.params).id);
    await membership(db, workspaceId, actor);
    return {
      members: (
        await db.query(
          "SELECT u.id,u.display_name,u.email,m.role FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.workspace_id=$1",
          [workspaceId],
        )
      ).rows,
    };
  });
  app.patch("/v1/workspaces/:id/members/:userId", async (request) => {
    const actor = await user(request);
    const params = z.object({ id, userId: id }).parse(request.params);
    const body = z
      .object({ role: z.enum(["admin", "editor", "viewer"]) })
      .parse(request.body);
    await db.transaction(async (connection) => {
      await connection.query(
        "SELECT id FROM workspaces WHERE id=$1 FOR UPDATE",
        [params.id],
      );
      await membership(connection, params.id, actor, ["owner"]);
      const changed = await connection.query(
        "UPDATE memberships SET role=$1 WHERE workspace_id=$2 AND user_id=$3 AND role<>'owner' RETURNING user_id",
        [body.role, params.id, params.userId],
      );
      if (!changed.rows.length)
        throw new ApiError(404, "Non-owner membership not found");
      await audit(connection, actor.id, params.id, "membership.role_changed", {
        userId: params.userId,
        role: body.role,
      });
    });
    return { ok: true };
  });
  app.delete("/v1/workspaces/:id/members/:userId", async (request) => {
    const actor = await user(request);
    const params = z.object({ id, userId: id }).parse(request.params);
    await db.transaction(async (connection) => {
      await connection.query(
        "SELECT id FROM workspaces WHERE id=$1 FOR UPDATE",
        [params.id],
      );
      await membership(connection, params.id, actor, ["owner"]);
      const removed = await connection.query(
        "DELETE FROM memberships WHERE workspace_id=$1 AND user_id=$2 AND role<>'owner' RETURNING user_id",
        [params.id, params.userId],
      );
      if (!removed.rows.length)
        throw new ApiError(404, "Non-owner membership not found");
      await audit(connection, actor.id, params.id, "membership.removed", {
        userId: params.userId,
      });
    });
    return { ok: true };
  });
  app.post("/v1/workspaces/:id/transfer", async (request) => {
    const actor = await user(request);
    const workspaceId = id.parse(record(request.params).id);
    const body = z.object({ userId: id }).parse(request.body);
    await db.transaction(async (connection) => {
      await connection.query(
        "SELECT id FROM workspaces WHERE id=$1 FOR UPDATE",
        [workspaceId],
      );
      await membership(connection, workspaceId, actor, ["owner"]);
      if (body.userId === actor.id)
        throw new ApiError(400, "Select another member");
      const target = await connection.query(
        "SELECT user_id FROM memberships WHERE workspace_id=$1 AND user_id=$2",
        [workspaceId, body.userId],
      );
      if (!target.rows.length)
        throw new ApiError(404, "Target must be an existing workspace member");
      await connection.query(
        "UPDATE memberships SET role='admin' WHERE workspace_id=$1 AND user_id=$2",
        [workspaceId, actor.id],
      );
      await connection.query(
        "UPDATE memberships SET role='owner' WHERE workspace_id=$1 AND user_id=$2",
        [workspaceId, body.userId],
      );
      await connection.query("UPDATE workspaces SET owner_id=$1 WHERE id=$2", [
        body.userId,
        workspaceId,
      ]);
      await audit(
        connection,
        actor.id,
        workspaceId,
        "workspace.ownership_transferred",
        { newOwner: body.userId },
      );
    });
    return { ok: true };
  });
  app.post("/v1/workspaces/:id/invitations", async (request) => {
    const actor = await user(request);
    const workspaceId = id.parse(record(request.params).id);
    const body = z
      .object({ email, role: z.enum(["admin", "editor", "viewer"]) })
      .parse(request.body);
    await db.transaction(async (connection) => {
      await membership(connection, workspaceId, actor, ["owner", "admin"]);
      const raw = token();
      await connection.query(
        "INSERT INTO invitations(id,workspace_id,email,role,token_hash,expires_at) VALUES($1,$2,$3,$4,$5,now()+interval '7 days')",
        [randomUUID(), workspaceId, body.email, body.role, hash(raw)],
      );
      await enqueue(
        connection,
        body.email,
        "RequestLab workspace invitation",
        `${config.origin}/account?invite=${raw}`,
      );
      await audit(connection, actor.id, workspaceId, "invitation.created", {
        role: body.role,
      });
    });
    return { ok: true };
  });
  app.post("/v1/invitations/accept", async (request) => {
    const actor = await user(request);
    const body = z
      .object({ token: z.string().min(32).max(128) })
      .parse(request.body);
    await db.transaction(async (connection) => {
      const found = await connection.query<{
        id: string;
        workspace_id: string;
        role: string;
      }>(
        "SELECT id,workspace_id,role FROM invitations WHERE token_hash=$1 AND email=$2 AND expires_at>now() AND accepted_at IS NULL FOR UPDATE",
        [hash(body.token), actor.email],
      );
      const invite = found.rows[0];
      if (!invite) throw new ApiError(404, "Invitation is invalid or expired");
      await connection.query(
        "SELECT id FROM workspaces WHERE id=$1 FOR UPDATE",
        [invite.workspace_id],
      );
      const plan = await connection.query<{ max_members: number }>(
        "SELECT p.max_members FROM plans p WHERE p.id=COALESCE((SELECT plan_id FROM subscriptions WHERE workspace_id=$1 AND status='active' AND expires_at>now()),'free')",
        [invite.workspace_id],
      );
      const count = await connection.query<{ count: string }>(
        "SELECT count(*) AS count FROM memberships WHERE workspace_id=$1",
        [invite.workspace_id],
      );
      if (Number(count.rows[0].count) >= plan.rows[0].max_members)
        throw new ApiError(409, "Workspace plan member limit reached");
      await connection.query(
        "INSERT INTO memberships VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
        [invite.workspace_id, actor.id, invite.role],
      );
      await connection.query(
        "UPDATE invitations SET accepted_at=now() WHERE id=$1",
        [invite.id],
      );
      await audit(
        connection,
        actor.id,
        invite.workspace_id,
        "invitation.accepted",
      );
    });
    return { ok: true };
  });
}
