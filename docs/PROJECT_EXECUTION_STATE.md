# Equa Project Execution State

## Last Updated

2026-10-08 (Asia/Saigon)

## Current Goal

Deliver a public STAGING / CLASS TEST release: complete the supported Web and Mobile MVP, connect both clients to the public Gateway, produce an Android distribution build, and run real public acceptance tests. Production remains NOT READY.

## Current Branch

`staging/demo` is the current deployment/source candidate. It is newer than `feature/automation-sync` and contains the Web identity/invitation work plus deployment preparation. Do not switch branches without rechecking the diff.

## Current HEAD

- Local: `dcfb44c0b2a22846e0809328e6b9950ed25269ad`
- `origin/staging/demo`: `dcfb44c0b2a22846e0809328e6b9950ed25269ad` (matches local)
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

Render Identity service `srv-db26vk6k1f9s739bmskg` is Free. Its first build failed because `corepack enable` tried to unlink `/usr/bin/pnpm` on a read-only filesystem; startup was not reached. `render.yaml` now uses direct `corepack pnpm` for all four Node services' install/build/start/migration commands; root pins `pnpm@11.21.0`. Local Corepack version, frozen install, Identity build, and Blueprint validation pass. No Resend secrets, database credentials, or business logic changed. All four database migrations pass; Postgres IP allow list is empty. Exact next action: commit/push only `render.yaml` and related checkpoint docs, then inspect Render auto-deploy; trigger Identity redeploy if none started, inspect build/runtime logs, and verify `/health`.

## Current Architecture

Web and Mobile call the Kong Gateway. Identity owns accounts/profiles, Social owns friendships/groups/invitations, Ledger owns financial data, and Automation & Sync owns recurring/sync state. Each service uses its own logical database; no cross-service data queries are allowed. Automation's migration/runtime now retargets Render's default Postgres URL to `equa_automation_sync` and rejects URLs owned by another service. Ledger publishes transactional outbox events; Notification handles delivery. Notification/RabbitMQ remain omitted from the $0 base plan because in-app invitations are canonical; outbox delivery is not claimed.

## Current Feature Status

| Area                 | Status  | Evidence / remaining work                                                                                                                                                                                                   |
| -------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Web MVP              | PARTIAL | Local API-mode flows and human-readable identity/in-app invitations have prior local evidence. Public URL, class registration/verification, and public E2E are NOT RUN.                                                     |
| Mobile MVP           | PARTIAL | Local screens/adapters cover auth/profile, friends, groups/invitations, expense CRUD, overview, readable labels, and SQLite/outbox create/edit/delete. Public Gateway URL, EAS APK, and native validation remain.           |
| Backend              | PARTIAL | Free Postgres role check and four migrations PASS; Identity Free service's first BUILD failed at global Corepack enable. Direct-Corepack fix passes locally; redeploy/health remain NOT RUN. Other services remain NOT RUN. |
| Email                | BLOCKED | Identity service exists; user must enter `RESEND_API_KEY` and `EMAIL_FROM` directly in Render Dashboard before registration/email verification.                                                                             |
| Android distribution | NOT RUN | No APK/EAS distribution URL. EAS account authentication is confirmed; build and native validation remain unrun.                                                                                                             |
| Public staging       | NOT RUN | Four Render migrations pass and Identity Free service exists, but no verified public service URL, Web deployment, registration, or acceptance flow exists. Vercel project remains empty.                                    |

## Mobile Audit Matrix

| Feature              | Backend available?                           | Web available?   | Mobile implemented?                                                                    | Mobile tested?                                 | Gap                                                                      |
| -------------------- | -------------------------------------------- | ---------------- | -------------------------------------------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------ |
| Auth/session         | Yes: Identity login/register/refresh/profile | Yes              | Login, signup, forgot-password, SecureStore session, server logout                     | Unit tests PASS; native NOT RUN                | Email verification is through the Web link; public provider gate remains |
| Profile              | Yes: Identity profile/avatar routes          | Yes              | Profile edit and avatar upload action                                                  | Typecheck/lint PASS; native NOT RUN            | Staging avatar storage is disabled; present provider errors clearly      |
| Friends/requests     | Yes: Social routes                           | Yes              | List, send, accept/reject, remove, on-demand supported balance                         | API tests PASS; native NOT RUN                 | Public two-account flow NOT RUN                                          |
| Groups/invitations   | Yes: Social routes                           | Yes              | List/detail/create/edit, member roles, email invite, accept/decline, remove/dissolve   | API tests PASS; native NOT RUN                 | Public two-account flow NOT RUN                                          |
| Expenses             | Yes: Ledger routes                           | Yes              | Online create/edit/soft-delete; explicit participants and payer; VND/minor-unit UI     | API/money tests PASS; native NOT RUN           | Public two-account flow NOT RUN                                          |
| Dashboard/home       | Yes: group/expense totals                    | Yes              | Active group/expense counts, currency-separated totals and recent expenses             | Typecheck/lint PASS; native NOT RUN            | Public Gateway query NOT RUN                                             |
| Offline cache/queue  | Yes: Automation sync/feed                    | N/A              | SQLite group/expense cache; durable create/edit/delete outbox; reconnect replay        | SQLite/sync tests PASS; native NOT RUN         | No offline friend/invitation mutation; native restart/reconnect NOT RUN  |
| Conflict/retry       | Yes: Automation sync                         | N/A              | Automatic retry and explicit server-version conflict resolution                        | Unit tests PASS; native NOT RUN                | Native conflict UX NOT RUN                                               |
| Public API config    | Gateway routes exist                         | Web uses Gateway | Local emulator-safe default; non-development requires HTTPS `EXPO_PUBLIC_API_BASE_URL` | Unit tests PASS                                | Set the public URL in EAS `preview` after Gateway creation               |
| Android distribution | N/A                                          | N/A              | `eas.json` internal APK preview profile                                                | JSON syntax PASS; account-bound config NOT RUN | Expo account authorization and APK build remain                          |

## Web Status

Local API mode uses the Gateway and Local Demo is an explicit separate option. Human-readable labels and in-app group invitation UX are present in the staging source. The local API-mode browser flow is documented; public registration, verification, and class acceptance remain NOT RUN.

## Mobile Status

Mobile now has five-tab navigation for overview, friends, groups, expenses, and profile. Friend requests, group create/edit/invite/accept/decline/admin controls, online expense CRUD, VND/minor-unit entry, and supported friend balances use authenticated Gateway adapters. The existing SQLite cache/outbox and conflict UI remain; offline soft delete uses the server's version-checked sync delete. The latest run passed 53/53 tests, typecheck/build, and lint. Expo EAS account authentication now passes; no Android runtime (`adb`) is present, and native validation is NOT RUN.

## Backend Status

Identity, Social, Ledger, Automation & Sync, and Notification code exists with service ownership boundaries. Render Identity/Social/Ledger/Automation migrations pass against separate databases. The Free Identity service exists; public backend deployments/health and RabbitMQ remain unverified.

## Deployment Status

Free Postgres provisioned and available; four service-owned migrations pass. `equa-staging-demo-identity` (`srv-db26vk6k1f9s739bmskg`) exists on `plan: free`; first deployment/health is not yet verified and no URL was returned at creation. User verified Hobby $0/month/no-card and authorized only Free resources. Vercel project remains undeployed. No custom domains, old `equa1` project, or existing DNS records are to be reused or modified.

## Cloud Resources

| Provider                                  | Resource                     | URL                                                         | Plan  | State                                                            |
| ----------------------------------------- | ---------------------------- | ----------------------------------------------------------- | ----- | ---------------------------------------------------------------- |
| Render                                    | `equa-staging-demo-postgres` | `https://dashboard.render.com/d/dpg-db24cj17lnhs73dib9l0-a` | Free  | `dpg-db24cj17lnhs73dib9l0-a`; available; expires 2026-11-05      |
| Render                                    | `equa-staging-demo-identity` | —                                                           | Free  | `srv-db26vk6k1f9s739bmskg`; created; first deploy/health pending |
| Vercel                                    | `equa-staging-demo-web`      | —                                                           | Hobby | Empty project `prj_itv1H6yyMa0B4RSZIxgxhsJKH8UG`; no deployment  |
| Vercel                                    | Existing unrelated project   | `vibefeed1-hcmutcuatiky.vercel.app`                         | Hobby | Leave untouched                                                  |
| No external database or migration exists. |

## Database State

- Local Compose PostgreSQL is the existing local environment; prior service-owned migrations and cross-service scenarios are recorded in `docs/INTEGRATION_TESTING.md`.
- Render Postgres `equa-staging-demo-postgres` exists on Free; default login is `newcredential`, effective role query reports `rolcreatedb=true`, `rolsuper=false`. Identity, Social, Ledger, and Automation migrations PASS on their owned databases. The initial credential exposure was rotated; allow list is empty.
- Any future staging deployment must use separate logical databases only for deployed services; never share tables or add cross-service foreign keys.

## Public URLs

Frontend: none.
Gateway: none.
Existing third-party DNS names are out of scope; do not change them.

## Mobile Distribution

An internal preview APK profile exists in `apps/mobile/eas.json`; configure `EXPO_PUBLIC_API_BASE_URL` in EAS `preview` after Gateway creation. EAS config inspection requires Expo account login. Expo Free has a limited low-priority build quota; no overage is charged on Free. No APK/install URL exists; device validation is NOT RUN.

## Tests Passed

Historical evidence (not re-run for this reconciliation):

- Earlier workspace tests: 161 tests across 9 packages; lint, typecheck and build passed.
- Local service migrations and PostgreSQL/RabbitMQ vertical scenarios passed as recorded in `docs/INTEGRATION_TESTING.md`.
- Staging-preparation checks for Web, Social, Identity, Ledger, Contracts, Kong and Render Blueprint passed as recorded in `docs/STAGING_DEPLOY_STATE.md`.
- Current Mobile checks: 53/53 tests; typecheck, lint, build, Expo app config, and EAS JSON syntax pass. EAS authentication PASS on 2026-10-06; project-bound config/build and public Gateway variable are NOT RUN.
- Current Automation checks: 42/42 tests including database ownership URL parsing; typecheck, lint, and build pass. Render Blueprint validation passes with 19 planned actions; Kong staging Docker build and substituted config parse pass. One Free Render Postgres is provisioned; all four migrations pass; Identity Free service exists, first deploy/health not verified.
- GitHub CI run `37338178757` and Security run `37338178538` PASS for `dcfb44c`; Deploy staging run `37338178878` is SKIPPED. The Vercel check fails under the inaccessible, out-of-scope `equa1` project.

## Tests Not Run

- Public Web registration/verification and two-account acceptance.
- Public health/security smoke and public Web/API E2E.
- EAS account-bound build, Android device/emulator, public Mobile Gateway flows, offline/reconnect on device.
- Class test report submission and public validation matrix execution.

## Known Bugs

No newly verified bug from the state reconciliation. The current state does not establish the expanded public class-test release as ready.

## Known Product Gaps

Unspecified split/balance/debt/settlement semantics, debt-reminder policy, and post-dissolution expense history remain BLOCKED. Do not invent these rules. Automation targets its own logical database; Render effective role `rolcreatedb=true` was verified and all four service-owned migrations passed. Notification/RabbitMQ remain omitted while in-app invitation delivery is the promised flow.

## Human Decisions / Authorizations

- Authorized: staging/class testing only; create NEW resources; Free-only/ USD 0; no production, no paid resource, no custom domain. Stop before any action that can incur a charge.
- Authorized: use current authenticated Vercel scope; ignore and do not modify inaccessible `equa1/equa-web-staging`; use direct-source Vercel deployment if Git import blocks.
- Latest class-test requirement supersedes the earlier seed-only lecturer demo: self-service registration and email verification must work; pre-seeded accounts alone are insufficient.
- Resend sender is verified and API key is ready; after Identity exists, the user will enter it directly into Render secrets. Never request or paste the key in chat.
- Expo/EAS account authentication confirmed on 2026-10-06.
- Do not paste provider secrets into chat or commit them.

## Current Blocker

Current phase: credential rotation is verified; effective database role has `rolsuper=false`, `rolcreatedb=true`. Identity, Social, Ledger, and Automation migrations PASS on Render (`equa_identity`, `equa_social`, `equa_ledger`, `equa_automation_sync`) with TLS. Identity Free service `srv-db26vk6k1f9s739bmskg` first failed BUILD at global `corepack enable`; direct `corepack pnpm` fix passes locally, awaiting commit/redeploy. `RESEND_API_KEY` and `EMAIL_FROM` are unchanged; temporary Postgres allow-list is empty.

## Exact Next Action

Exact next action: commit/push the validated deployment-only fix (`render.yaml` plus checkpoint docs) on `staging/demo`; inspect Render auto-deploy and trigger a redeploy if none started. Inspect build/runtime logs and verify `/health`. After the service runs, continue at the existing Resend secret-entry gate; never ask for either value in chat.

## Resume Instructions

1. Re-read this file and `docs/STAGING_DEPLOY_STATE.md`; inspect Git and provider state again.
2. Continue with Resend secret setup through provider secret storage; do not bypass Identity verification.
3. Recheck the current working-tree Blueprint and owned Automation database behavior before creating any resources; do not enable Notification/RabbitMQ unless the class-test flow requires their delivery.
4. Provision only explicitly Free resources, run owned migrations, deploy in dependency order, then run public Web acceptance.
5. Audit/complete Mobile, configure public Gateway, produce an Android preview APK only if EAS/local tooling is authorized and free, then run actual device tests.
6. Keep `docs/CLASS_TEST.md`, `docs/CLASS_TEST_VALIDATION.md`, and this state file truthful. Never claim NOT RUN as PASS.
7. Do not merge, force-push, reset, clean, modify production, or expose secrets.
