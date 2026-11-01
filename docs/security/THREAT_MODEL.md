# Security model and outstanding review

## Desktop

An API client intentionally reaches user-chosen local and remote servers. The native engine does not apply cloud-style private-IP blocking. UI confirmations warn for HTTP and obvious private/loopback hosts. This is not comprehensive DNS classification or DNS-rebinding prevention. A name can resolve to a private address without triggering that heuristic. Destination control is owned by the desktop user.

Rust validates HTTP(S) destinations, rejects embedded URL credentials and malformed method/headers, verifies TLS, caps response buffering, uses bounded execution, and cancels via explicit tokens. Cross-origin redirects are rejected natively, including HTTPS downgrades. The preview policy strips known credential headers and rejects unsafe custom-header redirects and HTTPS downgrades. Proxy/TLS exception controls are not exposed; disabling certificate verification is not supported.

IPC exposes explicit app commands, not filesystem/process/shell plugins. Local-window capabilities allow events, window close, and http/https external URL opening. The CSP denies frames, objects, arbitrary remote scripts/connections, and forms; bundled WASM requires `wasm-unsafe-eval`, not general JavaScript `unsafe-eval`. Inline styles are permitted for React/Monaco. Verify the CSP and plugin ACLs on actual native builds before release.

Credential vault data does not enter SQLite as plaintext. Unmarked free text is not an encrypted secret store. Response bodies remain in runtime memory and are excluded from persisted history. Logs contain only request method, status, timing, size, and generic failures, never body/credential values. Exports omit known secrets but cannot guarantee that all free-text content is safe to share.

QuickJS receives a serialized response and a synchronous assertion harness, not host functions. No `fetch`, filesystem, process, Node module loader, DOM, or timers are exposed. VM memory/stack/CPU and worker lifetime limits apply. This is stronger than running JavaScript with `eval`, Node `vm`, or a worker alone. It has not been independently audited; WASM/runtime vulnerabilities remain part of dependency management.

## Browser preview

`/__native` exists only in the Vite development server. It can reach the development machine's network and filesystem-backed workspace store. Same-origin/client-header checks mitigate browser CSRF, but **are not authentication** for a publicly reachable server. Protect access with the development platform's authentication or a private network. Never publish it as a cloud request executor. Preview secret storage is plaintext SQLite.

## Cloud

- Passwords: salted memory-hard scrypt; maximum input length; no hardcoded credentials.
- Sessions: random 256-bit token, SHA-256 digest at rest, HttpOnly, SameSite=Strict, Secure in production, finite expiration; suspension/password reset revokes sessions.
- Email tokens: single use, hashed at rest in auth table, expiring. Outbox temporarily contains delivery links until sent. SMTP must be authenticated and encrypted.
- CSRF: exact configured Origin plus a non-simple client header required on every state-changing route. No permissive CORS.
- Authorization: database membership/role checks on every workspace operation; separate server-side admin checks. Ownership transfers are transactional; owners cannot be demoted through ordinary role changes.
- Queries: parameterized SQL; request schemas and payload limits; generic external errors. Internal error logs identify route/request without bodies, tokens, SQL text, or raw error strings.
- Sync: row lock, compare-and-swap version, atomic revision/idempotency/audit writes. Obvious credential fields rejected. No secret synchronization or arbitrary destination execution.
- Billing: references start pending; only authorized admins may review once; explicit approval/expiry needed to activate; audit record committed with activation. No cards or auto-charging.
- Web: React output encoding, nonce-bearing script CSP, no framing, no-referrer, no-sniff, HTTPS guidance.

Rate limiting is process-local. The Next adapter ignores client IP headers unless `TRUST_PROXY_IP=1`. Enable this only behind a private ingress that **overwrites** X-Real-IP (example Caddy config). Multiple instances require a shared rate-limit store/edge policy, stronger abuse handling, and a coordinated deployment design. Forwarded client IPs must never be accepted from the open Internet.

## Production gates still open

1. Compile/lint/test and audit Rust dependencies; generate/review/commit Cargo.lock; exercise OS vault failures, redirects, cancellation, binary responses, and all installers.
2. Run PostgreSQL-server integration and concurrent conflict/ownership/membership stress tests, not only PGlite.
3. Validate containers, email delivery, CSP, cookie behavior, HTTPS ingress, backups/restores, and administrator recovery in a staging deployment.
4. Implement distributed abuse controls before horizontal scaling, quotas/retention, observability/alerting, SMTP dead-letter handling, and detailed operational audit retention.
5. Complete desktop sync authentication/queue/conflict handling before enabling any automatic upload.
6. Perform a dependency/license review, external penetration test, accessibility audit across tools/themes/native webviews, and privacy/data-retention review.
7. Provision code-signing/notarization credentials and release update/rollback policy. There is no signed or auto-update channel today.

No statement in this repository constitutes an independent security certification or a production-readiness guarantee.
