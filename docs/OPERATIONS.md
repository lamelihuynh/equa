# Operations runbook

This is an operator procedure for the current repository setup. Phase 10 ran a scoped local
PostgreSQL/RabbitMQ scenario; that does not establish staging, production backups, provider delivery,
or production operations.

## Service status and diagnostics

- `GET /health` is liveness for Identity, Social, and Ledger. Automation & Sync also exposes
  `GET /health` for liveness and `GET /ready` for database, Ledger-adapter, and sync readiness.
- Notification is a worker with no HTTP listener. Check its process and structured logs. It logs
  polling/ingest failures and RabbitMQ reconnect attempt/delay without printing URLs or secrets.
- Kong supplies `X-Correlation-ID`; Social, Ledger, and Automation & Sync include it as the request
  ID in structured logs. Internal HTTP calls do not yet propagate trace context.
- Local diagnostics: `docker compose --env-file .env -f infra/compose/docker-compose.yml ps` and
  `docker compose --env-file .env -f infra/compose/docker-compose.yml logs --tail=100 <service>`.
  Keep `.env` private. These commands require a running Docker daemon.

## Database migrations

Run each migration only against that service's database URL and only after reviewing the migration
and confirming a usable backup/snapshot for the target environment. Migrations are separate
one-off commands; application startup does not apply them automatically.

```sh
pnpm --filter @equa/identity-service db:migrate
pnpm --filter @equa/social-service db:migrate
pnpm --filter @equa/ledger-service migrate
pnpm --filter @equa/automation-sync-service db:migrate
pnpm --filter @equa/notification-worker db:migrate
```

Do not point local migration commands at staging or production credentials. After migration, check
the service's logs and a service-owned health/query path before deploying dependent code. Avoid
blind down-migrations; use a reviewed forward migration or a verified restore plan.

## Recurring and sync failures

- Automation recurring retries use persisted execution records and deterministic keys. Inspect
  Automation logs for `scheduler tick` errors and `/ready` for dependency status; raw exception
  messages and credentials are intentionally omitted.
- A sync `409`/conflict remains visible to the account owner and blocks ordered successors until an
  explicit conflict resolution. Do not manually edit sync rows to unblock an account.
- Retryable failures are retried by service policy. A `4xx` terminal result or explicit conflict
  needs request/domain review; do not replay with a new idempotency key as a workaround.

## Notification and RabbitMQ

The worker consumes `equa.domain-events` into `equa.notification`. Failed persistence is rejected
to `equa.notification.dlq`; provider jobs retry in the service database and become terminal after
their retry policy is exhausted. Rabbit connection retries use exponential delay capped at 30
seconds. Inspect worker diagnostics and the `equa.notification.dlq` queue before considering any
manual replay. A replay must preserve the original event ID/idempotency identity.

For local group invitations, `EMAIL_PROVIDER=mailpit` enables SMTP delivery using `SMTP_HOST`,
`SMTP_PORT`, and `EMAIL_FROM`. Social persists the invitation and its RabbitMQ outbox event in
one Social database transaction. If RabbitMQ is unavailable, the pending invitation remains
visible in Social and the outbox retries publication. If SMTP delivery fails, the Notification
job retries independently; neither failure rolls back the invitation. Other provider values keep
delivery disabled. No production provider delivery is demonstrated or claimed.

## Backup, restore, and release limits

Automated PostgreSQL backups, PITR, object-storage versioning, retention, and a completed restore
drill are not configured or evidenced in this branch. The daily backup/PITR and RPO/RTO entries in
`DEPLOYMENT.md` are goals only. Before changing a real database, require a platform snapshot/backup
and a tested restore procedure from its operator. Stop if there is no verified recovery path.

The staging workflow and component manifest currently target Identity only. Social, Ledger,
Automation & Sync, Notification, Platform, and Web need real environment targets, isolated secrets,
database/broker connectivity, and smoke checks before staging claims can be made. No production
deployment or rollback has been performed.
