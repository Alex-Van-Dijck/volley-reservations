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

The app must be served from one HTTPS origin: the frontend calls relative `/api` paths, and the service worker (needed to install the PWA) only works over HTTPS.

`docker-compose.prod.yml` runs Postgres, the API, and Caddy, which serves the built frontend, proxies `/api` to the API, and gets a Let's Encrypt certificate automatically.

On the server (any Docker host with ports 80 and 443 open, and a DNS record pointing your domain at it):

```bash
cp .env.example .env              # set DOMAIN, POSTGRES_PASSWORD and the seed passwords
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml exec api node_modules/.bin/tsx prisma/run-seed.ts   # first deploy only
```

The API container applies pending migrations on every start. The compose file sets `NODE_ENV=production` (via the image) so the session cookie is `Secure`, and `TRUST_PROXY=1` so the per-IP login rate limit sees real client addresses.

To deploy an update, pull the new code and run the `up -d --build` command again. Back up the database with `docker compose -f docker-compose.prod.yml exec db pg_dump -U volley volley > backup.sql`.
