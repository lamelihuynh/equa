# Security posture and gaps

This document separates controls visible in the repository from controls that still require
deployment configuration or runtime evidence. A configured workflow or target policy is not proof
that an external environment is protected.

## Present in this branch

- Kong configures CORS allowlists, a 5 MB request limit, Redis-backed rate limiting, and a generated
  `X-Correlation-ID`. Gateway configuration does not verify JWTs; Identity, Social, Ledger, and
  Automation & Sync validate bearer JWTs in their service boundaries.
- Runtime access tokens use HS256 with `IDENTITY_JWT_SECRET`; the repository does not implement an
  asymmetric signing/JWKS setup. Internal service routes use configured `X-Equa-Service-Key`
  values. These are shared-secret controls, not workload identity or mutual TLS.
- Social, Ledger, and Automation & Sync emit structured Fastify request logs. Their request IDs use
  `X-Correlation-ID`; request serializers omit headers and query strings, and redact authorization,
  cookies, and service keys. Notification worker emits structured recovery diagnostics without
  logging broker URLs or raw errors. Cross-service trace-context propagation is not implemented.
- Identity, Social, and Ledger expose liveness-only `/health` routes. Automation & Sync exposes
  `/health` and `/ready`; readiness checks its database, Ledger configuration, and sync service.
  Notification is a background worker and has no HTTP health endpoint.
- `security.yml` runs CodeQL for JavaScript/TypeScript on pull requests, `main`/`develop`, and weekly.
  Dependabot is configured for weekly npm, Docker, and GitHub Actions updates.
- Runtime Node images create and use a non-root `equa` user. The base image uses a version tag, not
  a digest. Application image vulnerability scanning, SBOM publication, signing, and provenance
  verification are not configured.
- Local examples use placeholders. Staging secrets are external. The staging manifest currently
  deploys Identity only; repository presence does not verify deployed secrets or network policy.

## Not yet implemented or verified

- Telemetry collector and Prometheus configs are infrastructure files only; application
  OpenTelemetry SDK/exporter instrumentation and production dashboards/alerts are absent.
- No automated PostgreSQL backup/PITR configuration or restore evidence is present in this branch.
  The goals in `DEPLOYMENT.md` are targets, not evidence of active backups.
- No dependency vulnerability gate, container scan/signing gate, DAST/ZAP run, production threat
  model, key-rotation drill, or service-to-service workload identity is evidenced here.
- Phase 10 exercised local readiness and a scoped PostgreSQL/RabbitMQ path. Production service
  isolation, broker policy/operations, staging behavior, and failure recovery remain unverified.

## Before accepting real users

Complete an auth/offline-sync threat model; configure and test secret rotation; add dependency and
image security gates; instrument and alert on service health, queue/DLQ backlog, and request errors;
configure encrypted backups/PITR and complete a restore drill; exercise staging security and failure
scenarios; and review rate-limit abuse cases and the OWASP API Top 10. Keep all real credentials in
the selected runtime secret manager, never in this repository or logs.
