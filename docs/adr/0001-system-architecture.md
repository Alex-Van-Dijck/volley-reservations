# ADR 0001: System architecture for the volleyball reservation system

- Status: Accepted. Persistence details amended by ADR 0002 (Prisma ORM).
- Date: 2026-10-20
- Input: `docs/volleyball-reservation-analysis.md`
- Detailed design: `docs/superpowers/specs/2026-10-20-volleyball-reservations-design.md`

## Context

A volleyball club with 4 teams and 2 fields needs a mobile-first PWA where captains reserve a field for home games, everyone can see who has which field, and the manager can block slots. The scale is tiny (a handful of users), so correctness and simplicity matter more than performance.

Two constraints shape the architecture beyond the functional requirements:

1. The backend is built in Node first and later ported to Java. The port must not require changes to the PWA or the database schema, and it must be verifiable.
2. The project is also a learning project, so the architecture should make the port a translation exercise rather than a redesign.

## Decision

Build a **contract-first monorepo** with four runtime pieces: a React PWA, a Fastify API, a framework-free domain library, and PostgreSQL. The OpenAPI document is the source of truth, and a black-box API test suite runs against any base URL so it can validate both the Node and the Java backend.

### C4 level 1: System context

```text
 Visitor ---- views club calendar and team view ------+
                                                      |
 Captain ---- + creates/cancels/moves own team's -----+--> [ Volleyball Reservation System ]
              home and away games                     |
                                                      |
 Manager ---- + same for any team, + blocks slots ----+
```

There are no external systems in v1. Notifications, registration and password reset are out of scope.

### C4 level 2: Containers

```text
 Browser
 +-------------------------------+   HTTPS, JSON    +-----------------------------+
 | PWA                           | ---------------> | API                         |
 | React + Vite, TypeScript      |  session cookie  | Node 22, Fastify, TypeScript|
 | service worker, generated     | <--------------- | Prisma ORM (later: Java,    |
 | API client                    |                  | same contract)              |
 +-------------------------------+                  +--------------+--------------+
                                                                   |
                                                                   | SQL
                                                    +--------------v--------------+
                                                    | PostgreSQL                  |
                                                    | unique + check constraints  |
                                                    | enforce rules 1-3, 5        |
                                                    +-----------------------------+

 Build-time artifacts (not runtime containers)
   contract/openapi.yaml       source of truth for the API
   api-tests/                  black-box suite, runs against BASE_URL
   api/prisma/                 schema.prisma and migrations (see ADR 0002)
```

| Container | Technology | Responsibility |
| --- | --- | --- |
| PWA | React, Vite, TypeScript | Calendar, team view, event forms, block management, login. Installable, mobile layout. |
| API | Node 22, Fastify, TypeScript, Prisma ORM | HTTP, validation against the contract, authentication, use-case orchestration, transactions. |
| Database | PostgreSQL | Durable state and the last line of defence for the booking rules. |

### C4 level 3: API components

```text
 HTTP adapter
   routes, OpenAPI request validation, DomainError -> problem+json
        |
 Auth
   session lookup, builds Principal { role, teamId? }
        |
 Application services (one per use case, each owns its transaction)
   GetClubCalendar, GetTeamView, CreateEvent, CancelEvent, MoveEvent,
   SetBlock, RemoveBlock, Login, Logout
        |
 Domain (pure TypeScript, no framework, no I/O)
   business rules 1-12, slot and date logic, derived practice/team status,
   Clock port, typed DomainError codes
        |
 Ports implemented by Prisma adapters
   EventRepo, BlockRepo, SlotRepo, SettingsRepo, UserRepo, SessionRepo,
   SlotLock, UnitOfWork
   (map unique violations to DomainError codes)
```

Dependencies point inward: the HTTP adapter and the Prisma adapters depend on the domain and application layers, never the reverse. Generated Prisma types stay inside the adapters. C4 level 4 is the code itself and is not drawn.

### Key decisions

| # | Decision | Reason |
| --- | --- | --- |
| 1 | OpenAPI is the source of truth; server validation and the web client types are generated from it | Keeps the PWA unchanged across the Java port and gives both backends one definition of correct. |
| 2 | Domain layer is framework-free TypeScript with an injected Clock | The Java port becomes a translation. Past-date and season rules are testable without real time. |
| 3 | Defense in depth: the domain checks every rule, and the database enforces rules 1, 3 and 5 with constraints | Domain gives clear errors; constraints stay valid under concurrent requests and across the port. |
| 4 | Prisma ORM 7 owns the schema and migrations in `packages/api/prisma` (ADR 0002) | One toolchain for schema, migrations, seed and typed queries in the Node API. |
| 5 | Move is one transaction: delete the old event, insert the new one, checking rules with the old event excluded | Satisfies rule 11. A failure rolls back and leaves the original untouched. |
| 6 | Block versus home-game race is closed with `pg_advisory_xact_lock` on (date, slot) in both `CreateEvent`/`MoveEvent` and `SetBlock` | Rule 9 spans two tables, so a row constraint cannot enforce it. |
| 7 | Dates are plain local dates plus a slot id, never timestamps; "today" comes from the Clock in the club timezone | Avoids time zone and DST bugs. |
| 8 | Auth is an httpOnly session cookie backed by a Postgres sessions table, argon2 password hashes, same-origin deployment, rate-limited login | Revocable, no token handling in the PWA, no extra infrastructure. |
| 9 | The calendar is generated on read from slot definitions plus events and blocks | Open and practice slots show without stored rows. No caching is needed at this scale. |
| 10 | A black-box `api-tests` package targets `BASE_URL` | It is the acceptance gate for the Java port. |

Defaults chosen for the open questions in the analysis:

| Question | Default |
| --- | --- |
| Block on a slot that has home games | Refuse with 409 until those games are cancelled. Away games are unaffected. |
| Block granularity | The whole slot, both fields. |
| Definition of past | The date is before today in the club timezone. |
| Cancelling or moving past events | Manager only. |
| Season end | A settings row seeded to 31 August, changed by SQL script in v1. The calendar is empty after that date. |

## Alternatives considered

| Alternative | Why not |
| --- | --- |
| Full-stack framework (Next.js, SvelteKit) | Couples UI and backend, leaving nothing clean to port to Java. |
| Backend-as-a-service (Supabase and similar) | Removes the backend that the learning goal and the port depend on. |
| Stateless JWT instead of sessions | Adds token storage and revocation concerns in the PWA for no benefit at this scale. |
| Timestamp-based reservations | Reintroduces overlap arithmetic and time zone risk that the fixed slot model removes. |
| Plain SQL migrations with hand-written `pg` adapters | The original choice, kept the schema tool-neutral. Replaced by Prisma in ADR 0002. |

## Consequences

Positive:

- The PWA and the database schema survive the Java port unchanged, and `api-tests` proves behavioural equivalence. How migrations are managed after the port is open (ADR 0002).
- Booking rules hold even if application code has a bug, because the constraints reject invalid data.
- Weekend slots later are mostly a data change plus a slot-to-field availability link.

Negative and risks:

- Contract-first needs generation tooling and discipline: the spec must be updated before code.
- Some rules are checked twice (domain and database), so error mapping from constraint violations must be tested.
- Advisory locks are Postgres-specific; the Java port must reproduce the same locking.
- Same-origin cookie auth requires the API and PWA to be served from one origin (reverse proxy or static files served by the API).

## Review trigger

Revisit this ADR when weekend slots start (the slot-to-field availability link), or if the club needs notifications or self-registration.
