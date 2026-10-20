# ADR 0002: Use Prisma ORM for API persistence

- Status: Accepted
- Date: 2026-10-20
- Amends: ADR 0001 (decision 4, the Postgres adapters, and the "ORM-managed schema" alternative)
- Detailed design: `docs/superpowers/specs/2026-10-20-volleyball-reservations-design.md`, sections 7, 8, 11 and 12

## Context

ADR 0001 chose plain versioned SQL migrations and hand-written Postgres adapters, mainly to keep the schema tool-neutral for the later Java port. The Node implementation will now use Prisma ORM instead. The Java port is deferred, and how Java manages the schema is decided when that work starts.

## Decision

Use Prisma ORM 7 in `packages/api`.

- Generator `prisma-client` with an explicit output at `packages/api/src/generated/prisma`. The generated client is not committed.
- Driver adapter `@prisma/adapter-pg` against PostgreSQL. Prisma 7 requires an adapter for SQL databases.
- `packages/api/prisma.config.ts` holds the datasource URL, schema path, migrations path and seed command. Environment variables are loaded explicitly with `dotenv`.
- `packages/api/prisma/schema.prisma` is the source of truth for tables, enums, relations and unique constraints. Prisma Migrate (`packages/api/prisma/migrations`) is the migration tool and replaces `db/migrations`.
- Prisma stays an adapter-layer detail. The domain and application layers never import generated types. Repositories map between Prisma rows and domain types.
- A `UnitOfWork` port wraps `prisma.$transaction`, so application services still own their transactions without knowing about Prisma.

Where each database concern lives:

| Concern | Where |
| --- | --- |
| Tables, enums, foreign keys | `schema.prisma` |
| Unique (team, date, slot) and unique (field, date, slot) on events, unique (date, slot) on blocks | `schema.prisma` via `@@unique` |
| Check: home event has a field, away event has none | Hand-written SQL in the migration |
| Check: captain has a team, manager has none | Hand-written SQL in the migration |
| Check: slot weekday between 1 and 7 | Hand-written SQL in the migration |
| Advisory lock per (date, slot) | `$executeRaw` in the slot-lock adapter |

Prisma's schema language has no check constraints. The workflow is `prisma migrate dev --create-only`, add the check constraints to the generated SQL by hand, then apply.

## Alternatives considered

| Alternative | Why not |
| --- | --- |
| Keep plain SQL migrations and use Prisma only for queries, introspected with `db pull` | Keeps the schema tool-neutral, but creates two sources of truth that can drift, and loses the single toolchain that motivated the change. |
| Keep ADR 0001 as written (`pg` plus hand-written SQL) | Gives up typed queries and generated migrations, which is the reason for adopting Prisma. |

## Consequences

Positive:

- One toolchain for schema, migrations, seed and typed queries.
- The booking rules still live in the database, so they hold under concurrent requests.
- Less hand-written SQL and row mapping in the adapters.

Negative and risks:

| Risk | Mitigation |
| --- | --- |
| Check constraints are invisible to `schema.prisma`, so a later migration could drop one unnoticed | An integration test inserts a violating row for each check and expects rejection. |
| The error shape for unique violations may differ when a driver adapter is used | The mapper does not rely on a single field. It reads whichever of `meta.target` or the driver adapter error details is present, falls back to `CONFLICT`, and has one integration test per constraint. |
| `@db.Date` and `@db.Time` surface as JavaScript `Date` objects, which invites time zone bugs | One mapper module converts to `YYYY-MM-DD` and `HH:MM` strings using UTC accessors only. The domain never sees `Date`. Round-trip tests cover it. |
| Interactive transactions hold a connection while they run | Keep them short and set an explicit timeout. |
| Prisma 7 is ESM-first and needs Node 20.19 or later and TypeScript 5.4 or later | Node 22 and a current TypeScript satisfy this. `packages/api` uses `"type": "module"`. |

## Open item: the Java port

Prisma's `migrations` folder and `_prisma_migrations` table are Prisma-specific, so Flyway or Liquibase cannot consume them directly. The database itself is plain PostgreSQL, so the Java backend can run against the same schema. When the port starts, choose between:

1. Keep running `prisma migrate deploy` from the Node package as the owner of the shared schema.
2. Generate a baseline SQL script from the schema with `prisma migrate diff` and hand ownership to a Java migration tool.

The `api-tests` suite is unaffected either way.
