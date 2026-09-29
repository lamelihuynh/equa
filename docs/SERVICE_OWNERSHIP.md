# Equa service ownership and interfaces

This map describes the `feature/automation-sync` branch. “Implemented” means the
code or runtime path exists in this branch; Phase 10 local scenario evidence is in docs/INTEGRATION_TESTING and is not production coverage.

## Component inventory

| Component                                           | Type                                         | Public routes                                                                                   | Owns / database                                                                                                 | Calls                                                                 | Consumes / publishes                                                           | Must not access                                  | Current implementation                                                                                                                             |
| --------------------------------------------------- | -------------------------------------------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identity (`@equa/identity-service`)                 | Business service                             | `/health`, `/v1/auth/*`, `/v1/profile/*`, `/v1/docs`                                            | `equa_identity`: users, profiles, refresh sessions, verification/reset tokens, audit logs                       | SMTP/Resend; S3-compatible avatar storage                             | No Rabbit events                                                               | Social, Ledger, Platform, Automation databases   | Auth/session/profile and internal identifier lookup implemented                                                                                    |
| Social (`@equa/social-service`)                     | Business service                             | `/v1/friends/*`, `/v1/groups/*`                                                                 | `equa_social`: friend requests, friendships, groups, members, invitations                                       | Identity internal resolver; Ledger pair-balance/debt API              | No Rabbit events                                                               | Identity and Ledger databases                    | Friend/group lifecycle and authorization implemented                                                                                               |
| Ledger (`@equa/ledger-service`)                     | Business service / financial source of truth | `/health`, `/v1/expenses/*`, `/v1/categories`; internal expense, sync, feed, and balance routes | `equa_ledger`: expenses, participants, history, categories, idempotency, pair/group balance projections, outbox | Social membership/friendship API; RabbitMQ publisher                  | Publishes version-1 `expense.created/updated/deleted` via transactional outbox | Identity, Social, Platform, Automation databases | EXP scope plus narrow balance/debt support implemented; full Split/Balance/Debt/Settlement APIs are outside this temporary slice                   |
| Automation & Sync (`@equa/automation-sync-service`) | Business service                             | Direct `/health`, `/ready`; Kong `/v1/recurring/*`, `/v1/sync`, `/v1/sync/feed`                 | `equa_automation_sync`: recurring rules/executions, sync receipts/sequences/cursors                             | Ledger internal expense API/feed                                      | Does not consume or publish Rabbit events in current code                      | Identity, Social, Ledger, Platform databases     | Recurring orchestration and sync protocol implemented; readiness checks DB, Ledger adapter, and sync config                                        |
| Platform (`@equa/platform-service`)                 | Business service scaffold                    | Direct `/health`; no public product routes are currently configured in Kong                     | `equa_platform` is created in local PostgreSQL; no Platform DB client, migrations, or owned tables were found   | None found                                                            | None found                                                                     | Other service databases                          | Health-only scaffold; product ownership is not inferred from old architecture prose                                                                |
| Notification (`@equa/notification-worker`)          | Worker                                       | No HTTP listener                                                                                | `equa_notification`: inbox and delivery jobs                                                                    | RabbitMQ; provider adapter (disabled)                                 | Consumes `equa.domain-events`; no event publishing found                       | Identity, Social, Ledger, Platform databases     | Durable inbox/job, retries, leases, terminal delivery state; external delivery is disabled                                                         |
| Web (`@equa/web`)                                   | Client application                           | Next.js pages                                                                                   | Browser session; explicit Local Demo uses `localStorage` key `equa_local_demo_v1`                               | Kong for Identity, Social, and Ledger; demo mode uses browser storage | None                                                                           | All service databases                            | API mode for auth/profile/friends/groups/expenses; separately labelled localStorage demo                                                           |
| Mobile (`@equa/mobile`)                             | Client application                           | Native Expo app                                                                                 | SQLite local projections/outbox; SecureStore tokens                                                             | Kong for Identity profile/auth and Automation sync/feed               | None                                                                           | All service databases                            | Profile/auth plus SQLite cache and durable offline expense create/edit panel; native runtime NOT RUN                                               |
| Contracts (`@equa/contracts`)                       | Shared package                               | None                                                                                            | No database                                                                                                     | Imported by workspace packages                                        | Versioned sync/event/Identity DTOs                                             | Runtime/service implementations and ORM models   | Shared DTOs/types only; no persistence entities                                                                                                    |
| Insights                                            | Deferred / unresolved                        | None                                                                                            | None                                                                                                            | None                                                                  | None                                                                           | All service databases                            | SRS assignment mentions the service, but this branch has no package, route, component manifest entry, migration, or detailed Insights requirements |

Local Compose runs one PostgreSQL container with six logical databases. The local
`equa_local` role is shared for convenience; database ownership remains separate.
The staging/production target requires separate database credentials/roles per owner.
Social's migration bootstrap connects to the administrative `postgres` database only
to create `equa_social` if absent, then runs its migrations against `equa_social`.

## Database table inventory

Table ownership follows the database owner; these names were read from current migration
SQL and migration runners:

| Database owner    | Tables                                                                                                                                                                                       |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identity          | `schema_migrations`, `users`, `user_profiles`, `refresh_sessions`, `email_verification_tokens`, `password_reset_tokens`, `audit_logs`                                                        |
| Social            | `schema_migrations`, `social_schema_migrations_marker`, `friend_requests`, `friendships`, `social_groups`, `group_members`, `group_invitations`                                              |
| Ledger            | `schema_migrations`, `expenses`, `expense_participants`, `expense_history`, `ledger_categories`, `ledger_idempotency_keys`, `ledger_pair_balances`, `ledger_group_balances`, `ledger_outbox` |
| Automation & Sync | `schema_migrations`, `recurring_rules`, `recurring_executions`, `sync_operations`, `sync_device_sequences`, `sync_cursors`                                                                   |
| Notification      | `schema_migrations`, `notification_inbox`, `notification_jobs`                                                                                                                               |
| Platform          | No current tables or migrations; only an allocated logical database                                                                                                                          |

## Route ownership

Kong local configuration routes only public/controller-backed prefixes:

| Prefix                                           | Owner               | Notes                                                                                                       |
| ------------------------------------------------ | ------------------- | ----------------------------------------------------------------------------------------------------------- |
| `/health`, `/v1/auth`, `/v1/profile`, `/v1/docs` | Identity            | Health and Swagger are currently routed through Identity                                                    |
| `/v1/friends`, `/v1/groups`                      | Social              | Internal Identity/Ledger endpoints are not routed publicly                                                  |
| `/v1/expenses`, `/v1/categories`                 | Ledger              | Internal sync/feed/balance endpoints require service key and are not routed publicly                        |
| `/v1/sync`, `/v1/recurring`                      | Automation & Sync   | JWT verified by service; conflict discard requires owner/device scope; financial writes forwarded to Ledger |
| No Platform prefix                               | Platform scaffold   | Product endpoints are not implemented; prior Kong prefixes returned unsupported routes                      |
| No Notification prefix                           | Notification worker | Worker has no HTTP server                                                                                   |

`infra/kong/kong.staging.yml` currently points only to the deployed Identity upstream.
The component manifest also configures staging deployment only for Identity. Social,
Ledger, Automation & Sync, Platform, and Notification are not represented as deployed
staging upstreams in the current branch.

Automation `/health` and `/ready` are direct service diagnostics and are not currently routed through
Kong. Social and Ledger `/health` are liveness endpoints; Identity health remains the only `/health`
route in Kong config.

## Service calls

| Caller → callee                   | Reason / protocol                                                                      | Authentication                                                    | Timeout/retry                                                                   | Idempotency / contract                                                                            |
| --------------------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Web/Mobile → Kong → Identity      | Login, token refresh, profile, avatar; HTTPS REST                                      | Bearer JWT after login; mobile auth sends `X-Equa-Client: mobile` | Mobile auth has 15 s abort deadline; Web has no explicit timeout                | Identity endpoint DTOs; Web refresh uses HttpOnly cookie; mobile stores refresh token securely    |
| Mobile → Kong → Automation & Sync | Ordered offline mutation push, Ledger feed pull, explicit conflict discard; HTTPS REST | Bearer JWT verified by Automation                                 | 20 s abort deadline; queue owns retry/backoff/reconnect                         | Operation UUID + payload-bound receipt; expectedVersion; owner/device-scoped conflict resolution  |
| Social → Identity                 | Resolve email/username; direct internal HTTP GET                                       | `x-equa-service-key` (`IDENTITY_SERVICE_KEY`)                     | 3 s abort timeout; no adapter retry; unavailable lookup fails closed            | `IdentityUserResolution` in `packages/contracts/src/identity.ts`                                  |
| Social → Ledger                   | Pair balance and friend/group debt eligibility; direct internal HTTP POST              | `x-equa-service-key` (`SOCIAL_SERVICE_KEY`)                       | 3 s abort timeout; no adapter retry; debt checks fail closed                    | Local `PairBalance` adapter shape; no shared Ledger DTO yet                                       |
| Ledger → Social                   | Check group membership/admin and friendship; direct internal HTTP POST                 | `x-equa-service-key` (`LEDGER_SERVICE_KEY`)                       | 3 s abort timeout; no adapter retry; access fails closed                        | Local `LedgerSocialAdapter` interface                                                             |
| Automation & Sync → Ledger        | Recurring expense create, sync expense mutation, owner feed; direct internal HTTP      | `x-equa-service-key` (`AUTOMATION_SYNC_SERVICE_KEY`)              | 3 s abort timeout; adapter does not retry; scheduler applies typed retry policy | `ExpenseSyncPayload`/event DTOs in `packages/contracts/src/automation.ts`; stable Idempotency-Key |
| Ledger → RabbitMQ                 | Publish financial domain event after DB transaction commits; confirmed topic publish   | RabbitMQ credentials                                              | Outbox lease/backoff handles failure; publisher reconnects                      | Version-1 event ID; consumer inbox deduplicates                                                   |
| Notification ← RabbitMQ           | Consume `equa.domain-events` topic; durable queue and DLQ                              | RabbitMQ credentials                                              | Exponential reconnect capped at 30 s; persistence failure is dead-lettered      | Inbox primary key on event ID; provider idempotency key `notification:{eventId}`                  |

No SQL statement in the Social adapter/repository accesses Identity or Ledger tables;
no SQL statement in Ledger accesses Social tables. Their cross-service checks use the
internal HTTP adapters above. Automation's repository queries only its own schema.
Social-to-Identity resolver access is also HTTP, not an Identity DB connection from Social.

## Contracts and events

| Contract/event                                                                | Owner               | Consumers                                        | Version / fields                                                                     | Idempotency                                                                                          |
| ----------------------------------------------------------------------------- | ------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| `IdentityUserResolution`                                                      | Identity            | Social                                           | Internal result: user ID, email, optional username                                   | Lookup is read-only                                                                                  |
| `SyncRequest`, `SyncOperation`, `SyncResult`, `SyncConflictResolutionRequest` | Automation & Sync   | Mobile, Ledger adapter                           | Version 1; device/operation identity, expectedVersion; explicit `discard` resolution | Owner/device/operation receipt binds payload hash; conflict discard is idempotent and account-scoped |
| `DomainEvent` / expense event                                                 | Ledger              | RabbitMQ Notification; Automation feed over HTTP | Version 1; ID, type, occurredAt, ownerId, correlationId, producer, payload           | Ledger outbox event ID stable per persisted mutation; Notification inbox deduplicates                |
| `NotificationJob`                                                             | Notification worker | Provider adapter                                 | Event/delivery ID, owner, type, payload                                              | Delivery ID `notification:{eventId}`                                                                 |

Contracts contain TypeScript DTOs, enums, and runtime envelope parsers. ORM entities,
SQL models, and service implementation code remain service-local. Expense HTTP DTOs
and Social membership/balance adapter DTOs are currently local interfaces; extracting
those as versioned shared contracts is a follow-up if independent deployment requires it.

## Event flow and gaps

Ledger inserts the expense mutation, history, idempotency receipt, balance projections,
and outbox event in one `equa_ledger` PostgreSQL transaction. The publisher sends the
outbox event to RabbitMQ with publisher confirms. Notification acknowledges a broker
message after inbox/job persistence, so provider delivery failures do not roll back a
Ledger transaction. The consumer is at-least-once and idempotent.

No Social or Identity domain event publisher was found. Automation currently pulls the
Ledger outbox through an owner-bound signed-cursor HTTP feed rather than consuming
RabbitMQ. Recurring/notification reminder orchestration remains incomplete. The Phase 10
scoped local PostgreSQL/RabbitMQ scenario is in `docs/INTEGRATION_TESTING.md`; exhaustive
concurrency stress and provider delivery remain unverified.
