# Volley reservations

A web app for a volleyball club to book its fields. Captains reserve slots for home games and enter away games, the manager can act for any team and block slots, and anyone can view the public club calendar. The backend is Node with Fastify and Prisma on PostgreSQL, and the frontend is a React PWA. Architecture decisions are recorded in [docs/adr/](docs/adr/).

## Development

```bash
docker compose up -d
pnpm install
cp packages/api/.env.example packages/api/.env
pnpm --filter @volley/api exec prisma generate
pnpm --filter @volley/api db:deploy
pnpm --filter @volley/api db:seed
pnpm --filter @volley/api dev     # http://localhost:3000
pnpm --filter @volley/web dev     # http://localhost:5173, proxies /api
```

The seed creates a `manager` user and one `captain<n>` user per team (`captain1`, `captain2`, ...). Their passwords come from `SEED_MANAGER_PASSWORD` and `SEED_CAPTAIN_PASSWORD` in `packages/api/.env` and default to `change-me`. Set real values before seeding any shared environment.

## Tests

```bash
pnpm -r typecheck
pnpm -r test                      # api tests need the volley_test database on port 5433 from docker compose
```

The API test setup applies migrations to `volley_test` itself, so only `docker compose up -d` is needed beforehand.

## Deploy

Build with `pnpm --filter @volley/web build` and serve `packages/web/dist` and the API from the same origin
(for example one reverse proxy that serves the static files and forwards `/api` to the Fastify process).
Set `TRUST_PROXY=1` when running behind a reverse proxy, otherwise the per-IP login rate limit counts all users as one client.
Set `NODE_ENV=production` so the session cookie is `Secure`, and serve over HTTPS (required for the service worker).
