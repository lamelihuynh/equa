# Phase 11 changeset review

Branch: `feature/automation-sync`. Snapshot: 70 tracked modifications and 40 untracked
files at review start; this review document is the 41st untracked file. No files are staged.
The Phase 10 checkpoint attributes early CI/CD, Local Demo, Identity and Social edits to
pre-existing working-tree work; phase attribution below follows that checkpoint and marks
uncertain provenance explicitly.

## Complete diff inventory

Each path appears in exactly one category. `C1`–`C9` are proposed commit groups below.

### A. CI/CD

| Path                                      | Purpose                                                                                  | Origin                                                           | Commit   |
| ----------------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | -------- |
| `.github/components.json`                 | Declares workspace component/package/image/staging metadata.                             | Pre-existing CI/CD work; exact phase unrecorded.                 | YES · C8 |
| `.github/workflows/component-quality.yml` | Reusable component build/lint/typecheck/test workflow.                                   | Pre-existing CI/CD work; exact phase unrecorded.                 | YES · C8 |
| `.github/workflows/ci.yml`                | Detects affected components and separates repository checks from component checks.       | Pre-existing CI/CD work; exact phase unrecorded.                 | YES · C8 |
| `.github/workflows/deploy-staging.yml`    | Selects configured staging components and deploys their images.                          | Pre-existing CI/CD work; exact phase unrecorded.                 | YES · C8 |
| `.github/workflows/release-images.yml`    | Builds release images from the component manifest.                                       | Pre-existing CI/CD work; exact phase unrecorded.                 | YES · C8 |
| `.github/workflows/security.yml`          | Includes `develop` in CodeQL push coverage.                                              | Pre-existing CI/CD work; exact phase unrecorded.                 | YES · C8 |
| `scripts/ci/affected-components.mjs`      | Validates the manifest and computes package/image/staging matrices.                      | Pre-existing CI/CD work; exact phase unrecorded.                 | YES · C8 |
| `scripts/ci/affected-components.test.mjs` | Tests detector cases; Phase 10 expectation includes Web as a contracts consumer.         | Base detector pre-existing; Web expectation updated in Phase 10. | YES · C8 |
| `docs/CI_CD.md`                           | Documents component workflows and the currently configured Identity-only staging target. | Pre-existing CI/CD documentation; exact phase unrecorded.        | YES · C8 |

### B. Architecture/docs

| Path                              | Purpose                                                                           | Origin                                                   | Commit    |
| --------------------------------- | --------------------------------------------------------------------------------- | -------------------------------------------------------- | --------- |
| `docs/ARCHITECTURE.md`            | Reconciles current runtime topology, ownership and unimplemented scaffolds.       | Phase 8/10.                                              | YES · C9  |
| `docs/DEPLOYMENT.md`              | Distinguishes configured staging from proposed production deployment.             | Phase 8/10.                                              | YES · C9  |
| `docs/DEVELOPMENT.md`             | Documents local Social/Identity migrations and legacy username behavior.          | Pre-existing project work; exact phase unrecorded.       | YES · C9  |
| `docs/EQUA-4.md`                  | Records Automation/Sync scope, local evidence and NOT RUN limits.                 | Phases 4/6/10.                                           | YES · C9  |
| `docs/SECURITY.md`                | Separates repository-visible controls from missing deployment evidence.           | Phase 8/10.                                              | YES · C9  |
| `docs/STAGING_DEPLOYMENT.md`      | Documents Identity-only staging configuration and external Web target status.     | Phase 8/10; exact introduction phase not recorded.       | YES · C9  |
| `docs/TESTING_STRATEGY.md`        | Clarifies unit/service versus infrastructure/E2E coverage.                        | Phase 7/10.                                              | YES · C9  |
| `docs/BACKEND_COMPLETENESS.md`    | Maps supplied requirements to evidence, status and remaining risks.               | Phase 3, reconciled in Phase 10 and updated in Phase 11. | YES · C9  |
| `docs/INTEGRATION_TESTING.md`     | Records migrations, real local IDs/scenarios, browser evidence and NOT RUN cases. | Phase 7/10/11.                                           | YES · C9  |
| `docs/OPERATIONS.md`              | Documents local operations and production runbook gaps.                           | Phase 8/10.                                              | YES · C9  |
| `docs/PRODUCTION_READINESS.md`    | Records the NOT READY decision and exact requirement counts.                      | Phase 9/10/11.                                           | YES · C9  |
| `docs/PROJECT_EXECUTION_STATE.md` | Durable checkpoint, updated with Phase 12 commit/test results.                    | Phases 3–12.                                             | YES · C10 |
| `docs/SERVICE_OWNERSHIP.md`       | Inventories service routes, tables, calls, events and boundaries.                 | Phase 3, updated in Phases 4–10.                         | YES · C9  |
| `infra/kong/kong.yml`             | Removes unimplemented public routes and keeps implemented service routes.         | Phase 8/10; gateway cleanup.                             | YES · C6  |
| `infra/kong/kong.staging.yml`     | Removes the obsolete Identity route alias.                                        | Phase 8/10; gateway cleanup.                             | YES · C6  |
| `docs/CHANGESET_REVIEW.md`        | This full inventory, review, secret audit and proposed commit plan.               | Phase 11.                                                | YES · C9  |

### C. Identity

| Path                                          | Purpose                                                                        | Origin                                                                     | Commit   |
| --------------------------------------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------- | -------- |
| `services/identity/src/auth/auth.service.ts`  | Preserves email-only registration while checking optional username uniqueness. | Pre-existing user registration-compatibility work; exact phase unrecorded. | YES · C1 |
| `services/identity/test/auth.service.spec.ts` | Covers the legacy `{displayName,email,password}` registration body.            | Phase 4A checkpoint.                                                       | YES · C1 |

### D. Social

| Path                                                  | Purpose                                                                               | Origin       | Commit   |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------- | ------------ | -------- |
| `services/social/src/database/migrate.ts`             | Restricts migration target to `equa_social` and creates that database when permitted. | Phase 4A.    | YES · C2 |
| `services/social/src/database/postgres.repository.ts` | Adds member-scoped group listing and persistence behavior.                            | Phase 4A/4B. | YES · C2 |
| `services/social/src/identity-adapter.ts`             | Adds a bounded, fail-closed Identity lookup.                                          | Phase 4B.    | YES · C2 |
| `services/social/src/ledger-adapter.ts`               | Adds a bounded, fail-closed Ledger call.                                              | Phase 4B.    | YES · C2 |
| `services/social/src/main.ts`                         | Adds authenticated group listing and structured/redacted request logging.             | Phase 4A/8.  | YES · C2 |
| `services/social/src/social.repository.ts`            | Adds the member group-list repository contract and in-memory implementation.          | Phase 4A.    | YES · C2 |
| `services/social/src/social.service.ts`               | Adds caller-scoped group listing.                                                     | Phase 4A.    | YES · C2 |
| `services/social/test/identity-adapter.spec.ts`       | Covers timeout and unavailable Identity behavior.                                     | Phase 4B.    | YES · C2 |
| `services/social/test/ledger-adapter.spec.ts`         | Covers timeout and fail-closed Ledger behavior.                                       | Phase 4B.    | YES · C2 |
| `services/social/test/main.spec.ts`                   | Covers group listing, correlation IDs and authorization boundaries.                   | Phase 4A/8.  | YES · C2 |
| `services/social/test/migrate.spec.ts`                | Covers database-name guard and safe identifier quoting.                               | Phase 4A.    | YES · C2 |

### E. Ledger

| Path                                                  | Purpose                                                                          | Origin       | Commit   |
| ----------------------------------------------------- | -------------------------------------------------------------------------------- | ------------ | -------- |
| `services/ledger/src/database/postgres.repository.ts` | Uses text-safe advisory-lock keys for idempotent mutations.                      | Phase 10.    | YES · C3 |
| `services/ledger/src/expense.service.ts`              | Adds caller-visible active expense listing and added-participant event metadata. | Phase 4A/10. | YES · C3 |
| `services/ledger/src/main.server.ts`                  | Adds the expense list route and structured/redacted request logging.             | Phase 4A/8.  | YES · C3 |
| `services/ledger/src/main.ts`                         | Loads the workspace environment for local service startup.                       | Phase 8/10.  | YES · C3 |
| `services/ledger/src/social-adapter.ts`               | Bounds internal Social requests and fails closed.                                | Phase 4B.    | YES · C3 |
| `services/ledger/src/types.ts`                        | Types optional added-participant IDs on outbox events.                           | Phase 10.    | YES · C3 |
| `services/ledger/test/expense.service.spec.ts`        | Covers list authorization and added-participant event deltas.                    | Phase 4A/10. | YES · C3 |
| `services/ledger/test/main.server.spec.ts`            | Covers authenticated list route and correlation header.                          | Phase 4A/8.  | YES · C3 |
| `services/ledger/test/postgres.repository.spec.ts`    | Regresses NUL-safe idempotency lock-key encoding.                                | Phase 10.    | YES · C3 |
| `services/ledger/test/social-adapter.spec.ts`         | Covers bounded Social membership calls.                                          | Phase 4B.    | YES · C3 |

### F. Automation & Sync

| Path                                                                                 | Purpose                                                                             | Origin           | Commit   |
| ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- | ---------------- | -------- |
| `services/automation-sync/src/automation/automation.service.ts`                      | Validates schedules and advances anchored occurrences in memory.                    | Phase 4C/11.     | YES · C4 |
| `services/automation-sync/src/automation/recurrence.ts`                              | Parses single-unit ISO periods and calculates UTC-anchored next dates.              | Phase 11.        | YES · C4 |
| `services/automation-sync/src/database/postgres.repository.ts`                       | Adds schedule anchors, terminal retries, conflict resolution and sequence ordering. | Phase 4C/6/8/11. | YES · C4 |
| `services/automation-sync/src/database/migrations/004_recurring_schedule_anchor.sql` | Backfills and requires the recurring UTC anchor.                                    | Phase 11.        | YES · C4 |
| `services/automation-sync/src/ledger/ledger.adapter.ts`                              | Adds request timeout and typed unavailable behavior.                                | Phase 4B/8.      | YES · C4 |
| `services/automation-sync/src/main.ts`                                               | Adds recurring validation, conflict endpoint, readiness/logging and env loading.    | Phase 6/8/11.    | YES · C4 |
| `services/automation-sync/src/sync/sync.service.ts`                                  | Blocks ordered successors and supports explicit conflict discard.                   | Phase 6.         | YES · C4 |
| `services/automation-sync/test/automation.service.spec.ts`                           | Covers anchored monthly schedule progression and retry identity.                    | Phase 11.        | YES · C4 |
| `services/automation-sync/test/ledger.adapter.spec.ts`                               | Covers timeout/unavailable adapter behavior.                                        | Phase 4B.        | YES · C4 |
| `services/automation-sync/test/local-demo.spec.ts`                                   | Updates the vertical in-memory notification assertion to recipient targeting.       | Phase 11.        | YES · C4 |
| `services/automation-sync/test/main.spec.ts`                                         | Covers recurring period inputs and conflict endpoint behavior.                      | Phase 6/10/11.   | YES · C4 |
| `services/automation-sync/test/postgres.repository.spec.ts`                          | Covers migration-era retry terminal state and persisted schedule anchors.           | Phase 4C/11.     | YES · C4 |
| `services/automation-sync/test/recurrence.spec.ts`                                   | Covers weekly/monthly/yearly/custom periods and calendar boundaries.                | Phase 11.        | YES · C4 |
| `services/automation-sync/test/sync.service.spec.ts`                                 | Covers predecessor/conflict blocking and explicit resolution.                       | Phase 6.         | YES · C4 |

### G. Notification

| Path                                                                               | Purpose                                                                         | Origin                                               | Commit   |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------- | -------- |
| `.env.example`                                                                     | Removes the unused Notification HTTP port; the worker has no HTTP listener.     | Pre-existing config cleanup; exact phase unrecorded. | YES · C5 |
| `workers/notification/package.json`                                                | Adds the service-owned `db:migrate` script.                                     | Phase 7.                                             | YES · C5 |
| `workers/notification/src/database/postgres.store.ts`                              | Atomically persists one inbox and recipient-specific jobs.                      | Phase 10/11.                                         | YES · C5 |
| `workers/notification/src/in-memory.store.ts`                                      | Mirrors event-wide inbox and multi-recipient idempotency.                       | Phase 10/11.                                         | YES · C5 |
| `workers/notification/src/main.ts`                                                 | Loads local env and reports bounded worker/Rabbit recovery diagnostics.         | Phase 8/10.                                          | YES · C5 |
| `workers/notification/src/notification.worker.spec.ts`                             | Covers recipient fan-out, deduplication, retries and recoverable poll failures. | Phase 4C/8/10/11.                                    | YES · C5 |
| `workers/notification/src/notification.worker.ts`                                  | Creates one stable delivery job per newly added participant.                    | Phase 4C/8/10/11.                                    | YES · C5 |
| `workers/notification/src/rabbit.consumer.spec.ts`                                 | Covers reconnect, ack failure and fencing/recovery behavior.                    | Phase 4C/8.                                          | YES · C5 |
| `workers/notification/src/rabbit.consumer.ts`                                      | Adds capped reconnect backoff and rejected-ack recovery.                        | Phase 4C/8.                                          | YES · C5 |
| `workers/notification/src/database/migrations/003_notification_recipient_jobs.sql` | Replaces event-only job uniqueness with event/recipient uniqueness.             | Phase 10.                                            | YES · C5 |

### H. Web

| Path                                     | Purpose                                                                  | Origin                                                         | Commit   |
| ---------------------------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------- | -------- |
| `apps/web/app/dashboard/page.tsx`        | Connects dashboard values/navigation to API mode and separate demo mode. | Phase 5/10.                                                    | YES · C6 |
| `apps/web/app/layout.tsx`                | Loads the Web demo styling.                                              | Phase 5.                                                       | YES · C6 |
| `apps/web/app/page.tsx`                  | Adds authenticated API login and explicit Local Demo entry.              | Phase 5.                                                       | YES · C6 |
| `apps/web/app/profile/page.tsx`          | Uses Identity API client for profile/avatar operations.                  | Phase 5.                                                       | YES · C6 |
| `apps/web/package.json`                  | Adds contracts dependency and Windows-compatible Web dev port.           | Phase 5; dev script compatibility fix in current working tree. | YES · C6 |
| `apps/web/app/api-client.ts`             | Adds authenticated Gateway client, refresh handling and mutation keys.   | Phase 5.                                                       | YES · C6 |
| `apps/web/app/api-client.spec.ts`        | Covers refresh races, logout, credentials and mutation idempotency.      | Phase 5.                                                       | YES · C6 |
| `apps/web/app/components/demo-shell.tsx` | Provides shared page shell and explicit Local Demo label.                | Local Demo/Phase 5.                                            | YES · C6 |
| `apps/web/app/demo-store.ts`             | Keeps browser demo data separate from API data.                          | Local Demo/Phase 5.                                            | YES · C6 |
| `apps/web/app/demo-store.spec.ts`        | Prevents comma input from silently changing a Local Demo amount.         | Phase 11 regression fix.                                       | YES · C6 |
| `apps/web/app/demo.css`                  | Styles the Local Demo pages using the existing visual language.          | Local Demo/Phase 5.                                            | YES · C6 |
| `apps/web/app/expenses/page.tsx`         | Adds API-backed expense CRUD/filter totals and explicit demo variant.    | Phase 5.                                                       | YES · C6 |
| `apps/web/app/friends/page.tsx`          | Adds API-backed friend flows and pair balances.                          | Phase 5/10.                                                    | YES · C6 |
| `apps/web/app/groups/page.tsx`           | Adds API-backed group create/list/invitation acceptance.                 | Phase 5.                                                       | YES · C6 |
| `apps/web/app/groups/[id]/page.tsx`      | Adds group edit/invite/member removal/dissolve actions.                  | Phase 5/10; invite form reset fixed in Phase 11.               | YES · C6 |
| `apps/web/app/money.ts`                  | Converts display input to minor units with integer arithmetic.           | Phase 5; strict comma rejection fix in Phase 11.               | YES · C6 |
| `apps/web/app/money.spec.ts`             | Covers minor-unit parsing/formatting and comma rejection.                | Phase 5/11.                                                    | YES · C6 |
| `docs/WEB_MVP_RUNBOOK.md`                | Documents the API-mode browser flow and Local Demo boundary.             | Phase 5/10.                                                    | YES · C6 |

### I. Mobile

| Path                                           | Purpose                                                                      | Origin         | Commit   |
| ---------------------------------------------- | ---------------------------------------------------------------------------- | -------------- | -------- |
| `apps/mobile/App.tsx`                          | Integrates owner-scoped queue recovery, conflict review and offline panel.   | Phase 6/10.    | YES · C7 |
| `apps/mobile/src/api/sync-api.ts`              | Adds bounded sync requests and explicit conflict-resolution transport.       | Phase 6.       | YES · C7 |
| `apps/mobile/src/api/sync-api.spec.ts`         | Covers request timeout and conflict endpoint construction.                   | Phase 6.       | YES · C7 |
| `apps/mobile/src/auth/auth-api.ts`             | Sends the Identity mobile header and bounds login/refresh requests.          | Phase 6.       | YES · C7 |
| `apps/mobile/src/auth/login-handoff.ts`        | Guards account-owner session handoff around local-store recovery.            | Phase 6.       | YES · C7 |
| `apps/mobile/src/auth/login-handoff.spec.ts`   | Covers stale handoff and owner-scoped store recovery.                        | Phase 6.       | YES · C7 |
| `apps/mobile/src/auth/session.ts`              | Serializes SecureStore token writes and fails closed on ambiguous refresh.   | Phase 6.       | YES · C7 |
| `apps/mobile/src/auth/session.spec.ts`         | Covers actual HTTP headers, timeout and stale logout/account writes.         | Phase 6.       | YES · C7 |
| `apps/mobile/src/db/local-store.ts`            | Adds cache/conflict summaries, retry deferral and owner quarantine recovery. | Phase 4C/6/10. | YES · C7 |
| `apps/mobile/src/db/local-store.spec.ts`       | Covers cache owner isolation, restart and queue retry/conflict behavior.     | Phase 4C/6/10. | YES · C7 |
| `apps/mobile/src/sync/sync-client.ts`          | Adds auth deferral, wake recovery and explicit server conflict resolution.   | Phase 4C/6.    | YES · C7 |
| `apps/mobile/src/sync/offline-data-panel.tsx`  | Displays cached groups/expenses and queues offline create/edit.              | Phase 10.      | YES · C7 |
| `apps/mobile/src/sync/offline-expense.ts`      | Validates/builds integer-minor expense mutations.                            | Phase 10.      | YES · C7 |
| `apps/mobile/src/sync/offline-expense.spec.ts` | Covers offline operation IDs, payloads and share invariants.                 | Phase 10.      | YES · C7 |

### J. Shared contracts

| Path                                        | Purpose                                                              | Origin                                                                  | Commit   |
| ------------------------------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------- | -------- |
| `packages/contracts/src/automation.ts`      | Adds conflict-resolution and typed expense-event metadata contracts. | Phase 6/10.                                                             | YES · C4 |
| `packages/contracts/src/automation.spec.ts` | Covers UUID sync operation and discard contracts.                    | Phase 6/10.                                                             | YES · C4 |
| `packages/contracts/src/index.ts`           | Registers Social and Automation & Sync service names.                | Pre-existing runtime/contract reconciliation; exact phase not recorded. | YES · C4 |
| `packages/contracts/src/index.spec.ts`      | Keeps the service inventory contract synchronized.                   | Same as `index.ts`.                                                     | YES · C4 |

### K. Generated/artifact

| Path                 | Purpose                                            | Origin                                                | Commit                |
| -------------------- | -------------------------------------------------- | ----------------------------------------------------- | --------------------- |
| `apps/web/AGENTS.md` | Generic Next 16.3-generated guidance.              | Generated by `next dev` during Phase 10.              | NO · Phase12 excluded |
| `apps/web/CLAUDE.md` | Generic pointer to `AGENTS.md`.                    | Generated by `next dev` during Phase 10.              | NO · Phase12 excluded |
| `pnpm-lock.yaml`     | Records the Web workspace dependency on contracts. | Package-manager-generated for Phase 5 Web dependency. | YES · C6              |

### L. Unrelated/pre-existing

No changed path was found that is unrelated to the Equa work represented by this branch. Several components predate this review; their origin is marked above when the checkpoint does not attribute a phase.

### M. Suspicious / needs human review

No suspicious path or unexplained binary is present in the current status. `.env` is ignored and absent from the diff; `next-env.d.ts` and `tsconfig.tsbuildinfo` were restored/left clean; `.next`, `dist`, coverage and logs are not in status.

## Confirmed defects fixed during stabilization

| Defect                                                                                                     | Fix                                                                      | Verification                                                                        |
| ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| Group invitation handler read `event.currentTarget` after awaiting the API, which can be cleared by React. | Capture the form element before the await, then reset the captured form. | Headless Chrome invitation smoke: success feedback, empty field, zero page errors.  |
| Web money parsing removed commas without validating placement, so input `1,2` became `12`.                 | Reject comma-formatted input in API and Local Demo parsers.              | Web regression tests reject malformed/grouped comma values; workspace suite passes. |
| The inventory row used `apps/web/app/package.json`, a path absent from Git status.                         | Correct it to `apps/web/package.json`.                                   | Compared every status path with the inventory: all 111 paths appear exactly once.   |

No unresolved bug caused by the current diff was confirmed. The known cross-service debt-check/removal race remains a documented correctness risk; no cross-service database access or transaction was introduced.

## Secret and sensitive-data audit

**PASS.** A scan of all 111 changed and untracked files found no private keys, GitHub/AWS credentials, compact JWTs, or non-local credentials. URL-pattern hits were `.env.example`'s documented localhost-only values and the synthetic localhost URL in the Social migration test. Reviewed credential literals in Mobile, Automation, and Identity tests are test tokens, signing values, verification codes, and passwords; none are production credentials. The ignored `.env` was not read and is absent from Git status. Integration documentation records synthetic IDs but no passwords or live tokens.

## Local artifacts excluded from the changeset

| Path                                          | Classification                                           | Commit treatment                             |
| --------------------------------------------- | -------------------------------------------------------- | -------------------------------------------- |
| `.env`                                        | Local environment file, ignored by `.gitignore`.         | Do not commit; it is absent from Git status. |
| `apps/web/.next/`                             | Next build cache, ignored by `.gitignore`.               | Do not commit; it is absent from Git status. |
| `apps/web/next-env.d.ts`                      | Tracked baseline file, currently clean.                  | Not part of this changeset.                  |
| `apps/web/tsconfig.tsbuildinfo`               | Tracked TypeScript build state, clean after restoration. | Not part of this changeset.                  |
| Root `coverage/` and `dist/`                  | Not present; both patterns are ignored globally.         | No files to exclude.                         |
| `.turbo/**` and `apps/mobile/.expo/dev/logs/` | Ignored generated task/build and Expo development logs.  | Do not commit; absent from Git status.       |
| Repository-local `*.db` / `*.sqlite*`         | None found in the targeted repository scan.              | No files to exclude.                         |
| Temporary audit probes                        | None found in the changed/untracked inventory.           | No files to exclude.                         |

`apps/web/AGENTS.md` and `apps/web/CLAUDE.md` are generic generated guidance, not project-specific requirements. Phase 12 explicitly excludes them from commits; leave them untracked and do not delete them.

## High-risk review

| Area                                                | Result        | Evidence / limitation                                                                                                                             |
| --------------------------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ledger PostgreSQL idempotency lock                  | PASS          | JSON-encoded scope/key avoids NUL rejection; a regression test and live PostgreSQL create/replay passed.                                          |
| Expense access, edit/delete and recalculation       | PASS          | Caller-visible list access is checked; live stale-version conflict, soft-delete/history and totals were verified.                                 |
| Friend/member debt removal                          | RISK          | Live debt gates passed, but Ledger check and Social removal are separate calls; concurrent debt creation/removal is not atomic.                   |
| Recurring schedule and idempotency                  | PASS          | PnD/PnW/PnM/PnY use an original UTC anchor; month-end/leap-day tests and a live P1M occurrence passed; execution key is deterministic.            |
| Sync ordering and conflict/discard                  | PASS          | Database sequence/predecessor checks, durable conflict, and owner/device-scoped explicit discard passed tests and local API flow.                 |
| Mobile refresh/token storage                        | PASS in tests | Actual mobile auth request headers, SecureStore session epochs and ambiguous refresh fail-closed behavior are covered; native runtime is NOT RUN. |
| Rabbit reconnect/ack and notification deduplication | PASS          | Recovery/backoff/ack tests pass; live Rabbit/PostgreSQL ingest and recipient fan-out were verified; external provider is disabled.                |
| Web API integration                                 | PASS          | Headless Chrome exercised API mode through Kong; Local Demo remains a separate labeled storage mode.                                              |

## Architecture boundary review

| Check                                      | Result | Evidence / limitation                                                                                                                                                           |
| ------------------------------------------ | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Service database ownership                 | PASS   | Ledger, Social, Automation & Sync, and Notification stores use their own configured database URLs. Inter-service access in the reviewed changes uses HTTP adapters or RabbitMQ. |
| Ledger financial source of truth           | PASS   | Recurring execution calls `HttpLedgerAdapter`; Automation & Sync opens only its own database. Ledger owns expense writes, version checks, and outbox persistence.               |
| Social friend/group ownership              | PASS   | Social persists friend/group state and calls Ledger debt/balance routes through `HttpSocialLedgerAdapter`; no cross-service database query was added.                           |
| Public Gateway and internal service routes | PASS   | Kong exposes public `/v1` routes and no `/internal` route. Ledger/Social internal handlers check `x-equa-service-key`; Web/Mobile API clients use configured Gateway bases.     |
| Asynchronous notification processing       | PASS   | Ledger outbox events are consumed through RabbitMQ; Notification has no public HTTP route. Provider delivery remains asynchronous and disabled in this environment.             |
| Money and conflict safety                  | PASS   | Ledger stores integer minor units and uses `BigInt` for totals. Idempotency and expected-version checks prevent duplicate writes and silent stale-version overwrites.           |

## Final validation

| Command/check                                                  | Result                                                                                                    |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `pnpm test`                                                    | PASS — 161 tests; forced uncached run also passed                                                         |
| `pnpm lint`                                                    | PASS — forced uncached lint tasks passed for all 9 packages                                               |
| `pnpm typecheck`                                               | PASS — forced uncached typecheck tasks passed for all 9 packages                                          |
| `pnpm build`                                                   | PASS — Web built fresh; other package build outputs were hash-cached                                      |
| `node --test scripts/ci/affected-components.test.mjs`          | PASS — 8/8                                                                                                |
| `pnpm check:scaffold`                                          | PASS                                                                                                      |
| `pnpm check:compose`                                           | PASS                                                                                                      |
| actionlint on all workflow YAML                                | NOT RUN in Phase 12; executable is unavailable. Phase 11's prior result is not used as current validation |
| Targeted Prettier on changed source/docs/workflows             | PASS                                                                                                      |
| `git diff --check`                                             | PASS                                                                                                      |
| Full `pnpm format:check`                                       | FAIL — 10 unchanged files plus `pnpm-lock.yaml`; the lockfile also fails on the committed baseline        |
| Docker/PostgreSQL/RabbitMQ/local Web                           | PASS for the documented manual scenarios; not production evidence                                         |
| Native Expo/device, provider delivery, staging, backup/restore | NOT RUN                                                                                                   |

The 10 unchanged Prettier failures are `apps/web/app/reset-password/page.tsx`, `apps/web/app/styles.css`, `apps/web/next-env.d.ts`, `apps/web/next.config.ts`, `docs/API_IDENTITY.md`, `docs/IDENTITY_RUNBOOK.md`, `services/identity/src/auth/auth.controller.ts`, `services/identity/src/profile/avatar.service.ts`, `services/identity/test/profile.spec.ts`, and `services/identity/vitest.config.ts`. Do not reformat them as part of this changeset.

## Proposed ordered commits

| #   | Commit message                                                               | Scope/files                                                                     | Purpose and dependencies                                                                                                             | Validation / independence                                                                                      |
| --- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| 1   | `fix(identity): preserve legacy email-only registration`                     | C1 inventory paths                                                              | Registration compatibility; independent of other feature commits.                                                                    | Identity tests/typecheck/lint/build; current workspace gate passes.                                            |
| 2   | `fix(social): scope group listing and constrain migrations`                  | D inventory paths                                                               | Social-owned group listing, guarded `equa_social` migration, bounded Identity/Ledger adapters.                                       | Social tests/typecheck/lint/build; service stores remain Social-owned.                                         |
| 3   | `fix(ledger): authorize expense listing and preserve idempotency`            | E inventory paths                                                               | Caller-visible expenses, PG-safe idempotency, participant event delta; depends on Social membership contract.                        | Ledger tests/typecheck/lint/build; PG replay/conflict evidence recorded.                                       |
| 4   | `feat(automation-sync): anchor recurring periods and resolve sync conflicts` | F and J inventory paths                                                         | Shared sync contracts plus Automation schedule/order/conflict behavior; depends on Ledger API.                                       | Contract/Automation tests/typecheck/lint/build; PostgreSQL migration 004 and live monthly occurrence verified. |
| 5   | `fix(notification): target jobs to newly added expense participants`         | G inventory paths                                                               | Transactional inbox + recipient jobs and reconnect/retry recovery; depends on Ledger event metadata and contracts.                   | Notification tests/typecheck/lint/build; migration 003 and local Rabbit/PostgreSQL evidence.                   |
| 6   | `feat(web): connect MVP routes to gateway-backed services`                   | H and required K paths (excluding AGENTS.md/CLAUDE.md), plus `infra/kong/*.yml` | API-mode Web flows, separate Local Demo, workspace contract link and routes; depends on Identity, Social, Ledger and contracts.      | Web tests/typecheck/lint/build and Chrome flow; current routes return HTTP 200.                                |
| 7   | `feat(mobile): persist offline expense cache and conflict actions`           | I inventory paths                                                               | Owner-scoped cache/outbox, secure session recovery and explicit conflict handling; depends on Identity and Automation contracts/API. | Mobile tests/typecheck/lint/build-equivalent; native device check remains NOT RUN.                             |
| 8   | `chore(ci): validate affected components and deployable images`              | A inventory paths                                                               | Component-aware CI/staging/release matrices; sequenced after Web because detector expectations include its contracts dependency.     | Detector 8/8, scaffold and Compose pass; actionlint NOT RUN (executable unavailable).                          |
| 9   | `docs(architecture): record ownership, validation and readiness`             | B inventory paths except `docs/PROJECT_EXECUTION_STATE.md`                      | Final ownership/readiness docs and this review; depends on the preceding code groups for accurate evidence.                          | Targeted Prettier and `git diff --check`; no runtime dependencies.                                             |
| 10  | `docs(project): record Phase 12 commits and validation results`              | `docs/PROJECT_EXECUTION_STATE.md`                                               | Final durable checkpoint after C1–C9 and post-commit validation.                                                                     | Targeted Prettier and `git diff --check`; no runtime dependencies.                                             |

## Commit independence check

The dependency review says each ordered group should leave the repository buildable and testable. The component gates ran on the complete tree; intermediate commit snapshots were not constructed or tested separately.

| Commit                                  | Repo builds/tests after this commit? | Gate and dependency basis                                                                                        |
| --------------------------------------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| C1 Identity                             | YES                                  | Identity tests/typecheck/lint/build; standalone service change.                                                  |
| C2 Social                               | YES                                  | Social tests/typecheck/lint/build; uses existing Identity/Ledger API contracts.                                  |
| C3 Ledger                               | YES                                  | Ledger tests/typecheck/lint/build; Social membership contract is already in C2.                                  |
| C4 Automation & Sync + shared contracts | YES                                  | Contract/Automation tests/typecheck/build; Ledger API is already in C3.                                          |
| C5 Notification                         | YES                                  | Notification tests/typecheck/build; Ledger event metadata and contracts are already in C3/C4.                    |
| C6 Web                                  | YES                                  | Web tests/typecheck/lint/build; APIs and shared contracts precede it.                                            |
| C7 Mobile                               | YES                                  | Mobile tests/typecheck/build-equivalent; Automation conflict contract/API precedes it in C4.                     |
| C8 CI/CD                                | YES                                  | Affected-component tests, scaffold, and Compose pass; actionlint unavailable in Phase 12; Web metadata is in C6. |
| C9 Documentation                        | YES                                  | Targeted Prettier and `git diff --check`; documentation-only.                                                    |
| C10 Checkpoint                          | YES                                  | Targeted Prettier and `git diff --check`; documentation-only.                                                    |

The repository-wide format gate remains the known baseline exception listed above, so CI's format job will remain red until those unrelated files are addressed separately.

## Working tree safety

**Phase 11 inventory snapshot: SAFE TO COMMIT after manual review.** The status-to-inventory check found 70 tracked modifications and 41 untracked paths, each represented exactly once. Phase 12 commits C1–C8 were created without push, merge, reset or clean. C9 is this architecture/review documentation commit; C10 records the final checkpoint after the required post-commit validation. Per the explicit Phase 12 decision, `apps/web/AGENTS.md` and `apps/web/CLAUDE.md` remain untracked and were not deleted. `.env`, `apps/web/.next/`, `.turbo/`, and `.expo/` logs are ignored; tracked `apps/web/next-env.d.ts` and `apps/web/tsconfig.tsbuildinfo` are clean. No temporary probe or database artifact is included.

## Human review items

- The generic Next `AGENTS.md`/`CLAUDE.md` pair is intentionally left untracked under the Phase 12 decision; they contain no project-specific content.
- Accept that root `pnpm format:check` remains red on the 10 listed baseline files plus the baseline-unformatted lockfile.
- Keep production NOT READY until external provider, staging, backup/restore, native Mobile, and product semantics for split/balance/debt/settlement/reminders/history are resolved.
