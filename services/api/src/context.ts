import type { FastifyRequest } from "fastify";
import type { Connection, Database } from "./db";
export interface ApiConfig {
  origin: string;
  production: boolean;
  sessionDays?: number;
}
export type User = {
  id: string;
  email: string;
  display_name: string;
  is_admin: boolean;
  verified_at: string | null;
};
export type Member = { role: "owner" | "admin" | "editor" | "viewer" };
export interface RouteContext {
  db: Database;
  config: ApiConfig;
  dummy: string;
  user: (request: FastifyRequest) => Promise<User>;
  admin: (request: FastifyRequest) => Promise<User>;
  membership: (
    connection: Connection,
    workspaceId: string,
    actor: User,
    roles?: Member["role"][],
  ) => Promise<Member>;
  audit: (
    connection: Connection,
    actor: string | null,
    workspace: string | null,
    action: string,
    details?: Record<string, unknown>,
  ) => Promise<void>;
  enqueue: (
    connection: Connection,
    to: string,
    subject: string,
    body: string,
  ) => Promise<void>;
  authToken: (
    connection: Connection,
    actorId: string,
    purpose: "verify" | "reset",
    to: string,
  ) => Promise<void>;
}
