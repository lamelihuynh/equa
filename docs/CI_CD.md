# Equa CI/CD components

`.github/components.json` lists the workspace components. The seven entries with
`deployable: true` have a Dockerfile and GHCR image; mobile and contracts run quality
checks but are not container images. `scripts/ci/affected-components.mjs` validates
the manifest and emits a GitHub matrix. Direct changes select their component;
workspace dependencies propagate shared package changes to consumers. Root build
configuration, the lockfile, workflows, and shared infrastructure select broadly.
Documentation-only changes select no component image.

## Workflow flow

`ci.yml`: detect changed packages → reusable `component-quality.yml` matrix.
Repository formatting, scaffold, detector tests, and Compose validation stay in a
separate job; the existing infrastructure smoke test remains separate. Each
component runs build, lint, typecheck, test, and coverage when its package script
exists. Pull requests and pushes to `main`/`develop` trigger CI.

`deploy-staging.yml`: on a push to the branch named by repository variable
`STAGING_BRANCH` (default `develop`), detect affected entries with `staging`
metadata → component quality → Docker build/cache → GHCR `sha-<commit>` image →
the component's deploy hook → its configured smoke check. GitHub does not expand
variables in `on.push.branches`, so the branch check is at job level. Only Identity
has staging metadata today; other components are not deployed until a real target
and secret have been configured. A worker can use `smoke.kind: "none"` and needs no
HTTP endpoint. Web uses `apps/web/Dockerfile`; Node services and the worker use
`infra/docker/node-service.Dockerfile`.

`release-images.yml`: reads all deployable entries from the same manifest and
publishes version-tag and `sha-` tags to GHCR. It never publishes mobile/contracts
as containers. `security.yml` runs CodeQL on PRs, `main`/`develop`, and schedule.

## Add a component

Create a workspace package under `services/`, `workers/`, or `apps/` with the
scripts it supports. Add one entry to `.github/components.json` with its package,
path, kind, and, if containerized, Dockerfile/image. The detector checks these
paths against the repository. Add a `staging` object only after a deployment
target exists, then configure its GitHub secret and optional smoke URL variable.
Dependencies declared as workspace packages are read from package manifests.

## GitHub configuration

| Name                          | Type                         | Purpose                                             |
| ----------------------------- | ---------------------------- | --------------------------------------------------- |
| `STAGING_BRANCH`              | repository variable          | Staging integration branch; defaults to `develop`   |
| `STAGING_API_BASE_URL`        | staging environment variable | Identity HTTP smoke base URL; `/health` is appended |
| `RENDER_IDENTITY_DEPLOY_HOOK` | staging environment secret   | Identity Render deploy hook                         |
| `GITHUB_TOKEN`                | built-in token               | GHCR push; workflow grants `packages: write`        |

For another staging target, its `staging.hookSecret` names a distinct GitHub
environment secret. The hook receives the immutable image URL as `imgURL`, matching
the current Render deployment. Never put hook URLs or credentials in the manifest.
The repository/environment must permit GHCR pushes and staging deployment.

To inspect a matrix locally, run `node scripts/ci/affected-components.mjs --base
<base-sha> --head <head-sha> --mode quality`. Modes are `quality`, `images`, and
`staging`; `--all --mode images` shows release targets. Run
`node --test scripts/ci/affected-components.test.mjs` for detector scenarios.
