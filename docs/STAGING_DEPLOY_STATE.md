# Staging Deployment State

Updated: 2026-10-09. Scope: public class-test staging only. **CLASS TEST DEPLOYMENT: NOT READY. PRODUCTION READINESS: NOT READY.**

## Public URLs

- Web: https://equa-staging-demo-web.vercel.app
- Gateway: https://equa-staging-demo-gateway.onrender.com
- Identity: https://equa-staging-demo-identity.onrender.com
- APK: https://expo.dev/artifacts/eas/UZOSEWChdoOUB1iaRiNlR3sXsdgxiq_o5M20s875uM4.apk (expires 2026-10-22)

## Application deployment

- Product fix `80a0976` and checkpoint/format commits through `99bf5a9` are pushed to `staging/demo`; remote tip is `99bf5a936cf4d0498fbfaa8d2bc9c2c623b314ae`. The deployed Web still serves the previous release.
- Vercel project: `equa-staging-demo-web`, Hobby plan, root directory `apps/web`.
- Vercel's existing production environment contains the correct non-secret Social and Ledger health URLs, alongside Gateway and Identity. The new build/deployment has not yet run.
- Render services remain Free. Earlier LIVE/deploy evidence and GitHub CI `37910030413` / Security/CodeQL `37910029964` PASS apply to the previous committed release only.
- First GitHub CI run for this change (`37952480138`, commit `ad92b12`) failed only the repository-wide Prettier check on `docs/CLASS_TEST_VALIDATION.md`; that file is now formatted locally. Security run `37952479715` was in progress at last check. Fresh statuses are pending after the correction push.

## Smoke evidence

- Web root and login form: HTTP 200.
- Gateway `/health`: HTTP 200, `status=ok`.
- Identity `/health`: HTTP 200, `status=ok`.
- Public synthetic login for a non-existent `.invalid` email: HTTP 401 `AUTH_INVALID_CREDENTIALS` (expected application response).
- Earlier minimal smoke of Web root/login and service health passed; later authenticated product navigation exposed the cold-service blocker below.

## Blocking authenticated product cold-start failure

At approximately 2026-10-09 14:16 UTC, `POST /v1/auth/login` and `GET /v1/profile/me` returned HTTP 200. Subsequent `GET /v1/groups`, `/v1/expenses`, `/v1/expenses/total`, `/v1/groups/invitations`, `/v1/friends`, `/v1/friends/requests`, and `/v1/categories` returned HTTP 502. Social and Ledger had no corresponding request or startup logs. The then-deployed same-origin readiness probes covered auth services only, so product requests reached sleeping upstreams.

The Web candidate probes the required Identity, Social, Ledger, and Gateway services through the same-origin Next.js readiness route before product requests; normal API calls still route through Kong. Automation is omitted because none of these Web flows currently calls it. Tests 41/41, typecheck, lint, local build, and Vercel-equivalent Turbo build pass. Two authenticated cold product cycles are **NOT RUN**.

## Forgot-password email report

Identity's anti-enumeration contract intentionally returns HTTP 202 whether an ACTIVE account exists or not. The report's tested address is not established from available evidence. A read-only status query was blocked because Render Postgres rejects external connections with an empty IP allowlist; no database/networking setting was changed. Therefore 202 alone does not prove provider delivery, and active status / inbox delivery remain unverified. Do not change anti-enumeration behavior.

The Vercel project deployment uses Vercel's `production` target internally because this is the primary alias of the separate staging project. No Equa production project or environment was deployed.

## Latest checkpoint (2026-10-09)

- Product fix `80a0976` plus checkpoint/format commits through `99bf5a9` are pushed; remote tip is `99bf5a936cf4d0498fbfaa8d2bc9c2c623b314ae`.
- CI `37952831536` and Security `37952830515` both PASS on `99bf5a9`. The staging deploy workflow skips `staging/demo` by design.
- Vercel deployment `dpl_8mN6yZeLbRE1VG4fvVJXdSKJkefP` failed while building exact SHA `99bf5a936cf4d0498fbfaa8d2bc9c2c623b314ae`: Turbo omitted the public Social/Ledger health vars because they were missing from its build-task env list. `turbo.json` now includes both variables, and the Vercel-equivalent Turbo build passes locally. Fresh CI/Security and deployment are pending for this correction.
- Exact next action: finish targeted Prettier and diff checks, commit/push the Turbo fix with checkpoint docs, verify fresh CI/Security, and deploy the exact new SHA.

## Validation and known limits

- Password reset, email verification, and public login for existing A/B accounts: user-confirmed PASS.
- Two independent cold Identity/Gateway readiness cycles: PASS. Render Free services can sleep, and cold-start latency remains variable; do not claim 100% reliability.
- Full public friend/group/expense E2E: **NOT COMPLETED**, at the user's direction.
- External group invitation email: **NOT DEPLOYED/NOT VERIFIED**.
- EAS APK exists; automated Mobile evidence is 53/53 tests with typecheck/lint/build PASS. Native Android device test: **NOT RUN**.
- Production readiness: **NOT READY**.

## Exact next action

Commit/push the Turbo build env fix with checkpoint docs, verify fresh CI/Security, and redeploy the exact new SHA to the authorized Vercel project. Do not manually warm Render. After the services naturally sleep, perform two public authenticated product cold-start cycles, correlating Vercel readiness logs and Render Social/Ledger startup/request logs. Keep class-test status NOT READY unless both cycles pass.

An unrelated GitHub status context named `Vercel` remains failed for the separate `equa-web-staging` project in an inaccessible `equa1` scope. That project was not changed. The existing authorized staging deployment is the previous committed release and must be checked again after candidate deployment.
