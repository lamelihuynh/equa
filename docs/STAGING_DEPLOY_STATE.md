# Staging Deployment State

Updated: 2026-10-10. Scope: public class-test staging only. **CLASS TEST DEPLOYMENT: READY WITH KNOWN RISKS. PRODUCTION READINESS: NOT READY.**

## Public URLs

- Web: https://equa-staging-demo-web.vercel.app
- Gateway: https://equa-staging-demo-gateway.onrender.com
- Identity: https://equa-staging-demo-identity.onrender.com
- APK: https://expo.dev/artifacts/eas/UZOSEWChdoOUB1iaRiNlR3sXsdgxiq_o5M20s875uM4.apk (expires 2026-10-22)

## Application deployment

- Product fix `80a0976` and Turbo fix `a24bcb3` are deployed from application commit `342c6af`. Subsequent staging/demo commits updated checkpoint documentation only.
- Vercel project: `equa-staging-demo-web`, Hobby plan, root directory `apps/web`.
- Vercel deployment `dpl_47WBBXP1JgrNtoLE57Ay5MnmsPu6` is READY from exact SHA `342c6af3e3363512aa1b61aeae9396dd304f59df`; stable alias `https://equa-staging-demo-web.vercel.app` is assigned.
- Render services remain Free and all five services are LIVE after docs-only rollouts. No backend source files changed after application SHA `342c6af`.
- CI `37954115482` and Security `37954114895` both PASS on application SHA `342c6af`; docs commit CI `38032003567` and Security `38032003352` also PASS on `12e9b27`. The `Deploy staging` GitHub workflow skips `staging/demo` by design.

## Smoke evidence

- Web root and login form: HTTP 200.
- Gateway `/health`: HTTP 200, `status=ok`.
- Identity `/health`: HTTP 200, `status=ok`.
- Public synthetic login for a non-existent `.invalid` email: HTTP 401 `AUTH_INVALID_CREDENTIALS` (expected application response).
- After the new Vercel deployment, a read-only public root fetch at 15:52 UTC returned HTTP 200 and rendered the login form; this did not execute browser JavaScript or touch APIs.
- After the final docs-only Render rollout, public Web root, Gateway `/health`, and Identity `/health` each returned HTTP 200.
- Earlier minimal smoke of Web root/login and service health passed; later authenticated product navigation exposed the cold-service blocker below.

## Previous authenticated product cold-start failure (resolved)

At approximately 2026-10-09 14:16 UTC, `POST /v1/auth/login` and `GET /v1/profile/me` returned HTTP 200. Subsequent `GET /v1/groups`, `/v1/expenses`, `/v1/expenses/total`, `/v1/groups/invitations`, `/v1/friends`, `/v1/friends/requests`, and `/v1/categories` returned HTTP 502. Social and Ledger had no corresponding request or startup logs. The then-deployed same-origin readiness probes covered auth services only, so product requests reached sleeping upstreams.

The Web candidate probes required services through the same-origin readiness route; normal API calls remain behind Kong. Tests 41/41, typecheck, lint, local build, and Vercel-equivalent Turbo build pass. Cold cycle 2 passed for login, profile, groups, expenses, and expenses total. The user confirmed the authenticated Friends page loaded normally without a 502.

## Forgot-password email report

Identity's anti-enumeration contract intentionally returns HTTP 202 whether an ACTIVE account exists or not. The report's tested address is not established from available evidence. A read-only status query was blocked because Render Postgres rejects external connections with an empty IP allowlist; no database/networking setting was changed. Therefore 202 alone does not prove provider delivery, and active status / inbox delivery remain unverified. Do not change anti-enumeration behavior.

The Vercel project deployment uses Vercel's `production` target internally because this is the primary alias of the separate staging project. No Equa production project or environment was deployed.

## Latest checkpoint (2026-10-10)

- Product fix `80a0976` and Turbo fix `a24bcb3` remain the deployed application changes at `342c6af`; subsequent commits changed checkpoint docs only.
- CI `37954115482` and Security `37954114895` pass on application SHA `342c6af`; CI `38032003567` and Security `38032003352` pass on docs SHA `12e9b27`. The staging deploy workflow skips this branch by design.
- Previous deployment `dpl_8mN6yZeLbRE1VG4fvVJXdSKJkefP` failed on the prior SHA because Turbo omitted the Social/Ledger health vars; deployment `dpl_47WBBXP1JgrNtoLE57Ay5MnmsPu6` is now READY from `342c6af3e3363512aa1b61aeae9396dd304f59df`.
- Natural idle evidence: Render logs show SIGTERM for Social at 16:02:29 UTC, Ledger at 16:02:26 UTC, and Identity at 16:02:28 UTC after the 15:47 deploys. No probe or product request was issued during this idle window. Gateway had no matching SIGTERM log in the queried window.
- Cycle 1 was partial: login and later Dashboard data succeeded, but a pre-login Dashboard batch returned 502.
- Cycle 2 passed on 2026-10-10 UTC. Gateway logged `POST /v1/auth/login` 200 at 06:20:03 and `/v1/profile/me` 200 at 06:20:04. Readiness recovered for Identity, Ledger, Social, and Gateway after bounded timeouts. Gateway logged expenses/total and expenses 200 at 06:21:29-30 and groups 200 at 06:21:49; there were no pre-login product calls or Gateway 5xx after login. No app requests were sent by the agent.

## Validation and known limits

- Password reset, email verification, and public login for existing A/B accounts: user-confirmed PASS.
- Two independent cold Identity/Gateway readiness cycles: PASS. Render Free services can sleep, and cold-start latency remains variable; do not claim 100% reliability.
- Full public friend/group/expense E2E: **NOT COMPLETED**, at the user's direction.
- External group invitation email: **NOT DEPLOYED/NOT VERIFIED**.
- EAS APK exists; automated Mobile evidence is 53/53 tests with typecheck/lint/build PASS. Native Android device test: **NOT RUN**.
- Free Postgres `equa-staging-demo-postgres` is available but expires 2026-11-05; staging data may not persist past expiry.
- Production readiness: **NOT READY**.

## Exact next action

Cold cycle 2 and the user-confirmed Friends-page check passed; minimal public root/Gateway/Identity smoke also returned 200. Commit/push this final documentation update, wait for CI/Security, and verify provider revisions. Keep the full two-user E2E marked NOT COMPLETED and production NOT READY.

An unrelated GitHub status context named `Vercel` remains failed for the separate `equa-web-staging` project in an inaccessible `equa1` scope. That project was not changed. The authorized `equa-staging-demo-web` deployment is READY from committed SHA `342c6af3e3363512aa1b61aeae9396dd304f59df`.
