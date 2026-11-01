import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { RouteContext, User } from "../context";
import {
  ApiError,
  hash,
  hashPassword,
  token,
  verifyPassword,
} from "../security";
import { email, password } from "../validation";
export function registerAuthRoutes(
  app: FastifyInstance,
  context: RouteContext,
) {
  const { db, config, dummy, user, audit, authToken } = context;
  app.post(
    "/v1/auth/register",
    { config: { rateLimit: { max: 5, timeWindow: "15 minutes" } } },
    async (request, reply) => {
      const body = z
        .object({ email, password, name: z.string().trim().min(1).max(100) })
        .parse(request.body);
      const digest = await hashPassword(body.password);
      await db.transaction(async (connection) => {
        const actorId = randomUUID();
        const result = await connection.query(
          "INSERT INTO users(id,email,password_hash,display_name) VALUES($1,$2,$3,$4) ON CONFLICT(email) DO NOTHING RETURNING id",
          [actorId, body.email, digest, body.name],
        );
        if (result.rows.length)
          await authToken(connection, actorId, "verify", body.email);
      });
      return reply.code(202).send({
        message:
          "If registration is available, a verification email will be sent. Check your inbox.",
      });
    },
  );
  app.post(
    "/v1/auth/login",
    { config: { rateLimit: { max: 10, timeWindow: "15 minutes" } } },
    async (request, reply) => {
      const body = z
        .object({ email, password: z.string().max(256) })
        .parse(request.body);
      const result = await db.query<
        User & { password_hash: string; suspended: boolean }
      >(
        "SELECT id,email,password_hash,display_name,is_admin,verified_at,suspended FROM users WHERE email=$1",
        [body.email],
      );
      const actor = result.rows[0];
      const valid = await verifyPassword(
        body.password,
        actor?.password_hash ?? dummy,
      );
      if (!actor || !valid || actor.suspended)
        throw new ApiError(401, "Invalid email or password");
      if (!actor.verified_at)
        throw new ApiError(403, "Verify your email before signing in");
      const raw = token();
      const days = config.sessionDays ?? 7;
      await db.query(
        "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,$3)",
        [hash(raw), actor.id, new Date(Date.now() + days * 86400000)],
      );
      reply.setCookie("rl_session", raw, {
        httpOnly: true,
        secure: config.production,
        sameSite: "strict",
        path: "/",
        maxAge: days * 86400,
      });
      return {
        user: {
          id: actor.id,
          email: actor.email,
          name: actor.display_name,
          isAdmin: actor.is_admin,
        },
      };
    },
  );
  app.post("/v1/auth/logout", async (request, reply) => {
    if (request.cookies.rl_session)
      await db.query("DELETE FROM sessions WHERE token_hash=$1", [
        hash(request.cookies.rl_session),
      ]);
    reply.clearCookie("rl_session", {
      path: "/",
      httpOnly: true,
      secure: config.production,
      sameSite: "strict",
    });
    return { ok: true };
  });
  app.get("/v1/auth/session", async (request) => ({
    user: await user(request),
  }));
  app.post("/v1/auth/verify", async (request) => {
    const body = z
      .object({ token: z.string().min(32).max(128) })
      .parse(request.body);
    await db.transaction(async (connection) => {
      const result = await connection.query<{ user_id: string }>(
        "DELETE FROM auth_tokens WHERE token_hash=$1 AND purpose='verify' AND expires_at>now() RETURNING user_id",
        [hash(body.token)],
      );
      if (!result.rows[0])
        throw new ApiError(400, "Invalid or expired verification token");
      await connection.query("UPDATE users SET verified_at=now() WHERE id=$1", [
        result.rows[0].user_id,
      ]);
    });
    return { ok: true };
  });
  app.post(
    "/v1/auth/forgot",
    { config: { rateLimit: { max: 5, timeWindow: "15 minutes" } } },
    async (request) => {
      const body = z.object({ email }).parse(request.body);
      await db.transaction(async (connection) => {
        const result = await connection.query<{ id: string }>(
          "SELECT id FROM users WHERE email=$1",
          [body.email],
        );
        if (result.rows[0])
          await authToken(connection, result.rows[0].id, "reset", body.email);
      });
      return { message: "If the account exists, a reset email will be sent." };
    },
  );
  app.post("/v1/auth/reset", async (request) => {
    const body = z
      .object({ token: z.string().min(32).max(128), password })
      .parse(request.body);
    const digest = await hashPassword(body.password);
    await db.transaction(async (connection) => {
      const result = await connection.query<{ user_id: string }>(
        "DELETE FROM auth_tokens WHERE token_hash=$1 AND purpose='reset' AND expires_at>now() RETURNING user_id",
        [hash(body.token)],
      );
      if (!result.rows[0])
        throw new ApiError(400, "Invalid or expired reset token");
      const actorId = result.rows[0].user_id;
      await connection.query("UPDATE users SET password_hash=$1 WHERE id=$2", [
        digest,
        actorId,
      ]);
      await connection.query("DELETE FROM sessions WHERE user_id=$1", [
        actorId,
      ]);
      await audit(connection, actorId, null, "account.password_reset");
    });
    return { ok: true };
  });
  app.patch("/v1/account", async (request) => {
    const actor = await user(request);
    const body = z
      .object({ name: z.string().trim().min(1).max(100) })
      .parse(request.body);
    await db.query("UPDATE users SET display_name=$1 WHERE id=$2", [
      body.name,
      actor.id,
    ]);
    return { ok: true };
  });
  app.delete("/v1/account", async (request, reply) => {
    const actor = await user(request);
    const body = z
      .object({ password: z.string().max(256) })
      .parse(request.body);
    const result = await db.query<{ password_hash: string }>(
      "SELECT password_hash FROM users WHERE id=$1",
      [actor.id],
    );
    if (!(await verifyPassword(body.password, result.rows[0].password_hash)))
      throw new ApiError(403, "Password confirmation failed");
    await db.transaction(async (connection) => {
      const owned = await connection.query(
        "SELECT id FROM workspaces WHERE owner_id=$1",
        [actor.id],
      );
      if (owned.rows.length)
        throw new ApiError(
          409,
          "Transfer or delete owned workspaces before deleting your account",
        );
      await audit(connection, actor.id, null, "account.deleted");
      await connection.query("DELETE FROM users WHERE id=$1", [actor.id]);
    });
    reply.clearCookie("rl_session", { path: "/" });
    return { ok: true };
  });
}
