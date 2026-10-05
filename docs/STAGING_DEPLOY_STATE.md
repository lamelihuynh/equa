# STAGING / CLASS TEST Deployment Checkpoint

Updated: 2026-10-05 (Asia/Saigon). No credentials are recorded here.

## Current phase

Public class-test deployment has not started. Self-service registration/email verification requires a verified Resend sender and API key; neither is configured and no Render service exists to hold the secret. Mobile class-test screens/API adapters are implemented locally and pass package checks. EAS CLI configuration requires Expo account login. These are the current external gates.

## Source and worktree

| Item                | Current state                                                                                                                                                                                 |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Branch / local HEAD | `staging/demo` / `31c2e007583ed19c77d9c05d891e0bc3e332446d`                                                                                                                                   |
| Remote              | `origin/staging/demo` points to the same SHA                                                                                                                                                  |
| Source comparison   | `staging/demo` is 11 commits ahead of `feature/automation-sync` at `0043ee64680a346eb816db05bb9ad52f1d46521c`; staging contains the newer Web identity/invitation changes and deployment prep |
| Worktree            | Dirty; preserve the listed generated/checkpoint/report files and generic AGENTS/CLAUDE files                                                                                                  |
| Git discipline      | No commit, push, merge, reset, or clean during this reconciliation                                                                                                                            |

## Provider inventory (fresh read-only check)

- Render CLI is authenticated to workspace `equa` (`tea-db1jlktg1s2s73agmkog`). Projects, services, and Postgres lists are empty. The CLI does not expose the workspace billing plan. No resources were created.
- Vercel CLI is authenticated as `tikyisme`; the current `ti-ky-s-projects` scope is Hobby. It contains one unrelated project and no Equa project. Leave that project untouched.
- The inaccessible `equa1/equa-web-staging` scope is not required and must not be modified. No DNS was changed.
- The current local `.env` selects `EMAIL_PROVIDER=mailpit`; it has no `RESEND_API_KEY`. This proves no local key is configured, not whether a Resend account exists.

## Scope and resource plan

The committed `render.yaml` remains the earlier lecturer-demo candidate. The local working tree now adds a Free Automation & Sync service, its service key/database target, and Kong `/v1/sync`/recurring routes. Automation startup/migration retargets the default Postgres URL to `equa_automation_sync` and checks `CREATEDB`; Render CLI reports a valid 15-action Blueprint plan. No resources have been created or migrated. Notification/RabbitMQ remain omitted from the $0 base plan; invitation lifecycle remains in-app, and outbox delivery is not claimed.

Only USD 0 staging resources are authorized. Vercel Hobby is the current authorized Web scope; Render resources must explicitly use Free plans. The new deployment should use default provider hostnames; do not add custom domains or modify old DNS. No paid resource, production change, or deployment has occurred.

Mobile has an internal preview APK profile in `apps/mobile/eas.json` using the EAS `preview` environment and `android.buildType=apk`. Set `EXPO_PUBLIC_API_BASE_URL` in EAS `preview` only after the public Gateway URL exists. The client rejects missing/HTTP/localhost values in non-development builds. The Expo Free plan offers a limited low-priority build quota with no overage; if the quota is exhausted, wait for reset instead of upgrading.

## Database state

- No staging Postgres, logical databases, or remote migrations exist.
- Local PostgreSQL service migrations and local PostgreSQL/RabbitMQ scenarios have historical evidence in `docs/INTEGRATION_TESTING.md`; that is not staging evidence.
- Preserve database ownership: Identity, Social, Ledger, Automation, and Notification may access only their own databases.

## URLs and distribution

Frontend: none.
Gateway: none.
Android APK/EAS URL: none.

## Validation

| Area                                    | Result                                              |
| --------------------------------------- | --------------------------------------------------- |
| Render workspace/resource inventory     | PASS: authenticated workspace; no Equa resources    |
| Vercel account/scope inventory          | PASS: Hobby scope; no Equa project                  |
| Git source                              | PASS: local and remote `staging/demo` at `31c2e00`  |
| Render Blueprint validation             | PASS: valid 15-action Free-only candidate           |
| Kong staging image/config               | PASS: Docker build, shell syntax, config parse      |
| Automation package checks               | PASS: 42 tests, typecheck, lint, build              |
| Automation DB ownership helper          | PASS: unit coverage; live Postgres/CREATEDB NOT RUN |
| Render/Vercel deployment                | NOT RUN                                             |
| Staging migrations                      | NOT RUN                                             |
| Public registration/email verification  | BLOCKED: Resend sender/API key not configured       |
| Public Web/Mobile E2E                   | NOT RUN                                             |
| Mobile local tests/typecheck/lint/build | PASS: 53 tests; package checks pass                 |
| EAS config/profile inspection           | BLOCKED: CLI requires Expo account login            |
| Android APK and device validation       | NOT RUN                                             |
| Production readiness                    | NOT READY                                           |

Historical local test/build evidence remains in `docs/PROJECT_EXECUTION_STATE.md` and `docs/INTEGRATION_TESTING.md`; do not report it as public or native validation.

## Exact human action

1. Create or authorize a Resend account.
2. Add and verify a sender domain you control; do not alter the existing staging/API CNAME records.
3. Create a sending API key and keep it private. Do not paste it into chat.
4. Reply that the sender is verified and the key is ready for secure entry into Render secrets; the next deployment pass will configure Identity's `RESEND_API_KEY` and matching `EMAIL_FROM`.
5. Authorize an Expo account for EAS CLI (for example, run `pnpm dlx eas-cli login` from `apps/mobile`). Do not send Expo credentials or access tokens in chat.

The local Automation database-ownership fix and Free-only topology validate; after the provider gates, recheck provider state, configure the EAS preview Gateway URL, and continue migrations/deployments/acceptance. Production remains **NOT READY**.
