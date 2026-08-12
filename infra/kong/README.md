# Kong version note

Local development uses the Docker Official Image `kong:3.9.3-ubuntu`, the current Community Edition
tag available from the official `library/kong` repository when this scaffold was verified. Kong's newer
3.14/3.15 documentation and container tags refer to Kong Gateway Enterprise (`kong/kong-gateway`) and
must not be substituted silently because licensing/deployment behavior differs.

Before production, explicitly choose one of:

1. Kong Community Edition and its supported release/security-update process.
2. Licensed Kong Gateway/Konnect, then pin an exact supported image digest.
3. Another gateway via a superseding ADR if OIDC/JWKS requirements make it a better operational fit.

The declarative configuration currently uses plugins supported by the pinned CE image. Dependency and
image updates must pass the Compose smoke test.
