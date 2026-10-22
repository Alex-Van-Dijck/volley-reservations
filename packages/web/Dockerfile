FROM node:22-bookworm-slim AS build
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/api/package.json packages/api/
# the web package's prepare script runs panda codegen, which needs its config at install time
COPY packages/web packages/web
RUN pnpm install --frozen-lockfile --filter @volley/web...
RUN pnpm --filter @volley/web build

FROM caddy:2-alpine
COPY packages/web/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/packages/web/dist /srv/web
