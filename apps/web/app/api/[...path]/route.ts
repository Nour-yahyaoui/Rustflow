import { createApp } from "@requestlab/api";
import { database } from "../../../../../services/api/src/db";
import type { FastifyInstance, HTTPMethods } from "fastify";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
let application: Promise<FastifyInstance> | undefined;
async function handler(request: Request) {
  if (!process.env.DATABASE_URL || !process.env.APP_ORIGIN)
    return Response.json(
      {
        error:
          "Cloud service is not configured. Set DATABASE_URL and APP_ORIGIN and apply migrations.",
      },
      { status: 503 },
    );
  application ??= createApp(database(process.env.DATABASE_URL), {
    origin: process.env.APP_ORIGIN,
    production: process.env.NODE_ENV === "production",
  }).catch((error) => {
    application = undefined;
    throw error;
  });
  try {
    const app = await application;
    const url = new URL(request.url);
    let body: string | undefined;
    if (!["GET", "HEAD"].includes(request.method) && request.body) {
      const reader = request.body.getReader();
      const decoder = new TextDecoder();
      let total = 0;
      body = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > 1024 * 1024) {
          await reader.cancel();
          return Response.json(
            { error: "Payload exceeds 1 MiB limit" },
            { status: 413 },
          );
        }
        body += decoder.decode(value, { stream: true });
      }
      body += decoder.decode();
    }
    const result = await app.inject({
      method: request.method as HTTPMethods,
      url: url.pathname.replace(/^\/api/, "") + url.search,
      headers: {
        cookie: request.headers.get("cookie") ?? "",
        origin: request.headers.get("origin") ?? "",
        ...(body
          ? {
              "content-type":
                request.headers.get("content-type") ?? "application/json",
            }
          : {}),
        "x-requestlab-client": request.headers.get("x-requestlab-client") ?? "",
      },
      payload: body || undefined,
      remoteAddress:
        process.env.TRUST_PROXY_IP === "1"
          ? (request.headers.get("x-real-ip") ?? "127.0.0.1")
          : "127.0.0.1",
    });
    const headers = new Headers();
    for (const [key, value] of Object.entries(result.headers))
      if (value !== undefined) {
        if (Array.isArray(value))
          for (const item of value) headers.append(key, item);
        else headers.set(key, String(value));
      }
    return new Response(result.body, { status: result.statusCode, headers });
  } catch {
    console.error(JSON.stringify({ event: "cloud.adapter_unavailable" }));
    return Response.json(
      {
        error:
          "Cloud service unavailable. Check database connectivity and server logs.",
      },
      { status: 503 },
    );
  }
}
export { handler as GET, handler as POST, handler as PATCH, handler as DELETE };
