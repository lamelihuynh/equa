# Staging Deployment State

Updated: 2026-10-09. Scope: public class-test staging only. **CLASS TEST DEPLOYMENT: NOT READY. PRODUCTION READINESS: NOT READY.**

## Public URLs

- Web: https://equa-staging-demo-web.vercel.app
- Gateway: https://equa-staging-demo-gateway.onrender.com
- Identity: https://equa-staging-demo-identity.onrender.com
- APK: https://expo.dev/artifacts/eas/UZOSEWChdoOUB1iaRiNlR3sXsdgxiq_o5M20s875uM4.apk (expires 2026-10-22)

## Application deployment

- `80a0976` (`fix(web): wake Social and Ledger before product requests`) and checkpoint commit `1400043` are pushed to `staging/demo`. The deployed Web is still the previous release until Vercel deployment metadata confirms the new SHA.
- Vercel project: `equa-staging-demo-web`, Hobby plan, root directory `apps/web`.
- Vercel's existing production environment contains the correct non-secret Social and Ledger health URLs, alongside Gateway and Identity. The new build/deployment has not yet run.
- Render services remain Free. Earlier LIVE/deploy evidence and GitHub CI `37910030413` / Security/CodeQL `37910029964` PASS apply to the previous committed release only.

## Smoke evidence

- Web root and login form: HTTP 200.
- Gateway `/health`: HTTP 200, `status=ok`.
- Identity `/health`: HTTP 200, `status=ok`.
- Public synthetic login for a non-existent `.invalid` email: HTTP 401 `AUTH_INVALID_CREDENTIALS` (expected application response).
- Earlier minimal smoke of Web root/login and service health passed; later authenticated product navigation exposed the cold-service blocker below.

## Blocking authenticated product cold-start failure

At approximately 2026-10-09 14:16 UTC, `POST /v1/auth/login` and `GET /v1/profile/me` returned HTTP 200. Subsequent `GET /v1/groups`, `/v1/expenses`, `/v1/expenses/total`, `/v1/groups/invitations`, `/v1/friends`, `/v1/friends/requests`, and `/v1/categories` returned HTTP 502. Social and Ledger had no corresponding request or startup logs. The then-deployed same-origin readiness probes covered auth services only, so product requests reached sleeping upstreams.

The Web candidate probes the required Identity, Social, Ledger, and Gateway services through the same-origin Next.js readiness route before product requests; normal API calls still route through Kong. Automation is omitted because none of these Web flows currently calls it. Local validation is 41/41 Web tests, typecheck, lint, targeted Prettier, local build, Vercel-mode build, and `git diff --check`: all PASS. Commit `80a0976` is pushed; CI/Security and deployment checks are pending. Two authenticated cold product cycles are **NOT RUN**.

## Forgot-password email report

Identity's anti-enumeration contract intentionally returns HTTP 202 whether an ACTIVE account exists or not. The report's tested address is not established from available evidence. A read-only status query was blocked because Render Postgres rejects external connections with an empty IP allowlist; no database/networking setting was changed. Therefore 202 alone does not prove provider delivery, and active status / inbox delivery remain unverified. Do not change anti-enumeration behavior.

The Vercel project deployment uses Vercel's `production` target internally because this is the primary alias of the separate staging project. No Equa production project or environment was deployed.

## Validation and known limits

- Password reset, email verification, and public login for existing A/B accounts: user-confirmed PASS.
- Two independent cold Identity/Gateway readiness cycles: PASS. Render Free services can sleep, and cold-start latency remains variable; do not claim 100% reliability.
- Full public friend/group/expense E2E: **NOT COMPLETED**, at the user's direction.
- External group invitation email: **NOT DEPLOYED/NOT VERIFIED**.
- EAS APK exists; automated Mobile evidence is 53/53 tests with typecheck/lint/build PASS. Native Android device test: **NOT RUN**.
- Production readiness: **NOT READY**.

## Exact next action

Verify CI/Security and confirm the authorized Vercel project deploys the pushed SHA. Do not manually warm Render. After the services naturally sleep, perform two public authenticated product cold-start cycles, correlating Vercel readiness logs and Render Social/Ledger startup/request logs. Keep class-test status NOT READY unless both cycles pass.

An unrelated GitHub status context named `Vercel` remains failed for the separate `equa-web-staging` project in an inaccessible `equa1` scope. That project was not changed. The existing authorized staging deployment is the previous committed release and must be checked again after candidate deployment.
