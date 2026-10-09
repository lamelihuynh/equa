# Staging Deployment State

Updated: 2026-10-09. Scope: public class-test staging only. Production is **NOT READY**.

## Public URLs

- Web: https://equa-staging-demo-web.vercel.app
- Gateway: https://equa-staging-demo-gateway.onrender.com
- Identity: https://equa-staging-demo-identity.onrender.com
- APK: https://expo.dev/artifacts/eas/UZOSEWChdoOUB1iaRiNlR3sXsdgxiq_o5M20s875uM4.apk (expires 2026-10-22)

## Application deployment

- Application fix commit: `21d716e61f93c79b2d94ca304169ee7e8626c7ff` on `staging/demo`; a separate documentation commit contains the final class-test state. The final release tip SHA is included in the handoff.
- Vercel project: `equa-staging-demo-web`, Hobby plan, root directory `apps/web`.
- Vercel deployment: READY, stable staging alias assigned, deployment metadata verified against the final committed staging release.
- Render services: all five LIVE from the final committed staging release, all on Free plans.
- Gateway was manually deployed from the pushed `staging/demo` commit after its checksPass trigger did not start; deployment `dep-db4b5cl9fdbs73bdjtj0` is LIVE.
- GitHub CI `37910030413`: PASS. Security/CodeQL `37910029964`: PASS.

## Smoke evidence

- Web root and login form: HTTP 200.
- Gateway `/health`: HTTP 200, `status=ok`.
- Identity `/health`: HTTP 200, `status=ok`.
- Public synthetic login for a non-existent `.invalid` email: HTTP 401 `AUTH_INVALID_CREDENTIALS` (expected application response).
- No 5xx occurred in the minimal smoke set.

The Vercel project deployment uses Vercel's `production` target internally because this is the primary alias of the separate staging project. No Equa production project or environment was deployed.

## Validation and known limits

- Password reset, email verification, and public login for existing A/B accounts: user-confirmed PASS.
- Two independent cold Identity/Gateway readiness cycles: PASS. Render Free services can sleep, and cold-start latency remains variable; do not claim 100% reliability.
- Full public friend/group/expense E2E: **NOT COMPLETED**, at the user's direction.
- External group invitation email: **NOT DEPLOYED/NOT VERIFIED**.
- EAS APK exists; automated Mobile evidence is 53/53 tests with typecheck/lint/build PASS. Native Android device test: **NOT RUN**.
- Production readiness: **NOT READY**.

An unrelated GitHub status context named `Vercel` remains failed for the separate `equa-web-staging` project in an inaccessible `equa1` scope. The authorized public staging deployment above is READY; the separate project was not changed.
