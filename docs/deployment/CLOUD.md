# Cloud deployment and recovery

This is a deployable configuration requiring staging validation, not evidence of a deployed service. No production hostname, SMTP credentials, database, or signing keys were invented.

## Configuration

Copy `.env.example` to `.env` (ignored by Git). Required values:

| Variable                       | Purpose                                                                                                     |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                 | PostgreSQL connection string for CLI/standalone service; use TLS and a least-privilege application role     |
| `APP_ORIGIN`                   | Exact browser-facing origin, no trailing slash; production must be HTTPS except local development           |
| `SMTP_URL`                     | Authenticated SMTPS or STARTTLS-enforcing relay connection URL                                              |
| `MAIL_FROM`                    | Verified sender allowed by that relay                                                                       |
| `POSTGRES_PASSWORD`            | Strong locally generated Compose database password; use URI-safe hex characters or URL-encode appropriately |
| `POSTGRES_USER`, `POSTGRES_DB` | Compose database identity (not credentials shipped with the repository)                                     |
| `TRUST_PROXY_IP`               | `1` only for an inaccessible backend behind an ingress that overwrites X-Real-IP; otherwise leave `0`       |
| `NODE_ENV`                     | `production` for secure cookies and production behavior                                                     |
| `PORT`                         | Standalone API listen port; default 3001                                                                    |
| `TEST_DATABASE_URL`            | Test-only empty disposable database; never production                                                       |

No JWT signing secret is needed: sessions are opaque random tokens stored as digests. Database and SMTP secrets must come from a deployment secret manager, not an image, repository, client bundle, or chat.

## Local development with your PostgreSQL

```bash
npm ci
# Export your configuration; Next auto-loads app-local .env files, not the repository root .env.
set -a; . ./.env; set +a
npm run db:migrate
npm run dev:web
# Separate shell with exported configuration:
npm run jobs
```

Without SMTP, registration can enqueue verification mail but the user cannot complete the normal email workflow. Do not bypass verification to pretend delivery worked. Configure and test the relay.

## Docker Compose

1. Install Docker Engine/Compose on a staging host.
2. Create a strong password, for example using `openssl rand -hex 32`, and populate `.env` privately.
3. Supply a real HTTPS `APP_ORIGIN`, SMTP relay, and sender.
4. Run:

```bash
docker compose build
docker compose up -d
docker compose ps
docker compose logs --tail=100 migrate web jobs
```

Database and web ports bind only to loopback. The migration service waits for database health and gates application startup. Images run as the non-root Node user. Persistent database data uses a named volume. `TRUST_PROXY_IP=1` in this topology assumes an authenticated/local ingress overwrites the header. Do not change web binding to a public address without re-evaluating this trust.

Place an HTTPS reverse proxy in front of port 3000. The Caddy example is `infrastructure/deployment/Caddyfile`; set `PUBLIC_HOST` to a hostname you own, configure DNS, install Caddy, and allow only required ingress ports. For managed hosting, provide equivalent origin, HTTPS, header, connection-pooling, and shared rate-limit guarantees. The web portal uses same-origin `/api/v1`; never configure browser calls to a remote machine's localhost.

A separate Fastify server image is available for dedicated API hosting. If using it, proxy `/api/v1` to `/v1` and do not leave both adapters publicly exposed as independent limiter entrances. Current Docker Compose uses the Next adapter and only uses the API image for migration/jobs.

## First administrator and billing

Register and verify the intended owner's email. No default administrator exists.

```bash
# Host with application database configuration:
npx tsx services/api/src/admin.ts YOUR_VERIFIED_ADMIN_EMAIL
# Or in the migration/service image:
docker compose run --rm migrate node services/api/dist/admin.js YOUR_VERIFIED_ADMIN_EMAIL
```

Open `/admin`, sign in, and verify admin authorization. Default manual contact is **56668672**. Administrators may update it and set plan/member/pricing configuration. Prices are intentionally unset until the owner chooses them. References remain pending until independently checked and explicitly approved/rejected with a note. Approval requires a future expiry within 366 days. No actual payment is processed by this system.

Administrator bootstrap currently updates the role via an operator CLI and is not itself recorded in the in-app audit table. Restrict access to the CLI and preserve operator/deployment audit logs. A future break-glass role-management workflow needs explicit design.

## Operations

- Health: `GET /api/v1/health` (database connectivity included).
- API errors emit sanitized JSON metadata; configure log collection/retention and alerting.
- Monitor database connection use, latency/error rates, disk growth, email queue attempts, pending payments, TLS expiration, and backup completion.
- Email delivery is at least once: a worker locks an outbox row, sends mail with a stable Message-ID, then marks it delivered. Failed sends back off exponentially (capped at one hour, eight attempts). SMTP acceptance followed by a DB failure may produce duplicate mail. Monitor exhausted rows; there is no dead-letter UI yet.
- Process-local rate limits are not sufficient for a multi-instance deployment. Add an edge policy/shared store before scaling; ensure client IP provenance is trusted.
- Plan/member admission is enforced; existing members are not silently removed on expiration. Complete premium entitlements/quotas and commercial policy before selling access.
- No object-storage service, telemetry vendor, external error-reporting integration, or scheduled API-request execution is configured.

## Backup, rollback, and recovery

1. Provision encrypted off-host PostgreSQL backups and, for production, point-in-time recovery. Restore-test regularly.
2. Before applying a new migration, snapshot the database and record schema/application versions.
3. On incidents, stop writes and preserve logs/backups. Restore to a **new** database, verify integrity, run integration smoke tests, and switch the secret-managed URL only after approval.
4. Roll back application images only when schema compatibility is established; no destructive down-migration is supplied.
5. If account/session credentials are compromised, suspend affected accounts or delete their session records through authorized operator procedures. Password reset invalidates existing sessions.
6. Recover admin access using the restricted bootstrap CLI only after verifying the owner's identity.

Docker images, HTTPS, actual SMTP delivery, real PostgreSQL-server concurrency, and disaster-recovery procedures were not executable in the supplied sandbox and require human staging verification.
