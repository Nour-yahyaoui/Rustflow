// Development-only native bridge. Not shipped in the desktop build or cloud service.
import type { Plugin } from "vite";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { requestSchema, workspaceSchema } from "../packages/shared/src";
export function previewBridge(): Plugin {
  return {
    name: "requestlab-preview-bridge",
    configureServer(server) {
      mkdirSync(resolve(".data"), { recursive: true });
      const db = new DatabaseSync(resolve(".data/preview.db"));
      db.exec(
        "PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS state (id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL);",
      );
      server.middlewares.use("/__native", async (req, res) => {
        res.setHeader("Content-Type", "application/json");
        res.setHeader("Cache-Control", "no-store");
        const json = (status: number, data: unknown) => {
          if (!res.destroyed) {
            res.statusCode = status;
            res.end(JSON.stringify(data));
          }
        };
        try {
          if (req.headers["x-requestlab-client"] !== "preview")
            return json(403, { error: "Preview client header required" });
          if (
            req.headers.origin &&
            new URL(req.headers.origin).host !== req.headers.host
          )
            return json(403, { error: "Cross-origin request denied" });
          if (req.url === "/state" && req.method === "GET") {
            const row = db
              .prepare("SELECT data FROM state WHERE id=1")
              .get() as { data: string } | undefined;
            return json(200, row ? JSON.parse(row.data) : null);
          }
          let body = "";
          for await (const chunk of req) {
            body += chunk.toString();
            if (Buffer.byteLength(body) > 12_000_000)
              return json(413, { error: "Payload too large" });
          }
          if (req.url === "/state" && req.method === "PUT") {
            const data = workspaceSchema.parse(JSON.parse(body));
            db.prepare(
              "INSERT INTO state(id,data) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data",
            ).run(JSON.stringify(data));
            return json(200, { ok: true });
          }
          if (req.url === "/execute" && req.method === "POST") {
            const input = requestSchema.parse(JSON.parse(body));
            let url = new URL(input.url);
            if (
              !["http:", "https:"].includes(url.protocol) ||
              url.username ||
              url.password
            )
              throw new Error("Invalid HTTP destination");
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), input.timeoutMs);
            res.on("close", () => controller.abort());
            const headers = new Headers();
            for (const h of input.headers)
              if (h.enabled && h.key) headers.append(h.key, h.value);
            const started = performance.now();
            let method = input.method;
            let requestBody =
              ["GET", "HEAD"].includes(method) || input.bodyType === "none"
                ? undefined
                : input.body;
            try {
              let response: globalThis.Response | undefined;
              for (let redirects = 0; redirects <= 10; redirects++) {
                response = await fetch(url, {
                  method,
                  headers,
                  body: requestBody,
                  redirect: "manual",
                  signal: controller.signal,
                });
                const location = response.headers.get("location");
                if (
                  !input.followRedirects ||
                  !location ||
                  ![301, 302, 303, 307, 308].includes(response.status)
                )
                  break;
                await response.body?.cancel();
                if (redirects === 10) throw new Error("Too many redirects");
                const next = new URL(location, url);
                if (
                  !["http:", "https:"].includes(next.protocol) ||
                  next.username ||
                  next.password
                )
                  throw new Error("Unsafe redirect");
                if (next.origin !== url.origin) {
                  for (const name of [
                    "authorization",
                    "cookie",
                    "proxy-authorization",
                    "x-api-key",
                  ])
                    headers.delete(name);
                  if (
                    [...headers.keys()].some(
                      (k) =>
                        !["accept", "content-type", "user-agent"].includes(k),
                    )
                  )
                    throw new Error(
                      "Cross-origin redirect with custom headers requires explicit follow-up",
                    );
                }
                if (url.protocol === "https:" && next.protocol === "http:")
                  throw new Error("HTTPS downgrade redirect blocked");
                if (
                  response.status === 303 ||
                  ([301, 302].includes(response.status) && method === "POST")
                ) {
                  method = "GET";
                  requestBody = undefined;
                  headers.delete("content-type");
                }
                url = next;
              }
              if (!response) throw new Error("No response");
              const chunks: Uint8Array[] = [];
              let size = 0;
              let truncated = false;
              const limit = 5 * 1024 * 1024;
              if (response.body) {
                const reader = response.body.getReader();
                while (true) {
                  const { done, value } = await reader.read();
                  if (done) break;
                  const remaining = limit - size;
                  chunks.push(value.subarray(0, remaining));
                  size += Math.min(value.length, remaining);
                  if (value.length > remaining || size >= limit) {
                    truncated = true;
                    await reader.cancel();
                    break;
                  }
                }
              }
              const bytes = Buffer.concat(chunks);
              return json(200, {
                status: response.status,
                statusText: response.statusText,
                headers: [...response.headers],
                body: bytes.toString("utf8"),
                base64: bytes.toString("base64"),
                durationMs: Math.round(performance.now() - started),
                size,
                truncated,
                url: url.toString(),
              });
            } finally {
              clearTimeout(timer);
            }
          }
          if (req.url === "/echo" && req.method === "POST")
            return json(200, {
              received: JSON.parse(body),
              message: "RequestLab local echo server",
            });
          if (req.url === "/health")
            return json(200, {
              status: "ok",
              engine: "Node preview bridge (not Rust)",
            });
          return json(404, { error: "Unknown preview command" });
        } catch (error) {
          json(400, {
            error: error instanceof Error ? error.message : "Request failed",
          });
        }
      });
      server.httpServer?.on("close", () => db.close());
    },
  };
}
