# STAGING / CLASS TEST Deployment Checkpoint

Updated: 2026-10-08 (Asia/Saigon). No credentials are recorded here.

## Current phase

Credential rotation is verified through safe Render metadata: default user `newcredential`, plan `free`, status available. The external URL username matches `newcredential`; a read-only SQL check reports effective `current_user=equa_staging_owner` with `rolsuper=false`, `rolcreatedb=true`. Identity, Social, Ledger, and Automation migrations PASS with TLS. Identity Free service `srv-db26vk6k1f9s739bmskg` failed during BUILD: `corepack enable` received EROFS unlinking `/usr/bin/pnpm`; startup was not reached. Root pins `pnpm@11.21.0`; `render.yaml` now uses direct `corepack pnpm` for Node commands, and the local frozen install/Identity build pass. `RESEND_API_KEY`/`EMAIL_FROM` remain absent and unchanged. No app secrets or database credentials changed. The temporary IP allow-list is empty; remote redeploy remains pending.

## Source and worktree

| Item                | Current state                                                                                                                                      |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Branch / local HEAD | `staging/demo` / `dcfb44c0b2a22846e0809328e6b9950ed25269ad`                                                                                        |
| Remote              | `origin/staging/demo` matches local at `dcfb44c0b2a22846e0809328e6b9950ed25269ad`                                                                  |
| Source comparison   | `staging/demo` contains the newer Web, Mobile and deployment work; `feature/automation-sync` remains at `0043ee64680a346eb816db05bb9ad52f1d46521c` |
| Worktree            | Four feature/deploy/test-doc commits pushed; three reconciled task docs and pre-existing generated/report files remain uncommitted                 |
| Git discipline      | Normal push completed; no merge, force push, reset, or clean                                                                                       |

## Provider inventory (reconciled 2026-10-08)

- Render CLI v2.28.0 is authenticated in workspace `equa`; Free Postgres dpg-db24cj17lnhs73dib9l0-a is available on plan `free` and expires 2026-11-05. Identity Free service `srv-db26vk6k1f9s739bmskg` is created; no other app services exist. Postgres `ipAllowList` is empty. The exposed credential has been rotated.
- Vercel CLI is authenticated as `tikyisme`; the current `ti-ky-s-projects` scope is Hobby. Created `equa-staging-demo-web` (`prj_itv1H6yyMa0B4RSZIxgxhsJKH8UG`); it has no framework/root configuration, linked source, or deployment yet. The only other project is unrelated (`vibefeed1-hcmutcuatiky`); leave it untouched.
- EAS CLI `whoami` now returns the user's owner account (`tikyisme`, `nguyendongthienky0406@gmail.com`). Authentication is confirmed; no EAS build has run.
- The inaccessible `equa1/equa-web-staging` scope is not required and must not be modified. No DNS was changed.
- The current local `.env` selects `EMAIL_PROVIDER=mailpit`; it has no `RESEND_API_KEY`. This proves no local key is configured, not whether a Resend account exists.

## Scope and resource plan

The committed render.yaml defines the Free class-test topology with five Free web services, one Free Postgres, and Kong sync/recurring routes. Identity, Social, Ledger, and Automation have separate logical DB migrations, all PASS. Identity Free service exists; other app services are not created. Notification/RabbitMQ remain omitted; in-app invitations remain canonical.

Only explicitly Free Render resources and the existing Vercel Hobby project are authorized. The user manually verified Render workspace `equa` is Hobby at $0/month with no card on file and accepts Free-tier limitations. Stop before any action that displays or requires a non-zero charge. Use default provider hostnames; do not add custom domains or modify old DNS. No paid Render resource or production change has occurred.

Mobile has an internal preview APK profile in `apps/mobile/eas.json` using the EAS `preview` environment and `android.buildType=apk`. Set `EXPO_PUBLIC_API_BASE_URL` in EAS `preview` only after the public Gateway URL exists. The client rejects missing/HTTP/localhost values in non-development builds. The Expo Free plan offers a limited low-priority build quota with no overage; if the quota is exhausted, wait for reset instead of upgrading.

## Database state

- Render Postgres `equa-staging-demo-postgres` is Free and available; default login is `newcredential`. Effective role capability PASS (`rolcreatedb=true`, `rolsuper=false`). Identity, Social, Ledger, and Automation migrations PASS on their owned databases. Identity Free service exists; initial credential exposure was rotated; allow list is empty.
- Local PostgreSQL service migrations and local PostgreSQL/RabbitMQ scenarios have historical evidence in `docs/INTEGRATION_TESTING.md`; that is not staging evidence.
- Preserve database ownership: Identity, Social, Ledger, Automation, and Notification may access only their own databases.

## URLs and distribution

Frontend: none.
Gateway: none.
Android APK/EAS URL: none.
Vercel project: `equa-staging-demo-web` (no deployment URL yet).

## Validation

| Area                                     | Result                                                                   |
| ---------------------------------------- | ------------------------------------------------------------------------ |
| Render workspace/resource inventory      | PASS: workspace `equa`; Free Postgres plus Identity Free service         |
| Vercel account/scope inventory           | PASS: Hobby scope; empty Equa project created                            |
| Vercel project creation                  | PASS: empty Hobby project; no deployment                                 |
| Git source                               | PASS: local and remote `staging/demo` at `dcfb44c`                       |
| Render Blueprint validation              | PASS: valid 19-action Free-only candidate                                |
| Kong staging image/config                | PASS: Docker build, shell syntax, config parse                           |
| Automation package checks                | PASS: 42 tests, typecheck, lint, build                                   |
| Free Postgres readiness                  | PASS: available, `plan: free`                                            |
| Owned database capability                | PASS: effective role `rolcreatedb=true`, `rolsuper=false`                |
| Render billing safeguard                 | PASS: user confirms Hobby $0/month, no card, and Free-only authorization |
| Render/Vercel deployment                 | PARTIAL: Identity service created; deploy/health and Web NOT VERIFIED    |
| Staging migrations                       | PASS: Identity, Social, Ledger, Automation owned databases               |
| Public registration/email verification   | NOT RUN: awaiting user entry of Resend secrets and deploy verification   |
| Public Web/Mobile E2E                    | NOT RUN                                                                  |
| Mobile local tests/typecheck/lint/build  | PASS: 53 tests; package checks pass                                      |
| EAS account authentication               | PASS: `whoami` confirms owner account                                    |
| EAS profile/build                        | NOT RUN                                                                  |
| Android APK and device validation        | NOT RUN                                                                  |
| GitHub CI                                | PASS for `dcfb44c` (run `37338178757`)                                   |
| GitHub Security                          | PASS for `dcfb44c` (run `37338178538`)                                   |
| Deploy staging workflow                  | SKIPPED for `staging/demo` (run `37338178878`)                           |
| Vercel status under inaccessible `equa1` | FAIL; not required and not modified                                      |
| Production readiness                     | NOT READY                                                                |

Historical local test/build evidence remains in `docs/PROJECT_EXECUTION_STATE.md` and `docs/INTEGRATION_TESTING.md`; do not report it as public or native validation.

## Exact human action

1. Resend sender verification and API key readiness are confirmed by the user. Identity service exists; user now enters `RESEND_API_KEY` and `EMAIL_FROM` directly in Render Dashboard secrets. Never send either value in chat.
2. Expo/EAS login is confirmed by `whoami`; do not ask for credentials.
3. User confirms Render workspace `equa` is Hobby $0/month with no card. Use only `plan: free`; if any future creation requests payment or shows non-zero cost, stop before continuing.

Free Postgres is available. Identity, Social, Ledger, and Automation migrations PASS against their owned databases with TLS. Identity Free service `srv-db26vk6k1f9s739bmskg` first failed BUILD at `corepack enable` before startup. `render.yaml` now uses direct `corepack pnpm`; local pnpm pin, frozen install, Identity build, and 19-action Blueprint validation pass. `APP_WEB_URL` is an anticipated alias until Vercel assigns the actual URL. Exact next action: commit/push the deployment-only fix, inspect Render auto-deploy or trigger a redeploy, inspect logs, and verify `/health`. Resend secrets stay unchanged.
