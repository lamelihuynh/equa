# Equa V1 production readiness

Assessment snapshot: 2026-09-29, branch feature/automation-sync. This is a repository and local-runtime assessment, not production approval or deployment.

## Decision

**NOT READY for production.** The scoped local PostgreSQL/RabbitMQ/Web scenario passed and the Web API-mode flow is suitable for a local MVP demonstration. Unspecified financial semantics, notification gaps, native mobile validation, cross-service race risks, and production operations prevent release.

## Demo readiness

**READY for the verified local Web/API demo path.** Headless Chrome exercised login, friends/balance, groups, expense create/edit/delete, dashboard/profile, and group image/edit/dissolve through Kong. Native Mobile and external notification delivery are outside this READY claim.

## Area assessment

| Area                    | Status                            | Evidence and remaining work                                                                                                                                                                                                                                  |
| ----------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Product requirements    | NOT READY                         | 14 FRs and 3 BRs are DONE; 6 FRs and BR-004 are PARTIAL; 9 FRs are BLOCKED. FR-NOTI-002 is blocked pending reminder timing/recipient policy; no supplied FR remains unclassified.                                                                            |
| Financial correctness   | NOT READY                         | Real local PostgreSQL create/replay/edit/stale-conflict/soft-delete/history/totals/outbox passed. Friend/member debt check and removal are separate service calls without cross-service atomicity; exhaustive race stress and settlement remain unresolved.  |
| Service architecture    | READY WITH EXTERNAL CONFIGURATION | Service-owned databases and HTTP boundaries were exercised locally. Production network isolation, service-key distribution, and private connectivity need environment verification.                                                                          |
| Sync correctness        | NOT READY                         | SQLite cache/outbox and conflict logic have disk/unit tests; Mobile profile now provides cached group/expense view plus offline create/edit. Live Automation replay/conflict/discard passed, but native reconnect/account-switch behavior is NOT RUN.        |
| Notifications           | NOT READY                         | Live Ledger/Rabbit ingestion persisted recipient-specific jobs for a newly added expense participant and deduplicated create replay. Debt reminders and settlement notices remain blocked; the delivery provider is disabled.                                |
| Web                     | READY WITH EXTERNAL CONFIGURATION | Real API-mode flow passed in headless Chrome through Kong. Staging Gateway/upstreams and external deployment configuration remain absent.                                                                                                                    |
| Quality and CI          | READY WITH EXTERNAL CONFIGURATION | Repository-wide Prettier, workspace tests/lint/typecheck/build, actionlint, scaffold, Compose, affected-component checks, GitHub CI, and Security/CodeQL pass on PR #18. Automated isolated PostgreSQL/RabbitMQ E2E and native-device CI remain unavailable. |
| Operations and recovery | NOT READY                         | Local migrations and the scoped scenario passed. Production staging beyond Identity, backup/PITR, restore drill, queue alerts, and rollback evidence are absent.                                                                                             |
| Security                | NOT READY                         | JWT/service guards, Kong limits, redacted API logs, CodeQL/Dependabot configuration and non-root containers exist. Rotation, dependency/image scanning, DAST, workload identity and production policy remain unverified.                                     |

## Requirement summary

The Phase 10 brief supplies exact statements for FR-FRD/GRP/EXP/REC/NOTI/SYNC and BR-004/005/010/013. It explicitly withholds detailed FR-SPL/BAL/DEBT/STL semantics. Statuses mirror docs/BACKEND_COMPLETENESS.md.

| Status      | Requirements                                                                                |
| ----------- | ------------------------------------------------------------------------------------------- |
| DONE (17)   | FR-FRD-001/003, FR-GRP-001/002/004/005, FR-EXP-001..005, FR-REC-001/002/003, BR-005/010/013 |
| PARTIAL (7) | FR-FRD-002, FR-GRP-003, FR-NOTI-001, FR-SYNC-001..003, BR-004                               |
| MISSING     | None                                                                                        |
| BLOCKED (9) | FR-SPL-001..004, FR-BAL-001, FR-DEBT-001, FR-STL-001, FR-NOTI-002/003                       |
| DEFERRED    | Insights                                                                                    |

A PostgreSQL expense write exposed a NUL byte in the advisory-lock key. It was repaired, covered by a regression test, and verified with successful real PostgreSQL create/replay. No unresolved P0 was found in the exercised scenarios; the cross-service debt-removal race and untested runtime paths prevent a broader correctness claim.

## Release checklist

- [x] Reconcile the supplied FR/BR statements; leave unsupplied split/balance/debt/settlement rules blocked.
- [x] Apply all five local service migrations and verify each service migration table.
- [x] Run the scoped local Identity -> Social -> Ledger -> Automation/Sync -> RabbitMQ -> Notification scenario.
- [x] Exercise duplicate/reverse Social requests, duplicate invitations, debt gates, expense idempotency/version/delete/history, recurring, sync conflict and inbox deduplication against local PostgreSQL/RabbitMQ.
- [x] Run the Web API-mode flow in headless Chrome through Kong.
- [x] Fix the Ledger PostgreSQL advisory-lock encoding failure and rerun the write/idempotency path.
- [ ] Decide split/balance/debt/settlement and post-dissolution history semantics with Product.
- [ ] Decide debt-reminder timing/recipients and participant-specific notification behavior; configure a provider.
- [ ] Run native Expo login/offline/restart/reconnect/conflict/account-switch checks on a device/emulator.
- [ ] Add automated isolated PostgreSQL/RabbitMQ integration and exhaustive concurrency/failure tests.
- [ ] Configure staging for all deployable components, secret management, security gates and rollback.
- [ ] Configure backups/PITR and complete an isolated restore drill.

## Actions requiring external input or environment

1. Product must define split/balance/debt/settlement rules, reminder timing, and post-dissolution history visibility.
2. A native Expo device/emulator is needed for Mobile runtime validation.
3. Configure staging/production targets, notification provider, secret management, backups/PITR, and restore operator.
4. Add automated CI integration/browser/device coverage after choosing its CI environment.

Local test credentials and tokens are not recorded here. No production deployment was attempted.
