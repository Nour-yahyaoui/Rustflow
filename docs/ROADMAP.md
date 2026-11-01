# Feature status — 2026-11-01

“Implemented” here describes code plus the explicitly named verification level, not commercial readiness. The original enterprise specification is **not fully complete**.

## Verified in this environment

- React/Vite frontend build; Next.js portal production build; strict desktop/API TypeScript.
- Real Node-preview HTTP execution; request cancellation; local SQLite persistence/reload; workspace export.
- Request builder, collections, environments, navigation, themes, context menus, command palette code.
- Post-response QuickJS isolation/assertions, missing-I/O tests, infinite-loop interrupt, rejection of unsupported async tests.
- Sequential collection runs and JSON test-report export.
- Real browser WebSocket exchange; OpenAPI 3.0 JSON import/basic export workflow.
- Offline-packaged Monaco editor loads and accepts content in Chromium.
- PostgreSQL-WASM-backed API auth/verification/reset/revocation, tenant isolation, roles, comments, sync CAS/idempotency, billing/admin checks, and expiry.
- Automated axe WCAG A/AA scan of the initial dark workspace. This is not a full accessibility certification.
- npm dependency audit: no reported advisories at the final check; advisory databases change over time.

## Implemented but unverified on native/production infrastructure

- Rust Reqwest/Rustls execution, bounded streaming read, cancellation and categorized network errors.
- Rust SQLite migrations/integrity checks/transactional writes; OS-keyring indirection.
- Native WebSocket transport, handshake headers, bounded frames/messages/channels.
- Tauri capabilities/CSP, external URL opener, window-state persistence, and save-before-close handling.
- Native HTTP integration/storage tests (source present, not run).
- PostgreSQL server deployment, Next-to-PostgreSQL production integration, advisory-lock migration execution, and production concurrency.
- Docker images/Compose, SMTP relay delivery, reverse-proxy/HTTPS, disaster recovery.
- CI and unsigned target-OS artifact workflow (configured, not executed here).

## Partial implementations

- **Collections:** create/rename/delete, move/duplicate/reorder requests. No nested folder/project model, saved examples, full collection descriptions editor, or undo stack.
- **Bodies/auth:** raw JSON/XML/text/urlencoded, basic/bearer/API-key headers. No multipart builder, binary request upload, OAuth2/refresh, native cookie jar manager, proxy UI, or per-request TLS configuration.
- **Responses:** bounded pretty/raw/tree JSON and text, headers/cookies, search/copy/download. No HTML rendering/XML tree, full virtualization, live streamed UI, complete response persistence, or response schema inference.
- **Variables:** global/environment scopes and recursive resolution; vault-protected native known secret fields. No collection/workspace/request scopes or encrypted cloud secrets.
- **Tests:** synchronous assertions, post-response scripts, sequential runs and report export. No pre-request script hooks, chained environment writes, persistent suite/run history, async testing, or advanced JSON-schema assertions.
- **OpenAPI:** 3.0/3.1 JSON subset, descriptions/query/header parameters/body examples, basic 3.0.3 export. No YAML, external `$ref`, full schemas/security definitions, robust round-tripping, version history, or hosted public/private docs.
- **Cloud sync:** server change protocol and reserved local queue schema. **No desktop login handoff, queue worker, retry/backoff, conflict-resolution UI, or background synchronization.**
- **Cloud commerce:** actual manual review/subscription records, status/expiry/cancellation/member-admission limits. Full entitlements, quotas, legal retention, pricing/commercial policies, and downgrade reconciliation need product decisions and implementation.
- **Admin/operations:** accounts/suspension, payment review/config/plans, audit API/UI, count/health API. No support-ticket workflow, feature flags, usage analytics, admin workspace browser, alert integrations, or full session management UI.
- **Persistence/performance:** aggregate SQLite document plus request index; autosave and render limits. No fully normalized local domain schema, database upgrade matrix, encrypted portable secret backups, large-list virtualization, or native performance baseline.

## Not implemented / release gates

- Mock servers and mock-server navigation (intentionally absent rather than a placeholder).
- Postman/Insomnia/Bruno import/export compatibility.
- Multiple native windows, desktop deep-link authentication, app updater, signed/notarized installers, real distribution releases.
- Object storage/upload service, real-time collaboration/presence, scheduled API tasks.
- Distributed rate limiting, comprehensive quotas/retention, observability/alerting vendor integration, complete enterprise audit/privacy policies.
- Independent security assessment, broad screen-reader/native accessibility checks, native OS E2E matrix, extensive crash/concurrency/large-workspace testing.

The most important next milestone is a verified native build and OS-level integration suite, followed by the desktop sync/auth/conflict workflow. Do not market the current beta as meeting the full production definition of done.
