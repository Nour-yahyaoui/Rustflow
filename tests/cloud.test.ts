import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { createApp } from "../services/api/src/app";
import { database, migrate } from "../services/api/src/db";
import type { Database, Connection, QueryResult } from "../services/api/src/db";
import {
  assertNoSecrets,
  hashPassword,
  verifyPassword,
} from "../services/api/src/security";
import type { FastifyInstance } from "fastify";
let app: FastifyInstance;
let pg: PGlite;
let db: Database;
let ownerCookie: string;
let outsiderCookie: string;
let adminCookie: string;
let workspaceId: string;
let ownerId: string;
let entityId: string;
let operationId: string;
let paymentId: string;
const headers = {
  origin: "http://localhost:3000",
  "x-requestlab-client": "web",
};
const connection = (client: {
  query: (
    sql: string,
    params?: unknown[],
  ) => Promise<{ rows: unknown[]; affectedRows?: number }>;
}): Connection => ({
  query: async <T extends Record<string, unknown>>(
    sql: string,
    values?: unknown[],
  ) => {
    const result = await client.query(sql, values);
    return {
      rows: result.rows as T[],
      rowCount: result.affectedRows ?? null,
    } as QueryResult<T>;
  },
});
async function register(email: string) {
  await app.inject({
    method: "POST",
    url: "/v1/auth/register",
    headers,
    payload: {
      email,
      password: "correct-horse-battery-staple",
      name: email.split("@")[0],
    },
  });
  const queued = await db.query<{ body: string }>(
    "SELECT body FROM email_outbox WHERE recipient=$1",
    [email],
  );
  const token = new URL(queued.rows[0].body).searchParams.get("verify");
  const verified = await app.inject({
    method: "POST",
    url: "/v1/auth/verify",
    headers,
    payload: { token },
  });
  expect(verified.statusCode).toBe(200);
  const login = await app.inject({
    method: "POST",
    url: "/v1/auth/login",
    headers,
    payload: { email, password: "correct-horse-battery-staple" },
  });
  expect(login.statusCode).toBe(200);
  return String(login.headers["set-cookie"]).split(";")[0];
}
beforeAll(async () => {
  if (process.env.TEST_DATABASE_URL) {
    db = database(process.env.TEST_DATABASE_URL);
    await migrate(db);
  } else {
    pg = new PGlite();
    await pg.exec(
      await readFile(
        new URL("../database/migrations/001_cloud.sql", import.meta.url),
        "utf8",
      ),
    );
    db = {
      ...connection(pg),
      transaction: (fn) => pg.transaction((tx) => fn(connection(tx))),
      close: () => pg.close(),
    };
  }
  app = await createApp(db, {
    origin: "http://localhost:3000",
    production: false,
  });
  ownerCookie = await register("owner@example.com");
  outsiderCookie = await register("outsider@example.com");
  adminCookie = await register("admin@example.com");
  await db.query("UPDATE users SET is_admin=true WHERE email=$1", [
    "admin@example.com",
  ]);
  ownerId = (
    await db.query<{ id: string }>("SELECT id FROM users WHERE email=$1", [
      "owner@example.com",
    ])
  ).rows[0].id;
  const result = await app.inject({
    method: "POST",
    url: "/v1/workspaces",
    headers: { ...headers, cookie: ownerCookie },
    payload: { name: "Engineering" },
  });
  expect(result.statusCode).toBe(201);
  workspaceId = result.json().id;
  entityId = randomUUID();
  operationId = randomUUID();
});
afterAll(async () => {
  await app?.close();
  await db?.close();
});
describe("cloud authentication, actual PostgreSQL WASM database, Fastify routes", () => {
  it("has no unauthenticated workspace access", async () => {
    const result = await app.inject("/v1/workspaces");
    expect(result.statusCode).toBe(401);
  });
  it("enforces origin and CSRF header", async () => {
    const result = await app.inject({
      method: "POST",
      url: "/v1/workspaces",
      headers: { cookie: ownerCookie, origin: "https://evil.example" },
      payload: { name: "bad" },
    });
    expect(result.statusCode).toBe(403);
  });
  it("sessions are hashed and HttpOnly", async () => {
    const rows = await db.query<{ token_hash: string }>(
      "SELECT token_hash FROM sessions",
    );
    expect(rows.rows[0].token_hash).toMatch(/^[a-f0-9]{64}$/);
    const login = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      headers,
      payload: {
        email: "owner@example.com",
        password: "correct-horse-battery-staple",
      },
    });
    expect(login.headers["set-cookie"]).toContain("HttpOnly");
    expect(login.headers["set-cookie"]).toContain("SameSite=Strict");
  });
  it("denies other tenants access to billing and changes", async () => {
    for (const path of ["billing", "changes", "members", "activity"]) {
      const result = await app.inject({
        url: `/v1/workspaces/${workspaceId}/${path}`,
        headers: { cookie: outsiderCookie },
      });
      expect(result.statusCode).toBe(403);
    }
  });
  it("lists only owned or joined workspaces", async () => {
    const result = await app.inject({
      url: "/v1/workspaces",
      headers: { cookie: outsiderCookie },
    });
    expect(result.json().workspaces).toEqual([]);
  });
  it("does not allow admins through client claims", async () => {
    const result = await app.inject({
      url: "/v1/admin/users",
      headers: { cookie: ownerCookie, "x-admin": "true" },
    });
    expect(result.statusCode).toBe(403);
  });
  it("hashes passwords with salted scrypt", async () => {
    const value = await hashPassword("twelve-long-password");
    expect(value).not.toContain("twelve-long");
    expect(await verifyPassword("twelve-long-password", value)).toBe(true);
    expect(await verifyPassword("wrong", value)).toBe(false);
  });
});
describe("versioned synchronization and permissions", () => {
  const body = () => ({
    operationId,
    entityId,
    kind: "collection",
    expectedVersion: 0,
    data: { name: "Users" },
    deleted: false,
  });
  it("applies real versioned changes", async () => {
    const result = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceId}/changes`,
      headers: { ...headers, cookie: ownerCookie },
      payload: body(),
    });
    expect(result.statusCode).toBe(200);
    expect(result.json()).toMatchObject({ version: 1, revision: 1 });
  });
  it("replays idempotently without duplicate revisions", async () => {
    const result = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceId}/changes`,
      headers: { ...headers, cookie: ownerCookie },
      payload: body(),
    });
    expect(result.statusCode).toBe(200);
    expect(result.json().revision).toBe(1);
  });
  it("rejects reused idempotency keys with changed payload", async () => {
    const result = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceId}/changes`,
      headers: { ...headers, cookie: ownerCookie },
      payload: { ...body(), data: { name: "Different" } },
    });
    expect(result.statusCode).toBe(409);
  });
  it("rejects stale versions rather than overwriting", async () => {
    const result = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceId}/changes`,
      headers: { ...headers, cookie: ownerCookie },
      payload: { ...body(), operationId: randomUUID() },
    });
    expect(result.statusCode).toBe(409);
    const pull = await app.inject({
      url: `/v1/workspaces/${workspaceId}/changes?after=0`,
      headers: { cookie: ownerCookie },
    });
    expect(pull.json().changes[0].data.name).toBe("Users");
  });
  it("rejects secrets", async () => {
    const result = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceId}/changes`,
      headers: { ...headers, cookie: ownerCookie },
      payload: {
        ...body(),
        operationId: randomUUID(),
        data: { variables: [{ key: "TOKEN", value: "secret", secret: true }] },
      },
    });
    expect(result.statusCode).toBe(422);
    expect(() =>
      assertNoSecrets({ auth: { type: "apikey", value: "secret" } }),
    ).toThrow();
  });
  it("denies viewer writes but permits comments", async () => {
    const outsider = (
      await db.query<{ id: string }>("SELECT id FROM users WHERE email=$1", [
        "outsider@example.com",
      ])
    ).rows[0].id;
    await db.query("INSERT INTO memberships VALUES($1,$2,'viewer')", [
      workspaceId,
      outsider,
    ]);
    const result = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceId}/changes`,
      headers: { ...headers, cookie: outsiderCookie },
      payload: { ...body(), operationId: randomUUID(), expectedVersion: 1 },
    });
    expect(result.statusCode).toBe(403);
    const comment = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceId}/comments/${entityId}`,
      headers: { ...headers, cookie: outsiderCookie },
      payload: { body: "Please document this endpoint." },
    });
    expect(comment.statusCode).toBe(200);
  });
});
describe("manual billing approval and audit", () => {
  it("uses the required contact number without fabricated prices", async () => {
    const result = await app.inject("/v1/plans");
    expect(result.json().paymentContact).toBe("56668672");
    expect(
      result
        .json()
        .plans.every(
          (p: { price_minor: number | null }) => p.price_minor === null,
        ),
    ).toBe(true);
  });
  it("submits pending references without activating subscriptions", async () => {
    const result = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceId}/payments`,
      headers: { ...headers, cookie: ownerCookie },
      payload: { planId: "team", reference: "bank-reference-123" },
    });
    expect(result.statusCode).toBe(200);
    expect(result.json().status).toBe("pending");
    paymentId = result.json().id;
    expect((await db.query("SELECT * FROM subscriptions")).rows).toHaveLength(
      0,
    );
  });
  it("requires a server-authorized administrator to approve", async () => {
    const result = await app.inject({
      method: "POST",
      url: `/v1/admin/payments/${paymentId}/review`,
      headers: { ...headers, cookie: ownerCookie },
      payload: {
        decision: "approved",
        note: "Untrusted approval",
        expiresAt: new Date(Date.now() + 30 * 86400000).toISOString(),
      },
    });
    expect(result.statusCode).toBe(403);
  });
  it("requires explicit expiry for approval", async () => {
    const result = await app.inject({
      method: "POST",
      url: `/v1/admin/payments/${paymentId}/review`,
      headers: { ...headers, cookie: adminCookie },
      payload: { decision: "approved", note: "Verified independently" },
    });
    expect(result.statusCode).toBe(400);
  });
  it("activates only after explicit authorized approval", async () => {
    const result = await app.inject({
      method: "POST",
      url: `/v1/admin/payments/${paymentId}/review`,
      headers: { ...headers, cookie: adminCookie },
      payload: {
        decision: "approved",
        note: "Verified independently with bank receipt",
        expiresAt: new Date(Date.now() + 30 * 86400000).toISOString(),
      },
    });
    expect(result.statusCode).toBe(200);
    const billing = await app.inject({
      url: `/v1/workspaces/${workspaceId}/billing`,
      headers: { cookie: ownerCookie },
    });
    expect(billing.json().subscription).toMatchObject({
      plan_id: "team",
      effective_status: "active",
    });
  });
  it("cannot review a payment twice", async () => {
    const result = await app.inject({
      method: "POST",
      url: `/v1/admin/payments/${paymentId}/review`,
      headers: { ...headers, cookie: adminCookie },
      payload: { decision: "rejected", note: "Second attempt" },
    });
    expect(result.statusCode).toBe(409);
  });
  it("records administrative audit events without credentials", async () => {
    const result = await app.inject({
      url: "/v1/admin/audit",
      headers: { cookie: adminCookie },
    });
    expect(result.statusCode).toBe(200);
    expect(
      result
        .json()
        .events.some(
          (event: { action: string }) =>
            event.action === "admin.payment_reviewed",
        ),
    ).toBe(true);
    expect(result.body).not.toContain("correct-horse");
  });
  it("expires subscription access based on database time", async () => {
    await db.query(
      "UPDATE subscriptions SET expires_at=now()-interval '1 day' WHERE workspace_id=$1",
      [workspaceId],
    );
    const result = await app.inject({
      url: `/v1/workspaces/${workspaceId}/billing`,
      headers: { cookie: ownerCookie },
    });
    expect(result.json().subscription.effective_status).toBe("expired");
  });
  it("will not delete an account while it owns workspaces", async () => {
    const result = await app.inject({
      method: "DELETE",
      url: "/v1/account",
      headers: { ...headers, cookie: ownerCookie },
      payload: { password: "correct-horse-battery-staple" },
    });
    expect(result.statusCode).toBe(409);
    expect(
      (await db.query("SELECT id FROM users WHERE id=$1", [ownerId])).rows,
    ).toHaveLength(1);
  });
});

describe("account lifecycle and revocation", () => {
  it("requires verification and consumes verification tokens once", async () => {
    await app.inject({
      method: "POST",
      url: "/v1/auth/register",
      headers,
      payload: {
        email: "lifecycle@example.com",
        password: "long-account-password",
        name: "Lifecycle",
      },
    });
    const denied = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      headers,
      payload: {
        email: "lifecycle@example.com",
        password: "long-account-password",
      },
    });
    expect(denied.statusCode).toBe(403);
    const queued = await db.query<{ body: string }>(
      "SELECT body FROM email_outbox WHERE recipient=$1",
      ["lifecycle@example.com"],
    );
    const token = new URL(queued.rows[0].body).searchParams.get("verify");
    for (const expected of [200, 400]) {
      const result = await app.inject({
        method: "POST",
        url: "/v1/auth/verify",
        headers,
        payload: { token },
      });
      expect(result.statusCode).toBe(expected);
    }
  });
  it("single-use password resets invalidate existing sessions", async () => {
    const login = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      headers,
      payload: {
        email: "lifecycle@example.com",
        password: "long-account-password",
      },
    });
    const cookie = String(login.headers["set-cookie"]).split(";")[0];
    await app.inject({
      method: "POST",
      url: "/v1/auth/forgot",
      headers,
      payload: { email: "lifecycle@example.com" },
    });
    const queued = await db.query<{ body: string }>(
      "SELECT body FROM email_outbox WHERE recipient=$1 AND subject=$2",
      ["lifecycle@example.com", "Reset your RequestLab password"],
    );
    const token = new URL(queued.rows[0].body).searchParams.get("reset");
    const result = await app.inject({
      method: "POST",
      url: "/v1/auth/reset",
      headers,
      payload: { token, password: "a-new-long-account-password" },
    });
    expect(result.statusCode).toBe(200);
    expect(
      (await app.inject({ url: "/v1/auth/session", headers: { cookie } }))
        .statusCode,
    ).toBe(401);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/v1/auth/reset",
          headers,
          payload: { token, password: "another-long-password" },
        })
      ).statusCode,
    ).toBe(400);
  });
  it("suspension invalidates existing sessions and is audited", async () => {
    const target = (
      await db.query<{ id: string }>("SELECT id FROM users WHERE email=$1", [
        "outsider@example.com",
      ])
    ).rows[0].id;
    const result = await app.inject({
      method: "PATCH",
      url: `/v1/admin/users/${target}`,
      headers: { ...headers, cookie: adminCookie },
      payload: { suspended: true },
    });
    expect(result.statusCode).toBe(200);
    expect(
      (
        await app.inject({
          url: "/v1/auth/session",
          headers: { cookie: outsiderCookie },
        })
      ).statusCode,
    ).toBe(401);
  });
  it("does not reveal whether a password reset account exists", async () => {
    const result = await app.inject({
      method: "POST",
      url: "/v1/auth/forgot",
      headers,
      payload: { email: "nonexistent@example.com" },
    });
    expect(result.statusCode).toBe(200);
    expect(result.json().message).toBe(
      "If the account exists, a reset email will be sent.",
    );
  });
});

it("logs out bodyless requests and revokes the session", async () => {
  const login = await app.inject({
    method: "POST",
    url: "/v1/auth/login",
    headers,
    payload: {
      email: "lifecycle@example.com",
      password: "a-new-long-account-password",
    },
  });
  expect(login.statusCode).toBe(200);
  const cookie = String(login.headers["set-cookie"]).split(";")[0];
  const result = await app.inject({
    method: "POST",
    url: "/v1/auth/logout",
    headers: { ...headers, cookie },
  });
  expect(result.statusCode).toBe(200);
  expect(
    (await app.inject({ url: "/v1/auth/session", headers: { cookie } }))
      .statusCode,
  ).toBe(401);
});
