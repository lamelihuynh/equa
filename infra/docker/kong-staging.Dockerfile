FROM kong:3.9.3-ubuntu

USER root
RUN apt-get update \
  && apt-get install --no-install-recommends -y gettext-base \
  && rm -rf /var/lib/apt/lists/*
COPY infra/kong/kong.staging.yml /opt/kong/kong.template.yml
COPY infra/docker/start-kong-staging.sh /usr/local/bin/start-kong-staging
RUN chmod 0555 /usr/local/bin/start-kong-staging

ENV KONG_DATABASE=off \
    KONG_DECLARATIVE_CONFIG=/tmp/kong.staging.yml \
    KONG_ADMIN_LISTEN=off \
    KONG_PROXY_ACCESS_LOG=/dev/stdout \
    KONG_PROXY_ERROR_LOG=/dev/stderr \
    KONG_ANONYMOUS_REPORTS=off \
    KONG_NGINX_WORKER_PROCESSES=1 \
    KONG_MEM_CACHE_SIZE=64m \
    KONG_PLUGINS=correlation-id,cors,request-size-limiting,rate-limiting

EXPOSE 10000
ENTRYPOINT ["/usr/local/bin/start-kong-staging"]
