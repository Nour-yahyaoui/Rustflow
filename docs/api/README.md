# RequestLab API v1

The standalone service uses `/v1/*`. The Next.js portal exposes the same handlers at `/api/v1/*`. Responses are JSON and never cached. Normal request payloads are limited to 1 MiB. Errors have `{ "error": "..." }`; validation errors also include field paths/messages. HTTP 401 = no valid session, 403 = denied permission/origin, 409 = version/state conflict, 422 = forbidden secret data, 429 = rate limit.

Browser authentication uses the HttpOnly `rl_session` cookie. Every mutation must include the exact `Origin: <APP_ORIGIN>` and `X-RequestLab-Client: web`. The custom header is a CSRF measure, not an API key. Do not expose database credentials to clients.

## Accounts

| Method | Standalone path     | Behavior                                                        |
| ------ | ------------------- | --------------------------------------------------------------- |
| GET    | `/v1/health`        | Database-backed health and API version                          |
| POST   | `/v1/auth/register` | `{email,password,name}`; queues verification email, generic 202 |
| POST   | `/v1/auth/verify`   | `{token}`; consumes valid unexpired token once                  |
| POST   | `/v1/auth/login`    | `{email,password}`; verified users only; session cookie         |
| POST   | `/v1/auth/logout`   | Revokes current session and clears cookie                       |
| GET    | `/v1/auth/session`  | Current account, or 401                                         |
| POST   | `/v1/auth/forgot`   | `{email}`; generic response; queues reset email when applicable |
| POST   | `/v1/auth/reset`    | `{token,password}`; consumes token and revokes all sessions     |
| PATCH  | `/v1/account`       | `{name}`; updates display name                                  |
| DELETE | `/v1/account`       | `{password}`; requires no owned workspaces                      |

Passwords must be 12–256 characters on creation/reset. Registration and recovery tokens expire after one hour. Sessions last seven days by default. Password change via reset is implemented; email change, session-device listing, MFA, and OAuth login are not.

## Teams

| Method   | Path                                 | Required role                                                             |
| -------- | ------------------------------------ | ------------------------------------------------------------------------- |
| GET/POST | `/v1/workspaces`                     | Signed in; list only own memberships / create owner membership            |
| PATCH    | `/v1/workspaces/:id`                 | owner or admin; `{name}`                                                  |
| DELETE   | `/v1/workspaces/:id`                 | owner                                                                     |
| GET      | `/v1/workspaces/:id/members`         | any member                                                                |
| PATCH    | `/v1/workspaces/:id/members/:userId` | owner; `{role:admin                                                       | editor | viewer}`, cannot demote owner |
| DELETE   | `/v1/workspaces/:id/members/:userId` | owner; cannot remove owner                                                |
| POST     | `/v1/workspaces/:id/transfer`        | owner; `{userId}` already a member                                        |
| POST     | `/v1/workspaces/:id/invitations`     | owner/admin; `{email,role}`; email outbox, seven-day token                |
| POST     | `/v1/invitations/accept`             | matching verified signed-in email; `{token}`; effective-plan member limit |

Owners can change roles/transfer ownership. Admins may invite members and manage billing, but cannot override owners. Workspace IDs are UUIDs; knowing an ID grants no access. The current member list endpoints are bounded, not fully paginated enterprise directory APIs.

## Synchronization

`GET /v1/workspaces/:id/changes?after=0` returns up to 200 ordered changes and `hasMore`. Use the last returned revision as the next cursor. Bigint revisions are returned by PostgreSQL as decimal strings in change rows; mutation acknowledgments contain a numeric revision. The current implementation assumes revisions remain below JavaScript's safe-integer limit; change to a consistent string cursor before extreme scale.

Owner/admin/editor mutation example:

```json
{
  "operationId": "<client-generated UUID>",
  "entityId": "<client-generated UUID>",
  "kind": "collection",
  "expectedVersion": 0,
  "data": { "name": "My API", "description": "Public metadata only" },
  "deleted": false
}
```

POST to `/v1/workspaces/:id/changes`. Allowed kinds: collection, request, environment. New entities use version 0; each accepted mutation increments the entity version and workspace revision. Deletes are tombstones. Duplicate identical operations return the original acknowledgment. A reused operation ID with another actor/payload or a stale base version returns 409. Pull current changes and merge explicitly; never retry stale data as an unconditional overwrite.

Secrets are not supported in sync. Obvious secret fields and secret-marked variable values are rejected. Free-text embedded secrets cannot be reliably detected: clients must sanitize and review. This protocol does not by itself implement a desktop change queue, retries, auth handoff, or merge UI; those are not connected yet.

## Collaboration

- `GET/POST /v1/workspaces/:id/comments/:entityId`: any member; POST `{body}` (1–5,000 characters); entity must belong to that workspace.
- `GET /v1/workspaces/:id/activity`: latest 100 audit events for that workspace.

Comments/activity are implemented; real-time presence, simultaneous text editing, comment moderation/edit/delete, and shareable hosted documentation are not.

## Billing

- `GET /v1/plans`: public active plans and configured manual contact (default **56668672**). Prices start unset, not fabricated.
- `GET /v1/workspaces/:id/billing`: owner/admin; subscription with effective expiration status and latest 100 payment records.
- `POST /v1/workspaces/:id/payments`: owner/admin; `{planId:pro|team,reference}`. Creates **pending** record only.
- `POST /v1/workspaces/:id/subscription/cancel`: owner; immediate cancellation.

Upgrades/downgrades are new manual references. Approval replaces the current plan/expiry according to the independently verified arrangement; there is no automatic prorating or charge. Member-admission limits are enforced, not full premium entitlement metering.

## Administration

Every endpoint below requires the database-backed `is_admin` flag; no frontend header/claim is sufficient.

| Method | Path                            | Payload/response                                     |
| ------ | ------------------------------- | ---------------------------------------------------- |
| GET    | `/v1/admin/overview`            | account/workspace/pending-payment counts             |
| GET    | `/v1/admin/users`               | latest 200 accounts, no hashes/tokens                |
| PATCH  | `/v1/admin/users/:id`           | `{suspended}`; cannot suspend self; sessions revoked |
| GET    | `/v1/admin/payments`            | latest 200 payment records                           |
| POST   | `/v1/admin/payments/:id/review` | `{decision:approved                                  | rejected,note,expiresAt?}`; only pending records |
| GET    | `/v1/admin/audit`               | latest 200 audit events                              |
| PATCH  | `/v1/admin/configuration`       | `{paymentContact}`                                   |
| PATCH  | `/v1/admin/plans/:id`           | `{active,maxMembers,priceMinor,currency}`            |

Approval requires an ISO date-time expiry in the future within 366 days. Payment update, subscription activation, and audit write share a transaction. A second review returns 409. Configuration, plans, suspension, and payment review are audited.

No automatic gateway, card storage, paid transaction confirmation, arbitrary cloud request executor, or object upload endpoint exists.
