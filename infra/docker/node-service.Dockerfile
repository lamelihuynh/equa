FROM node:24.18.0-alpine AS build

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /workspace

COPY . .
RUN pnpm install --frozen-lockfile

ARG PACKAGE_NAME
RUN test -n "$PACKAGE_NAME"
RUN pnpm --filter "$PACKAGE_NAME"... build
RUN pnpm --config.inject-workspace-packages=true \
  --filter "$PACKAGE_NAME" deploy --prod /opt/equa
FROM node:24.18.0-alpine AS runtime

ENV NODE_ENV=production
WORKDIR /app
RUN addgroup -S equa && adduser -S equa -G equa
COPY --from=build --chown=equa:equa /opt/equa/ ./
USER equa
CMD ["node", "dist/main.js"]

