# EQUA-4 automation and sync

This slice owns mobile outbox mechanics, recurring execution scheduling, sync reservations and notification delivery mechanics. Ledger financial rules, Identity behavior and notification-provider credentials remain external boundaries.

## Implemented behavior

- Mobile login and refresh use the existing Identity `X-Equa-Client: mobile` contract. Session epochs and serialized SecureStore persistence prevent stale login or refresh results from restoring a session after logout or an account change.
- SQLite uses `PRAGMA user_version = 2`. A version-gated transactional rebuild migrates prior outbox schemas, preserving rows while adding `queue_sequence`, `retry_at`, `dependencies` and `claim_token`; abandoned legacy `sending` rows become retryable `pending` rows.
- The mobile client schedules one wake-up at the durable earliest pending retry or lease expiry. Queue mutations reschedule it, restart rehydrates it from SQLite, and the Expo network listener triggers a reconnect only when connectivity transitions to available. Terminal 4xx rows are excluded from further claims.
- Sync reservations use server-assigned per-owner/device sequence numbers. A device-sequence row lock and predecessor query prevent a later operation from being leased while an earlier operation is pending, leased or conflicted. Conflicts remain durable and stop ordered batch processing. Completion/retry/conflict writes are lease-token fenced.
- The scheduler checks a typed disabled Ledger capability before claiming. A typed unavailable result after a claim releases the execution without consuming the retry attempt; actual execution failures consume an attempt.
- Notification inbox/job creation is idempotent. The polling loop catches asynchronous database failures so later polls still run. Provider failures at the eighth claim, and already exhausted reclaimable rows, transition to `dead`; terminal jobs are excluded from claims. Lease-token fencing remains in place.
- Ledger mutations write history, a currency-safe balance projection, and one versioned outbox event in the owning PostgreSQL transaction. Automation pulls the owner-bound Ledger feed with a signed cursor; the mobile store keeps a separate cursor and event receipt per owner/device.

## Validation performed

- Mobile unit tests cover constructed login/refresh request headers, SecureStore logout/account-switch refresh races, disk SQLite legacy migration and reopen, retry deadline wake-up, startup recovery, timer replacement, a SyncClient connectivity-adapter transition and terminal 4xx handling.
- Automation unit tests cover duplicate replay, ordered predecessor blocking, conflict blocking, concurrent successor reservations and scheduler disabled/unavailable/retryable-dependency behavior.
- Notification unit tests cover duplicate inboxing, lease fencing, recoverable polling after database rejection, exhaustion to `dead`, retryable provider statuses and disabled providers.
- Ledger unit and injected Fastify tests cover currency-separated balances, soft-delete reversal, participant authorization, idempotent events, feed pagination/checkpoints, internal sync IDs, and outbox publication retry fencing.

## Validation not run

- PostgreSQL concurrency integration: **NOT RUN** because Docker was unavailable.
- RabbitMQ integration: **NOT RUN** because RabbitMQ/Docker was unavailable.
- Native Expo/device test: **NOT RUN**.

The Ledger adapter is fail-closed when `LEDGER_URL` or `AUTOMATION_SYNC_SERVICE_KEY` is absent; when both are configured it uses the authenticated internal Expense API with stable idempotency keys. The notification provider remains disabled until provider credentials are configured. RabbitMQ/PostgreSQL delivery still requires the external services listed above.
