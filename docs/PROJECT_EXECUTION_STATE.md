# Project Execution State

Updated: 2026-10-09. Canonical checkpoint for the public staging class-test build.

## Current state

- Verdict: **CLASS TEST DEPLOYMENT: NOT READY**.
- Production: **NOT READY**.
- `80a0976` (`fix(web): wake Social and Ledger before product requests`) and checkpoint commit `1400043` are pushed to `staging/demo`; local and remote were aligned at `1400043` after the push.
- The authorized Vercel project is `equa-staging-demo-web`; production env metadata confirms the public Social and Ledger `/health` URLs are configured. Current deployment SHA must be rechecked after the candidate push.
- Render services use Free plans. Previously observed LIVE state and CI `37910030413` / Security `37910029964` PASS apply to the prior committed release, not this candidate.
- The earlier auth-only public smoke passed, but the later authenticated product flow failed as recorded below.

## Blocking live finding

At approximately 2026-10-09 14:16 UTC, public login and `GET /v1/profile/me` returned HTTP 200, then authenticated requests to groups, expenses, expenses total, group invitations, friends/requests, and categories returned HTTP 502. Social and Ledger had no corresponding startup/request logs. Authentication-only cold readiness is insufficient for the authenticated Web.

## Social/Ledger readiness candidate (2026-10-09)

- Web maps authenticated product requests to required services and performs same-origin readiness probes that call the configured public service health endpoints server-side. Normal product requests remain under `/v1` through Kong. Readiness has bounded retries, in-flight coalescing, short success caching, and friendly startup errors; Automation is not probed because the affected Web routes do not use it.
- Vercel production env metadata confirms `EQUA_SOCIAL_HEALTH_URL` and `EQUA_LEDGER_HEALTH_URL` target the expected public HTTPS `/health` endpoints. Values are non-secret.
- Web validation: tests 41/41 PASS; typecheck, lint, targeted Prettier, local production build, Vercel-mode build, and `git diff --check` PASS. Candidate `80a0976` is pushed; CI/Security and Vercel deployment checks are pending.
- Two authenticated public Social/Ledger cold-start cycles: **NOT RUN**. Warm/local tests are not evidence of Render wake behavior.
- Forgot-password report: Identity intentionally returns 202 for both active and absent users. A safe read-only Postgres status lookup was blocked because the database rejects external connections with an empty IP allowlist; no networking setting was changed. The reported address was not identified in the available evidence, so active-account status and inbox delivery remain unverified. Do not change anti-enumeration behavior.

## Previously accepted E2E scope

The user explicitly stopped the remaining manual two-user friend/group/expense E2E. It is **NOT COMPLETED**. Do not claim friend requests, group invitations, expenses, displayed balances, debt guard, edit/delete, or cross-account dashboard/profile behavior as passed. Native APK device validation is **NOT RUN**. Render Free cold starts remain variable; repeated readiness cycles passed, but no production reliability guarantee is made.

Both existing accounts have user-confirmed email verification, fresh password reset, and public login PASS. No passwords or tokens were requested or recorded.

## Vercel check note

GitHub also reports a failing `Vercel` status context for a separate `equa-web-staging` project under an inaccessible `equa1` scope. The separate project was not accessed or changed; the candidate uses only the authorized `equa-staging-demo-web` project.

## Exact next action

Verify CI/Security for the pushed commits and confirm Vercel deploys the committed `staging/demo` SHA to the authorized project. Wait for Render Free services to sleep naturally; then guide the user through one public login-to-Dashboard/Friends/Groups/Expenses cold cycle at a time and correlate it with Render logs. Repeat after a second independent natural idle period. Keep the verdict NOT READY unless both cycles prove Social and Ledger woke and product requests returned non-5xx.
