import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { RouteContext } from "../context";
import { ApiError, assertNoSecrets, hash } from "../security";
import { id, record } from "../validation";
export function registerSyncRoutes(
  app: FastifyInstance,
  context: RouteContext,
) {
  const { db, user, admin, membership, audit } = context;
  app.get("/v1/workspaces/:id/changes", async (request) => {
    const actor = await user(request);
    const workspaceId = id.parse(record(request.params).id);
    const query = z
      .object({ after: z.coerce.number().int().min(0).default(0) })
      .parse(request.query);
    await membership(db, workspaceId, actor);
    const result = await db.query(
      "SELECT * FROM changes WHERE workspace_id=$1 AND revision>$2 ORDER BY revision LIMIT 201",
      [workspaceId, query.after],
    );
    return {
      changes: result.rows.slice(0, 200),
      hasMore: result.rows.length > 200,
    };
  });
  app.post("/v1/workspaces/:id/changes", async (request) => {
    const actor = await user(request);
    const workspaceId = id.parse(record(request.params).id);
    const body = z
      .object({
        operationId: id,
        entityId: id,
        kind: z.enum(["collection", "request", "environment"]),
        expectedVersion: z.number().int().min(0),
        data: z.record(z.string(), z.unknown()),
        deleted: z.boolean().default(false),
      })
      .parse(request.body);
    assertNoSecrets(body.data);
    const requestHash = hash(JSON.stringify(body));
    return db.transaction(async (connection) => {
      await connection.query(
        "SELECT id FROM workspaces WHERE id=$1 FOR UPDATE",
        [workspaceId],
      );
      await membership(connection, workspaceId, actor, [
        "owner",
        "admin",
        "editor",
      ]);
      const replay = await connection.query<{
        request_hash: string;
        response: unknown;
        user_id: string;
      }>(
        "SELECT request_hash,response,user_id FROM operations WHERE workspace_id=$1 AND operation_id=$2",
        [workspaceId, body.operationId],
      );
      if (replay.rows[0]) {
        if (
          replay.rows[0].request_hash !== requestHash ||
          replay.rows[0].user_id !== actor.id
        )
          throw new ApiError(
            409,
            "Operation identifier was already used with a different payload or actor",
          );
        return replay.rows[0].response;
      }
      const existing = await connection.query<{
        version: number;
        kind: string;
        data: unknown;
      }>(
        "SELECT version,kind,data FROM entities WHERE workspace_id=$1 AND id=$2",
        [workspaceId, body.entityId],
      );
      const current = existing.rows[0];
      if ((current?.version ?? 0) !== body.expectedVersion)
        throw new ApiError(
          409,
          `Version conflict: current version ${current?.version ?? 0}. Pull changes before retrying`,
        );
      if (current && current.kind !== body.kind)
        throw new ApiError(409, "Entity kind cannot change");
      const version = body.expectedVersion + 1;
      const revision = (
        await connection.query<{ revision: string }>(
          "UPDATE workspaces SET revision=revision+1 WHERE id=$1 RETURNING revision",
          [workspaceId],
        )
      ).rows[0].revision;
      await connection.query(
        "INSERT INTO entities(workspace_id,id,kind,version,data,deleted,updated_by) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(workspace_id,id) DO UPDATE SET version=excluded.version,data=excluded.data,deleted=excluded.deleted,updated_by=excluded.updated_by,updated_at=now()",
        [
          workspaceId,
          body.entityId,
          body.kind,
          version,
          JSON.stringify(body.data),
          body.deleted,
          actor.id,
        ],
      );
      await connection.query(
        "INSERT INTO changes VALUES($1,$2,$3,$4,$5,$6,$7)",
        [
          workspaceId,
          revision,
          body.entityId,
          version,
          JSON.stringify(body.data),
          body.kind,
          body.deleted,
        ],
      );
      const response = {
        entityId: body.entityId,
        version,
        revision: Number(revision),
      };
      await connection.query("INSERT INTO operations VALUES($1,$2,$3,$4,$5)", [
        workspaceId,
        body.operationId,
        actor.id,
        requestHash,
        JSON.stringify(response),
      ]);
      await audit(connection, actor.id, workspaceId, "entity.changed", {
        entityId: body.entityId,
        version,
      });
      return response;
    });
  });
  app.get("/v1/workspaces/:id/comments/:entityId", async (request) => {
    const actor = await user(request);
    const params = z.object({ id, entityId: id }).parse(request.params);
    await membership(db, params.id, actor);
    return {
      comments: (
        await db.query(
          "SELECT c.id,c.body,c.created_at,u.display_name FROM comments c LEFT JOIN users u ON u.id=c.author_id WHERE workspace_id=$1 AND entity_id=$2 ORDER BY created_at LIMIT 200",
          [params.id, params.entityId],
        )
      ).rows,
    };
  });
  app.post("/v1/workspaces/:id/comments/:entityId", async (request) => {
    const actor = await user(request);
    const params = z.object({ id, entityId: id }).parse(request.params);
    const body = z
      .object({ body: z.string().trim().min(1).max(5000) })
      .parse(request.body);
    await db.transaction(async (connection) => {
      await membership(connection, params.id, actor);
      const entity = await connection.query(
        "SELECT id FROM entities WHERE workspace_id=$1 AND id=$2",
        [params.id, params.entityId],
      );
      if (!entity.rows.length) throw new ApiError(404, "Entity not found");
      await connection.query(
        "INSERT INTO comments(id,workspace_id,entity_id,author_id,body) VALUES($1,$2,$3,$4,$5)",
        [randomUUID(), params.id, params.entityId, actor.id, body.body],
      );
      await audit(connection, actor.id, params.id, "comment.created");
    });
    return { ok: true };
  });
  app.get("/v1/workspaces/:id/activity", async (request) => {
    const actor = await user(request);
    const workspaceId = id.parse(record(request.params).id);
    await membership(db, workspaceId, actor);
    return {
      activity: (
        await db.query(
          "SELECT action,details,created_at FROM audit_log WHERE workspace_id=$1 ORDER BY created_at DESC LIMIT 100",
          [workspaceId],
        )
      ).rows,
    };
  });
}
