# Project Execution State

Updated: 2026-10-09. Canonical checkpoint for the public staging class-test build.

## Current state

- Verdict: **CLASS TEST DEPLOYMENT: READY WITH KNOWN RISKS**.
- Production: **NOT READY**.
- Application fix commit: `21d716e61f93c79b2d94ca304169ee7e8626c7ff`, pushed to `staging/demo`; the requested documentation update is a separate, non-runtime commit.
- Web: authorized Vercel staging project is READY, stable public alias assigned, and deployment metadata matches the final committed staging release. The exact release tip SHA is in the handoff.
- Render: Identity, Social, Ledger, Automation, and Gateway are LIVE from the final committed staging release and remain on Free plans.
- GitHub CI run `37910030413` and Security/CodeQL run `37910029964`: PASS.
- Minimal public smoke: PASS for Web root/login form, Gateway health, Identity health, and a synthetic invalid-login response; no 5xx observed.

## Accepted risk

The user explicitly stopped the remaining manual two-user friend/group/expense E2E. It is **NOT COMPLETED**. Do not claim friend requests, group invitations, expenses, displayed balances, debt guard, edit/delete, or cross-account dashboard/profile behavior as passed. Native APK device validation is **NOT RUN**. Render Free cold starts remain variable; repeated readiness cycles passed, but no production reliability guarantee is made.

Both existing accounts have user-confirmed email verification, fresh password reset, and public login PASS. No passwords or tokens were requested or recorded.

## Vercel check note

GitHub also reports a failing `Vercel` status context for a separate `equa-web-staging` project under an inaccessible `equa1` scope. The authorized staging project `equa-staging-demo-web` is READY on the application commit. The separate project was not accessed or changed.

## Exact next action

No deployment or smoke work remains. Share the class-test instructions and collect reports. Do not run the canceled two-user E2E or deploy to production without new authorization.
