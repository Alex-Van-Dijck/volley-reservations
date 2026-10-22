FROM node:22-bookworm-slim
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/api/package.json packages/api/
COPY packages/web/package.json packages/web/
RUN pnpm install --frozen-lockfile --filter @volley/api...

COPY packages/api packages/api
# prisma.config.ts reads DATABASE_URL even for generate, so give it a placeholder at build time
RUN DATABASE_URL=postgresql://placeholder pnpm --filter @volley/api generate \
  && pnpm --filter @volley/api build

ENV NODE_ENV=production
WORKDIR /app/packages/api
USER node
EXPOSE 3000
CMD ["sh", "-c", "node_modules/.bin/prisma migrate deploy && node dist/main.js"]
