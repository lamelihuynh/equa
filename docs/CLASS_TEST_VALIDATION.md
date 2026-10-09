# Equa Class Test Validation

Updated: 2026-10-09. Target: public staging. **CLASS TEST DEPLOYMENT: READY WITH KNOWN RISKS. PRODUCTION READINESS: NOT READY.**

## Acceptance status

| Area                            | Result                    | Evidence / limitation                                                                                                                                                                         |
| ------------------------------- | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Email verification              | PASS                      | User confirmed both existing accounts verified successfully.                                                                                                                                  |
| Password reset                  | PASS                      | User confirmed fresh resets completed for both existing accounts.                                                                                                                             |
| Public login A/B                | PASS                      | User confirmed both accounts logged into the public Web.                                                                                                                                      |
| Cold-start readiness            | PASS, repeated twice      | Two independent Render idle-to-wake cycles passed for Identity and Gateway; retries were needed while Identity started. Render Free cold starts remain variable.                              |
| Minimal public smoke            | PASS                      | Web root/login form 200; Gateway health 200; Identity health 200; synthetic public login returned expected 401 `AUTH_INVALID_CREDENTIALS`; no 5xx in these checks.                            |
| Public friend/group/expense E2E | NOT COMPLETED             | User explicitly accepted this staging risk. Do not report friend requests, invitations, shared expenses, balances, debt guard, edit/delete, dashboard, or profile multi-user flows as passed. |
| Group-invitation email          | NOT DEPLOYED/NOT VERIFIED | In-app state remains Social-owned; external email delivery is not proven in this topology.                                                                                                    |
| Mobile automated                | PASS (existing evidence)  | 53/53 tests; typecheck, lint, and build passed. EAS preview APK exists.                                                                                                                       |
| Native APK/device               | NOT RUN                   | No physical-device/adb validation was performed.                                                                                                                                              |
| Production                      | NOT READY                 | Free-tier staging limitations and incomplete product E2E remain.                                                                                                                              |

## Build and deployment

- Application fix commit: `21d716e61f93c79b2d94ca304169ee7e8626c7ff` (`fix(web): wake staging services through same-origin probes`). The final release tip SHA, including this class-test documentation, is provided in the handoff.
- GitHub CI run `37910030413`: PASS.
- Security/CodeQL run `37910029964`: PASS.
- Vercel public staging deployment: READY with stable alias assigned; deployment metadata matches the final committed staging release.
- Render Identity, Social, Ledger, Automation, and Gateway: LIVE from the final committed staging release; all are Free services.
- An additional GitHub status context named `Vercel` reports failure for a separate `equa-web-staging` project under an inaccessible `equa1` scope. It is not the authorized public `equa-staging-demo-web` deployment, which is READY. No changes were made to that separate project.

## Cold-start evidence

Render independently logged Identity and Gateway shutdowns before each of two readiness cycles. In both cycles, the public Web readiness path eventually returned Identity and Gateway HTTP 200; Identity's first long probe sometimes returned normalized 503 while startup was still completing. The cold path passed twice, but this does not establish 100% reliability. Render Free sleeping/cold starts remain a staging limitation.

## Exact next action

Share [CLASS_TEST.md](CLASS_TEST.md) and collect class feedback. Do not claim the incomplete public two-user product flows or native device behavior as PASS.
