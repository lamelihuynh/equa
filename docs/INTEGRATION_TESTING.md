# Cross-service integration testing

## Current evidence

**Phase 10 local integration: PASS for the scenarios listed below.** Docker Desktop 29.5.2
and Compose 5.1.3 were available. The pre-existing Equa Compose services were healthy;
the unrelated `oc-hem-postgres` container was left untouched. This manual run is not an
automated CI/Testcontainers suite or production-environment evidence. Local Mailpit delivery
for group invitations was separately verified through the API-mode Web flow. Live retry after
an observed SMTP failure, production provider delivery, native Expo/device, staging, and
backup/restore remain **NOT RUN**.

## Phase 10 execution record

Local client base: `http://127.0.0.1:8000/v1` through Kong. Web: `http://localhost:3000`.
Identity mail verification used local Mailpit. Synthetic test identities used `example.com`
addresses; passwords, access tokens, refresh tokens, and verification tokens are not recorded.

All service migration commands completed. `schema_migrations` row counts are Identity 3,
Social 2, Ledger 2, Automation & Sync 4, and Notification 3. The persistent local PostgreSQL
volume predated the Automation database; only the missing empty `equa_automation_sync` logical
database was created, then its migration runner passed. The Compose init SQL already declares it.

Commands used: `pnpm check:compose`; `pnpm --filter @equa/identity-service db:migrate`,
`pnpm --filter @equa/social-service db:migrate`, `pnpm --filter @equa/ledger-service migrate`,
`pnpm --filter @equa/automation-sync-service db:migrate`, and
`pnpm --filter @equa/notification-worker db:migrate`. These app commands were started with local
`.env` values loaded into each process: `pnpm --filter @equa/identity-service dev`,
`pnpm --filter @equa/social-service dev`, `pnpm --filter @equa/ledger-service dev`,
`pnpm --filter @equa/automation-sync-service dev`, `pnpm --filter @equa/notification-worker dev`,
and `pnpm --filter @equa/web dev`. Compose services were already
healthy, so `pnpm infra:up` was not run and existing Docker resources were not restarted or removed.
The one additive local DB initialization command was
`CREATE DATABASE equa_automation_sync OWNER equa_local` after `equa_automation_sync` was confirmed
absent from the Equa PostgreSQL server.

| Scenario                                                                                | Live result                                                                                                                                                                                                                                                                                 |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identity register, Mailpit verify, login, profile                                       | PASS; synthetic users A/B/C: 3c114593-f0ee-4ee0-a03d-492f558e35b3, f5ca5975-97b2-43fd-959d-446e4846e329, 1f46b5f1-a022-4d5b-9004-e3185081a4db. Two-user verification/login/profile passed through Kong and Mailpit.                                                                         |
| Friend request by email, duplicate and reverse request, receiver acceptance             | PASS; request cf00daf3-f106-4ba3-b7de-7a904b2599b0; cross-instance duplicate row 0c856149-ce9b-4023-a977-c4b1940d866b; accepted by B.                                                                                                                                                       |
| Friend balance and debt-gated friend removal                                            | PASS; friend expense 092f2063-6751-45de-91bc-78ce68ab04f4 yielded net 300 VND minor units; remove returned OUTSTANDING_DEBT.                                                                                                                                                                |
| Group create/image/type, email invite duplicate/accept, member roles, edit, dissolve    | PASS; active group 539ef0a7-a495-43b0-8e6e-fe22a052220c, invitation 965f3690-14c3-4585-b0be-57df8a64bce3; cross-instance invite row e23403fe-bd37-48b3-af20-ae12a93a9fcd. A separate browser-created group passed image/type edit and admin dissolve.                                       |
| Group debt-gated member removal                                                         | PASS; group expense c2e9ccf6-b87d-4a11-9baa-778421fb0d24 caused OUTSTANDING_DEBT. Admin removal of a B-paid group expense also passed: 3cf61734-f4dd-47d2-81dd-fb82beedf873.                                                                                                                |
| Ledger create/replay, edit/version conflict, payer and admin delete, history and totals | PASS; friend expense 092f2063-6751-45de-91bc-78ce68ab04f4 and group expense c2e9ccf6-b87d-4a11-9baa-778421fb0d24. Replay returned same ID; stale version returned CONFLICT; soft-delete retained history and cleared active group total. Sync expense 1001a055-c06c-4fbb-8640-4f1dba975c6d. |
| Standard/custom category and nonmember access                                           | PASS; custom category 5a149ba4-7120-4733-b54f-d8b8cee3c7ee; outsider 1f46b5f1-a022-4d5b-9004-e3185081a4db was denied group expense 2fca3381-ba36-4962-8e98-f8fdff3cbacc with 403.                                                                                                           |
| Recurring execution and future-only edit/cancel                                         | PASS; rule 40d3673e-13a4-4e6d-9f00-2e39666c736e produced exactly one completed occurrence 597e5e50-0ce4-44fe-bd5c-90a4332991b4; edit/cancel left it unchanged.                                                                                                                              |
| Monthly recurring schedule and anchor                                                   | PASS; live rule f8fb3250-f82d-45aa-9f0f-ee5c227163bc executed occurrence 2026-08-31 once, persisted next run 2026-09-30 from its original UTC anchor, and was disabled through the API after verification. Ledger idempotency key had one row.                                              |
| Sync receipt/replay, cursor, conflict/order/discard                                     | PASS; op 0823650a-131e-40a2-a6a4-4a15f06e075b replayed idempotently. Conflict b683cc91-c701-4e6e-8cd0-695a0fa6759e blocked successor 628efc8b-4d50-4665-8bd6-e5822438f552 until explicit discard.                                                                                           |
| Ledger outbox and Notification inbox/job                                                | PASS; six expense outbox events were published/ingested. Duplicate event d07b565c-3b05-4c06-b3af-dc47679bb9f5 left one inbox row and one job; Rabbit queue drained to zero. Provider remains disabled.                                                                                      |
| New participant notification fan-out                                                    | PASS; live expense 37f9d623-4436-46cd-b3e0-5c32143ff2c4 emitted event c83bc634-15a4-49c9-8cc5-6b8854b606ac with added participant B. Duplicate create replay returned the same expense; PostgreSQL contained one outbox event, one inbox row, and one pending job for B (none for actor A). |
| Multi-recipient Notification store and replay                                           | PASS; direct PostgreSQL store probe for synthetic event 46736790-6397-435b-8187-0620a768d247 inserted two recipient jobs; replay returned `duplicate` and the database retained exactly two owners. This verifies store fan-out/idempotency, not a multi-recipient Rabbit publish.          |
| API-mode Chrome Web flow                                                                | PASS; real login/friends-balance/groups/expense create-edit-delete/dashboard/profile flow and separate group image/edit/dissolve flow; zero browser page errors.                                                                                                                            |

The separate group-invitation acceptance covered the pending UI, accept/decline, one Mailpit
email with inviter/group details and no code, and invitation persistence while Mailpit was
unavailable. Delivery retry after SMTP recovery was not observed.

The first real Ledger expense write exposed an invalid NUL byte in the PostgreSQL advisory-lock
text key. The key now uses an unambiguous JSON-encoded string pair; its regression test passes and
the live PostgreSQL create/idempotency flow passes.

Native Expo/device validation: **NOT RUN** because `adb` is unavailable. Do not treat the SQLite
tests or browser run as native-device evidence.

## Local run procedure

1. Create the local environment file with placeholders only, then start infrastructure:

   ```powershell
   Copy-Item .env.example .env
   pnpm infra:up
   ```

2. Apply each service's own migrations before starting it:

   ```powershell
   pnpm --filter @equa/identity-service db:migrate
   pnpm --filter @equa/social-service db:migrate
   pnpm --filter @equa/ledger-service migrate
   pnpm --filter @equa/automation-sync-service db:migrate
   pnpm --filter @equa/notification-worker db:migrate
   ```

3. In separate terminals start Identity, Social, Ledger, Automation & Sync, and the
   Notification worker with their workspace `dev` scripts. The local `.env` must provide
   matching service keys/URLs, PostgreSQL URLs, `IDENTITY_JWT_SECRET`, `RABBITMQ_URL`,
   and the Ledger feed cursor secret. Start Web with `pnpm --filter @equa/web dev` if
   verifying browser requests through Kong.

## Scenario checklist

1. Register two users through Identity and verify their addresses through local Mailpit.
2. Send a Social friend request from the first account and accept it from the second.
3. Create a group, invite the second account by email, verify the pending invitation appears
   in the invitee's `/groups` page and in local Mailpit, then accept or decline in the app.
   No invitation code is copied or pasted. Verify membership and admin authorization through
   the public Social APIs.
4. Create a Ledger group expense with explicit integer minor-unit participant shares that
   sum to the amount. Read it and its total as a member, edit with `expectedVersion`, then
   soft-delete with an `Idempotency-Key`; verify duplicate requests do not create a second
   mutation and deleted expenses leave active totals.
5. Push a UUID-keyed Automation sync create/update, replay the same operation, then submit
   a stale-version operation. Verify the receipt is idempotent, the conflict blocks later
   device operations, and an authenticated explicit discard releases the sequence.
6. Confirm Ledger publishes its outbox event and Notification persists one inbox/job for
   that event. For group email invitations, confirm Social commits the invitation/outbox
   together, Notification persists one recipient job, and the local Mailpit provider delivers
   it. If the broker or SMTP provider is unavailable, the pending invitation remains visible
   and delivery retries; neither failure rolls back invitation state. Mailpit validates local
   delivery only, not a production provider. A read-only inspection of `equa_notification` is
   allowed for the test operator; service code must continue to access only its own database.
7. Verify Web displays the Gateway-backed group/expense state. For offline persistence,
   run the Mobile SQLite unit suite; do not call it a native/device run.

After execution, record the exact commands, environment, passed scenarios, and any
`NOT RUN` items here. Never convert a mock or in-memory scenario into an infrastructure
integration claim.
