import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import Fastify, { type FastifyRequest } from "fastify";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { ApiConfig, Member, RouteContext, User } from "./context";
import type { Connection, Database } from "./db";
import { registerAdminRoutes } from "./routes/admin";
import { registerAuthRoutes } from "./routes/auth";
import { registerBillingRoutes } from "./routes/billing";
import { registerSyncRoutes } from "./routes/sync";
import { registerWorkspaceRoutes } from "./routes/workspaces";
import { ApiError, hash, hashPassword, token } from "./security";
export type { ApiConfig } from "./context";
export async function createApp(db: Database, config: ApiConfig) {
  const origin = new URL(config.origin);
  if (
    origin.origin !== config.origin ||
    !["http:", "https:"].includes(origin.protocol)
  )
    throw new Error(
      "APP_ORIGIN must be an exact HTTP(S) origin without a trailing slash",
    );
  if (
    config.production &&
    origin.protocol !== "https:" &&
    !["localhost", "127.0.0.1"].includes(origin.hostname)
  )
    throw new Error("Production APP_ORIGIN must use HTTPS");
  const app = Fastify({
    logger: false,
    bodyLimit: 1024 * 1024,
    trustProxy: false,
  });
  await app.register(cookie);
  await app.register(rateLimit, { max: 120, timeWindow: "1 minute" });
  const dummy = await hashPassword(token());
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof z.ZodError)
      return reply.code(400).send({
        error: "Invalid input",
        issues: error.issues.map((i) => ({
          path: i.path,
          message: i.message,
        })),
      });
    const status =
      error instanceof ApiError
        ? error.statusCode
        : typeof error === "object" && error !== null && "statusCode" in error
          ? Number(error.statusCode)
          : 500;
    if (status >= 500)
      console.error(
        JSON.stringify({
          event: "api.internal_error",
          requestId: _request.id,
          method: _request.method,
          route: _request.routeOptions.url ?? "unknown",
        }),
      );
    return reply.code(status >= 400 && status <= 599 ? status : 500).send({
      error:
        status >= 500
          ? "Internal server error"
          : error instanceof Error
            ? error.message
            : "Request failed",
    });
  });
  app.addHook("onRequest", async (request, reply) => {
    reply
      .header("Cache-Control", "no-store")
      .header("X-Content-Type-Options", "nosniff")
      .header("Referrer-Policy", "no-referrer");
    if (config.production)
      reply.header(
        "Strict-Transport-Security",
        "max-age=31536000; includeSubDomains",
      );
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) {
      if (
        request.headers.origin !== config.origin ||
        request.headers["x-requestlab-client"] !== "web"
      )
        throw new ApiError(403, "Invalid request origin or CSRF client header");
    }
  });
  async function user(request: FastifyRequest): Promise<User> {
    const raw = request.cookies.rl_session;
    if (!raw) throw new ApiError(401, "Sign in required");
    const result = await db.query<User>(
      "SELECT u.id,u.email,u.display_name,u.is_admin,u.verified_at FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.token_hash=$1 AND s.expires_at>now() AND u.suspended=false",
      [hash(raw)],
    );
    if (!result.rows[0]) throw new ApiError(401, "Session expired");
    return result.rows[0];
  }
  async function admin(request: FastifyRequest) {
    const actor = await user(request);
    if (!actor.is_admin)
      throw new ApiError(403, "Administrator access required");
    return actor;
  }
  async function membership(
    connection: Connection,
    workspaceId: string,
    actor: User,
    roles: Member["role"][] = ["owner", "admin", "editor", "viewer"],
  ) {
    const result = await connection.query<Member>(
      "SELECT role FROM memberships WHERE workspace_id=$1 AND user_id=$2",
      [workspaceId, actor.id],
    );
    const member = result.rows[0];
    if (!member || !roles.includes(member.role))
      throw new ApiError(403, "Workspace permission denied");
    return member;
  }
  async function audit(
    connection: Connection,
    actor: string | null,
    workspace: string | null,
    action: string,
    details: Record<string, unknown> = {},
  ) {
    await connection.query(
      "INSERT INTO audit_log(id,actor_id,workspace_id,action,details) VALUES($1,$2,$3,$4,$5)",
      [randomUUID(), actor, workspace, action, JSON.stringify(details)],
    );
  }
  async function enqueue(
    connection: Connection,
    to: string,
    subject: string,
    body: string,
  ) {
    await connection.query(
      "INSERT INTO email_outbox(id,recipient,subject,body) VALUES($1,$2,$3,$4)",
      [randomUUID(), to, subject, body],
    );
  }
  async function authToken(
    connection: Connection,
    actorId: string,
    purpose: "verify" | "reset",
    to: string,
  ) {
    const raw = token();
    await connection.query(
      "DELETE FROM auth_tokens WHERE user_id=$1 AND purpose=$2",
      [actorId, purpose],
    );
    await connection.query(
      "INSERT INTO auth_tokens(token_hash,user_id,purpose,expires_at) VALUES($1,$2,$3,now()+interval '1 hour')",
      [hash(raw), actorId, purpose],
    );
    await enqueue(
      connection,
      to,
      purpose === "verify"
        ? "Verify your RequestLab email"
        : "Reset your RequestLab password",
      `${config.origin}/account?${purpose}=${encodeURIComponent(raw)}`,
    );
  }
  app.get("/v1/health", async () => {
    await db.query("SELECT 1");
    return { status: "ok", version: "0.1.0" };
  });
  const context: RouteContext = {
    db,
    config,
    dummy,
    user,
    admin,
    membership,
    audit,
    enqueue,
    authToken,
  };
  registerAuthRoutes(app, context);
  registerWorkspaceRoutes(app, context);
  registerSyncRoutes(app, context);
  registerBillingRoutes(app, context);
  registerAdminRoutes(app, context);
  return app;
}
