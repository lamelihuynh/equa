# STAGING / LECTURER DEMO Deployment Checkpoint

Updated: 2026-10-05. No credentials are recorded here.

## Current step

Prepared and validated the zero-cost candidate topology and scoped source changes. Commits `637b2fd` (Web label regression test) and `a2536bc` (staging runtime/config) are local. No resources, migrations, deploys, DNS changes, or pushes have occurred. The documentation checkpoint is being finalized before the authorized normal push.

## Source and worktree

| Item                     | Current state                                                                                                     |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| Branch / source revision | `staging/demo` / `a2536bceb25469c70d488b98378c57a65ed335ba`                                                       |
| Remote branch            | `origin/staging/demo` absent; `origin/feature/automation-sync` remains `0043ee64680a346eb816db05bb9ad52f1d46521c` |
| Recent staging commits   | `637b2fd` Web label test; `a2536bc` Free topology and deployment support; prior app/docs commits remain ancestors |
| Worktree                 | Staging docs are pending the checkpoint commit; reports and generated files remain excluded                       |
| Push/merge/reset/clean   | Local commits made; no push, merge, reset, or clean performed                                                     |

Do not stage `apps/web/AGENTS.md`, `apps/web/CLAUDE.md`, `apps/web/tsconfig.tsbuildinfo`, or `reports/weekly/**`.

## Provider inventory

- Render CLI workspace `equa`: no Equa projects, services, Postgres, or Key Value. The current CLI does not expose the workspace billing plan; the Free-only Blueprint validates with 13 create/update actions.
- Vercel Hobby scope: no Equa project and no domains; one unrelated project is present. The old Web/API CNAMEs point to a Vercel project and Render gateway outside these scopes and are not reused.
- GitHub integration can read `lamelihuynh/equa`; local Git has push permission. Remote `staging/demo` is absent. No Vercel or Render connector tools are exposed in this session, so the authenticated CLIs are the approved fallback.
- Connected GitHub identity is `TiKyisme`, while the repository owner is `lamelihuynh`. Vercel Hobby personal-repository import may require owner authorization; no Vercel Git connection has been attempted.
- Resend credentials and a verified sender are not available. Public registration cannot complete until the provider is set up; email verification will not be bypassed.

## Minimum-cost candidate

| Resource                                                         | Count | Cost | Status                                   |
| ---------------------------------------------------------------- | ----: | ---: | ---------------------------------------- |
| Vercel Hobby Web                                                 |     1 |   $0 | No Equa project yet                      |
| Render Free Web: Gateway, Identity, Social, Ledger               |     4 |   $0 | Blueprint candidate                      |
| Render Free Postgres                                             |     1 |   $0 | 1 GB; expires after 30 days; no backups  |
| Redis, RabbitMQ, Notification worker, Automation, avatar storage |     0 |   $0 | Omitted as optional for the browser demo |

Base monthly resource cost is **USD 0** within free-tier quotas. Render Free Web services share 750 monthly workspace-hours, sleep after 15 idle minutes, cold-start, and are public. Vercel Hobby is intended for personal/non-commercial use. Free-tier expiration, quota suspension, and outbound/build usage risks prevent any production claim. Render's live docs: [Free limits](https://render.com/docs/free); Vercel: [Hobby plan](https://vercel.com/docs/plans/hobby).

## Validation

| Check                                                    | Result                                                                                         |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Render account inventory                                 | PASS: selected workspace lists no Equa resources                                               |
| Vercel account inventory                                 | PASS: no Equa project/domain in authenticated scope                                            |
| Render Blueprint validation                              | PASS: valid, 13 actions; no paid plan requested                                                |
| Frozen install                                           | PASS                                                                                           |
| Web tests/typecheck/lint/build                           | PASS: 15 tests; Vercel rewrite build used a dummy HTTPS Gateway URL                            |
| Social tests/typecheck/lint/build                        | PASS: 26 tests                                                                                 |
| Identity tests/typecheck/lint/build                      | PASS: 15 tests; existing non-fatal Vite config warning                                         |
| Ledger tests/typecheck/lint/build                        | PASS: 28 tests                                                                                 |
| Contracts tests/typecheck/lint/build                     | PASS: 5 tests                                                                                  |
| Kong Free Docker build/config parse/shell syntax         | PASS                                                                                           |
| Targeted Prettier / scaffold / Compose / diff check      | PASS                                                                                           |
| Root `pnpm format:check`                                 | FAIL only on untracked `reports/weekly/.build/report_print.css`; excluded from staging commits |
| Render resource sync, database migrations, public deploy | NOT RUN                                                                                        |
| GitHub CI/CodeQL for `staging/demo`                      | NOT RUN; branch is not pushed                                                                  |
| Public Web/API E2E, security smoke, Resend delivery      | NOT RUN                                                                                        |

## Next actions

1. Commit the validated documentation checkpoint, excluding generated and report files.
2. Push normally to `origin/staging/demo` and wait for CI/CodeQL.
3. Before initial Blueprint sync, configure Resend with a verified sender and store its API key in Render secrets; do not paste the key into chat or docs.
4. Create/connect the Vercel project to the exact GitHub repo/branch. If the personal-repository owner authorization is required, stop and request it; do not reassign existing domains.
5. Set Render `WEB_ORIGIN` and `APP_WEB_URL` to the generated Vercel origin, then sync only the validated Free Blueprint after reviewing its complete resource diff. Never create or upgrade paid resources.
6. Once Render assigns a Gateway URL, set Vercel `EQUA_GATEWAY_URL` to it and `NEXT_PUBLIC_API_BASE_URL=/v1` so browser auth cookies stay same-origin through the rewrite.
7. Confirm the Postgres owner can create the Social and Ledger databases; review migrations, deploy health, then run public E2E/security smoke.

`docs/PUBLIC_DEMO.md` remains deferred until public MVP E2E and security smoke pass. Production remains **NOT READY**.
