# Equa Staging / Lecturer Demo

This is a temporary public demo, not production. The current candidate uses only free plans; no Render or Vercel resources have been created or modified.

## Minimum topology

| Component               | Classification                   | Candidate                         | Demo notes                                                                                                |
| ----------------------- | -------------------------------- | --------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Web                     | REQUIRED                         | Vercel Hobby, root `apps/web`     | Deploy the GitHub `staging/demo` branch; use its generated `.vercel.app` hostname.                        |
| Gateway                 | REQUIRED                         | Render Free Web service           | The browser uses only this HTTPS URL. Kong Admin API stays disabled.                                      |
| Identity                | REQUIRED                         | Render Free Web service           | JWT auth remains required. Public registration needs a configured verified-email provider.                |
| Social                  | REQUIRED                         | Render Free Web service           | Owns `equa_social`; in-app friend/group flows remain available.                                           |
| Ledger                  | REQUIRED                         | Render Free Web service           | Owns `equa_ledger`; all financial writes still go through Ledger.                                         |
| PostgreSQL              | REQUIRED                         | One Render Free Postgres instance | Three logical databases; 1 GB and 30-day lifetime.                                                        |
| Automation & Sync       | OPTIONAL                         | Omitted                           | Current public Web demo has no recurring/offline-sync UI. Mobile is not deployed.                         |
| Notification / RabbitMQ | OPTIONAL                         | Omitted                           | Group invitations remain in-app; external invite email is not needed for the public demo.                 |
| Redis / Key Value       | NOT REQUIRED                     | Omitted                           | Staging Kong rate limiting uses one-instance local counters.                                              |
| Avatar object storage   | NOT REQUIRED                     | Omitted                           | `AVATAR_STORAGE_ENABLED=false`; avatar upload reports unavailable.                                        |
| Identity email          | REQUIRED FOR PUBLIC REGISTRATION | Resend Free, after setup          | Identity cannot verify newly registered users without a real provider. No verification bypass is allowed. |

## Zero-cost plan and trade-offs

| Resource                                                  | Plan                     |        Monthly base cost | Limits and trade-off                                                                                                                                                     |
| --------------------------------------------------------- | ------------------------ | -----------------------: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Vercel Web                                                | Hobby                    |                       $0 | Personal/non-commercial use; included usage limits apply.                                                                                                                |
| Gateway, Identity, Social, Ledger                         | Render Free Web          |                       $0 | Four services share 750 workspace instance-hours/month; each sleeps after 15 minutes and may take about a minute to wake. Free services have public `onrender.com` URLs. |
| Postgres                                                  | Render Free              |                       $0 | One instance/workspace, 1 GB, no backups, expires after 30 days.                                                                                                         |
| Redis, RabbitMQ, Notification, Automation, object storage | Omitted                  |                       $0 | Their optional public-demo behavior is unavailable.                                                                                                                      |
| Identity verification mail                                | Resend Free, if eligible | $0 within provider quota | Requires a Resend account, verified sender domain, and API key; free quota is currently 3,000 messages/month and 100/day.                                                |

The Render Free tier is suitable only for a short, low-volume demo. Free services can be restarted, cold-start, or suspended at quota limits. Outbound bandwidth/build overages may incur costs if billing is enabled; do not add a payment method or upgrade a plan for this setup. The Vercel Hobby plan is limited to personal/non-commercial use. See [Render Free limits](https://render.com/docs/free), [Vercel Hobby](https://vercel.com/docs/plans/hobby), and [Resend pricing](https://resend.com/pricing).

## Boundaries and data

Render Free Web services cannot receive private-network traffic. The backend Web services therefore have public hostnames; the browser calls same-origin `/v1/*` paths on Vercel, which rewrites server-side to Kong. This preserves Identity's existing `/v1/auth` refresh-cookie path and avoids third-party cookies. Direct API routes still require JWTs or service keys. Social-to-Identity/Ledger and Ledger-to-Social calls use HTTPS between Render hostnames. This public-upstream arrangement is a demo compromise; production remains **NOT READY**.

Postgres remains one server with separate logical databases:

- Identity: `equa_identity`
- Social: `equa_social`
- Ledger: `equa_ledger`

Each service's code targets its own database name. The current Blueprint uses the server's default database credential for those URLs, so database-user isolation is not a production security boundary. There are no cross-service queries or foreign keys.

Render Free Web does not support paid pre-deploy commands. Identity, Social, and Ledger therefore run their idempotent migrations in their start commands. Social and Ledger create their own logical databases when absent. The three services currently use the Postgres instance's default credential with distinct database names; app code does not query another service's database, but database-user isolation is not provided. See [Render deploy steps](https://render.com/docs/deploys).

Kong allows one exact `WEB_ORIGIN`, applies correlation IDs and request-size limits, and uses local per-instance rate limits. Its counter resets on restart. PostgreSQL is referenced over Render's same-region private connection. No secret is included in Git.

## Deployment sequence

1. Validate and push the reviewed local `staging/demo` source; wait for CI and CodeQL.
2. Configure Resend with a verified sender and store its key in Render secrets. The initial Blueprint sync requests it; do not bypass email verification.
3. Create and connect the Vercel project `equa-web-staging` to `lamelihuynh/equa`, branch `staging/demo`, root `apps/web`. Use the actual assigned `.vercel.app` URL. A personal-repository import may require authorization from its owner.
4. Set Render `WEB_ORIGIN` and `APP_WEB_URL` to the Vercel origin, validate the Free-only Blueprint and review its full resource diff, then sync it in `equa-staging-demo/staging`.
5. Confirm the Postgres owner can create the Social and Ledger databases; each service runs its idempotent migration at startup.
6. After the Gateway hostname exists, set Vercel `EQUA_GATEWAY_URL` to it and `NEXT_PUBLIC_API_BASE_URL=/v1`; deploy Web and verify HTTPS/no localhost requests.
7. Run public health/security smoke, then the two-account Web E2E. Publish `docs/PUBLIC_DEMO.md` only after that E2E passes.

Do not reuse `staging.equa.io.vn` or `api-staging.equa.io.vn`; their DNS points to projects outside the currently authenticated provider scopes. Do not change their DNS.

## Current stop conditions

Resend account/sender setup is required before synthetic users can register and verify. The Vercel Hobby scope is not the GitHub repository owner; verify the Git connection can be authorized before connecting the project. If either provider requests owner authorization, stop at that request. No paid resource is in this plan.
