# Project Execution State

Updated: 2026-10-10. Canonical checkpoint for the public staging class-test build.

## Current state

- Verdict: **CLASS TEST DEPLOYMENT: READY WITH KNOWN RISKS**.
- Production: **NOT READY**.
- Product fix `80a0976` and Turbo fix `a24bcb3` are deployed from application commit `342c6af`. Documentation-only checkpoint updates are pushed to `staging/demo`; CI/Security passed on the first checkpoint update.
- The authorized Vercel project is `equa-staging-demo-web`; deployment `dpl_47WBBXP1JgrNtoLE57Ay5MnmsPu6` is READY from exact SHA `342c6af3e3363512aa1b61aeae9396dd304f59df`, with stable alias `https://equa-staging-demo-web.vercel.app`. A read-only fetch of the public root at 15:52 UTC returned HTTP 200 with the login form rendered.
- All Render services remain Free and are LIVE after docs-only rollouts; no backend source files changed after validated application commit `342c6af`. Vercel remains READY from exact application SHA `342c6af`.
- The original authenticated product cold flow failed on Social/Ledger. A clean second cycle completed on 2026-10-10; detailed provider evidence is below. The user subsequently confirmed the authenticated Friends page loads normally with no 502.

## Resolved cold-start finding

At approximately 2026-10-09 14:16 UTC, public login and `GET /v1/profile/me` returned HTTP 200, then authenticated requests to groups, expenses, expenses total, group invitations, friends/requests, and categories returned HTTP 502. Social and Ledger had no corresponding startup/request logs. Authentication-only cold readiness is insufficient for the authenticated Web.

## Social/Ledger readiness candidate (2026-10-09)

- Web maps authenticated product requests to required services and performs same-origin readiness probes that call the configured public service health endpoints server-side. Normal product requests remain under `/v1` through Kong. Readiness has bounded retries, in-flight coalescing, short success caching, and friendly startup errors; Automation is not probed because the affected Web routes do not use it.
- Vercel production env metadata confirms `EQUA_SOCIAL_HEALTH_URL` and `EQUA_LEDGER_HEALTH_URL` target the expected public HTTPS `/health` endpoints. Values are non-secret.
- Web validation: tests 41/41 PASS; typecheck, lint, targeted Prettier, local production build, Vercel-equivalent Turbo build, and `git diff --check` PASS. CI `37954115482` and Security `37954114895` pass on application SHA `342c6af`; docs-only checkpoint commits also passed CI/Security, including the latest checkpoint verified in this handoff.
- The repository's `Deploy staging` workflow deliberately skips branch `staging/demo`; it made no deployment. The old Vercel build failed on SHA `99bf5a9` because Turbo omitted the configured Social/Ledger health URLs. `turbo.json` now passes them and deployment `dpl_47WBBXP1JgrNtoLE57Ay5MnmsPu6` is READY on SHA `342c6af`.
- Public cold cycle 1 (2026-10-09 UTC): login returned 200 at 18:41:56; readiness eventually returned ready and post-login profile/expenses/groups calls returned 200. A pre-login Dashboard batch returned 502, so cycle 1 is **PARTIAL**.
- Public cold cycle 2 (2026-10-10 UTC) PASS for the login-to-Dashboard API path: Account A login 200 at 06:20:03; profile 200 at 06:20:04. Identity readiness recovered by 06:19:27 after one 54s timeout; Gateway was ready by 06:20:01. Ledger readiness recovered at 06:21:28 after a 54s timeout; expenses/total and expenses returned 200 at 06:21:29-30. Social readiness recovered at 06:21:47 after a 54s timeout; groups returned 200 at 06:21:49. There were no product/API requests before login and no Gateway 5xx afterward. The user stopped at Dashboard; Vercel readiness timeouts recovered inside the retry budget.
- Minimal public smoke after the final Render rollout: Vercel root/login form 200; Gateway `/health` 200; Identity `/health` 200. Profile, groups, expenses, and expenses total returned 200 during cold cycle 2. User confirmed the authenticated Friends page loaded normally without a 502.
- Natural-idle evidence between cycles: Identity/Social/Ledger logged SIGTERM at 18:57:41/51/44 UTC on Oct 9; no product requests appeared before cycle 2 at 06:20 UTC. Gateway had no SIGTERM marker, but its instance ID changed and its Vercel readiness probe took ~33s before returning 200. No health probes were sent by the agent before cycle 2.
- Full public two-user friend/group/expense E2E remains **NOT COMPLETED**.
- Forgot-password report: Identity intentionally returns 202 for both active and absent users. A safe read-only Postgres status lookup was blocked because the database rejects external connections with an empty IP allowlist; no networking setting was changed. The reported address was not identified in the available evidence, so active-account status and inbox delivery remain unverified. Do not change anti-enumeration behavior.

## Previously accepted E2E scope

The user explicitly stopped the remaining manual two-user friend/group/expense E2E. It is **NOT COMPLETED**. Do not claim friend requests, group invitations, expenses, displayed balances, debt guard, edit/delete, or cross-account dashboard/profile behavior as passed. Native APK device validation is **NOT RUN**. Render Free cold starts remain variable; repeated readiness cycles passed, but no production reliability guarantee is made.

Both existing accounts have user-confirmed email verification, fresh password reset, and public login PASS. No passwords or tokens were requested or recorded.

## Vercel check note

GitHub also reports a failing `Vercel` status context for a separate `equa-web-staging` project under an inaccessible `equa1` scope. The separate project was not accessed or changed; the candidate uses only the authorized `equa-staging-demo-web` project.

## Exact next action

Commit/push this final documentation update, wait for CI/Security, and verify provider revisions. The minimal authenticated Friends check is user-confirmed PASS. Do not run another cold cycle or the full two-user E2E. Keep production NOT READY.
