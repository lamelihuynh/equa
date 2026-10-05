# Equa Project Execution State

## Last Updated

2026-10-05 (Asia/Saigon)

## Current Goal

Deliver a public STAGING / CLASS TEST release: complete the supported Web and Mobile MVP, connect both clients to the public Gateway, produce an Android distribution build, and run real public acceptance tests. Production remains NOT READY.

## Current Branch

`staging/demo` is the current deployment/source candidate. It is newer than `feature/automation-sync` and contains the Web identity/invitation work plus deployment preparation. Do not switch branches without rechecking the diff.

## Current HEAD

- Local: `31c2e007583ed19c77d9c05d891e0bc3e332446d`
- `origin/staging/demo`: same SHA
- `feature/automation-sync`: `0043ee64680a346eb816db05bb9ad52f1d46521c`
- `develop`: `4ff198e092562cbeb46b2882f5629a9badb4e3fd`

## Working Tree

DIRTY. Current task changes are local and uncommitted:

- Mobile: `apps/mobile/App.tsx`, `apps/mobile/eas.json`, `apps/mobile/src/**`
- Automation/Deployment: Automation database targeting, `render.yaml`, Kong staging template/start script
- Docs: execution/deployment/environment/readiness checkpoints
- Preserve pre-existing/generated: `apps/web/next-env.d.ts`, `apps/web/tsconfig.tsbuildinfo`, `apps/web/AGENTS.md`, `apps/web/CLAUDE.md`, `reports/`
  Do not stage or remove the pre-existing generated/report/AGENTS/CLAUDE files.

## Completed Phases

- Prior Phase 3–12 work implemented and validated the service-owned Social/Ledger flows, local Web API-mode flows, Identity-aware human labels, in-app group invitations, and Mobile durable local expense cache/outbox foundations.
- `staging/demo` carries the latest staging candidate. Its 11 commits after `feature/automation-sync` include Web identity/invitation UX, Kong/Render preparation, and deployment documentation.
- Earlier local evidence is recorded in `docs/INTEGRATION_TESTING.md` and below; it is not public-staging or native-Mobile evidence.
- Phase 5 local Mobile work now adds overview, friends, groups/invitations, expenses CRUD, readable labels, explicit API configuration and version-checked offline delete while preserving the existing SecureStore and SQLite/outbox flow.
- Current branch CI and Security were previously reported passing at this SHA; refresh those checks before any future push/release.

## Current Phase

Phase 4 audit and local Phase 5 Mobile implementation are complete. The expanded local Phase 9 candidate includes Automation & Sync, its owned database target, and Kong sync routes. Mobile/Automation checks, 15-action Free Blueprint validation, and Kong image/config parsing pass. Resend blocks public registration; Expo account authorization blocks EAS profile/build. No cloud resource has been provisioned.

## Current Architecture

Web and Mobile call the Kong Gateway. Identity owns accounts/profiles, Social owns friendships/groups/invitations, Ledger owns financial data, and Automation & Sync owns recurring/sync state. Each service uses its own logical database; no cross-service data queries are allowed. Automation's migration/runtime now retargets Render's default Postgres URL to `equa_automation_sync` and rejects URLs owned by another service. Ledger publishes transactional outbox events; Notification handles delivery. Notification/RabbitMQ remain omitted from the $0 base plan because in-app invitations are canonical; outbox delivery is not claimed.

## Current Feature Status

| Area                 | Status  | Evidence / remaining work                                                                                                                                                                                         |
| -------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Web MVP              | PARTIAL | Local API-mode flows and human-readable identity/in-app invitations have prior local evidence. Public URL, class registration/verification, and public E2E are NOT RUN.                                           |
| Mobile MVP           | PARTIAL | Local screens/adapters cover auth/profile, friends, groups/invitations, expense CRUD, overview, readable labels, and SQLite/outbox create/edit/delete. Public Gateway URL, EAS APK, and native validation remain. |
| Backend              | PARTIAL | Core local PostgreSQL/RabbitMQ cross-service flows have historical evidence. Public deployment, migrations, and health/security smoke are NOT RUN.                                                                |
| Email                | BLOCKED | Local Mailpit is configured. Public registration needs a verified sender and Resend API key; no key is configured in the local environment.                                                                       |
| Android distribution | NOT RUN | No APK/EAS distribution URL. Check EAS authorization and local Android tooling after resuming.                                                                                                                    |
| Public staging       | NOT RUN | No Render Equa resources, staging databases, public URLs, or Vercel Equa project.                                                                                                                                 |

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

Mobile now has five-tab navigation for overview, friends, groups, expenses, and profile. Friend requests, group create/edit/invite/accept/decline/admin controls, online expense CRUD, VND/minor-unit entry, and supported friend balances use authenticated Gateway adapters. The existing SQLite cache/outbox and conflict UI remain; offline soft delete uses the server's version-checked sync delete. The latest run passed 53/53 tests, typecheck/build, and lint. No `adb` or global `eas` command is present; EAS CLI config requires Expo account authorization. Native validation is NOT RUN.

## Backend Status

Identity, Social, Ledger, Automation & Sync, and Notification code exists with service ownership boundaries. Local PostgreSQL/RabbitMQ scenarios are documented as previously passed. No remote migrations or public backend deployments have run.

## Deployment Status

Pre-provisioning. New Vercel project in the authenticated Hobby scope and new Render Free resources are authorized for staging only, subject to $0 plans. No custom domains, old `equa1` project, or existing DNS records are to be reused or modified. Resend setup and Expo/EAS account authorization are human gates.

## Cloud Resources

| Provider                                  | Resource                       | URL                                 | Plan        | State                                                  |
| ----------------------------------------- | ------------------------------ | ----------------------------------- | ----------- | ------------------------------------------------------ |
| Render                                    | Equa project/services/Postgres | —                                   | —           | None found in authenticated `equa` workspace           |
| Vercel                                    | Equa Web project               | —                                   | Hobby scope | None found in authenticated `ti-ky-s-projects` account |
| Vercel                                    | Existing unrelated project     | `vibefeed1-hcmutcuatiky.vercel.app` | Hobby       | Leave untouched                                        |
| No external database or migration exists. |

## Database State

- Local Compose PostgreSQL is the existing local environment; prior service-owned migrations and cross-service scenarios are recorded in `docs/INTEGRATION_TESTING.md`.
- No Render Postgres instance, staging logical database, or staging migration exists.
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
- Current Mobile checks: 53/53 tests; typecheck, lint, build, Expo app config, and EAS JSON syntax pass. EAS project-bound config/build and public Gateway variable are NOT RUN.
- Current Automation checks: 42/42 tests including database ownership URL parsing; typecheck, lint, and build pass. Render Blueprint validation passes with 15 planned actions; Kong staging Docker build and substituted config parse pass. No resources were provisioned.
- GitHub CI and Security were previously reported PASS for `31c2e00`; refresh before future release activity.

## Tests Not Run

- Public Web registration/verification and two-account acceptance.
- Render staging migrations, public health/security smoke, and public Web/API E2E.
- EAS account-bound build, Android device/emulator, public Mobile Gateway flows, offline/reconnect on device.
- Class test bug-reporting flow and final validation matrix.

## Known Bugs

No newly verified bug from the state reconciliation. The current state does not establish the expanded public class-test release as ready.

## Known Product Gaps

Unspecified split/balance/debt/settlement semantics, debt-reminder policy, and post-dissolution expense history remain BLOCKED. Do not invent these rules. Automation now targets its own logical database in code; whether the future Render Postgres owner can create `equa_automation_sync` remains NOT RUN until that staging database exists. Notification/RabbitMQ remain omitted while in-app invitation delivery is the promised flow.

## Human Decisions / Authorizations

- Authorized: staging/class testing only; create NEW resources; prefer USD 0; no production, no paid resource, no custom domain.
- Authorized: use current authenticated Vercel scope; ignore and do not modify inaccessible `equa1/equa-web-staging`; use direct-source Vercel deployment if Git import blocks.
- Latest class-test requirement supersedes the earlier seed-only lecturer demo: self-service registration and email verification must work; pre-seeded accounts alone are insufficient.
- Do not paste provider secrets into chat or commit them.

## Current Blocker

Two external gates remain: public registration requires a verified Resend sender and API key, and EAS project configuration/build requires Expo account login. The repository `.env` has `EMAIL_PROVIDER=mailpit` and no `RESEND_API_KEY`; no Render service exists yet to hold the staging secret. EAS CLI reported that an Expo user account is required. Do not paste credentials into chat.

## Exact Next Action

Authorize Resend sender/API-key setup and Expo EAS CLI login without sharing credentials in chat. On resume, recheck provider state, confirm Render Postgres `CREATEDB` capability during the owned Automation migration, and provision only the validated Free topology. Never bundle service secrets.

## Resume Instructions

1. Re-read this file and `docs/STAGING_DEPLOY_STATE.md`; inspect Git and provider state again.
2. Continue with Resend secret setup through provider secret storage; do not bypass Identity verification.
3. Recheck the current working-tree Blueprint and owned Automation database behavior before creating any resources; do not enable Notification/RabbitMQ unless the class-test flow requires their delivery.
4. Provision only explicitly Free resources, run owned migrations, deploy in dependency order, then run public Web acceptance.
5. Audit/complete Mobile, configure public Gateway, produce an Android preview APK only if EAS/local tooling is authorized and free, then run actual device tests.
6. Keep `docs/CLASS_TEST.md`, `docs/CLASS_TEST_VALIDATION.md`, and this state file truthful. Never claim NOT RUN as PASS.
7. Do not merge, force-push, reset, clean, modify production, or expose secrets.
