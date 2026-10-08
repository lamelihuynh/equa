# Equa Project Execution State

## Last Updated

2026-10-08 (Asia/Saigon)

## Current Goal

Deliver a public STAGING / CLASS TEST release: complete the supported Web and Mobile MVP, connect both clients to the public Gateway, produce an Android distribution build, and run real public acceptance tests. Production remains NOT READY.

## Current Branch

`staging/demo` is the current deployment/source candidate. It is newer than `feature/automation-sync` and contains the Web identity/invitation work plus deployment preparation. Do not switch branches without rechecking the diff.

## Current HEAD

- Local: `fec7ead080785302630bfb86ae7682db2480357c`
- `origin/staging/demo`: `fec7ead080785302630bfb86ae7682db2480357c` (matches local)
- `feature/automation-sync`: `0043ee64680a346eb816db05bb9ad52f1d46521c`
- `develop`: `4ff198e092562cbeb46b2882f5629a9badb4e3fd`

## Working Tree

DIRTY. Code, deployment source, and issue template are pushed. Current local-only task changes are the reconciled checkpoints and validation-matrix evidence:

- Modified task docs: `docs/PROJECT_EXECUTION_STATE.md`, `docs/STAGING_DEPLOY_STATE.md`, `docs/CLASS_TEST_VALIDATION.md`
- Preserve pre-existing/generated: `apps/web/next-env.d.ts`, `apps/web/tsconfig.tsbuildinfo`, `apps/web/AGENTS.md`, `apps/web/CLAUDE.md`, `reports/`
  Do not stage or remove the pre-existing generated/report/AGENTS/CLAUDE files.

## Completed Phases

- Prior Phase 3–12 work implemented and validated the service-owned Social/Ledger flows, local Web API-mode flows, Identity-aware human labels, in-app group invitations, and Mobile durable local expense cache/outbox foundations.
- `staging/demo` carries the latest staging candidate. Its 11 commits after `feature/automation-sync` include Web identity/invitation UX, Kong/Render preparation, and deployment documentation.
- Earlier local evidence is recorded in `docs/INTEGRATION_TESTING.md` and below; it is not public-staging or native-Mobile evidence.
- Phase 5 local Mobile work now adds overview, friends, groups/invitations, expenses CRUD, readable labels, explicit API configuration and version-checked offline delete while preserving the existing SecureStore and SQLite/outbox flow.
- Pushed commits: `3a30f27` Mobile flows; `c4b21de` Automation database ownership; `7151993` Free class-test topology; `dcfb44c` class validation matrix and issue form.
- GitHub CI run `37338178757` and Security run `37338178538` passed on SHA `dcfb44c`; Deploy staging run `37338178878` was skipped for this branch. The old Vercel integration failure is out of scope.
- Added a truthful `docs/CLASS_TEST_VALIDATION.md` matrix and public GitHub class-test bug form; public URLs/acceptance remain unavailable, so `docs/CLASS_TEST.md` is deferred.

## Current Phase

Provider recheck 2026-10-08: Render Free services/Postgres are available. Gateway remains LIVE at SHA fec7ead. The auth wake fix now uses the public Gateway `/health` URL directly from the browser; the Gateway returns CORS for the staging Web origin. A Chrome-origin GET returned Identity health HTTP 200 at 16:40:54 UTC. The previous same-origin Vercel rewrite preflight returned repeated 502 after idle; a docs-only push also auto-deployed Identity and interrupted one preflight. Two forgot-password POSTs later returned HTTP 202 after warm readiness; reset email clicks and account login remain pending. Direct Gateway health wake is locally tested but not yet deployed. Web tests 21/21, typecheck, lint, Prettier, local build, Vercel-mode build, and direct CORS probe pass. No backend business logic or Gateway config changed. Render Free Shell/SSH is unavailable; no paid access used. Production remains NOT READY.

## Current Architecture

Web and Mobile call the Kong Gateway. Identity owns accounts/profiles, Social owns friendships/groups/invitations, Ledger owns financial data, and Automation & Sync owns recurring/sync state. Each service uses its own logical database; no cross-service data queries are allowed. Automation's migration/runtime now retargets Render's default Postgres URL to `equa_automation_sync` and rejects URLs owned by another service. Ledger publishes transactional outbox events; Notification handles delivery. Notification/RabbitMQ remain omitted from the $0 base plan because in-app invitations are canonical; outbox delivery is not claimed.

## Current Feature Status

| Area                 | Status  | Evidence / remaining work                                                                                                                                                                                                                                                                                                         |
| -------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Web MVP              | PARTIAL | Latest Vercel deployment is ready; readiness returned Identity HTTP 200 via Gateway. User confirmed both account verification links succeeded. Post-idle auth, login, reset, and two-user E2E remain NOT RUN; inbox/token state is not independently inspected.                                                                   |
| Mobile MVP           | PARTIAL | Local screens/adapters and tests cover supported flows. EAS project/config/preview env pass and APK is available; native validation and public Mobile flows remain.                                                                                                                                                               |
| Backend              | PARTIAL | Service-owned migrations PASS; all five Render `/health` endpoints return 200 after wakeup; Gateway/Vercel API guards return expected 401 and CORS preflight returns 200.                                                                                                                                                         |
| Email                | PARTIAL | Two resend requests returned HTTP 202; user confirmed both verification links succeeded. Inbox contents and database token state were not independently inspected. Post-idle wake, password-reset flow, and login remain NOT RUN. One earlier browser request returned HTTP 502 while the Gateway/Identity upstream was starting. |
| Android distribution | PARTIAL | EAS preview APK build c946bf3b-09a7-4cb5-959d-06a37ef078e1 FINISHED; artifact URL is available. Device validation NOT RUN because adb is unavailable.                                                                                                                                                                             |
| Public staging       | PARTIAL | Web/Gateway smoke and EAS APK pass; native test, email activation, public two-user E2E, and class acceptance remain pending.                                                                                                                                                                                                      |

## Mobile Audit Matrix

| Feature              | Backend available?                           | Web available?   | Mobile implemented?                                                                    | Mobile tested?                         | Gap                                                                                |
| -------------------- | -------------------------------------------- | ---------------- | -------------------------------------------------------------------------------------- | -------------------------------------- | ---------------------------------------------------------------------------------- |
| Auth/session         | Yes: Identity login/register/refresh/profile | Yes              | Login, signup, forgot-password, SecureStore session, server logout                     | Unit tests PASS; native NOT RUN        | User-confirmed verification; public post-idle auth, reset, and login checks remain |
| Profile              | Yes: Identity profile/avatar routes          | Yes              | Profile edit and avatar upload action                                                  | Typecheck/lint PASS; native NOT RUN    | Staging avatar storage is disabled; present provider errors clearly                |
| Friends/requests     | Yes: Social routes                           | Yes              | List, send, accept/reject, remove, on-demand supported balance                         | API tests PASS; native NOT RUN         | Public two-account flow NOT RUN                                                    |
| Groups/invitations   | Yes: Social routes                           | Yes              | List/detail/create/edit, member roles, email invite, accept/decline, remove/dissolve   | API tests PASS; native NOT RUN         | Public two-account flow NOT RUN                                                    |
| Expenses             | Yes: Ledger routes                           | Yes              | Online create/edit/soft-delete; explicit participants and payer; VND/minor-unit UI     | API/money tests PASS; native NOT RUN   | Public two-account flow NOT RUN                                                    |
| Dashboard/home       | Yes: group/expense totals                    | Yes              | Active group/expense counts, currency-separated totals and recent expenses             | Typecheck/lint PASS; native NOT RUN    | Public Gateway query NOT RUN                                                       |
| Offline cache/queue  | Yes: Automation sync/feed                    | N/A              | SQLite group/expense cache; durable create/edit/delete outbox; reconnect replay        | SQLite/sync tests PASS; native NOT RUN | No offline friend/invitation mutation; native restart/reconnect NOT RUN            |
| Conflict/retry       | Yes: Automation sync                         | N/A              | Automatic retry and explicit server-version conflict resolution                        | Unit tests PASS; native NOT RUN        | Native conflict UX NOT RUN                                                         |
| Public API config    | Gateway routes exist                         | Web uses Gateway | Local emulator-safe default; non-development requires HTTPS `EXPO_PUBLIC_API_BASE_URL` | Unit tests PASS                        | Native APK validation remains                                                      |
| Android distribution | N/A                                          | N/A              | `eas.json` internal APK preview profile                                                | EAS APK build PASS                     | Device validation NOT RUN because `adb` is unavailable                             |

## Web Status

Local API mode uses the Gateway and Local Demo is an explicit separate option. Human-readable labels and in-app group invitation UX are present in the staging source. The local API-mode browser flow is documented; user confirmed existing account verification, while public registration and full class acceptance remain NOT RUN.

## Mobile Status

Mobile now has five-tab navigation for overview, friends, groups, expenses, and profile. Friend requests, group create/edit/invite/accept/decline/admin controls, online expense CRUD, VND/minor-unit entry, and supported friend balances use authenticated Gateway adapters. The existing SQLite cache/outbox and conflict UI remain; offline soft delete uses the server's version-checked sync delete. Latest checks pass: 53/53 tests, typecheck, lint, and local Android export. EAS account auth/project link/config and public preview Gateway variable pass; the preview APK is available. No Android runtime (`adb`) is present, so native validation is NOT RUN.

## Backend Status

Identity, Social, Ledger, Automation & Sync, and Notification code exists with service ownership boundaries. Render Identity/Social/Ledger/Automation migrations pass against separate databases. Render inventory lists all five services as Free/not suspended; all five health endpoints now return 200 after wakeup. Gateway and Vercel API GET auth guards return expected 401s and preflight returns 200. RabbitMQ is intentionally omitted from the $0 topology.

## Deployment Status

Free Postgres provisioned; four service-owned migrations pass. Render inventory lists all five services as `plan: free`, not suspended, in Singapore; all five direct health checks returned 200 after wakeup. Gateway/Vercel GET routes return expected 401 auth guards, and CORS preflight returns 200. Vercel project `equa-staging-demo-web` is READY and public root returned HTTP 200. The user verified Hobby $0/month/no-card and authorized only Free resources. No custom domains, old `equa1` project, or existing DNS records are to be reused or modified.

## Cloud Resources

| Provider | Resource                     | URL                                                         | Plan  | State                                                                                                                                        |
| -------- | ---------------------------- | ----------------------------------------------------------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Render   | `equa-staging-demo-postgres` | `https://dashboard.render.com/d/dpg-db24cj17lnhs73dib9l0-a` | Free  | `dpg-db24cj17lnhs73dib9l0-a`; available; expires 2026-11-05                                                                                  |
| Render   | Identity                     | https://equa-staging-demo-identity.onrender.com             | Free  | srv-db26vk6k1f9s739bmskg; APP_WEB_URL set; deploy live; `/health` returned 200 after wakeup                                                  |
| Render   | Social                       | https://equa-staging-demo-social.onrender.com               | Free  | srv-db3f7al9fdbs73dhevog; direct `/health` returned 200 after ~53s wakeup                                                                    |
| Render   | Ledger                       | https://equa-staging-demo-ledger.onrender.com               | Free  | srv-db3fb26i0phs739ui1h0; direct `/health` returned 200 after ~53s wakeup                                                                    |
| Render   | Automation                   | https://equa-staging-demo-automation.onrender.com           | Free  | srv-db3fdkdg1s2s73a7qe20; direct `/health` returned 200 on retry                                                                             |
| Render   | Gateway                      | https://equa-staging-demo-gateway.onrender.com              | Free  | srv-db3g1c0m7kps73ehfrc0; deploy live; `/health` returned 200 after wakeup                                                                   |
| Vercel   | equa-staging-demo-web        | https://equa-staging-demo-web.vercel.app                    | Hobby | prj_itv1H6yyMa0B4RSZIxgxhsJKH8UG; READY deployment dpl_6KmVAA9kc3wGyQFGsVDLtLUTZ1bK; source=clean worktree at c34aa69; stable alias assigned |
| Vercel   | Existing unrelated project   | `vibefeed1-hcmutcuatiky.vercel.app`                         | Hobby | Leave untouched                                                                                                                              |

## Database State

- Local Compose PostgreSQL is the existing local environment; prior service-owned migrations and cross-service scenarios are recorded in `docs/INTEGRATION_TESTING.md`.
- Render Postgres `equa-staging-demo-postgres` exists on Free; default login is `newcredential`, effective role query reports `rolcreatedb=true`, `rolsuper=false`. Identity, Social, Ledger, and Automation migrations PASS on their owned databases. The initial credential exposure was rotated; allow list is empty.
- Any future staging deployment must use separate logical databases only for deployed services; never share tables or add cross-service foreign keys.

## Public URLs

Frontend: https://equa-staging-demo-web.vercel.app (READY; public root/rewrite smoke checks pass).
Gateway: https://equa-staging-demo-gateway.onrender.com (deploy live; `/health` and CORS preflight HTTP 200; `/v1/friends`, `/v1/expenses`, `/v1/sync/feed` return expected 401 without a bearer token).
Existing third-party DNS names are out of scope; do not change them.

## Mobile Distribution

An internal preview APK profile exists in `apps/mobile/eas.json`; EAS project `@tikyisme/equa` and public `preview` Gateway variable are configured. Mobile `postinstall` builds `@equa/contracts` before Metro. Local Android Expo export, 53 tests, typecheck, and lint PASS. EAS build `c946bf3b-09a7-4cb5-959d-06a37ef078e1` FINISHED. APK `https://expo.dev/artifacts/eas/UZOSEWChdoOUB1iaRiNlR3sXsdgxiq_o5M20s875uM4.apk` returns HTTP 200 and is 76,241,972 bytes; it expires 2026-10-22. Device validation is NOT RUN because `adb` is unavailable.

## Tests Passed

Historical evidence (not re-run for this reconciliation):

- Earlier workspace tests: 161 tests across 9 packages; lint, typecheck and build passed.
- Local service migrations and PostgreSQL/RabbitMQ vertical scenarios passed as recorded in `docs/INTEGRATION_TESTING.md`.
- Staging-preparation checks for Web, Social, Identity, Ledger, Contracts, Kong and Render Blueprint passed as recorded in `docs/STAGING_DEPLOY_STATE.md`.
- Current Mobile checks: 53/53 tests; typecheck and lint pass after the EAS config update. Expo config and EAS project info pass; local Android Expo export passed after the Contracts postinstall fix. EAS preview APK build FINISHED; device validation is NOT RUN.
- Current Automation checks: 42/42 tests including database ownership URL parsing; typecheck, lint, and build pass. Render Blueprint validation and Kong staging Docker/config checks pass. All four service-owned migrations pass; Identity, Social, Ledger, and Automation Free services are deployed and healthy.
- Auth-wake commit `c34aa6958be6b2f4302c243b7b430fdb20497b63` is pushed to `staging/demo`; GitHub CI run `37801366848` and Security/CodeQL run `37801366362` PASS. Render deploy run `37801367210` was SKIPPED because backend components were unaffected. GitHub's Vercel Preview Comments check passes; the separate Vercel GitHub status targets the inaccessible, out-of-scope `equa1` project, while the authorized `equa-staging-demo-web` project still needs a direct deployment.

## Tests Not Run

- Public Web registration/verification and two-account acceptance.
- Public health/security smoke and public Web/API E2E.
- Android device/emulator, public Mobile Gateway flows, offline/reconnect on device.
- Class test report submission and public validation matrix execution.

## Known Bugs

No newly verified bug from the state reconciliation. The current state does not establish the expanded public class-test release as ready.

## Known Product Gaps

Unspecified split/balance/debt/settlement semantics, debt-reminder policy, and post-dissolution expense history remain BLOCKED. Do not invent these rules. Automation targets its own logical database; Render effective role `rolcreatedb=true` was verified and all four service-owned migrations passed. Notification/RabbitMQ remain omitted while in-app invitation delivery is the promised flow.

## Human Decisions / Authorizations

- Authorized: staging/class testing only; create NEW resources; Free-only/ USD 0; no production, no paid resource, no custom domain. Stop before any action that can incur a charge.
- Authorized: use current authenticated Vercel scope; ignore and do not modify inaccessible `equa1/equa-web-staging`; use direct-source Vercel deployment if Git import blocks.
- Latest class-test requirement supersedes the earlier seed-only lecturer demo: self-service registration and email verification must work; pre-seeded accounts alone are insufficient.
- The user confirmed Resend sender/API secret values were entered directly in Identity Render settings. Never access or paste these values into chat.
- Expo/EAS auth, project linking, Expo config, and `eas project:info` confirmed on 2026-10-08. Project ID `54fd6829-f137-4e48-9afb-bf0b88f348b7` is in `apps/mobile/app.config.ts`.
- Do not paste provider secrets into chat or commit them.

## Current Blocker

Current phase: The previous auth wake helper at c34aa69 is committed and pushed; a focused repair now targets the public Gateway health URL directly from the browser so Render sees the wake request. CORS is verified from the Web origin; Web tests 21/21, lint, typecheck, Prettier, and local/Vercel-mode builds pass. This direct wake change is not yet committed/deployed. The warm public flow sent reset requests for both existing accounts (HTTP 202); no passwords changed. Render auto-deploys Identity on every new commit, including docs-only commits, so the next push will restart Identity. No Gateway config changes. Production remains NOT READY.

## Exact Next Action

Exact next action: stage only `apps/web/app/api-client.ts`, `apps/web/app/api-client.spec.ts`, `apps/web/next.config.ts`, and the three checkpoint docs; commit and push the direct Gateway health wake fix. Verify CI/Security and Render's automatic Identity deploy; deploy Web to the existing Vercel project from that commit. Then allow Gateway/Identity to idle and ask the user to click the already-issued reset links, which will exercise the deployed auth readiness flow before its single reset POST.

## Resume Instructions

1. Re-read this file and `docs/STAGING_DEPLOY_STATE.md`; inspect Git and provider state again.
2. Run the public Gateway smoke tests; preserve this single Free service.
3. Reconcile this checkpoint before each provider mutation; keep Notification/RabbitMQ omitted from the Free topology.
4. The user confirmed both existing accounts are verified. After the post-idle auth wake and reset-link clicks, confirm both logins and finish public Web acceptance; continue to Mobile/EAS build and native validation.
5. Audit/complete Mobile, configure public Gateway, produce an Android preview APK only if EAS/local tooling is authorized and free, then run actual device tests.
6. Keep `docs/CLASS_TEST.md`, `docs/CLASS_TEST_VALIDATION.md`, and this state file truthful. Never claim NOT RUN as PASS.
7. Do not merge, force-push, reset, clean, modify production, or expose secrets.
