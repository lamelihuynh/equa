FROM node:24.18.0-alpine AS build

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /workspace

COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @equa/web build

FROM node:24.18.0-alpine AS runtime

ENV NODE_ENV=production
ENV PORT=3000
WORKDIR /app
RUN addgroup -S equa && adduser -S equa -G equa
COPY --from=build --chown=equa:equa /workspace/apps/web/.next/standalone ./
COPY --from=build --chown=equa:equa /workspace/apps/web/.next/static ./apps/web/.next/static
USER equa
EXPOSE 3000
CMD ["node", "apps/web/server.js"]

