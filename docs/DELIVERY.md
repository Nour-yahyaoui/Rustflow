# RequestLab engineering delivery report

**Date:** 2026-11-01 · **Version:** 0.1.0 engineering beta · **Repository:** Nour-yahyaoui/Rustflow

## 1. Delivered functionality

The repository previously contained only `README.md`. It now includes a functional local-first request workspace, explicit native transport/storage sources, and a separate cloud portal/API.

### Verified working paths

- Create/edit/send a real HTTP request, inspect status/headers/body, run isolated assertions, cancel, reload persisted requests, and export a workspace.
- Manage collections and environment variables; switch tools/themes; load/edit with offline Monaco assets.
- Run requests sequentially with actual HTTP responses and export test results.
- Connect/send/receive/disconnect against an actual local WebSocket server.
- Import OpenAPI JSON endpoints/documentation and export a basic OpenAPI document.
- API registration/verification/login/reset/logout/session revocation, tenant isolation/roles, versioned/idempotent changes, comments, subscriptions, manual payment review, admin authorization, audit, and expiration against real PostgreSQL compiled to WASM.

These are not claims that the full enterprise specification is finished. The native app and deployed SaaS end-to-end path remain unverified.

## 2. Repository structure

```text
apps/desktop/src/                   Modular React UI, editors, tools, IPC, sandbox worker
apps/desktop/src-tauri/             Rust HTTP/storage/vault/WebSocket runtime, migrations, ACLs, icons
apps/web/app/                       Next.js account/team/billing/admin portal and API adapter
services/api/src/routes/            Auth, workspaces, sync, billing, and admin boundaries
services/api/src/                   Database/pooling, security helpers, migrations, outbox jobs
packages/shared/src/                Typed request/workspace contracts and shared transformations
database/migrations/                Cloud PostgreSQL schema
infrastructure/docker/              Web/service Dockerfiles
infrastructure/deployment/          HTTPS reverse-proxy example
.github/workflows/                  Quality and unsigned OS artifact builds
tests/                             Core, API, and browser E2E suites
docs/                              Architecture, API, deployment, security, screenshots, roadmap
tools/                             Preview bridge, test-browser fallback, benchmarks
```

## 3. Technology choices

Tauri 2 + Rust stable/Tokio/Reqwest/Rustls/Rusqlite/keyring; React 19 + strict TypeScript/Vite/Tailwind, custom design tokens, small shadcn-style/Radix primitives, Lucide/Motion, lazy Monaco; bounded QuickJS WASM inside a worker; Next.js + Fastify + PostgreSQL + SMTP outbox. The browser development runtime intentionally substitutes Node fetch/SQLite for unavailable native tooling, clearly labeled in the interface and documentation. It is never shipped as a cloud request executor.

## 4. Database overview

Local: atomic versioned workspace aggregate, indexed request documents, migration marker, reserved preferences/queue tables. Native secrets use OS vault references, not plaintext secret fields in SQLite. Preview uses development-only plaintext SQLite. The target fully normalized local model is not complete.

Cloud: users/sessions/action tokens, workspaces/memberships/invitations, entities/changes/idempotency operations, comments/audit, plans/subscriptions/payments/configuration, and email outbox. UUIDs, compound tenant keys, constraints, indexes, parameterized SQL, and transactions are implemented. See [database documentation](architecture/DATABASE.md).

## 5. Run and build the desktop

From repository root:

```bash
npm ci
npm run dev             # runnable browser workspace on port 5173
npm run desktop         # native development; requires Rust and platform prerequisites
npm run desktop:build   # target-OS executable/installers; requires native build toolchain
```

Platform requirements and output paths: [DESKTOP.md](deployment/DESKTOP.md).

The installer build was actually attempted and failed at `cargo metadata` because Cargo does not exist in this environment. **No native binary or installer has been generated.** Rust source syntax was parsed/formatted through a WASM formatter; that is not compilation or native execution.

## 6. Run/deploy SaaS

```bash
# After privately configuring an actual PostgreSQL DB and SMTP relay:
npm run db:migrate
npm run dev:web
npm run jobs

# Production frontend/server compilation:
npm run build:web
# Prepared container deployment (not executed here):
docker compose build
docker compose up -d
```

Cloud ingress, actual SMTP verification, PostgreSQL-server integration, backups, and admin provisioning need owner actions. Follow [CLOUD.md](deployment/CLOUD.md); do not deploy the Vite bridge.

## 7. Environment requirements

`DATABASE_URL`, exact `APP_ORIGIN`, `SMTP_URL`, `MAIL_FROM`, `NODE_ENV`, and optional `PORT`. Compose also needs privately generated `POSTGRES_PASSWORD`, with optional `POSTGRES_USER`/`POSTGRES_DB`. Enable `TRUST_PROXY_IP` only behind a trusted ingress. `TEST_DATABASE_URL` must point only to a disposable database. `VITE_CLOUD_PORTAL_URL` is an optional public portal link, not cloud-sync credentials. `.env.example` contains no real secrets.

## 8. Actual test/build execution

| Check                                               | Actual result                                                                 |
| --------------------------------------------------- | ----------------------------------------------------------------------------- |
| `npm run typecheck`                                 | Passed (strict desktop + API TypeScript)                                      |
| `npm test`                                          | **41 passed**: 14 shared/core/sandbox tests + 27 API integration tests        |
| `REQUESTLAB_SANDBOX_BROWSER=1 npm run test:e2e`     | **6 passed**, Chromium, real HTTP/WebSocket servers; no mocked response proof |
| Initial workspace axe scan                          | Passed automated WCAG 2 A/AA rules; scope is not a complete product audit     |
| `npm run build`                                     | Passed; frontend and offline worker/editor assets generated                   |
| `npm run build:web`                                 | Passed; dynamic portal/admin/account/API routes compiled                      |
| `npm audit --audit-level=low`                       | Zero reported vulnerabilities at final check                                  |
| `npm run format:check`                              | Passed after formatting                                                       |
| `npm run benchmark`                                 | Executed; see below                                                           |
| `npm run desktop:build`                             | **Blocked/failed:** Cargo missing before native compilation                   |
| Rust tests/Clippy/dependency audit                  | **Not run:** no Rust/Cargo                                                    |
| PostgreSQL-server CI variant                        | Configured; **not run here** (PGlite integration variant passed)              |
| Docker image/build/runtime validation               | **Not run:** Docker unavailable                                               |
| SMTP delivery, deployed HTTPS, signing/notarization | **Not performed:** owner services/credentials required                        |
| GitHub Actions and target-OS workflows              | Configured, **not executed in this session**                                  |

Native HTTP test sources use a real TCP HTTP server; they have **not** run. Browser test success is not evidence for the Rust engine.

Microbenchmark execution on this sandbox: 10,000 nested variable resolutions in 16.68 ms; 100 sanitized exports of 1,000 requests in 11.08 ms. These numbers describe only that run/machine, not a startup, FPS, RAM, or production-performance guarantee. Monaco is lazy-loaded but still produces large build chunks; further bundle/render profiling is needed.

## 9. Security controls

TLS verification; native redirect isolation; bounded response reads and cancellation; strict local CSP/capabilities; worker+VM script isolation with CPU/memory limits and no I/O; vault-backed native known credential fields; secret-aware exports; no response-body persistence; redacted runtime logging; scrypt; hashed, finite HttpOnly sessions; single-use email tokens; exact-origin/header CSRF protection; request schemas/limits; parameterized SQL; server-side tenant/admin checks; transactional CAS/idempotency and manual approvals; explicit expiry; no cards, cloud executor, or automatic secret upload. This is implementation review, not independent certification. Full threat-model caveats are documented.

## 10. Known limitations

The most important missing workflow is **desktop authentication/background cloud synchronization**: the server change API exists, but no desktop queue consumer, retry engine, auth handoff, or conflict-resolution UI is connected. Native execution/vault/packaging remains unverified. OAuth2, multipart/binary request uploads, mocks, full OpenAPI/schema round-tripping, hosted docs, pre-request scripts, advanced scopes, fully normalized local tables, complete premium entitlements, distributed abuse controls, observability integrations, and broad OS E2E coverage are absent or partial. See the [complete status ledger](ROADMAP.md).

## 11. Owner credentials/actions still needed

- Rust/platform build tooling; Cargo dependency resolution and review/commit of Cargo.lock.
- Windows/macOS/Linux compilation, native tests, vault/webview/CSP verification, and clean-machine installer QA.
- Real PostgreSQL, SMTP sender/relay, owned hostname/DNS/HTTPS, secret management, off-host backups, and staging restore tests.
- Register/verify the owner account, explicitly grant admin via operator CLI, choose pricing/commercial/retention policies, and independently verify actual manual payments. Default contact is **56668672**; no real transaction was submitted or approved here.
- Review CI runs; provision platform signing/notarization certificates only through trusted secret storage if releasing.
- Independent security/privacy/accessibility assessment before production use.

## 12. Artifacts actually generated

- `apps/desktop/dist/`: built React UI, Monaco workers/fonts, QuickJS WASM and worker assets (ignored build output, reproducible via command).
- `apps/web/.next/`: production Next.js build/standalone output (ignored, reproducible).
- `apps/desktop/src-tauri/icons/`: application icons generated from `docs/icon.svg`.
- `docs/screenshots/workspace.png`, `docs/screenshots/request.png`: screenshots taken from running browser tests.
- Source code, dependency lockfile, SQL migrations, tests, workflow and deployment configuration, and documentation.

**Not generated:** signed/unsigned native installers, deployed SaaS resources, real verification emails, actual payment confirmations, or a production release.

### Handoff conclusion

This is a substantial working beta implementation with real, tested workflows—not a static UI shell. It does **not** satisfy the full enterprise production definition of done. The remaining gaps are explicit rather than hidden behind simulated controls or invented deployment results.
