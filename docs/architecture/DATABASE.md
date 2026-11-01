# Data model, migrations, backup, and restore

## Local SQLite

Location: Tauri's application data directory, `requestlab.db`. Browser development uses `.data/preview.db`.

Native migration: `apps/desktop/src-tauri/migrations/001_initial.sql`.

| Table               | Purpose                                                                                                        |
| ------------------- | -------------------------------------------------------------------------------------------------------------- |
| `schema_migrations` | Applied local schema version                                                                                   |
| `workspace_state`   | Single atomic version-1 aggregate: collections, requests, environments, globals, metadata history, preferences |
| `requests`          | Searchable/indexed copy of each protected request; collection index                                            |
| `preferences`       | Reserved key/value table; current UI preferences are in the aggregate                                          |
| `sync_queue`        | Reserved offline-operation shape; no consumer is implemented                                                   |

Foreign keys are enabled; the aggregate does not pretend to have normalized relational foreign keys between each collection/request. WAL, busy timeout, transactions, JSON constraints, and `quick_check` protect the actual persisted model. A schema newer than the application is refused. A load failure blocks the UI instead of replacing existing data with an empty workspace.

Native vault protection replaces secret variables, sensitive-key values, and authentication token/password/API-key values with opaque references before writing SQLite. Request bodies, script text, descriptions, and arbitrary URLs remain normal workspace data. Keyring operations are not transactionally atomic with SQLite: new entries are written before the SQLite transaction and cleaned on failure; old entries are cleaned after commit. A crash between these steps can leave orphaned vault entries. It must not replace credentials with plaintext. Headless Linux without an unlocked Secret Service will fail secret saves explicitly.

The development database deliberately does **not** emulate a secure vault. Keep it free of real secrets.

### Portable backup

Settings → Export workspace produces a sanitized RequestLab JSON document. Secret-marked or obviously sensitive variables, known credential headers/parameters, authentication secrets, and history are omitted. Review all remaining free text before sharing. Settings → Import validates that document, asks for confirmation, and replaces the workspace. This is a portable configuration backup, **not a complete secret backup**.

### Complete same-device backup

1. Close RequestLab, waiting for the saved status/close flush.
2. Use SQLite's backup API/CLI `.backup` against the database, or copy the database only after a clean shutdown/checkpoint. Do not copy just the main file from a running WAL database.
3. Protect the backup with filesystem permissions and encryption. Keep the OS vault intact: it is a separate dependency, not included in the SQLite backup.
4. Restore only with RequestLab closed. Preserve the damaged/original files first. Replace the database with the verified backup, reopen, and check collections and vault access.
5. Moving the database to another machine without the vault will not recover secret values. Re-enter those credentials through the UI.

There is no in-app full vault backup, portable encrypted backup, or repair utility. Do not delete damaged files as an automatic recovery strategy.

## Cloud PostgreSQL

Migration: `database/migrations/001_cloud.sql`; `npm run db:migrate` runs it in a transaction under an advisory lock. Initial SQL is idempotent. Subsequent schema changes must be new numbered migrations and require an upgrade test; a generalized multi-version migration runner is not yet implemented.

- **Accounts:** `users`, `sessions`, `auth_tokens`.
- **Teams:** `workspaces`, `memberships`, `invitations`.
- **Sync:** `entities`, `changes`, `operations`.
- **Collaboration:** `comments`, `audit_log`.
- **Billing:** `plans`, `subscriptions`, `payments`, `configuration`.
- **Jobs:** `email_outbox`.

UUID identities, workspace-scoped compound primary/foreign keys, role/status constraints, and targeted indexes enforce real data relationships. Cloud membership is enforced in every tenant route, not inferred from a frontend selection. No PostgreSQL row-level security is configured; the API is the sole exposed access boundary. Do not distribute its database credentials.

`entities` are immutable in kind and optimistic-versioned. Tombstones remain in change history. Idempotency records bind operation ID, actor, and request digest. There is no change-retention/compaction policy implemented yet; storage growth must be monitored.

Subscriptions are active only when their status is active and expiration is in the future. Invitation acceptance uses the effective plan's member limit. Existing memberships are not automatically removed after downgrade or expiry. Premium entitlement enforcement is currently limited to that member-admission policy, not a complete commercial feature-metering system.

### PostgreSQL backup/recovery

Use daily encrypted `pg_dump -Fc`, off-host retention, and provider WAL/PITR for production. Test restoration into an isolated database before trusting a backup. Example with credentials supplied by the environment:

```bash
pg_dump --dbname="$DATABASE_URL" --format=custom --file=requestlab-backup.dump
# Restore into a NEW dedicated database; never overwrite blindly.
pg_restore --dbname="$RESTORE_DATABASE_URL" --no-owner requestlab-backup.dump
```

Backups include password hashes, PII, payment references, and temporarily queued email action links. Limit access and document legal retention. A workspace deletion cascades its cloud records; audit entries retain the action but their workspace reference is nulled. User deletion requires transferring/deleting owned workspaces first.
