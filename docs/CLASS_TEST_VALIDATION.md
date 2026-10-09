# Equa Class Test Validation

Updated: 2026-10-09. Target: public staging. **CLASS TEST DEPLOYMENT: NOT READY. PRODUCTION READINESS: NOT READY.**

## Acceptance status

| Area                            | Result                    | Evidence / limitation                                                                                                                                                                         |
| ------------------------------- | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Email verification              | PASS                      | User confirmed both existing accounts verified successfully.                                                                                                                                  |
| Password reset                  | PASS                      | User confirmed fresh resets completed for both existing accounts.                                                                                                                             |
| Public login A/B                | PASS                      | User confirmed both accounts logged into the public Web.                                                                                                                                      |
| Auth-service cold readiness     | PASS, repeated twice      | Two independent Render idle-to-wake cycles passed for Identity and Gateway. This does not validate Social/Ledger product services.                                                            |
| Auth-only public smoke          | PASS                      | Web root/login form 200; Gateway and Identity health 200; synthetic public login returned expected 401 `AUTH_INVALID_CREDENTIALS`.                                                            |
| Authenticated product cold path | FAIL                      | On 2026-10-09 around 14:16 UTC, groups, expenses/total, invitations, friends/requests, and categories returned 502 after login/profile succeeded; Social/Ledger had no wake/request logs.         |
| Social/Ledger readiness code    | PASS (local only)         | Same-origin server readiness routes, service dependency mapping, bounded retry/coalescing, friendly startup errors; Vercel health URL configuration confirmed. No public cold-cycle proof yet. |
| Web candidate local validation  | PASS                      | 41/41 tests; typecheck, lint, targeted Prettier, local build, Vercel-mode build, and `git diff --check` all pass. Candidate is not yet committed or deployed.                                                |
| Public product cold cycles      | NOT RUN                   | Requires deployment of the candidate and two natural Render idle-to-wake cycles. Do not infer from local/warm checks.                                                                         |
| Forgot-password inbox report   | UNVERIFIED                | Identity's anti-enumeration 202 is expected for absent/non-active accounts; tested email not identified. Read-only status query was blocked by database IP allowlist.                         |
| Public friend/group/expense E2E | NOT COMPLETED             | User explicitly accepted this staging risk. Do not report friend requests, invitations, shared expenses, balances, debt guard, edit/delete, dashboard, or profile multi-user flows as passed. |
| Group-invitation email          | NOT DEPLOYED/NOT VERIFIED | In-app state remains Social-owned; external email delivery is not proven in this topology.                                                                                                    |
| Mobile automated                | PASS (existing evidence)  | 53/53 tests; typecheck, lint, and build passed. EAS preview APK exists.                                                                                                                       |
| Native APK/device               | NOT RUN                   | No physical-device/adb validation was performed.                                                                                                                                              |
| Production                      | NOT READY                 | Free-tier staging limitations and incomplete product E2E remain.                                                                                                                              |

## Build and deployment

- Application fix commit: `21d716e61f93c79b2d94ca304169ee7e8626c7ff` (`fix(web): wake staging services through same-origin probes`). The final release tip SHA, including this class-test documentation, is provided in the handoff.
- GitHub CI run `37910030413`: PASS.
- Security/CodeQL run `37910029964`: PASS.
- Vercel public staging deployment: the previous committed release was READY with the stable alias; the candidate deployment is pending.
- Render Identity, Social, Ledger, Automation, and Gateway: previously reported LIVE on Free plans; no candidate backend changes are included.
- An additional GitHub status context named `Vercel` reports failure for a separate `equa-web-staging` project under an inaccessible `equa1` scope. It is not the authorized public `equa-staging-demo-web` deployment, which is READY. No changes were made to that separate project.

## Cold-start evidence

Render independently logged Identity and Gateway shutdowns before each of two readiness cycles. In both cycles, the public Web readiness path eventually returned Identity and Gateway HTTP 200; Identity's first long probe sometimes returned normalized 503 while startup was still completing. The cold path passed twice, but this does not establish 100% reliability. Render Free sleeping/cold starts remain a staging limitation.

The later cold authenticated product flow failed: public login/profile passed, but Social/Ledger-backed routes returned 502 without Social/Ledger startup logs. A local fix now probes those services server-side through the same-origin Web readiness route; normal requests remain behind Kong. Local Web tests (41/41), typecheck, lint, targeted Prettier, local build, and Vercel-mode build pass. This is not evidence that Render Free services wake correctly.

The reported forgot-password request returned 202. Identity intentionally gives the same result for absent/non-active accounts; the tested email is not identified. A read-only active-status query could not reach Postgres because external connections are blocked by its empty IP allowlist. No account was altered and no anti-enumeration behavior was changed. Provider inbox delivery remains unverified.

## Exact next action

Exact next action: commit/push the candidate to `staging/demo`, verify CI/Security and deploy the committed SHA to the existing staging Vercel project. After Render services sleep naturally, guide one public login-to-Dashboard/Friends/Groups/Expenses cold cycle, verify Render logs show Social and Ledger wake with non-5xx product responses, then repeat after a second natural idle period. Keep class-test status NOT READY until both cycles pass.
