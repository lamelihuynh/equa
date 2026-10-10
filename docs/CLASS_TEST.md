# Equa Class Test Guide

**CLASS TEST DEPLOYMENT: NOT READY**  
**PRODUCTION READINESS: NOT READY**

## Public links

| Target              | Link                                                                           | Notes                                                                 |
| ------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| Web app             | https://equa-staging-demo-web.vercel.app                                       | Public staging Web                                                    |
| API Gateway         | https://equa-staging-demo-gateway.onrender.com                                 | Public staging API                                                    |
| Android preview APK | https://expo.dev/artifacts/eas/UZOSEWChdoOUB1iaRiNlR3sXsdgxiq_o5M20s875uM4.apk | Build `c946bf3b-09a7-4cb5-959d-06a37ef078e1`; link expires 2026-10-22 |

## Getting started

1. Open the Web link and use the public app. Do not select **Local Demo**; it stores data only in the browser.
2. To register, use an email inbox you can access, create an account, then open the verification email and follow its link.
3. Sign in with your account. If you forget the password, choose **Quen mat khau?** and use the newest reset email. Do not share passwords or reset links.
4. After a long idle period, Render Free services may be asleep. Allow around 1–2 minutes for the first authenticated Dashboard load while services start; actual timing varies. Leave the page open while the startup message is shown instead of repeatedly reloading or opening Render health URLs.

Email verification, fresh password reset, and public login were manually confirmed for the two existing staging accounts. No replacement accounts were created for this finalization.

## Suggested class exploration

Use separate browser profiles if you test two accounts. Try the Friends, Groups, Expenses, Dashboard, and Profile pages. You may explore a friend request, an in-app group invitation, or a shared expense, but those public two-user flows and their balances/debt behavior were **NOT COMPLETED** in the final acceptance run. Report what you observe rather than assuming those flows passed.

External group-invitation email is **NOT DEPLOYED/NOT VERIFIED** in the current staging topology. The full public friend/group/expense E2E is **NOT COMPLETED**. Render Free services can sleep and have limited quotas. The current Free Postgres instance expires on 2026-11-05; staging data may not persist beyond that date. Production is not ready.

The Web cold-start fix is deployed. Cycle 1 was partial because a pre-login Dashboard batch returned 502. Clean cycle 2 passed at the API/log level: Account A login/profile succeeded, readiness brought Identity, Gateway, Social, and Ledger up, and groups/expenses/total returned 200 with no Gateway 5xx after login. The authenticated Friends-page check remains unverified; do not infer its UI result from the Groups request.

The checkpoint documentation is committed and pushed. CI and Security/CodeQL passed on the documentation checkpoint. A post-rollout public smoke returned HTTP 200 for the Web root, Gateway health, and Identity health. The authenticated Friends-page check is the only remaining minimal UI check; keep its result unverified until observed.

## Android

Download and install the APK on Android, then sign in with your own verified staging account. Automated Mobile evidence is 53/53 tests with typecheck, lint, and build passing. Native installation/device validation is **NOT RUN**; offline restart/reconnect behavior is also not verified on a device.

## Reporting a problem

Send the page URL, approximate time and timezone, account role (A/B or your own account), steps, expected result, actual result, and any visible HTTP status or correlation ID. Redact email addresses in screenshots where practical. Never send passwords, verification/reset tokens, access tokens, or secrets.
