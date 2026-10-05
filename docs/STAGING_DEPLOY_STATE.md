# STAGING / LECTURER DEMO Deployment Checkpoint

Updated: 2026-10-05. This checkpoint contains no credentials.

## Current step

The staging source is prepared in a local branch with scoped commits. Do not push, sync a
Blueprint, create cloud resources, or run remote migrations until the Render inventory is
authorized and the paid-resource estimate is approved. The remote `staging/demo` branch
remains absent.

## Repository and source

| Item                       | Current state                                                      |
| -------------------------- | ------------------------------------------------------------------ |
| Current branch             | `staging/demo` (local only)                                        |
| Base commit                | `0043ee64680a346eb816db05bb9ad52f1d46521c`                         |
| Application/config commits | `2ed2d2b`, `c7285ef`, `e6c215f`; documentation commits follow      |
| `origin/staging/demo`      | Absent; no push performed                                          |
| Worktree                   | App/config changes committed; reports and generated files excluded |
| PR #18                     | Existing `develop` PR was not merged or changed                    |

## Change classification from the initial worktree audit

| Class                    | Current paths/change groups                                                                                                                                                                  | Staging action                                                |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| A — Required staging app | Web Friends/Groups/Expenses/font and identity label; shared contracts; Identity resolver; Social identities/invitations/outbox; Notification jobs/provider; related manifests/tests/lockfile | Committed in the first two local commits                      |
| B — Deployment config    | Service `PORT` support; `.dockerignore`; Kong Dockerfile/template/entrypoint; `render.yaml`; CI/Security branch coverage and legacy-deploy guard; environment matrix                         | Committed in the third local commit                           |
| C — Docs/report only     | Deployment/readiness/operations/integration/runbook/checkpoint docs; all `reports/weekly/**` material                                                                                        | Relevant docs committed; all report artifacts/source excluded |
| D — Generated            | `apps/web/AGENTS.md`, `apps/web/CLAUDE.md`, `apps/web/tsconfig.tsbuildinfo`, `reports/weekly/.build/__pycache__/**`                                                                          | Do not commit; Docker ignore excludes these paths             |
| E — Unrelated            | None identified in the current status list                                                                                                                                                   | Preserve; do not stage implicitly                             |

No command has used `git add .`, reset, clean, or force operations. The Docker image build
context excludes `.env`, reports, generated agent files, and TypeScript build-info files.

## External state observed

- `https://staging.equa.io.vn` currently resolves to Vercel and returned HTTP 200. Vercel
  project settings, deployed branch, API environment value, and public browser flow remain
  unverified because Vercel CLI/token access is unavailable.
- `api-staging.equa.io.vn` currently resolves to `equa-kong-staging.onrender.com`. The
  existing GitHub staging environment points its legacy smoke variable at that Render
  hostname and contains the legacy `RENDER_IDENTITY_DEPLOY_HOOK` secret name. The secret
  value was not read. Public API health and Render resource ownership/configuration remain
  unverified because Render access is unavailable.
- `STAGING_BRANCH` is unset at repository and staging-environment scope; the legacy workflow
  defaults to `develop`. The candidate explicitly excludes `staging/demo` from that legacy
  Identity-only image/hook deployment.
- GitHub CLI is authenticated and used only for read-only metadata. Render CLI v2.28.0 was
  downloaded to a temporary directory and hash-verified, but no Render workspace is signed
  in/selected, so Blueprint validation returned the workspace-selection error. Vercel CLI
  and local Vercel auth are absent. Cloudflare, Resend, and CloudAMQP credentials are not
  present in the local environment.

## Proposed resources and cost gate

The candidate `render.yaml` uses new names (`equa-staging-demo-*`) to avoid taking over
existing resources. It proposes six paid 0.5 CPU / 512 MB compute services, one 0.1 CPU /
256 MB Postgres instance, and one 256 MB Key Value instance: about **USD 58/month** on a
Render Hobby workspace, before bandwidth/build overages and tax. Render Pro adds USD 25/month
and Vercel Pro USD 20/month if either account requires those plans; current plans are unknown.
Existing Render resources might reduce incremental cost, but that cannot be established
without authorized inventory. No paid resources were created. CloudAMQP Little Lemur, Resend
Free, R2 free tier, and Vercel Hobby are candidates only; each requires account/ownership
confirmation and may have usage or policy limits.

## Validation performed

| Check                                                               | Result                                                                                                                  |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                    | PASS                                                                                                                    |
| Web/Social/Identity/Ledger/Automation/Notification/Contracts builds | PASS                                                                                                                    |
| Affected unit suites                                                | PASS: Web 15, Social 23, Identity 13, Ledger 26, Automation 38, Notification 17, Contracts 5                            |
| Prior affected lint/typecheck checks                                | PASS for Web, Social, Identity, Notification, Contracts; new Ledger/Automation builds and tests also pass               |
| Compose config rendering                                            | PASS                                                                                                                    |
| Existing local Compose services                                     | Healthy; no restart/down/reset commands were run                                                                        |
| Render Kong staging Docker image                                    | PASS                                                                                                                    |
| Render Blueprint JSON Schema and local reference checks             | PASS                                                                                                                    |
| Render CLI semantic Blueprint validation                            | NOT RUN; CLI requires Render login and workspace selection                                                              |
| Shared Node Docker image                                            | PASS for Identity; other package variants could not resolve Docker Hub base-image metadata after TLS handshake timeouts |
| Vercel custom Web URL                                               | HTTP 200; this does not validate current source/API-mode browser flow                                                   |
| Render API health, migrations, public E2E                           | NOT RUN                                                                                                                 |

The Render Blueprint is candidate configuration only. The full Docker check for the shared
Node Dockerfile and the Web Dockerfile remains unverified; the selected Render backend uses
native Node builds, and Web uses Vercel.

## Remaining gates and next actions

1. Sign in to Render using the CLI/dashboard, select the workspace, and inspect all existing
   services, databases, Key Value stores, domains, plans, and Blueprint links before any sync.
2. Approve the estimated paid Render baseline or provide an authorized alternative.
3. Sign in to the Vercel account that owns the current Web domain/project and confirm the
   custom-domain, root-directory, and environment settings.
4. Configure Resend verification mail, CloudAMQP RabbitMQ, and S3-compatible avatar secrets
   through provider dashboards; do not paste secret values into chat.
5. Only then push the reviewed staging branch, wait for CI/CodeQL, sync the unique-name
   Blueprint after reviewing its complete resource diff, create missing logical databases,
   migrate, and run public smoke/E2E/security checks.

Production remains **NOT READY**. `docs/PUBLIC_DEMO.md` is intentionally deferred until public
staging E2E and security checks pass.
