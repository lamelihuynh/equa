# STAGING / CLASS TEST Deployment Checkpoint

Updated: 2026-10-08 (Asia/Saigon). No credentials are recorded here.

## Current phase

Provider recheck 2026-10-08: The auth wake fix and JSON-safe auth error handling are committed locally on `staging/demo`; push and deployment are pending. Vercel rewrite manifest maps same-origin `/v1/auth/_ready` to public Gateway `/health`; Web polls only safe GETs for up to about 130 seconds and then sends the auth POST once. Test/login, forgot, reset, verify and register requests share this wrapper. Web tests 20/20, lint, typecheck, Prettier, local and Vercel-mode builds pass. Live Vercel remains dpl_4w2scTPX2oQSBcmamS3xXqysUHSq; Gateway is LIVE on SHA fec7ead. User reports both accounts verified; login/reset E2E pending.

## Source and worktree

| Item                | Current state                                                                                                                                      |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Branch / local HEAD | `staging/demo` / `fec7ead080785302630bfb86ae7682db2480357c`                                                                                        |
| Remote              | `origin/staging/demo` matches local at `fec7ead080785302630bfb86ae7682db2480357c`                                                                  |
| Source comparison   | `staging/demo` contains the newer Web, Mobile and deployment work; `feature/automation-sync` remains at `0043ee64680a346eb816db05bb9ad52f1d46521c` |
| Worktree            | Four feature/deploy/test-doc commits pushed; three reconciled task docs and pre-existing generated/report files remain uncommitted                 |
| Git discipline      | Normal push completed; no merge, force push, reset, or clean                                                                                       |

## Provider inventory (reconciled 2026-10-08)

- Render workspace `equa` (`tea-db1jlktg1s2s73agmkog`) lists the Free Postgres `dpg-db24cj17lnhs73dib9l0-a` and five Free, not-suspended services in Singapore. All five direct `/health` endpoints now return 200 after wakeup. Gateway and Vercel API auth-guard GETs return 401 without a token, and CORS preflight returns 200. Four service-owned migrations remain PASS. Postgres `ipAllowList` is empty; rotated credential remains private.
- Vercel Hobby workspace `ti-ky-s-projects` has existing project `equa-staging-demo-web` (`prj_itv1H6yyMa0B4RSZIxgxhsJKH8UG`), using Next.js root `apps/web` and the public Gateway env. Latest deployment `dpl_4w2scTPX2oQSBcmamS3xXqysUHSq` is READY and aliased to `equa-staging-demo-web.vercel.app`; source is a direct CLI deployment from local HEAD `fec7ead` plus uncommitted Web/Turbo changes, not a new Git commit. SSO is disabled only for this staging project.
- EAS `whoami`, Expo config, and `eas project:info` PASS on 2026-10-08 (`tikyisme`, project ID `54fd6829-f137-4e48-9afb-bf0b88f348b7`). `apps/mobile/app.config.ts` and preview Gateway variable are linked; EAS preview APK build FINISHED.
- The inaccessible `equa1/equa-web-staging` scope is not required and must not be modified. No DNS was changed.
- The current local `.env` selects `EMAIL_PROVIDER=mailpit`; it has no `RESEND_API_KEY`. This proves no local key is configured, not whether a Resend account exists.

## Scope and resource plan

The committed `render.yaml` defines the Free class-test topology with five Free web services, one Free Postgres, and Kong sync/recurring routes. Identity, Social, Ledger, and Automation have separate logical DB migrations, all PASS. All five services are listed Free/not suspended and direct health returns 200 after wakeup. Gateway/Vercel GET auth guards return expected 401s and preflight returns 200. Notification/RabbitMQ remain omitted; in-app invitations remain canonical.

Only explicitly Free Render resources and the existing Vercel Hobby project are authorized. The user manually verified Render workspace `equa` is Hobby at $0/month with no card on file and accepts Free-tier limitations. Stop before any action that displays or requires a non-zero charge. Use default provider hostnames; do not add custom domains or modify old DNS. No paid Render resource or production change has occurred.

Mobile has an internal preview APK profile in `apps/mobile/eas.json` using the EAS `preview` environment and `android.buildType=apk`. EAS preview variable `EXPO_PUBLIC_API_BASE_URL` is set to the public Gateway URL. The client rejects missing/HTTP/localhost values in non-development builds. The Expo Free plan offers a limited low-priority build quota with no overage; if the quota is exhausted, wait for reset instead of upgrading.

## Database state

- Render Postgres `equa-staging-demo-postgres` is Free and available; default login is `newcredential`. Effective role capability PASS (`rolcreatedb=true`, `rolsuper=false`). Identity, Social, Ledger, and Automation migrations PASS on their owned databases. Identity Free service exists; initial credential exposure was rotated; allow list is empty.
- Local PostgreSQL service migrations and local PostgreSQL/RabbitMQ scenarios have historical evidence in `docs/INTEGRATION_TESTING.md`; that is not staging evidence.
- Preserve database ownership: Identity, Social, Ledger, Automation, and Notification may access only their own databases.

## URLs and distribution

Frontend: https://equa-staging-demo-web.vercel.app (deployment READY; current root GET 200; earlier API OPTIONS and /v1 auth-guard smoke checks passed).
Gateway: https://equa-staging-demo-gateway.onrender.com (latest deploy live; `/health` and CORS preflight return 200; GET `/v1/friends`, `/v1/expenses`, `/v1/sync/feed` return expected 401 without a bearer token).
Android APK: https://expo.dev/artifacts/eas/UZOSEWChdoOUB1iaRiNlR3sXsdgxiq_o5M20s875uM4.apk (internal preview; download verified HTTP 200, 76,241,972 bytes; expires 2026-10-22; device installation NOT RUN).
Vercel project: equa-staging-demo-web; deployment dpl_4w2scTPX2oQSBcmamS3xXqysUHSq READY at https://equa-staging-demo-web.vercel.app. Source base SHA fec7ead plus uncommitted local Web/Turbo overlay.

## Validation

| Area                                     | Result                                                                                                                                                                                                     |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Render workspace/resource inventory      | PASS: equa workspace; Free Postgres and five Free web services                                                                                                                                             |
| Vercel account/scope inventory           | PASS: Hobby scope; existing staging project verified                                                                                                                                                       |
| Vercel project/deployment                | PASS: deployment READY for fec7ead; stable alias and public root HTTP 200                                                                                                                                  |
| Git source                               | PASS: local and origin/staging/demo match at fec7ead                                                                                                                                                       |
| Render Blueprint validation              | PASS: valid 19-action Free-only candidate                                                                                                                                                                  |
| Kong staging image/config                | PASS: Docker build, shell syntax, config parse                                                                                                                                                             |
| Automation package checks                | PASS: 42 tests, typecheck, lint, build                                                                                                                                                                     |
| Free Postgres readiness                  | PASS: available, `plan: free`                                                                                                                                                                              |
| Owned database capability                | PASS: effective role `rolcreatedb=true`, `rolsuper=false`                                                                                                                                                  |
| Render billing safeguard                 | PASS: user confirms Hobby $0/month, no card, and Free-only authorization                                                                                                                                   |
| Render/Vercel deployment                 | PARTIAL: Vercel READY/root 200; all Render `/health` checks 200 after wakeup; Gateway/Vercel API guards 401 and CORS preflight 200; email/user acceptance pending                                          |
| Staging migrations                       | PASS: Identity, Social, Ledger, Automation owned databases                                                                                                                                                 |
| Public registration/email verification   | BLOCKED: Gateway-to-Identity synthetic route now returns Identity HTTP 400 after health 200, but real fresh-link verification/login still await the two user clicks. PostgreSQL token metadata is NOT RUN. |
| Public Web/Mobile E2E                    | NOT RUN                                                                                                                                                                                                    |
| Mobile local tests/typecheck/lint/build  | PASS: 53 tests; typecheck/lint pass after EAS config update; prior package build passed                                                                                                                    |
| EAS account authentication               | PASS: `whoami` confirms owner `tikyisme` on 2026-10-08                                                                                                                                                     |
| EAS profile/build                        | PASS: preview APK available from EAS project `@tikyisme/equa`; build c946bf3b-09a7-4cb5-959d-06a37ef078e1 FINISHED                                                                                         |
| Android APK and device validation        | APK artifact PASS; device validation NOT RUN because `adb` is not installed                                                                                                                                |
| GitHub CI                                | PASS for `dcfb44c` (run `37338178757`)                                                                                                                                                                     |
| GitHub Security                          | PASS for `dcfb44c` (run `37338178538`)                                                                                                                                                                     |
| Deploy staging workflow                  | SKIPPED for `staging/demo` (run `37338178878`)                                                                                                                                                             |
| Vercel status under inaccessible `equa1` | FAIL; not required and not modified                                                                                                                                                                        |
| Production readiness                     | NOT READY                                                                                                                                                                                                  |

Historical local test/build evidence remains in `docs/PROJECT_EXECUTION_STATE.md` and `docs/INTEGRATION_TESTING.md`; do not report it as public or native validation.

## Confirmed user inputs

- Resend secrets were entered directly into Identity Render settings; values remain unseen and must not be read or shared.
- Expo/EAS authentication and Free-only Render authorization are confirmed. Stop before any action showing a non-zero charge.

Four service-owned migrations PASS. The Free-tier mitigation is a Web preflight through the public Gateway to Identity `/health`, with bounded retries only on that GET. The state-changing login/register/forgot/reset/verify POST is sent once after health JSON confirms `status=ok` and `service=identity`; auth pages parse non-JSON/HTML failures into human-readable HTTP errors. No Gateway code/config changed because the live upstream route passes when warm and POST replay could duplicate one-time actions. Free Shell/SSH direct container testing is NOT RUN; no paid plan used. Source awaits scoped commit/push and committed deployment. After deployment, allow services to sleep if practical and test first auth request, then issue reset links for the verified users.
