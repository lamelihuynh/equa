# Equa Class Test Guide

**CLASS TEST DEPLOYMENT: READY WITH KNOWN RISKS**  
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
4. After a long idle period, Render Free services may be asleep. Allow several minutes for the first authenticated action. The two measured sequential cold-readiness cycles completed in about 2-4 minutes from the first wake probe; this is staging evidence, not a guaranteed upper bound. If the page reports a temporary connection error, wait briefly and retry once.

Email verification, fresh password reset, and public login were manually confirmed for the two existing staging accounts. No replacement accounts were created for this finalization.

## Suggested class exploration

Use separate browser profiles if you test two accounts. Try the Friends, Groups, Expenses, Dashboard, and Profile pages. You may explore a friend request, an in-app group invitation, or a shared expense, but those public two-user flows and their balances/debt behavior were **NOT COMPLETED** in the final acceptance run. Report what you observe rather than assuming those flows passed.

External group-invitation email is **NOT DEPLOYED/NOT VERIFIED** in the current staging topology. The full public friend/group/expense E2E is **NOT COMPLETED**. Render Free services can sleep and have limited quotas. Production is not ready.

## Android

Download and install the APK on Android, then sign in with your own verified staging account. Automated Mobile evidence is 53/53 tests with typecheck, lint, and build passing. Native installation/device validation is **NOT RUN**; offline restart/reconnect behavior is also not verified on a device.

## Reporting a problem

Send the page URL, approximate time and timezone, account role (A/B or your own account), steps, expected result, actual result, and any visible HTTP status or correlation ID. Redact email addresses in screenshots where practical. Never send passwords, verification/reset tokens, access tokens, or secrets.
