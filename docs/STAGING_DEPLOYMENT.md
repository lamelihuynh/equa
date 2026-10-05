# Equa Staging / Class Test Deployment Plan

This plan targets a temporary public **STAGING / CLASS TEST** environment, not production. Current provider inventory and gates are recorded in `docs/STAGING_DEPLOY_STATE.md`. No cloud resources have been created.

## Required topology

| Component               | Plan                                                                   | Why it is needed                                                                    | State                                                                                        |
| ----------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Web                     | Vercel Hobby                                                           | Registration/login and the public class-test UI                                     | New project in the authenticated `ti-ky-s-projects` scope; use a generated `.vercel.app` URL |
| Gateway                 | Render Free Web                                                        | Single public API entry point for Web and Mobile                                    | Add HTTPS routes for Identity, Social, Ledger, and Automation & Sync                         |
| Identity                | Render Free Web                                                        | Registration, verified email, login, profile                                        | Resend verified sender and API key are required; never bypass verification                   |
| Social                  | Render Free Web                                                        | Friends, groups, memberships, in-app invitations                                    | Owns `equa_social`; uses Identity/Ledger HTTP adapters                                       |
| Ledger                  | Render Free Web                                                        | Expense source of truth and supported balances                                      | Owns `equa_ledger`; mutations stay in Ledger                                                 |
| Automation & Sync       | Render Free Web                                                        | Required for Mobile persistent offline queue replay and sync feed                   | Owns `equa_automation_sync`; uses Ledger internal API                                        |
| PostgreSQL              | One Render Free Postgres                                               | Persistent staging data                                                             | Separate logical databases for each deployed service                                         |
| Notification / RabbitMQ | Omitted from the $0 base plan unless a Free, safe deployment is proven | Group invitation lifecycle is in-app; registration email is sent by Identity/Resend | Group invitation email and Ledger event delivery are not claimed when omitted                |
| Redis / Key Value       | Omitted                                                                | Kong uses a single-instance local rate-limit policy                                 | Counters reset when Gateway restarts                                                         |
| Avatar storage          | Omitted                                                                | Not required for class acceptance                                                   | Keep `AVATAR_STORAGE_ENABLED=false`                                                          |

The committed `render.yaml` was prepared for the smaller lecturer demo. The current working-tree version adds a Free Automation & Sync service, its service-owned database target/key, and Kong `/v1/sync`/recurring routes. Render CLI validation reports a valid 15-action plan; no resources have been created. Notification/RabbitMQ remain omitted from the $0 base plan.

## Zero-cost constraints

- Create only explicit Vercel Hobby and Render Free resources. Do not add a payment method, upgrade, or create a paid resource.
- Vercel Hobby is limited to personal/non-commercial use. Use this only as a course demo.
- Render Free Web services share workspace instance-hour quotas, sleep when idle, and have public provider hostnames. Render Free Postgres is temporary, has limited storage, and has no backups.
- EAS Free includes a limited low-priority build quota and does not charge overages. If the quota is exhausted, wait for reset; do not upgrade.
- Resend may have a free quota, but it still requires an account, verified sender domain, and API key. Do not purchase a domain or provider plan automatically.
- Production remains **NOT READY**.

See [Render Free limits](https://render.com/docs/free), [Vercel Hobby](https://vercel.com/docs/plans/hobby), [EAS plans](https://docs.expo.dev/billing/plans/), and [EAS pricing](https://expo.dev/pricing).

## Boundaries and client routing

- Ledger remains the source of truth for financial data. No cross-service database access or cross-service foreign keys.
- The browser uses same-origin `/v1/*` rewrite paths to the public HTTPS Gateway. This preserves the existing Identity refresh-cookie path.
- Mobile uses `EXPO_PUBLIC_API_BASE_URL=https://<gateway-host>/v1` from the EAS `preview` environment. The app rejects missing, insecure, and localhost API URLs outside development. The URL is public configuration, not a secret.
- Render Free Web hostnames are publicly reachable. JWTs protect user APIs; service keys protect internal Identity/Social/Ledger/Automation routes. Kong Admin must not be exposed.
- Set Gateway `WEB_ORIGIN` to the exact Vercel origin. Mobile native traffic is not browser CORS traffic.
- Keep service-owned logical databases: `equa_identity`, `equa_social`, `equa_ledger`, and `equa_automation_sync`. Create `equa_notification` only if Notification is actually deployed.

## Deployment sequence

1. Resolve the Resend sender/API-key gate and Expo/EAS CLI account gate. Never paste secrets into chat.
2. Add the Automation Free web service, its owned database URL/key, and its Gateway routes; validate the complete Blueprint plan and verify every resource is Free.
3. Create the new Vercel project `equa-demo-web` in the current authorized scope, root `apps/web`, branch `staging/demo`. If Git import blocks, deploy the checked-out source directly. Do not use `equa1/equa-web-staging` or change DNS.
4. Set Render `WEB_ORIGIN` and `APP_WEB_URL` to the generated Vercel origin. Configure Identity with `EMAIL_PROVIDER=resend`, matching `EMAIL_FROM`, and `RESEND_API_KEY` in provider secret storage.
5. Create the Free Render Postgres and services in dependency order: Identity, Social, Ledger, Automation, then Gateway. Run each service's own migration and record the result.
6. Configure Vercel `EQUA_GATEWAY_URL` and `NEXT_PUBLIC_API_BASE_URL=/v1`. Set the EAS `preview` environment variable `EXPO_PUBLIC_API_BASE_URL` to the public Gateway URL.
7. Verify public HTTPS, CORS, rate limits, protected internal endpoints, secret exclusion from Web/Mobile bundles, and public health.
8. Run real two-account Web acceptance and Android preview APK acceptance. Do not substitute local behavior for public or native evidence.

Do not reuse `staging.equa.io.vn` or `api-staging.equa.io.vn`; their existing DNS points to resources outside the authorized scopes. Do not modify those records.
