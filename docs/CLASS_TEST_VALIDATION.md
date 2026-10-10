# Equa Class Test Validation

Updated: 2026-10-10. Target: public staging. **CLASS TEST DEPLOYMENT: NOT READY. PRODUCTION READINESS: NOT READY.**

## Acceptance status

| Area                            | Result                        | Evidence / limitation                                                                                                                                                                                                                                     |
| ------------------------------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Email verification              | PASS                          | User confirmed both existing accounts verified successfully.                                                                                                                                                                                              |
| Password reset                  | PASS                          | User confirmed fresh resets completed for both existing accounts.                                                                                                                                                                                         |
| Public login A/B                | PASS                          | User confirmed both accounts logged into the public Web.                                                                                                                                                                                                  |
| Auth-service cold readiness     | PASS, repeated twice          | Two independent idle-to-wake cycles passed for Identity and Gateway. Cycle 2 also exercised the product readiness probes for Social and Ledger.                                                                                                           |
| Auth-only public smoke          | PASS                          | Web root/login form 200; Gateway and Identity health 200; synthetic public login returned expected 401 `AUTH_INVALID_CREDENTIALS`.                                                                                                                        |
| Post-fix Web root smoke         | PASS                          | Public Vercel root returned HTTP 200 and rendered the login form on deployment SHA `342c6af`; no authenticated API path was exercised.                                                                                                                    |
| Minimal public acceptance       | PARTIAL                       | Web root/login, Gateway health, Identity health, authenticated profile, groups, expenses, and expenses total returned 200. Authenticated Friends page has not been checked in the signed-in browser.                                                      |
| Previous cold product release   | FAIL                          | On 2026-10-09 around 14:16 UTC, groups, expenses, invitations, friends, and categories returned 502 with no Social/Ledger wake logs. This was before the current readiness deployment.                                                                    |
| Social/Ledger readiness code    | PASS (public cycle 2)         | Vercel same-origin readiness retries recovered after initial timeouts; Render logs show Social and Ledger started, became ready, and served their Dashboard routes through Kong.                                                                          |
| Web candidate validation        | PASS (local/CI)               | 41/41 tests, typecheck, lint, local/Vercel-equivalent Turbo builds pass. CI `37954115482` and Security `37954114895` pass on app SHA `342c6af`; final docs commit checks also pass. Vercel deployment `dpl_47WBBXP1JgrNtoLE57Ay5MnmsPu6` is READY.        |
| Natural idle evidence           | PASS (Social/Ledger/Identity) | SIGTERM was logged after idle for Social, Ledger, and Identity. No product requests occurred between cycle 1 and cycle 2 before Account A's clean login. Gateway showed no separate SIGTERM marker.                                                       |
| Public product cold cycles      | PASS (cycle 2)                | Fresh journey: login 200 at 06:20:03 UTC, profile 200 at 06:20:04, readiness recovered for Ledger/Social, then expenses/total and expenses 200 at 06:21:29–30 and groups 200 at 06:21:49. No pre-login product calls or Gateway 5xx; cycle 1 was partial. |
| Authenticated Friends page      | NOT RUN                       | No shared authenticated browser session was available for UI inspection; Social readiness is proven by the successful Groups API request, not by a Friends-page render.                                                                                   |
| Forgot-password inbox report    | UNVERIFIED                    | Identity's anti-enumeration 202 is expected for absent/non-active accounts; tested email not identified. Read-only status query was blocked by database IP allowlist.                                                                                     |
| Public friend/group/expense E2E | NOT COMPLETED                 | User explicitly accepted this staging risk. Friend requests, invitations, shared expenses, balances, debt guard, edit/delete, and cross-account dashboard/profile behavior were not exercised.                                                            |
| Group-invitation email          | NOT DEPLOYED/NOT VERIFIED     | In-app state remains Social-owned; external email delivery is not proven in this topology.                                                                                                                                                                |
| Mobile automated                | PASS (existing evidence)      | 53/53 tests; typecheck, lint, and build passed. EAS preview APK exists.                                                                                                                                                                                   |
| Native APK/device               | NOT RUN                       | No physical-device/adb validation was performed.                                                                                                                                                                                                          |
| Production                      | NOT READY                     | Free-tier staging limitations and incomplete product E2E remain.                                                                                                                                                                                          |

## Build and deployment

- Product wake fix `80a0976` and Turbo env fix `a24bcb3` are deployed from `staging/demo` (application SHA `342c6af`). Subsequent pushes changed checkpoint documentation only.
- GitHub CI run `37954115482` on `342c6af`: PASS.
- Security/CodeQL run `37954114895` on `342c6af`: PASS.
- GitHub CI run `38032003567` on docs checkpoint `12e9b27`: PASS; Security/CodeQL run `38032003352`: PASS. `Deploy staging` run `38032003491` was skipped for this branch by design.
- Vercel public staging deployment: READY on exact SHA `342c6af3e3363512aa1b61aeae9396dd304f59df`; stable alias assigned.
- After docs-only pushes, Render Identity, Social, Ledger, Automation, and Gateway are LIVE. All remain Free; no backend source files changed after application SHA `342c6af`.
- An additional GitHub status context named `Vercel` reports failure for a separate `equa-web-staging` project under an inaccessible `equa1` scope. It is not the authorized public `equa-staging-demo-web` deployment, which is READY. No changes were made to that separate project.

The first GitHub CI run after push (`37952480138`, commit `ad92b12`) failed only the repository-wide Prettier check on this file. The formatting correction was pushed as `99bf5a9`; CI `37952831536` and Security `37952830515` both PASS on that SHA. The repository staging-deploy workflow skips `staging/demo` by design.

## Cold-start evidence

Two independent cold Identity/Gateway readiness cycles passed, but Render Free latency remains variable. Cold product cycle 1 was partial because a pre-login Dashboard batch returned 502.

Cold product cycle 2 passed the clean login-to-Dashboard API path on 2026-10-10. Account A's login returned 200 at 06:20:03 UTC and profile returned 200 at 06:20:04. Vercel logs show Identity recovered after a bounded timeout; Gateway, Ledger, and Social readiness then returned ready after bounded waits. Render logs show Ledger and Social started and received health/data requests. Gateway returned 200 for expenses/total and expenses at 06:21:29-30, and groups at 06:21:49. There were no pre-login product requests or Gateway 5xx after login. The user completed the fresh-tab journey and stopped at Dashboard; browser console output was not independently captured. Post-rollout public root/Gateway/Identity smoke returned HTTP 200. Render Free cold starts remain a staging limitation.

The reported forgot-password request returned 202. Identity intentionally gives the same result for absent/non-active accounts; the tested email is not identified. A read-only active-status query could not reach Postgres because external connections are blocked by its empty IP allowlist. No account was altered and no anti-enumeration behavior was changed. Provider inbox delivery remains unverified.

## Exact next action

Exact next action: record the authenticated Friends-page result if the user can confirm it; do not run another cold cycle or full two-user E2E. Cycle 1 remains partial and cycle 2 passed. Keep class-test deployment NOT READY until that minimal UI check is confirmed.
