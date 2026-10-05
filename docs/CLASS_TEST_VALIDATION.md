# Equa Class Test Validation

Updated: 2026-10-05. Environment target: **STAGING / COURSE TEST**. This matrix is intentionally not a readiness claim; no public backend, public Web, or Android build has been verified.

| Feature      | Web Public | Android | Backend | Status  | Evidence                                                                                                               | Known issue                                                                                              |
| ------------ | ---------- | ------- | ------- | ------- | ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Identity     | NOT RUN    | NOT RUN | PARTIAL | BLOCKED | Identity register/verify/login flows have local integration evidence in `docs/INTEGRATION_TESTING.md`                  | Public registration requires a verified Resend sender and API key                                        |
| Friends      | NOT RUN    | NOT RUN | PARTIAL | PARTIAL | Social APIs and local two-user flow are recorded in `docs/INTEGRATION_TESTING.md`; Mobile API adapters are unit tested | Public two-account flow has not run                                                                      |
| Groups       | NOT RUN    | NOT RUN | PARTIAL | PARTIAL | Social group/member/role APIs; Web and Mobile routes are implemented locally                                           | Public permissions/debt behavior has not run                                                             |
| Invitations  | NOT RUN    | NOT RUN | PARTIAL | PARTIAL | Social in-app invitation lifecycle and local Web flow are documented                                                   | Public in-app accept/decline has not run; Notification/RabbitMQ email delivery is not in the $0 topology |
| Expenses     | NOT RUN    | NOT RUN | PARTIAL | PARTIAL | Local Ledger create/edit/idempotency/soft-delete evidence; Mobile API and integer-money tests                          | Public shared-expense flow has not run                                                                   |
| Dashboard    | NOT RUN    | NOT RUN | PARTIAL | PARTIAL | Web local API flow and Mobile overview code                                                                            | Public totals and cold-start behavior have not run                                                       |
| Profile      | NOT RUN    | NOT RUN | PARTIAL | PARTIAL | Identity profile APIs and Mobile profile/session tests                                                                 | Public profile persistence has not run; avatar storage is disabled in the staging candidate              |
| Offline      | N/A        | NOT RUN | PARTIAL | PARTIAL | Mobile SQLite cache/outbox/reopen/retry tests; offline create/edit/delete operations                                   | Native offline/restart/reconnect behavior has not run                                                    |
| Sync         | N/A        | NOT RUN | PARTIAL | PARTIAL | Automation sync unit tests and Mobile queue/conflict tests pass locally                                                | Automation has not been deployed; public sync and device conflict UX have not run                        |
| Recurring    | N/A        | NOT RUN | PARTIAL | PARTIAL | Local Automation scheduler/occurrence tests                                                                            | Public scheduler deployment is not yet verified                                                          |
| Notification | NOT RUN    | NOT RUN | PARTIAL | PARTIAL | Local Notification worker and Mailpit tests are documented                                                             | Notification/RabbitMQ are omitted; debt reminders and public provider delivery remain unavailable        |

## Current local validation

- Mobile: 53 tests passed; typecheck/build and lint passed.
- Automation & Sync: 42 tests passed; typecheck, lint, and build passed.
- Render Blueprint: valid 15-action Free-only candidate; no resources created.
- Kong staging image build and substituted configuration parse passed.
- GitHub CI and Security passed for `staging/demo` SHA `7151993624ee5712307c284b4e4509ba461686b9`.
- Native Android validation, EAS APK, staging migrations, and every public acceptance flow are **NOT RUN**.

## Readiness gates

- Resend verified sender and API key for public registration.
- Expo/EAS account authorization for the preview APK build.
- Provision only Free resources and test whether the Postgres owner can create `equa_automation_sync`.
- Run public Web and Android acceptance before distributing class-test URLs.

Production remains **NOT READY**.
