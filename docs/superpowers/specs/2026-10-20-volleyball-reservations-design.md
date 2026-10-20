# Volleyball Reservation System: Design Spec

- Date: 2026-10-20
- Status: Draft for review
- Inputs: `docs/volleyball-reservation-analysis.md`, `docs/adr/0001-system-architecture.md`, `docs/adr/0002-prisma-for-api-persistence.md`

This spec turns the analysis into an implementable design. The architecture and its rationale are in the ADRs; this document defines scope, behaviour, interfaces, data and testing precisely enough to plan work from.

## 1. Goals and non-goals

Goals:

- Captains reserve fields for home games and enter away games. The manager can do so for any team and can block slots.
- A public, read-only club calendar and per-team view.
- Backend built in Node with Prisma ORM, then ported to Java with no change to the PWA or the database schema. How the Java side manages migrations is decided at port time (ADR 0002).

Non-goals for v1: registration, password reset, user management UI, notifications, weekend slots, season-end admin screen.

## 2. Decisions on the analysis open questions

| Question | Decision |
|---|---|
| Blocking a slot that already has home games | Refused with `BLOCK_HAS_HOME_GAMES` (409). The manager cancels the games first. |
| Do blocks affect away games | No. Away games stay and take precedence in the team view (analysis section 6). |
| Blocking granularity | Whole slot. |
| Definition of "past" | Event date is before today in the club timezone. Tonight's slot is still bookable. |
| Cancel or move a past event | Manager only. For a move, the source event being in the past makes it manager only. |
| Season end | Row in `settings`, seeded to 31 August of the current season. Changed by SQL script in v1. |
| Cancel history | Hard delete. No audit trail in v1. |
| Club timezone | `Europe/Brussels`, stored in `settings`. |

## 3. Roles and permissions

| Action | Visitor | Captain | Manager |
|---|---|---|---|
| View calendar and team view | yes | yes | yes |
| Create, cancel, move home or away event | no | own team | any team |
| Cancel or move a past event | no | no | yes |
| Create or remove a block | no | no | yes |

A captain account is linked to exactly one team. The manager account has no team. Accounts are inserted by a seed or admin script.

## 4. Domain model

| Entity | Fields | Notes |
|---|---|---|
| Team | id, name | 4 teams |
| Field | id, name, size (`small` or `big`) | 2 fields. Size is informational. |
| Slot | id, weekday, start, end | Data, not code. Launch: Thursday 20:00-22:00. |
| Event | id, team_id, date, slot_id, type (`home` or `away`), field_id (home only) | One table for both types. |
| Block | id, date, slot_id, reason (optional) | Covers the whole slot. |
| User | id, username, password_hash, role (`captain` or `manager`), team_id (captain only) | Created manually. |
| Session | id (opaque token hash), user_id, expires_at | Server-side session. |
| Setting | key, value | `season_end`, `timezone`. |

### Business rules

Numbering matches the analysis. "Where" shows which layer rejects the violation; the domain always checks first so errors are clear, and the database is the backstop.

| # | Rule | Error code (HTTP) | Where |
|---|---|---|---|
| 1 | A field hosts at most one home game per (date, slot) | `FIELD_TAKEN` (409) | domain + unique constraint |
| 2 | Capacity of 2 home games per slot | follows from rule 1 | n/a |
| 3 | One event per team per (date, slot) | `TEAM_BUSY` (409) | domain + unique constraint |
| 4 | Away games block nothing | none | n/a |
| 5 | Home requires a field, away has none | `FIELD_REQUIRED` / `FIELD_NOT_ALLOWED` (422) | domain + check constraint |
| 6 | Weekday of date equals the slot's weekday | `WEEKDAY_MISMATCH` (422) | domain |
| 7 | No events created in the past, no move into the past | `DATE_IN_PAST` (422) | domain |
| 8 | Date not after season end | `OUT_OF_SEASON` (422) | domain |
| 9 | No home game in a blocked slot | `SLOT_BLOCKED` (409) | domain + advisory lock |
| 10 | Captains act only on their own team; only the manager manages blocks | `FORBIDDEN` (403) | domain |
| 11 | Move is atomic cancel plus create, rules checked against the new position ignoring the moved event | as per rule violated | application service transaction |
| 12 | No deadlines apart from rule 7 | none | n/a |

Additional errors: `UNAUTHENTICATED` (401), `NOT_FOUND` (404), `VALIDATION_ERROR` (400), `BLOCK_HAS_HOME_GAMES` (409), `PAST_EVENT_MANAGER_ONLY` (403).

Rule 9 is checked for home games only, since away games do not use the hall.

## 5. Derived state

Practice is never stored. For each (date, slot):

- Blocked: no practice.
- Otherwise practice fields are the fields without a home game. If there are none, there is no training.

Team status for a (date, slot), first match wins:

1. Home game (with field)
2. Away game
3. Unavailable (slot blocked)
4. Training (on the free fields, at least one exists)
5. No training

The derivation lives in the domain package as pure functions over a snapshot of events, blocks and fields for the requested range.

## 6. API surface

The authoritative definition is `packages/contract/openapi.yaml`, written before any handler. Planned operations:

| Method and path | Auth | Purpose |
|---|---|---|
| `GET /api/config` | public | Teams, fields, slots, season end, timezone |
| `GET /api/calendar?from&to` | public | Club calendar. Defaults to today through season end. |
| `GET /api/teams/{teamId}/schedule?from&to` | public | Team view with derived status per date and slot |
| `POST /api/events` | captain, manager | Create home or away event |
| `DELETE /api/events/{id}` | captain, manager | Cancel an event |
| `POST /api/events/{id}/move` | captain, manager | Atomic move to a new date, slot and field |
| `PUT /api/blocks/{date}/{slotId}` | manager | Create a block, optional reason |
| `DELETE /api/blocks/{date}/{slotId}` | manager | Remove a block |
| `POST /api/auth/login` | public, rate-limited | Start session |
| `POST /api/auth/logout` | any | End session |
| `GET /api/auth/me` | any | Current principal or 401 |

Conventions:

- JSON bodies. Dates as `YYYY-MM-DD`, times as `HH:MM`, no timestamps in the domain API.
- Errors use `application/problem+json` with a stable `code` field from the table in section 4.
- Calendar entries are generated for every slot occurrence in the range, so open slots appear with their practice fields.
- Move returns the new event, which has a new id.

## 7. Data model

The schema lives in `packages/api/prisma/schema.prisma` and is migrated with Prisma Migrate (ADR 0002). Sketch of the models that matter:

```prisma
generator client {
  provider = "prisma-client"
  output   = "../src/generated/prisma"
}

datasource db {
  provider = "postgresql"
}

enum EventType {
  home
  away
}

model Slot {
  id      Int      @id @default(autoincrement())
  weekday Int
  start   DateTime @db.Time(0)
  end     DateTime @db.Time(0)
  events  Event[]
  blocks  Block[]
}

model Event {
  id        String    @id @default(uuid()) @db.Uuid
  teamId    Int
  date      DateTime  @db.Date
  slotId    Int
  type      EventType
  fieldId   Int?
  createdBy String    @db.Uuid
  team      Team      @relation(fields: [teamId], references: [id])
  slot      Slot      @relation(fields: [slotId], references: [id])
  field     Field?    @relation(fields: [fieldId], references: [id])
  creator   User      @relation(fields: [createdBy], references: [id])

  @@unique([teamId, date, slotId])
  @@unique([fieldId, date, slotId])
}

model Block {
  id     String   @id @default(uuid()) @db.Uuid
  date   DateTime @db.Date
  slotId Int
  reason String?
  slot   Slot     @relation(fields: [slotId], references: [id])

  @@unique([date, slotId])
}
```

`@@unique([fieldId, date, slotId])` ignores away rows because `fieldId` is null for them and Postgres treats nulls as distinct. The remaining models (`Team`, `Field`, `User`, `Session`, `Setting`) follow section 4.

Prisma cannot express check constraints, so the first migration is created with `prisma migrate dev --create-only` and these statements are added by hand before applying:

```sql
alter table "Event" add constraint event_home_has_field
  check ((type = 'home') = ("fieldId" is not null));

alter table "User" add constraint user_captain_has_team
  check ((role = 'captain') = ("teamId" is not null));

alter table "Slot" add constraint slot_weekday_range
  check (weekday between 1 and 7);
```

Date and time handling:

- `@db.Date` and `@db.Time` come back from Prisma as JavaScript `Date` objects. A single mapper module in the adapter layer converts them to `YYYY-MM-DD` and `HH:MM` strings and back, using UTC accessors only.
- The domain and application layers see only strings. No `Date` object crosses the repository boundary.
- Round-trip tests cover dates around daylight saving changes and year ends.

Persistence boundaries:

- Repositories map Prisma rows to domain types. Generated Prisma types never appear in `packages/domain` or in application service signatures.
- Constraint violations surface as Prisma errors (`P2002` for unique). The error mapper identifies the violated constraint from the error metadata and raises `FIELD_TAKEN` or `TEAM_BUSY`. An unrecognised constraint raises a generic conflict error that is logged.
- Seed data (teams, fields, the Thursday slot, settings, accounts) is created by `prisma/seed.ts`, run with `prisma db seed`.

## 8. Concurrency

- Two simultaneous bookings of the same field or team are stopped by the unique constraints. The adapter maps the violation to `FIELD_TAKEN` or `TEAM_BUSY`.
- `CreateEvent` and `MoveEvent` for home games, and `SetBlock`, each take a transaction-scoped advisory lock keyed on (date, slot) at the start of their transaction, then run their checks. This serialises the cross-table rule 9.
- The lock is taken through the `SlotLock` port. Its Prisma adapter runs `select pg_advisory_xact_lock(<epoch day>, <slot id>)` with `$executeRaw` on the transaction client. It uses `$executeRaw` rather than `$queryRaw` because the function returns `void`, which Prisma cannot deserialise as a query result.
- `UnitOfWork.run(fn)` wraps `prisma.$transaction(async tx => ...)` and hands `fn` repositories bound to `tx`. Application services never see the Prisma client. The lock call and every check in a use case therefore run on the same connection.
- Transactions use the default `ReadCommitted` isolation with an explicit timeout of a few seconds. The advisory lock, not isolation level, provides the cross-table guarantee.
- Move runs in a single transaction with the lock held. Moving between two slots takes both locks in ascending (date, slot) order to avoid deadlock.

## 9. Authentication and security

- Login with username and password, argon2id hashing.
- Session token is random, stored hashed in `sessions`, sent as an httpOnly, Secure, SameSite=Lax cookie. Sessions expire after 30 days of inactivity.
- API and PWA are served from one origin, so CSRF exposure is limited by SameSite plus a check that state-changing requests carry `Content-Type: application/json`.
- Login is rate-limited per IP and username.
- Authorisation is enforced in the application services using the `Principal`, never only in the UI.

## 10. PWA

- React with Vite and TypeScript. The API client and types are generated from `openapi.yaml`.
- Screens: club calendar, team view, add/edit event, manage blocks, login.
- Mobile-first layout. Installable with a web manifest and service worker caching the app shell. API data is network-first so stale bookings are never presented as current.
- Signed-in state comes from `GET /api/auth/me`. Manager-only controls are hidden for other roles, with the server as the real gate.

## 11. Repository layout

```
packages/contract    openapi.yaml, generated types
packages/domain      pure rules and derived state, unit tests
packages/api         Fastify, Prisma adapters, integration tests
  prisma/            schema.prisma, migrations/, seed.ts
  prisma.config.ts   datasource URL, schema, migrations path, seed command
packages/web         React PWA
packages/api-tests   black-box suite, reads BASE_URL
docs/                analysis, ADRs, specs, plans
```

Generated code is not committed: the web client and server types from the contract, and the Prisma client in `packages/api/src/generated/prisma`. A `generate` script runs both generators, and CI runs it before build and test.

`packages/api` is an ES module package (`"type": "module"`), as Prisma 7 expects. It needs Node 22 and a current TypeScript. Environment variables are loaded explicitly with `dotenv` in `prisma.config.ts` and at API startup.

Prisma workflow:

- Development: edit `schema.prisma`, run `prisma migrate dev --name <change>`, then `prisma generate`, then `prisma db seed` when seed data is needed. Prisma 7 does not reliably generate or seed as a side effect, so each step is explicit.
- Check constraints are added to the migration SQL by hand (section 7), using `--create-only` and then applying.
- Production and CI: `prisma migrate deploy`.

## 12. Testing strategy

| Level | Scope | Tooling |
|---|---|---|
| Unit | Domain rules, derived state, with a fake Clock | Vitest, no database |
| Integration | Services and adapters against a real Postgres, including constraint-to-error mapping and concurrency | Vitest with a throwaway Postgres container, schema applied with `prisma migrate deploy` |
| Schema guard | Every hand-written check constraint rejects a violating row, and every unique constraint maps to the right error | Integration tests that insert violating rows through the Prisma client |
| Contract | API responses conform to `openapi.yaml` | Schema validation in `api-tests` |
| Black-box API | Every rule and permission through HTTP | `api-tests` against `BASE_URL`. Same suite gates the Java port. |
| Component and e2e | Key PWA flows | Vitest with Testing Library, Playwright for the main journeys |

Development is test-first. The black-box suite is written alongside each use case, not afterwards, so the port has full coverage from day one.

## 13. Implementation order

Follows the analysis milestones, adjusted for parallel work.

1. Foundation, serial: monorepo scaffold and CI, contract skeleton, Prisma schema with the first migration (including hand-written check constraints) and seed.
2. Parallel tracks on the stable contract: domain package, API read side, web shell with a mocked client.
3. In order: authentication and permissions, create/cancel/move events, blocks, PWA polish.
4. Java port against `api-tests`.
5. Weekend slots with a slot-to-field availability link.

The detailed task breakdown for the subagent-driven workflow is produced by the writing-plans step as a separate document.

## 14. Risks

| Risk | Mitigation |
|---|---|
| Contract drifts from implementation | Contract tests and generated types in CI. |
| Constraint violations mapped to the wrong error | Integration tests for every constraint. Prisma error shape under the pg driver adapter is verified in the first schema task, not assumed. |
| A later migration silently drops a hand-written check constraint | Schema guard tests fail if any check is missing. |
| `Date` objects leak into the domain and cause off-by-one-day bugs | One mapper module, string-only domain types, round-trip tests around DST and year ends. |
| Cross-table race between block and home game | Advisory lock plus a concurrency test. |
| Java port differs subtly | Same `api-tests` suite against the same PostgreSQL schema. |
| Prisma migration history is not consumable by Java migration tools | Decision deferred to the port, with two options recorded in ADR 0002. |
| Season end forgotten at season change | Calendar is empty after the date. Documented script. Admin screen deferred. |

## 15. Future expansion

Weekend slots add slot rows. Because they have one field, a slot-to-field availability table will be added then. At launch both fields are always available, so the table is not created yet. The slot-as-data model, the unique constraints and the derived-state functions do not change.
