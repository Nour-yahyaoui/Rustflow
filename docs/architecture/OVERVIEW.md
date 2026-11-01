# Architecture

## Boundaries

```text
React UI ──Tauri IPC──> Rust commands ──> application HTTP/WebSocket/storage services
                                      ├─ Reqwest + Rustls → user-selected destinations
                                      ├─ SQLite → local workspace + request index
                                      └─ OS keyring → protected credential values

Development only: React → same-origin /__native → Node fetch + SQLite

Next.js portal → same-origin /api/v1 → Fastify domain routes → PostgreSQL
                                                            └─ email outbox → SMTP worker
```

The development bridge is not compiled into frontend artifacts. Browser test results do not prove the native engine works. There is no cloud-side arbitrary request executor and no desktop access to the production database.

### Desktop domains

- `packages/shared`: Zod contracts, request preparation, deterministic variable resolution, and sanitized exports.
- `components`: sidebar, request configuration, response inspection, environments, tests, WebSocket, documentation, and settings. UI state orchestration stays in `App.tsx`.
- `lib/bridge`: the only HTTP/storage runtime selector. Native IPC is selected by the presence of Tauri internals; absence selects the explicit development bridge, not a silent native fallback.
- `src-tauri/src/http.rs`: reusable TLS client, bounded streaming read, cancellation, timeout, manual redirect policy, and categorized errors.
- `storage.rs`: migrations, integrity checks, atomic workspace/index writes, credential indirection, and vault hydration on a blocking task.
- `websocket.rs`: bounded message/frame sizes and channels; asynchronous connection lifecycle.
- `workers/test.worker.ts`: QuickJS module loaded from bundled WASM. Test scripts run in a VM with no host I/O inside a separate worker. Runtime memory: 16 MiB; stack: 512 KiB; evaluation: 500 ms; worker lifetime watchdog: 2 seconds. Synchronous assertions only; async tests explicitly fail rather than silently passing.

UI persistence is debounced by 450 ms. Saves are serialized. A native close handler flushes the latest state before destroying the window. Browser preview warns on closing with a pending save. Native window dimensions are handled by the window-state plugin; layout/theme/environment preferences live in SQLite. These native behaviors await OS-level verification.

### Cloud domains

Fastify authorization helpers are constructed once in `app.ts`; domain route modules receive a typed context. Authentication, workspaces/membership, sync/collaboration, billing, and administration have separate route modules. Next renders a modular portal backed by a shared controller; no frontend admin claim authorizes a server action.

The Next adapter normally hosts the API in the same process. The standalone Fastify entry point is an alternative for a reverse-proxied deployment, not an additional public bypass. PostgreSQL connections are pooled (maximum ten per process). Sessions and email action tokens are random 256-bit tokens stored as SHA-256 digests; password hashes use scrypt (N=32768, r=8, p=1, 64-byte derived key, random 16-byte salt).

### Change protocol

A mutation includes `operationId`, `entityId`, `kind`, `expectedVersion`, `data`, and `deleted`. A PostgreSQL transaction locks the workspace row, rechecks membership/role, detects replay, checks the entity version, increments the workspace revision, and writes entity/change/idempotency/audit records together. Replaying the same operation returns its original result. Reusing the operation ID with another payload or actor returns 409. A stale version returns 409 rather than overwriting data. Clients pull an ordered page after a revision and resolve conflicts explicitly.

The server protocol is implemented and tested. The native offline queue table exists, but there is **no desktop sync worker, authentication handshake, retry queue consumer, conflict UI, or automated background upload** yet. The cloud screen says so. No secret encryption model is invented; obvious secrets are rejected and encrypted secret upload is unavailable.

### Deliberate limitations

- Local persistence is a versioned JSON aggregate plus indexed request documents. Not all target domains have normalized local tables.
- Global → environment precedence is implemented. Workspace/collection/request variable scopes are not wired.
- Large responses are limited, JSON tree siblings are capped at 200, and rendered text at 5,000 lines; this is bounded rendering, not a full virtualized editor.
- Bodies, descriptions, scripts, and URLs can contain arbitrary sensitive data and are not comprehensively classified.
- The styling system combines Tailwind with custom CSS tokens and small shadcn-style/Radix primitives; the full shadcn catalog is not installed.
- Native connection reuse is explicit; preview transport uses Node's fetch pool. Native cross-origin redirects are always rejected; preview redirects strip known credentials and reject unsafe custom headers/downgrades.
- Native code, migration error paths, installer integration, and vault behavior require compilation and testing on all supported systems.
