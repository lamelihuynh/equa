# Equa Class Test Validation

Updated: 2026-10-08. Environment target: **STAGING / COURSE TEST**. This matrix is intentionally not a readiness claim; no public backend, public Web, or Android build has been verified.

| Feature      | Web Public | Android | Backend | Status  | Evidence                                                                                                               | Known issue                                                                                               |
| ------------ | ---------- | ------- | ------- | ------- | ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Identity     | NOT RUN    | NOT RUN | PARTIAL | BLOCKED | Local flows documented; Render Free service `srv-db26vk6k1f9s739bmskg` created; migration PASS                         | Initial BUILD failed at `corepack enable`; direct-Corepack fix validated locally; redeploy/health pending |
| Friends      | NOT RUN    | NOT RUN | PARTIAL | PARTIAL | Social APIs and local two-user flow are recorded in `docs/INTEGRATION_TESTING.md`; Mobile API adapters are unit tested | Public two-account flow has not run                                                                       |
| Groups       | NOT RUN    | NOT RUN | PARTIAL | PARTIAL | Social group/member/role APIs; Web and Mobile routes are implemented locally                                           | Public permissions/debt behavior has not run                                                              |
| Invitations  | NOT RUN    | NOT RUN | PARTIAL | PARTIAL | Social in-app invitation lifecycle and local Web flow are documented                                                   | Public in-app accept/decline has not run; Notification/RabbitMQ email delivery is not in the $0 topology  |
| Expenses     | NOT RUN    | NOT RUN | PARTIAL | PARTIAL | Local Ledger create/edit/idempotency/soft-delete evidence; Mobile API and integer-money tests                          | Public shared-expense flow has not run                                                                    |
| Dashboard    | NOT RUN    | NOT RUN | PARTIAL | PARTIAL | Web local API flow and Mobile overview code                                                                            | Public totals and cold-start behavior have not run                                                        |
| Profile      | NOT RUN    | NOT RUN | PARTIAL | PARTIAL | Identity profile APIs and Mobile profile/session tests                                                                 | Public profile persistence has not run; avatar storage is disabled in the staging candidate               |
| Offline      | N/A        | NOT RUN | PARTIAL | PARTIAL | Mobile SQLite cache/outbox/reopen/retry tests; offline create/edit/delete operations                                   | Native offline/restart/reconnect behavior has not run                                                     |
| Sync         | N/A        | NOT RUN | PARTIAL | PARTIAL | Automation sync unit tests and Mobile queue/conflict tests pass locally                                                | Automation has not been deployed; public sync and device conflict UX have not run                         |
| Recurring    | N/A        | NOT RUN | PARTIAL | PARTIAL | Local Automation scheduler/occurrence tests                                                                            | Public scheduler deployment is not yet verified                                                           |
| Notification | NOT RUN    | NOT RUN | PARTIAL | PARTIAL | Local Notification worker and Mailpit tests are documented                                                             | Notification/RabbitMQ are omitted; debt reminders and public provider delivery remain unavailable         |

## Current local validation

- Mobile: 53 tests passed; typecheck/build and lint passed.
- Automation & Sync: 42 tests passed; typecheck, lint, and build passed.
- Identity Render build fix: Corepack `pnpm` version `11.21.0`, frozen install PASS, Identity workspace build PASS; Render Blueprint validation PASS. Remote redeploy and `/health` verification NOT RUN.
- Render Blueprint: valid 19-action Free-only candidate; one Free Postgres and the Identity Free service exist.
- Kong staging image build and substituted configuration parse passed.
- GitHub CI run `37338178757` and Security run `37338178538` passed for `staging/demo` SHA `dcfb44c0b2a22846e0809328e6b9950ed25269ad`. Deploy staging run `37338178878` was skipped.
- Resend sender/key readiness confirmed by the user; EAS CLI `whoami` authentication PASS. Neither email delivery nor an EAS build has been run.
- One Free Render Postgres is available. Read-only SQL verified effective `current_user=equa_staging_owner` with `rolsuper=false`, `rolcreatedb=true`; safe metadata and external URL identify default login `newcredential`. Identity, Social, Ledger, and Automation migrations PASS on Render with TLS (`equa_identity`, `equa_social`, `equa_ledger`, `equa_automation_sync`). One Automation attempt was interrupted and its idempotent retry passed. The temporary runner `/32` was removed; allow list is empty. Identity Free service `srv-db26vk6k1f9s739bmskg` exists; first BUILD failed at `corepack enable`; local Corepack fix passes; redeploy/health pending. No password or connection string was emitted.
- Current provider authentication checks: Render CLI authenticated to workspace `equa`; Vercel CLI `whoami` is `tikyisme` and existing Hobby project `equa-staging-demo-web` remains undeployed; EAS `whoami` is `tikyisme` (Owner). All four Render logical DB migrations pass.
- Native Android validation, EAS APK, staging migrations, and every public acceptance flow are **NOT RUN**.

## Readiness gates

- Enter the ready Resend key into Render secrets after Identity exists.
- EAS preview build and public API configuration; account authentication is confirmed.
- Identity service exists. User enters `RESEND_API_KEY` and `EMAIL_FROM` directly in Render Dashboard; then verify deploy/health, registration, Resend email, and login. No secret in chat.
- Provision only Free resources and test whether the Postgres owner can create `equa_automation_sync`.
- Run public Web and Android acceptance before distributing class-test URLs.

Production remains **NOT READY**.
