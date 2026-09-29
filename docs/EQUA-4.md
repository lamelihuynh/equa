# EQUA-4 automation and sync

This slice owns mobile outbox mechanics, recurring execution scheduling, sync reservations and notification delivery mechanics. Ledger financial rules, Identity behavior and notification-provider credentials remain external boundaries.

## Implemented behavior

- Mobile login and refresh use the existing Identity `X-Equa-Client: mobile` contract. Session epochs and serialized SecureStore persistence prevent stale login or refresh results from restoring a session after logout or an account change.
- SQLite uses `PRAGMA user_version = 2`. A version-gated transactional rebuild migrates prior outbox schemas, preserving rows while adding `queue_sequence`, `retry_at`, `dependencies` and `claim_token`; abandoned legacy `sending` rows become retryable `pending` rows.
- The mobile client schedules one wake-up at the durable earliest pending retry or lease expiry. Queue mutations reschedule it, restart rehydrates it from SQLite, and the Expo network listener triggers a reconnect only when connectivity transitions to available. Terminal 4xx rows are excluded from further claims.
- Mobile sync requests have a 20-second AbortController deadline; Identity login/refresh requests have a 15-second deadline. An unavailable token defers claimed rows without consuming mutation attempts. If refresh rotation has an ambiguous outcome, the session manager invalidates the stored tokens rather than replaying the old refresh token; logout quarantines that owner's queue, and signing in again as that same owner restores it. A transient SQLite wake-state read schedules bounded recovery.
- Sync reservations use server-assigned per-owner/device sequence numbers. A device-sequence row lock and predecessor query prevent a later operation from being leased while an earlier operation is pending, leased or conflicted. Conflicts remain durable and stop ordered batch processing. Completion/retry/conflict writes are lease-token fenced.
- The existing Mobile profile screen lists concise conflict summaries and offers an explicit, confirmed server-wins action. That action records an owner/device-scoped discard on Automation & Sync before deleting the local mutation and reconciling the feed; it does not silently discard local financial edits.
- The Mobile profile screen now refreshes/caches groups and expenses in SQLite, shows saved data offline, and creates/edits integer-minor expense mutations through the durable outbox with explicit participant shares. Tokens remain in SecureStore, separate from the business cache.
- The scheduler checks a typed disabled Ledger capability before claiming. A typed unavailable result after a claim releases the execution without consuming the retry attempt; actual execution failures consume an attempt.
- Recurring rules accept positive single-unit ISO date periods `PnD`, `PnW`, `PnM`, and `PnY`. Offset-aware starts normalize to UTC; monthly/yearly occurrences preserve the original day anchor and clamp month-end/leap-day dates to the last valid calendar day.
- Retry-exhausted recurring executions transition to `dead`, including already-exhausted pending or expired leases, instead of remaining unclaimable and pending.
- Notification inbox/job creation is idempotent. The polling loop catches asynchronous database failures so later polls still run. Provider failures at the eighth claim, and already exhausted reclaimable rows, transition to `dead`; terminal jobs are excluded from claims. Lease-token fencing remains in place. Rejected async broker acknowledgements trigger reconnect handling.
- A transient SQLite failure while recalculating the next queue wake-up schedules a bounded 30-second recovery attempt rather than leaving an unhandled rejection or a permanently dormant queue.
- Ledger mutations write history, a currency-safe balance projection, and one versioned outbox event in the owning PostgreSQL transaction. Automation pulls the owner-bound Ledger feed with a signed cursor; the mobile store keeps a separate cursor and event receipt per owner/device.

## Validation performed

- Mobile unit tests cover constructed login/refresh request headers, bounded sync/auth requests, SecureStore logout/account-switch refresh races, disk SQLite legacy migration and reopen, retry deadline wake-up, startup recovery, timer replacement, SQLite wake-read recovery, auth-unavailable attempt preservation, owner-scoped conflict summary/resolution, dependency release after explicit resolution, a SyncClient connectivity-adapter transition and terminal 4xx handling.
- Automation unit tests cover duplicate replay, ordered predecessor blocking, conflict blocking, concurrent successor reservations, explicit conflict discard/idempotent retry, retry exhaustion SQL contract, and scheduler disabled/unavailable/retryable-dependency behavior.
- Notification unit tests cover duplicate inboxing, lease fencing, recoverable polling after database rejection, async acknowledgement failure recovery, exhaustion to `dead`, retryable provider statuses and disabled providers.
- Ledger unit and injected Fastify tests cover currency-separated balances, soft-delete reversal, participant authorization, idempotent events, feed pagination/checkpoints, internal sync IDs, and outbox publication retry fencing.

## Phase 10 live validation

- Docker Desktop 29.5.2/Compose 5.1.3 local infrastructure was available; all five service migrations completed and the service-owned migration tables were checked.
- A local PostgreSQL/RabbitMQ scenario exercised recurring occurrence idempotency, sync replay/order/conflict resolution, Ledger outbox publication, recipient-specific Notification job fan-out/deduplication for an added expense participant, and filtered totals. Details and synthetic IDs are recorded in `docs/INTEGRATION_TESTING.md`.
- A PostgreSQL advisory-lock NUL-byte bug found by a real expense write was fixed; the Ledger repository regression test passes.
- Mobile UI now reads cached groups/expenses and writes create/edit mutations to the durable SQLite outbox. Unit/disk tests pass.

## Validation not run

- Exhaustive PostgreSQL concurrency/failure stress and an automated CI integration suite: **NOT RUN**; Phase 10 was a scoped manual local run.
- Native Expo/device test: **NOT RUN** because Android `adb` and an emulator/device are unavailable.
- Notification provider delivery: **NOT RUN**; the provider remains disabled.
- Staging, backup/restore, and production deployment: **NOT RUN**.

The Ledger adapter is fail-closed when `LEDGER_URL` or `AUTOMATION_SYNC_SERVICE_KEY` is absent; when both are configured it uses the authenticated internal Expense API with stable idempotency keys. Production provider credentials and managed database/broker targets remain external configuration.
