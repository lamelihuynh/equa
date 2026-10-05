# STAGING / LECTURER DEMO Deployment

This is a public **staging/demo** environment, not production. No resources have been
created or changed by syncing `render.yaml`; it remains a candidate until Render
inventory and the paid-resource estimate are reviewed and approved.

## Current external state (2026-10-05)

- `https://staging.equa.io.vn` resolves to Vercel and returned HTTP 200. Vercel CLI is
  authenticated to a Hobby scope with no Equa project or `staging.equa.io.vn` domain. Do
  not create a duplicate project or reassign the domain without its current owner's approval.
- `api-staging.equa.io.vn` resolves to `equa-kong-staging.onrender.com`; a read-only
  `/health` probe timed out. Render CLI is authenticated to workspace `equa`, whose project,
  service, Postgres, and Key Value lists are empty. The DNS target may belong to another
  workspace or be stale. The existing GitHub `staging` environment still has the legacy
  smoke URL and Identity deploy-hook secret name; its value was not read.
- The local `staging/demo` branch now has the validated application/config commits; the
  remote branch is still absent. `STAGING_BRANCH` is unset at repository and `staging`
  environment scope, so the legacy deploy workflow defaults to `develop`. CI and CodeQL
  include `staging/demo`; the legacy Identity hook workflow explicitly excludes it.
- The candidate Blueprint groups resources under Project `equa-staging-demo`, Environment
  `staging`, with unique `equa-staging-demo-*` names. Reassigning the existing API hostname
  requires confirmation from its current owner.

## Proposed topology

| Layer          | Component                                                 | Exposure                    | Staging behavior                                                        |
| -------------- | --------------------------------------------------------- | --------------------------- | ----------------------------------------------------------------------- |
| Web            | Existing Vercel Next.js project, root `apps/web`          | Public                      | API mode; `NEXT_PUBLIC_API_BASE_URL=https://api-staging.equa.io.vn/v1`  |
| Gateway        | New Render Kong web service                               | Public                      | Only public API entry; restricted CORS, rate limiting, correlation ID   |
| Backend        | Identity, Social, Ledger, Automation & Sync               | Render private services     | HTTP service-key boundaries; one `PORT`, bind `0.0.0.0`                 |
| Worker         | Notification                                              | Render background worker    | RabbitMQ ingestion and durable jobs; external invitation email disabled |
| Data           | Render Postgres                                           | Private                     | One server, five logical databases owned by their services              |
| Rate limits    | Render Key Value                                          | Private                     | Redis-backed Kong counters; persistent paid 256 MB plan                 |
| Events         | CloudAMQP Little Lemur or an existing authorized RabbitMQ | Private outbound connection | Shared free staging tier candidate; not production-grade                |
| Identity email | Resend                                                    | Outbound provider           | Verification/reset mail; requires a verified sender and API key         |
| Avatar objects | S3-compatible staging bucket (R2 candidate)               | Provider URL                | Identity requires access/secret keys during startup                     |

The Platform service is omitted because it is currently only a health scaffold and is not
needed by the demo flows. Mailpit remains local-only. Notification email is explicitly
disabled in staging unless a supported external provider is implemented and configured;
Social-owned group invitations remain visible and actionable in the Web app.

## Database and migration plan

Use separate logical databases on the staging Postgres server:

| Owner             | Database               |
| ----------------- | ---------------------- |
| Identity          | `equa_identity`        |
| Social            | `equa_social`          |
| Ledger            | `equa_ledger`          |
| Automation & Sync | `equa_automation_sync` |
| Notification      | `equa_notification`    |

The candidate Blueprint declares only the initial `equa_identity` database. After
authorization, inspect the selected Render server and create any missing logical
databases additively. Do not drop/reset databases or share one application database.
Each service receives only its own `*_DATABASE_URL`. Migrations run as that service's
pre-deploy command:

```text
pnpm --filter @equa/identity-service db:migrate
pnpm --filter @equa/social-service db:migrate
pnpm --filter @equa/ledger-service migrate
pnpm --filter @equa/automation-sync-service db:migrate
pnpm --filter @equa/notification-worker db:migrate
```

Run these only after confirming the target is a staging database and the Blueprint has
been approved.

## Security and Web configuration

- Public traffic goes through Kong. Identity, Social, Ledger, and Automation use private
  Render networking. Notification is an outbound-only worker. Postgres, Redis, and the
  RabbitMQ credentials are not placed in browser bundles.
- Kong's staging template accepts one explicit `WEB_ORIGIN`; use
  `https://staging.equa.io.vn`, not `*`. Only the gateway hostname goes in Web config.
- Identity uses `NODE_ENV=production`, secure cookies, and the canonical Web URL. The
  custom Web and API hosts are same-site subdomains. Use the custom Web domain for login;
  the default `.vercel.app` origin has not been verified for refresh-cookie behavior.
- Internal Identity lookup routes are not routed through Kong. Service calls use private
  URLs and service keys; services do not connect to another service's database.
- The gateway reads Render's private Key Value `REDIS_URL`, accepts only the private
  `redis://` scheme, then passes its host/port to Kong's Redis rate limiter.
- Local `Mailpit`, `.env`, `host.docker.internal`, and local MinIO URLs are not staging
  providers. Secrets belong in Render/Vercel/provider dashboards, never in Git.

## Cost estimate and approval gate

The current candidate uses six paid Render compute services (`0.5c-512mb`, about
USD 7/month each), Render Postgres (`0.1c-256mb`, about USD 6/month), and Render Key Value
(`256mb`, about USD 10/month): approximately **USD 58/month** before bandwidth, build
pipeline overages, tax, or any workspace/Vercel plan charges. The Hobby workspace has no
monthly workspace fee, but private services and background workers do not have a free
compute plan. A Render Pro workspace adds USD 25/month if required; its current plan is
unknown. The Vercel account plan is also unknown: Hobby is free for personal projects;
Pro is USD 20/month. CloudAMQP Little Lemur, Resend Free, and R2's free tier are suitable
candidates within their quotas, but each still requires account/provider
authorization and setup. See the [Render pricing](https://render.com/pricing),
[Render compute plans](https://render.com/docs/compute-plans),
[Render free limits](https://render.com/docs/free),
[Vercel pricing](https://vercel.com/pricing),
[CloudAMQP plans](https://www.cloudamqp.com/plans.html),
[Resend pricing](https://resend.com/pricing), and
[Cloudflare R2 pricing](https://developers.cloudflare.com/r2/pricing/).

**Do not sync the Blueprint or provision resources until existing Render resources have
been inventoried and the estimated paid baseline has explicit approval.** Reuse can change
the incremental cost, but must not overwrite the current API gateway, Identity service,
Postgres, Redis, or any production resource.

## Local validation

`pnpm install --frozen-lockfile`, Web and backend package builds, the Compose config check,
and the staging Kong Docker build passed locally. The Render Blueprint passed the public
Render JSON Schema and local project/environment service/database/group-reference checks.
Render CLI validation reports `need_payment_info` for its six compute services, Postgres,
and Key Value. The shared Node Docker build passed for Identity; attempts for the other
package variants stopped before build execution when Docker Hub manifest requests timed out.
These services use native Node builds in the candidate Render Blueprint. Full public API
health, Render/Vercel settings, migrations, and public E2E remain unverified.

## Deployment sequence after the gates

1. Identify the Render workspace/account that owns the current API hostname. The authenticated
   `equa` workspace is empty; do not reassign the hostname until its owner/current state is
   confirmed.
2. Authorize the Vercel account/team containing the existing Equa project/domain. The current
   authenticated Hobby scope has no Equa project; do not create a duplicate without approval.
3. Review the paid Render resource estimate and explicitly approve any new resources before
   provisioning.
4. Configure CloudAMQP, Resend sender/API key, and S3-compatible avatar credentials via
   their dashboards and Render secrets. Do not send secrets in chat or commit them.
5. After the gates, push the prepared `staging/demo` source and let CI/CodeQL finish before
   Render deploys.
6. Sync the unique-name Blueprint only after checking every resource diff. Create missing
   logical databases additively; apply each service migration.
7. Connect the existing API custom hostname only after verifying it can be reassigned
   without modifying the current service or data.
8. Configure the existing Vercel project with root `apps/web`, the canonical API base,
   and the staging avatar origin if avatars are tested.
9. Verify Gateway routes, CORS, auth/cookies, private-service isolation, then run synthetic
   public E2E and technical staging tests. Publish `docs/PUBLIC_DEMO.md` only after those
   checks pass.

Production remains **NOT READY**. Staging validation is not production validation.
