FROM kong:3.9.3-ubuntu

COPY infra/kong/kong.staging.yml /opt/kong/kong.yml

ENV KONG_DATABASE=off \
    KONG_DECLARATIVE_CONFIG=/opt/kong/kong.yml \
    KONG_PROXY_LISTEN=0.0.0.0:8000 \
    KONG_ADMIN_LISTEN=off \
    KONG_PROXY_ACCESS_LOG=/dev/stdout \
    KONG_PROXY_ERROR_LOG=/dev/stderr \
    KONG_ANONYMOUS_REPORTS=off