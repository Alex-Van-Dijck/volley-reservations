# Volleyball Reservations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a mobile-first PWA where volleyball captains reserve home games, enter away games, and cancel or move them, where the manager can do the same for any team and block slots, and where everyone can see a club calendar and a team view.

**Architecture:** A two-package pnpm monorepo. `packages/api` is a Fastify and TypeScript server whose route handlers call Prisma directly and return JSON. The business rules live in one small pure module (`rules.ts`) with fast unit tests. `packages/web` is a React and Vite PWA that talks to the API through a small hand-written fetch client. PostgreSQL constraints and one advisory lock per (date, slot) back up the rules under concurrency.

**Tech Stack:** Node 22, TypeScript, Fastify 5, Prisma 7 (`prisma-client` generator, `@prisma/adapter-pg`), PostgreSQL 16, argon2, React 18, Vite, React Router, Vitest, Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-20-volleyball-reservations-design.md`. Background: `docs/volleyball-reservation-analysis.md` and the ADRs in `docs/adr/`.

**Scope note:** The spec and ADR 0001 describe a contract-first layout (OpenAPI, a framework-free domain package, ports and adapters, a black-box `api-tests` package) built so the backend can be ported to Java. That port is deferred. This plan deliberately drops that layering to keep the application simple. When the port is scheduled, add an OpenAPI document and an HTTP-level test suite then, adapting the Fastify tests in this plan.

## Global Constraints

- Node 22 or newer, pnpm 9, TypeScript strict mode.
- Data model: Team, Field, Slot, Event, Block, User, Session, Setting. 4 teams, 2 fields (`Field 1` big, `Field 2` small). Launch slot is Thursday 20:00-22:00 and applies to both fields.
- Dates are `YYYY-MM-DD` strings and times are `HH:MM` strings in every API payload. Convert to `Date` only inside Prisma calls, using UTC accessors.
- "Past" means before today in the `timezone` setting (`Europe/Brussels`). Tests inject today through a function.
- Errors are `application/problem+json` with `type`, `title`, `status`, `detail` and a stable `code`.
- Error codes and statuses: 409 `FIELD_TAKEN`, `TEAM_BUSY`, `SLOT_BLOCKED`, `BLOCK_HAS_HOME_GAMES`. 422 `FIELD_REQUIRED`, `FIELD_NOT_ALLOWED`, `WEEKDAY_MISMATCH`, `DATE_IN_PAST`, `OUT_OF_SEASON`. 403 `FORBIDDEN`, `PAST_EVENT_MANAGER_ONLY`. 401 `UNAUTHENTICATED`. 404 `NOT_FOUND`. 400 `VALIDATION_ERROR`. 429 `RATE_LIMITED`. 500 `INTERNAL`.
- Rules: a home game needs a field and an away game has none. A team has at most one event per slot and date. A field has at most one home game per slot and date. A block covers the whole slot, refuses while home games exist in it, and does not affect away games. Practice is derived, never stored. `season_end` is a settings row (seed `2027-08-31`). Cancel is a hard delete. Cancel and move of past events is manager only. Move keeps type and team and returns a new event id.
- Team status for a date and slot, first match wins: `home`, `away`, `unavailable`, `training`, `no_training`.
- Auth: argon2id password hashes, opaque random session token stored as a SHA-256 hash, httpOnly SameSite=Lax cookie named `session` (Secure in production), 30 day sliding expiry, same-origin deployment, mutating requests with a body must be `application/json`, login rate-limited per IP and username.
- Authorisation is enforced in the API using the logged-in user, never only in the UI.
- Style: comments only where the reason is non-obvious. No emoji and no em-dashes in code, docs or commit messages.

## File Structure

```
package.json, pnpm-workspace.yaml, tsconfig.base.json, docker-compose.yml, .github/workflows/ci.yml
packages/api/
  prisma/schema.prisma, prisma/migrations/, prisma/seed.ts, prisma/run-seed.ts
  prisma.config.ts, vitest.config.ts
  src/db.ts            Prisma client factory, date helpers
  src/errors.ts        AppError, problem+json handler
  src/rules.ts         pure rules and derived state
  src/auth.ts          password, tokens, sessions, login limiter
  src/app.ts           buildApp(deps), hooks
  src/routes/*.ts      read, auth, events, blocks
  src/main.ts          process entry point
  test/*.test.ts       integration tests via Fastify inject
packages/web/
  src/api.ts, src/types.ts, src/auth-context.tsx, src/pages/*.tsx, src/App.tsx, src/main.tsx
  public/manifest.webmanifest, public/sw.js
  e2e/*.spec.ts, playwright.config.ts
```

## Task Order

1. Scaffold, Prisma schema, migration, guard tests (Task 1)
2. Seed (Task 2)
3. Pure rules (Task 3)
4. App skeleton and read endpoints (Task 4)
5. Authentication (Task 5)
6. Create, cancel and move events (Task 6)
7. Blocks (Task 7)
8. Web app (Tasks 8-10)
9. PWA polish, e2e and CI (Task 11)

---

### Task 1: Scaffold, Prisma schema, migration and guard tests

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `docker-compose.yml`, `.gitignore` additions
- Create: `packages/api/package.json`, `packages/api/tsconfig.json`, `packages/api/prisma.config.ts`, `packages/api/.env.example`, `packages/api/vitest.config.ts`
- Create: `packages/api/prisma/schema.prisma`, `packages/api/prisma/migrations/<timestamp>_init/migration.sql`
- Create: `packages/api/test/global-setup.ts`, `packages/api/test/db.ts`, `packages/api/test/schema-guard.test.ts`

**Interfaces:**
- Produces:
  - Prisma models `Team`, `Field`, `Slot`, `User`, `Session`, `Event`, `Block`, `Setting`, and enums `EventType { home, away }`, `Role { captain, manager }`. `Slot.start` and `Slot.end` are `@db.Time(0)`. `Event.date` and `Block.date` are `@db.Date`.
  - Unique constraints: `Event(teamId, date, slotId)`, `Event(fieldId, date, slotId)`, `Block(date, slotId)`.
  - Workspace packages `@volley/api` and (Task 8) `@volley/web`. Root scripts `build`, `test`, `typecheck`.
  - Test helpers `testPrisma(): PrismaClient` and `resetDb(prisma): Promise<void>` in `packages/api/test/db.ts`.
  - The Prisma client is generated into `packages/api/src/generated/prisma` and is not committed. Import it as `../src/generated/prisma/client.js`.

- [ ] **Step 1: Create the workspace files**

`pnpm-workspace.yaml`:

```yaml
packages:
  - "packages/*"
```

`package.json`:

```json
{
  "name": "volley-reservations",
  "private": true,
  "packageManager": "pnpm@9.12.0",
  "engines": { "node": ">=22" },
  "scripts": {
    "generate": "pnpm -r --if-present generate",
    "build": "pnpm -r --if-present build",
    "test": "pnpm -r --if-present test",
    "typecheck": "pnpm -r --if-present typecheck",
    "dev": "pnpm -r --parallel --if-present dev"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

`tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "sourceMap": true
  }
}
```

`docker-compose.yml`:

```yaml
services:
  db:
    image: postgres:16
    environment:
      POSTGRES_USER: volley
      POSTGRES_PASSWORD: volley
      POSTGRES_DB: volley
    ports:
      - "5432:5432"
  db-test:
    image: postgres:16
    environment:
      POSTGRES_USER: volley
      POSTGRES_PASSWORD: volley
      POSTGRES_DB: volley_test
    ports:
      - "5433:5432"
    tmpfs:
      - /var/lib/postgresql/data
```

Append to `.gitignore` (keep existing lines):

```text
node_modules/
dist/
.env
packages/api/src/generated/
packages/web/dev-dist/
playwright-report/
test-results/
```

Run: `docker compose up -d db db-test`

- [ ] **Step 2: Create the api package**

`packages/api/package.json`:

```json
{
  "name": "@volley/api",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "generate": "prisma generate",
    "build": "tsc -p tsconfig.build.json",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "dev": "tsx watch src/main.ts",
    "start": "node dist/main.js",
    "db:migrate": "prisma migrate dev",
    "db:deploy": "prisma migrate deploy",
    "db:seed": "tsx prisma/run-seed.ts"
  },
  "dependencies": {
    "@fastify/cookie": "^11.0.0",
    "@prisma/adapter-pg": "^7.0.0",
    "@prisma/client": "^7.0.0",
    "argon2": "^0.41.0",
    "dotenv": "^16.4.0",
    "fastify": "^5.0.0",
    "pg": "^8.13.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "@types/pg": "^8.11.0",
    "prisma": "^7.0.0",
    "tsx": "^4.19.0"
  }
}
```

`packages/api/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "noEmit": true, "types": ["node"] },
  "include": ["src", "test", "prisma", "prisma.config.ts", "vitest.config.ts"]
}
```

`packages/api/tsconfig.build.json`:

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": { "noEmit": false, "outDir": "dist", "rootDir": "src" },
  "include": ["src"],
  "exclude": ["src/**/*.test.ts"]
}
```

`packages/api/.env.example`:

```text
DATABASE_URL=postgresql://volley:volley@localhost:5432/volley
SEED_MANAGER_PASSWORD=change-me
SEED_CAPTAIN_PASSWORD=change-me
```

`packages/api/prisma.config.ts`:

```ts
import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations", seed: "tsx prisma/run-seed.ts" },
  datasource: { url: env("DATABASE_URL") },
});
```

`packages/api/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts", "src/**/*.test.ts"],
    globalSetup: ["./test/global-setup.ts"],
    fileParallelism: false,
    testTimeout: 15000,
  },
});
```

`packages/api/test/global-setup.ts`:

```ts
import { execSync } from "node:child_process";

const TEST_URL = "postgresql://volley:volley@localhost:5433/volley_test";

export default function setup() {
  const url = process.env.DATABASE_URL ?? TEST_URL;
  if (!url.includes("volley_test")) {
    throw new Error(`Refusing to run tests against ${url}: the database name must contain volley_test`);
  }
  process.env.DATABASE_URL = url;
  execSync("pnpm exec prisma migrate deploy", { stdio: "inherit", env: process.env });
}
```

The guard matters because `resetDb` truncates every table.

- [ ] **Step 3: Write the Prisma schema**

`packages/api/prisma/schema.prisma`:

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

enum Role {
  captain
  manager
}

model Team {
  id     Int     @id @default(autoincrement())
  name   String  @unique
  events Event[]
  users  User[]
}

model Field {
  id     Int     @id @default(autoincrement())
  name   String  @unique
  size   String
  events Event[]
}

model Slot {
  id      Int      @id @default(autoincrement())
  weekday Int
  start   DateTime @db.Time(0)
  end     DateTime @db.Time(0)
  events  Event[]
  blocks  Block[]
}

model User {
  id           String    @id @default(uuid()) @db.Uuid
  username     String    @unique
  passwordHash String
  role         Role
  teamId       Int?
  team         Team?     @relation(fields: [teamId], references: [id])
  sessions     Session[]
  events       Event[]
}

model Session {
  id         String   @id @default(uuid()) @db.Uuid
  tokenHash  String   @unique
  userId     String   @db.Uuid
  user       User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  createdAt  DateTime @default(now())
  lastUsedAt DateTime @default(now())
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

model Setting {
  key   String @id
  value String
}
```

- [ ] **Step 4: Create the migration without applying it, then add check constraints**

Copy `packages/api/.env.example` to `packages/api/.env`, then run:

```bash
cd packages/api && pnpm install && pnpm exec prisma migrate dev --create-only --name init
```

Expected: `prisma/migrations/<timestamp>_init/migration.sql` exists and is not applied. Append this to the end of that file:

```sql
ALTER TABLE "Event"
  ADD CONSTRAINT "Event_home_has_field_chk"
  CHECK (("type" = 'home') = ("fieldId" IS NOT NULL));

ALTER TABLE "User"
  ADD CONSTRAINT "User_captain_has_team_chk"
  CHECK (("role" = 'captain') = ("teamId" IS NOT NULL));

ALTER TABLE "Slot"
  ADD CONSTRAINT "Slot_weekday_chk"
  CHECK ("weekday" BETWEEN 1 AND 7);
```

Then run `pnpm exec prisma migrate dev` to apply it to the dev database and `pnpm generate` to create the client.

- [ ] **Step 5: Write the test helper and the failing guard tests**

`packages/api/test/db.ts`:

```ts
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.js";

export function testPrisma(): PrismaClient {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  return new PrismaClient({ adapter });
}

export async function resetDb(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe(
    'TRUNCATE "Session", "Event", "Block", "User", "Slot", "Field", "Team", "Setting" RESTART IDENTITY CASCADE',
  );
}
```

`packages/api/test/schema-guard.test.ts`:

```ts
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { resetDb, testPrisma } from "./db.js";

const prisma = testPrisma();
const day = new Date("2026-11-05T00:00:00Z");
const time = (h: string) => new Date(`1970-01-01T${h}:00Z`);

async function basics() {
  const team = await prisma.team.create({ data: { name: "A" } });
  const team2 = await prisma.team.create({ data: { name: "B" } });
  const field = await prisma.field.create({ data: { name: "F1", size: "big" } });
  const slot = await prisma.slot.create({ data: { weekday: 4, start: time("20:00"), end: time("22:00") } });
  const user = await prisma.user.create({
    data: { username: "cap", passwordHash: "x", role: "captain", teamId: team.id },
  });
  return { team, team2, field, slot, user };
}

beforeEach(() => resetDb(prisma));
afterAll(() => prisma.$disconnect());

describe("schema guards", () => {
  it("rejects a home event without a field", async () => {
    const b = await basics();
    await expect(
      prisma.event.create({
        data: { teamId: b.team.id, date: day, slotId: b.slot.id, type: "home", createdBy: b.user.id },
      }),
    ).rejects.toThrow();
  });

  it("rejects an away event with a field", async () => {
    const b = await basics();
    await expect(
      prisma.event.create({
        data: { teamId: b.team.id, date: day, slotId: b.slot.id, type: "away", fieldId: b.field.id, createdBy: b.user.id },
      }),
    ).rejects.toThrow();
  });

  it("rejects two home games on one field, date and slot", async () => {
    const b = await basics();
    const base = { date: day, slotId: b.slot.id, type: "home" as const, fieldId: b.field.id, createdBy: b.user.id };
    await prisma.event.create({ data: { ...base, teamId: b.team.id } });
    await expect(prisma.event.create({ data: { ...base, teamId: b.team2.id } })).rejects.toThrow();
  });

  it("rejects two events for one team, date and slot", async () => {
    const b = await basics();
    const data = { teamId: b.team.id, date: day, slotId: b.slot.id, type: "away" as const, createdBy: b.user.id };
    await prisma.event.create({ data });
    await expect(prisma.event.create({ data })).rejects.toThrow();
  });

  it("allows away games for different teams in the same date and slot", async () => {
    const b = await basics();
    const base = { date: day, slotId: b.slot.id, type: "away" as const, createdBy: b.user.id };
    await prisma.event.create({ data: { ...base, teamId: b.team.id } });
    await prisma.event.create({ data: { ...base, teamId: b.team2.id } });
  });

  it("rejects a second block for the same date and slot", async () => {
    const b = await basics();
    await prisma.block.create({ data: { date: day, slotId: b.slot.id } });
    await expect(prisma.block.create({ data: { date: day, slotId: b.slot.id } })).rejects.toThrow();
  });

  it("rejects a captain without a team and a manager with a team", async () => {
    await expect(
      prisma.user.create({ data: { username: "x", passwordHash: "x", role: "captain" } }),
    ).rejects.toThrow();
    const team = await prisma.team.create({ data: { name: "A" } });
    await expect(
      prisma.user.create({ data: { username: "m", passwordHash: "x", role: "manager", teamId: team.id } }),
    ).rejects.toThrow();
  });

  it("rejects a slot with weekday 8", async () => {
    await expect(
      prisma.slot.create({ data: { weekday: 8, start: time("20:00"), end: time("22:00") } }),
    ).rejects.toThrow();
  });

  it("round-trips a date and a time without shifting", async () => {
    const slot = await prisma.slot.create({ data: { weekday: 4, start: time("20:00"), end: time("22:00") } });
    await prisma.block.create({ data: { date: new Date("2026-03-29T00:00:00Z"), slotId: slot.id } });
    const block = await prisma.block.findFirstOrThrow();
    expect(block.date.toISOString()).toBe("2026-03-29T00:00:00.000Z");
    const read = await prisma.slot.findFirstOrThrow();
    expect(read.start.toISOString()).toBe("1970-01-01T20:00:00.000Z");
  });
});
```

- [ ] **Step 6: Run the tests**

Run: `pnpm --filter @volley/api test`
Expected: the migration applies to the test database and all 9 guard tests pass. If the generated client path differs (for example `client.js` versus `index.js`), fix the import in `test/db.ts` once and use that form everywhere else.

Also capture the shape of a unique violation for Task 6: in a scratch script, catch the error from creating a duplicate field booking and print `JSON.stringify(e, null, 2)`. Task 6 maps it, and the exact shape under `@prisma/adapter-pg` decides how.

- [ ] **Step 7: Commit**

```bash
git add package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json docker-compose.yml .gitignore packages/api
git commit -m "chore: scaffold monorepo and add Prisma schema with check constraints and guard tests"
```

### Task 2: Seed

**Files:**
- Create: `packages/api/src/password.ts`, `packages/api/prisma/seed.ts`, `packages/api/prisma/run-seed.ts`
- Test: `packages/api/test/seed.test.ts`

**Interfaces:**
- Consumes: `testPrisma`, `resetDb` (Task 1).
- Produces:
  - `hashPassword(plain: string): Promise<string>` and `verifyPassword(hash: string, plain: string): Promise<boolean>` in `src/password.ts` (argon2id).
  - `seed(prisma: PrismaClient, opts?: { managerPassword?: string; captainPassword?: string }): Promise<void>`, idempotent. Seeds `Team 1` to `Team 4`, `Field 1` (big), `Field 2` (small), one slot (weekday 4, 20:00-22:00), settings `season_end = 2027-08-31` and `timezone = Europe/Brussels`, users `manager` and `captain1` to `captain4` (captain N belongs to `Team N`).

- [ ] **Step 1: Write the failing test**

`packages/api/test/seed.test.ts`:

```ts
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { seed } from "../prisma/seed.js";
import { verifyPassword } from "../src/password.js";
import { resetDb, testPrisma } from "./db.js";

const prisma = testPrisma();

beforeEach(() => resetDb(prisma));
afterAll(() => prisma.$disconnect());

describe("seed", () => {
  it("creates the launch data", async () => {
    await seed(prisma, { managerPassword: "m-pass", captainPassword: "c-pass" });
    expect(await prisma.team.count()).toBe(4);
    expect(await prisma.field.count()).toBe(2);
    const slot = await prisma.slot.findFirstOrThrow();
    expect(slot.weekday).toBe(4);
    expect(slot.start.toISOString()).toBe("1970-01-01T20:00:00.000Z");
    expect((await prisma.setting.findUniqueOrThrow({ where: { key: "season_end" } })).value).toBe("2027-08-31");
    expect((await prisma.setting.findUniqueOrThrow({ where: { key: "timezone" } })).value).toBe("Europe/Brussels");
    const manager = await prisma.user.findUniqueOrThrow({ where: { username: "manager" } });
    expect(manager.role).toBe("manager");
    expect(manager.teamId).toBeNull();
    expect(await verifyPassword(manager.passwordHash, "m-pass")).toBe(true);
    expect(await prisma.user.count({ where: { role: "captain" } })).toBe(4);
  });

  it("is idempotent", async () => {
    await seed(prisma, { managerPassword: "m", captainPassword: "c" });
    await seed(prisma, { managerPassword: "m", captainPassword: "c" });
    expect(await prisma.team.count()).toBe(4);
    expect(await prisma.user.count()).toBe(5);
    expect(await prisma.slot.count()).toBe(1);
  });
});
```

- [ ] **Step 2: Run to see failure**

Run: `pnpm --filter @volley/api exec vitest run test/seed.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement the password helper and the seed**

`packages/api/src/password.ts`:

```ts
import argon2 from "argon2";

export function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, { type: argon2.argon2id });
}

export function verifyPassword(hash: string, plain: string): Promise<boolean> {
  return argon2.verify(hash, plain);
}
```

`packages/api/prisma/seed.ts`:

```ts
import { hashPassword } from "../src/password.js";
import type { PrismaClient } from "../src/generated/prisma/client.js";

const time = (h: string) => new Date(`1970-01-01T${h}:00Z`);

export async function seed(
  prisma: PrismaClient,
  opts: { managerPassword?: string; captainPassword?: string } = {},
): Promise<void> {
  const managerPassword = opts.managerPassword ?? process.env.SEED_MANAGER_PASSWORD ?? "change-me";
  const captainPassword = opts.captainPassword ?? process.env.SEED_CAPTAIN_PASSWORD ?? "change-me";

  const teams = [];
  for (let i = 1; i <= 4; i++) {
    teams.push(await prisma.team.upsert({ where: { name: `Team ${i}` }, update: {}, create: { name: `Team ${i}` } }));
  }
  await prisma.field.upsert({ where: { name: "Field 1" }, update: {}, create: { name: "Field 1", size: "big" } });
  await prisma.field.upsert({ where: { name: "Field 2" }, update: {}, create: { name: "Field 2", size: "small" } });

  if ((await prisma.slot.count()) === 0) {
    await prisma.slot.create({ data: { weekday: 4, start: time("20:00"), end: time("22:00") } });
  }

  for (const [key, value] of [["season_end", "2027-08-31"], ["timezone", "Europe/Brussels"]] as const) {
    await prisma.setting.upsert({ where: { key }, update: {}, create: { key, value } });
  }

  await prisma.user.upsert({
    where: { username: "manager" },
    update: {},
    create: { username: "manager", role: "manager", passwordHash: await hashPassword(managerPassword) },
  });
  for (const [i, team] of teams.entries()) {
    await prisma.user.upsert({
      where: { username: `captain${i + 1}` },
      update: {},
      create: {
        username: `captain${i + 1}`,
        role: "captain",
        teamId: team.id,
        passwordHash: await hashPassword(captainPassword),
      },
    });
  }
}
```

`packages/api/prisma/run-seed.ts`:

```ts
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.js";
import { seed } from "./seed.js";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

try {
  await seed(prisma);
} finally {
  await prisma.$disconnect();
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm --filter @volley/api exec vitest run test/seed.test.ts`
Expected: both tests pass. Then run `pnpm --filter @volley/api db:seed` once against the dev database and confirm it exits 0.

- [ ] **Step 5: Commit**

```bash
git add packages/api
git commit -m "feat(api): add idempotent seed and argon2 password helper"
```

### Task 3: Pure rules

**Files:**
- Create: `packages/api/src/errors.ts`, `packages/api/src/rules.ts`
- Test: `packages/api/test/rules.test.ts`

**Interfaces:**
- Produces from `src/errors.ts`:
  - `type ErrorCode = "FIELD_TAKEN" | "TEAM_BUSY" | "SLOT_BLOCKED" | "BLOCK_HAS_HOME_GAMES" | "FIELD_REQUIRED" | "FIELD_NOT_ALLOWED" | "WEEKDAY_MISMATCH" | "DATE_IN_PAST" | "OUT_OF_SEASON" | "FORBIDDEN" | "PAST_EVENT_MANAGER_ONLY" | "UNAUTHENTICATED" | "NOT_FOUND" | "VALIDATION_ERROR" | "RATE_LIMITED" | "INTERNAL"`
  - `class AppError extends Error { readonly code: ErrorCode; readonly status: number; constructor(code: ErrorCode, detail: string) }` where `detail` is also the message.
  - `sendProblem(reply: FastifyReply, code: ErrorCode, detail: string, status?: number): FastifyReply` which sends `application/problem+json`.
- Produces from `src/rules.ts`:
  - `type Actor = { id: string; role: "captain" | "manager"; teamId: number | null }`
  - `type TeamStatus = "home" | "away" | "unavailable" | "training" | "no_training"`
  - `isValidDate(s: string): boolean`, `isoWeekday(date: string): number` (1 = Monday to 7 = Sunday), `todayIn(timezone: string, now: Date): string`
  - `datesWithWeekday(from: string, to: string, weekday: number): string[]`
  - `resolveRange(q: { from?: string; to?: string }, today: string, seasonEnd: string): { from: string; to: string }`
  - `checkEventInput(i: { type: "home" | "away"; fieldId: number | null; date: string; slotWeekday: number; today: string; seasonEnd: string }): void`
  - `assertOwnsTeam(actor: Actor, teamId: number): void`
  - `assertCanModify(actor: Actor, event: { teamId: number; date: string }, today: string): void`
  - `practiceFieldIds(allFieldIds: number[], homeFieldIds: number[], blocked: boolean): number[]`
  - `teamStatus(i: { event: { type: "home" | "away" } | null; blocked: boolean; practiceFieldIds: number[] }): TeamStatus`

- [ ] **Step 1: Write the failing test**

`packages/api/test/rules.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { AppError } from "../src/errors.js";
import {
  assertCanModify,
  assertOwnsTeam,
  checkEventInput,
  datesWithWeekday,
  isoWeekday,
  isValidDate,
  practiceFieldIds,
  resolveRange,
  teamStatus,
  todayIn,
  type Actor,
} from "../src/rules.js";

const codeOf = (fn: () => void): string | null => {
  try {
    fn();
  } catch (e) {
    return (e as AppError).code;
  }
  return null;
};

const manager: Actor = { id: "m", role: "manager", teamId: null };
const captain1: Actor = { id: "c1", role: "captain", teamId: 1 };

describe("errors", () => {
  it("maps codes to statuses", () => {
    expect(new AppError("TEAM_BUSY", "x").status).toBe(409);
    expect(new AppError("DATE_IN_PAST", "x").status).toBe(422);
    expect(new AppError("FORBIDDEN", "x").status).toBe(403);
    expect(new AppError("UNAUTHENTICATED", "x").status).toBe(401);
    expect(new AppError("RATE_LIMITED", "x").status).toBe(429);
  });
});

describe("dates", () => {
  it("validates calendar dates", () => {
    expect(isValidDate("2026-10-22")).toBe(true);
    expect(isValidDate("2026-02-30")).toBe(false);
    expect(isValidDate("22-10-2026")).toBe(false);
  });

  it("computes the ISO weekday", () => {
    expect(isoWeekday("2026-10-19")).toBe(1);
    expect(isoWeekday("2026-10-22")).toBe(4);
    expect(isoWeekday("2026-10-25")).toBe(7);
  });

  it("computes today in the club timezone", () => {
    expect(todayIn("Europe/Brussels", new Date("2026-10-20T10:00:00Z"))).toBe("2026-10-20");
    expect(todayIn("Europe/Brussels", new Date("2026-10-20T23:30:00Z"))).toBe("2026-10-21");
  });

  it("lists dates with a weekday in a range", () => {
    expect(datesWithWeekday("2026-10-20", "2026-11-05", 4)).toEqual(["2026-10-22", "2026-10-29", "2026-11-05"]);
  });
});

describe("resolveRange", () => {
  it("defaults to today through season end", () => {
    expect(resolveRange({}, "2026-10-20", "2027-08-31")).toEqual({ from: "2026-10-20", to: "2027-08-31" });
  });

  it("collapses the default range after the season ended", () => {
    expect(resolveRange({}, "2027-09-05", "2027-08-31")).toEqual({ from: "2027-09-05", to: "2027-09-05" });
  });

  it("rejects bad input", () => {
    expect(codeOf(() => resolveRange({ from: "nope" }, "2026-10-20", "2027-08-31"))).toBe("VALIDATION_ERROR");
    expect(codeOf(() => resolveRange({ from: "2026-11-01", to: "2026-10-01" }, "2026-10-20", "2027-08-31"))).toBe(
      "VALIDATION_ERROR",
    );
    expect(codeOf(() => resolveRange({ from: "2026-01-01", to: "2027-12-31" }, "2026-10-20", "2027-08-31"))).toBe(
      "VALIDATION_ERROR",
    );
  });
});

describe("checkEventInput", () => {
  const base = {
    type: "home" as const,
    fieldId: 1 as number | null,
    date: "2026-10-22",
    slotWeekday: 4,
    today: "2026-10-20",
    seasonEnd: "2026-11-05",
  };

  it("accepts a valid home game and a valid away game", () => {
    expect(codeOf(() => checkEventInput(base))).toBeNull();
    expect(codeOf(() => checkEventInput({ ...base, type: "away", fieldId: null }))).toBeNull();
  });

  it("requires a field for home and forbids one for away", () => {
    expect(codeOf(() => checkEventInput({ ...base, fieldId: null }))).toBe("FIELD_REQUIRED");
    expect(codeOf(() => checkEventInput({ ...base, type: "away" }))).toBe("FIELD_NOT_ALLOWED");
  });

  it("requires the date to match the slot weekday", () => {
    expect(codeOf(() => checkEventInput({ ...base, date: "2026-10-23" }))).toBe("WEEKDAY_MISMATCH");
  });

  it("rejects past dates but allows today", () => {
    expect(codeOf(() => checkEventInput({ ...base, date: "2026-10-15" }))).toBe("DATE_IN_PAST");
    expect(codeOf(() => checkEventInput({ ...base, date: "2026-10-22", today: "2026-10-22" }))).toBeNull();
  });

  it("rejects dates after season end but allows the last day", () => {
    expect(codeOf(() => checkEventInput({ ...base, date: "2026-11-12" }))).toBe("OUT_OF_SEASON");
    expect(codeOf(() => checkEventInput({ ...base, date: "2026-11-05" }))).toBeNull();
  });
});

describe("permissions", () => {
  it("lets a captain act only for the own team", () => {
    expect(codeOf(() => assertOwnsTeam(captain1, 1))).toBeNull();
    expect(codeOf(() => assertOwnsTeam(captain1, 2))).toBe("FORBIDDEN");
    expect(codeOf(() => assertOwnsTeam(manager, 2))).toBeNull();
  });

  it("restricts past events to the manager", () => {
    const today = "2026-10-20";
    expect(codeOf(() => assertCanModify(captain1, { teamId: 1, date: "2026-10-22" }, today))).toBeNull();
    expect(codeOf(() => assertCanModify(captain1, { teamId: 1, date: "2026-10-15" }, today))).toBe(
      "PAST_EVENT_MANAGER_ONLY",
    );
    expect(codeOf(() => assertCanModify(captain1, { teamId: 2, date: "2026-10-22" }, today))).toBe("FORBIDDEN");
    expect(codeOf(() => assertCanModify(manager, { teamId: 2, date: "2026-10-15" }, today))).toBeNull();
  });
});

describe("derived state", () => {
  it("derives practice fields", () => {
    expect(practiceFieldIds([1, 2], [], false)).toEqual([1, 2]);
    expect(practiceFieldIds([1, 2], [1], false)).toEqual([2]);
    expect(practiceFieldIds([1, 2], [1, 2], false)).toEqual([]);
    expect(practiceFieldIds([1, 2], [], true)).toEqual([]);
  });

  it("derives the team status with the first match winning", () => {
    expect(teamStatus({ event: { type: "home" }, blocked: false, practiceFieldIds: [] })).toBe("home");
    expect(teamStatus({ event: { type: "away" }, blocked: true, practiceFieldIds: [] })).toBe("away");
    expect(teamStatus({ event: null, blocked: true, practiceFieldIds: [] })).toBe("unavailable");
    expect(teamStatus({ event: null, blocked: false, practiceFieldIds: [2] })).toBe("training");
    expect(teamStatus({ event: null, blocked: false, practiceFieldIds: [] })).toBe("no_training");
  });
});
```

- [ ] **Step 2: Run to see failure**

Run: `pnpm --filter @volley/api exec vitest run test/rules.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement errors and rules**

`packages/api/src/errors.ts`:

```ts
import type { FastifyReply } from "fastify";

const STATUS = {
  FIELD_TAKEN: 409,
  TEAM_BUSY: 409,
  SLOT_BLOCKED: 409,
  BLOCK_HAS_HOME_GAMES: 409,
  FIELD_REQUIRED: 422,
  FIELD_NOT_ALLOWED: 422,
  WEEKDAY_MISMATCH: 422,
  DATE_IN_PAST: 422,
  OUT_OF_SEASON: 422,
  FORBIDDEN: 403,
  PAST_EVENT_MANAGER_ONLY: 403,
  UNAUTHENTICATED: 401,
  NOT_FOUND: 404,
  VALIDATION_ERROR: 400,
  RATE_LIMITED: 429,
  INTERNAL: 500,
} as const;

export type ErrorCode = keyof typeof STATUS;

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;

  constructor(code: ErrorCode, detail: string) {
    super(detail);
    this.code = code;
    this.status = STATUS[code];
  }
}

export function sendProblem(reply: FastifyReply, code: ErrorCode, detail: string, status = STATUS[code]) {
  const title = code.charAt(0) + code.slice(1).toLowerCase().replaceAll("_", " ");
  return reply
    .code(status)
    .type("application/problem+json")
    .send({ type: `/problems/${code.toLowerCase().replaceAll("_", "-")}`, title, status, detail, code });
}
```

`packages/api/src/rules.ts`:

```ts
import { AppError } from "./errors.js";

export type Actor = { id: string; role: "captain" | "manager"; teamId: number | null };
export type TeamStatus = "home" | "away" | "unavailable" | "training" | "no_training";

const DAY_MS = 86_400_000;
const MAX_RANGE_DAYS = 400;

export function isValidDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function isoWeekday(date: string): number {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

export function todayIn(timezone: string, now: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function datesWithWeekday(from: string, to: string, weekday: number): string[] {
  const out: string[] = [];
  const end = Date.parse(`${to}T00:00:00Z`);
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= end; t += DAY_MS) {
    const iso = new Date(t).toISOString().slice(0, 10);
    if (isoWeekday(iso) === weekday) out.push(iso);
  }
  return out;
}

export function resolveRange(
  q: { from?: string; to?: string },
  today: string,
  seasonEnd: string,
): { from: string; to: string } {
  const from = q.from ?? today;
  const to = q.to ?? (seasonEnd > from ? seasonEnd : from);
  if (!isValidDate(from) || !isValidDate(to)) {
    throw new AppError("VALIDATION_ERROR", "from and to must be dates in YYYY-MM-DD format");
  }
  if (from > to) throw new AppError("VALIDATION_ERROR", "from must not be after to");
  if (Date.parse(to) - Date.parse(from) > MAX_RANGE_DAYS * DAY_MS) {
    throw new AppError("VALIDATION_ERROR", `the range is limited to ${MAX_RANGE_DAYS} days`);
  }
  return { from, to };
}

export function checkEventInput(i: {
  type: "home" | "away";
  fieldId: number | null;
  date: string;
  slotWeekday: number;
  today: string;
  seasonEnd: string;
}): void {
  if (i.type === "home" && i.fieldId === null) throw new AppError("FIELD_REQUIRED", "A home game needs a field");
  if (i.type === "away" && i.fieldId !== null) throw new AppError("FIELD_NOT_ALLOWED", "An away game has no field");
  if (isoWeekday(i.date) !== i.slotWeekday) {
    throw new AppError("WEEKDAY_MISMATCH", "The date does not fall on the weekday of this slot");
  }
  if (i.date < i.today) throw new AppError("DATE_IN_PAST", "The date is in the past");
  if (i.date > i.seasonEnd) throw new AppError("OUT_OF_SEASON", `The season ends on ${i.seasonEnd}`);
}

export function assertOwnsTeam(actor: Actor, teamId: number): void {
  if (actor.role === "manager") return;
  if (actor.teamId !== teamId) throw new AppError("FORBIDDEN", "You can only manage your own team");
}

export function assertCanModify(actor: Actor, event: { teamId: number; date: string }, today: string): void {
  assertOwnsTeam(actor, event.teamId);
  if (actor.role !== "manager" && event.date < today) {
    throw new AppError("PAST_EVENT_MANAGER_ONLY", "Only the manager can change past events");
  }
}

export function practiceFieldIds(allFieldIds: number[], homeFieldIds: number[], blocked: boolean): number[] {
  if (blocked) return [];
  return allFieldIds.filter((id) => !homeFieldIds.includes(id));
}

export function teamStatus(i: {
  event: { type: "home" | "away" } | null;
  blocked: boolean;
  practiceFieldIds: number[];
}): TeamStatus {
  if (i.event) return i.event.type;
  if (i.blocked) return "unavailable";
  return i.practiceFieldIds.length > 0 ? "training" : "no_training";
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm --filter @volley/api exec vitest run test/rules.test.ts`
Expected: all tests pass. Then `pnpm --filter @volley/api typecheck` passes.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/errors.ts packages/api/src/rules.ts packages/api/test/rules.test.ts
git commit -m "feat(api): add pure booking rules and error codes"
```

### Task 4: App skeleton and read endpoints

**Files:**
- Create: `packages/api/src/db.ts`, `packages/api/src/app.ts`, `packages/api/src/main.ts`, `packages/api/src/routes/read.ts`
- Create: `packages/api/test/helpers.ts`
- Modify: `packages/api/test/db.ts` (add `clearBookings`)
- Test: `packages/api/test/read.test.ts`

**Interfaces:**
- Consumes: everything exported by `src/rules.ts` and `src/errors.ts` (Task 3), `seed` (Task 2), `testPrisma` and `resetDb` (Task 1).
- Produces from `src/db.ts`:
  - `type Deps = { prisma: PrismaClient; now: () => Date; production: boolean; trustProxy?: boolean }`
  - `createPrisma(url: string): PrismaClient`
  - `toDate(s: string): Date` (UTC midnight), `fmtDate(d: Date): string` (`YYYY-MM-DD`), `fmtTime(d: Date): string` (`HH:MM`)
  - `loadSettings(prisma): Promise<{ seasonEnd: string; timezone: string }>`
  - re-exports `PrismaClient` and `Prisma` from the generated client.
- Produces from `src/app.ts`: `buildApp(deps: Deps)` and `type App = ReturnType<typeof buildApp>`. Errors are rendered as problem+json, unknown routes give `NOT_FOUND`.
- Produces from `src/routes/read.ts`: `readRoutes(app: App, deps: Deps): void` registering three public routes:
  - `GET /api/config` returns `{ teams: {id, name}[], fields: {id, name, size}[], slots: {id, weekday, start, end}[], seasonEnd, today }`.
  - `GET /api/calendar?from&to` returns `{ days: { date, slots: { slotId, blocked, blockReason, homeGames: {eventId, teamId, fieldId}[], awayGames: {eventId, teamId}[], practiceFieldIds }[] }[] }`.
  - `GET /api/teams/:id/schedule?from&to` returns `{ teamId, days: { date, slotId, status, eventId, fieldId, practiceFieldIds }[] }` where `status` is a `TeamStatus`.
  - Both range endpoints default to today through season end.
- Produces test helpers in `test/helpers.ts`: `NOW` (a fixed Tuesday, 2026-10-20T10:00:00Z), `buildTestApp(prisma, now?)`, `seedWorld(prisma)` returning `World`, and in `test/db.ts` `clearBookings(prisma)`.
  - `type World = { teams: Team[]; fields: Field[]; slot: Slot; manager: User; captainOf(teamId: number): User }`, teams and fields ordered by id.
  - Seeded passwords in tests: manager `m-pass`, captains `c-pass`.

- [ ] **Step 1: Write db.ts, test helpers and the failing test**

`packages/api/src/db.ts`:

```ts
import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "./generated/prisma/client.js";

export { Prisma, PrismaClient };

export type Deps = {
  prisma: PrismaClient;
  now: () => Date;
  production: boolean;
  trustProxy?: boolean;
};

export function createPrisma(url: string): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
}

export const toDate = (s: string): Date => new Date(`${s}T00:00:00Z`);
export const fmtDate = (d: Date): string => d.toISOString().slice(0, 10);
export const fmtTime = (d: Date): string => d.toISOString().slice(11, 16);

export async function loadSettings(prisma: PrismaClient): Promise<{ seasonEnd: string; timezone: string }> {
  const rows = await prisma.setting.findMany();
  const map = new Map(rows.map((r) => [r.key, r.value]));
  const seasonEnd = map.get("season_end");
  const timezone = map.get("timezone");
  if (!seasonEnd || !timezone) throw new Error("Settings season_end and timezone are missing, run the seed");
  return { seasonEnd, timezone };
}
```

Append to `packages/api/test/db.ts`:

```ts
export async function clearBookings(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe('TRUNCATE "Session", "Event", "Block" CASCADE');
}
```

`packages/api/test/helpers.ts`:

```ts
import type { Field, Slot, Team, User } from "../src/generated/prisma/client.js";
import { buildApp, type App } from "../src/app.js";
import type { PrismaClient } from "../src/db.js";
import { seed } from "../prisma/seed.js";
import { resetDb } from "./db.js";

export const NOW = new Date("2026-10-20T10:00:00Z");
export const PASSWORDS = { manager: "m-pass", captain: "c-pass" };

export type World = {
  teams: Team[];
  fields: Field[];
  slot: Slot;
  manager: User;
  captainOf(teamId: number): User;
};

export function buildTestApp(prisma: PrismaClient, now: Date = NOW): App {
  return buildApp({ prisma, now: () => now, production: false });
}

export async function seedWorld(prisma: PrismaClient): Promise<World> {
  await resetDb(prisma);
  await seed(prisma, { managerPassword: PASSWORDS.manager, captainPassword: PASSWORDS.captain });
  const teams = await prisma.team.findMany({ orderBy: { id: "asc" } });
  const fields = await prisma.field.findMany({ orderBy: { id: "asc" } });
  const slot = await prisma.slot.findFirstOrThrow();
  const users = await prisma.user.findMany();
  return {
    teams,
    fields,
    slot,
    manager: users.find((u) => u.role === "manager")!,
    captainOf: (teamId) => users.find((u) => u.teamId === teamId)!,
  };
}
```

`packages/api/test/read.test.ts`:

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { App } from "../src/app.js";
import { toDate } from "../src/db.js";
import { clearBookings, testPrisma } from "./db.js";
import { buildTestApp, seedWorld, type World } from "./helpers.js";

const prisma = testPrisma();
let app: App;
let w: World;

const book = (teamId: number, date: string, type: "home" | "away", fieldId: number | null) =>
  prisma.event.create({
    data: { teamId, date: toDate(date), slotId: w.slot.id, type, fieldId, createdBy: w.manager.id },
  });

beforeAll(async () => {
  w = await seedWorld(prisma);
  app = buildTestApp(prisma);
});
beforeEach(() => clearBookings(prisma));
afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

describe("GET /api/config", () => {
  it("returns teams, fields, slots, season end and today", async () => {
    const res = await app.inject({ url: "/api/config" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.teams).toHaveLength(4);
    expect(body.fields.map((f: { name: string }) => f.name)).toEqual(["Field 1", "Field 2"]);
    expect(body.slots).toEqual([{ id: w.slot.id, weekday: 4, start: "20:00", end: "22:00" }]);
    expect(body.seasonEnd).toBe("2027-08-31");
    expect(body.today).toBe("2026-10-20");
  });
});

describe("GET /api/calendar", () => {
  it("lists the slot dates in range with derived practice fields", async () => {
    const ev = await book(w.teams[0]!.id, "2026-10-22", "home", w.fields[0]!.id);
    await book(w.teams[1]!.id, "2026-10-22", "away", null);
    const res = await app.inject({ url: "/api/calendar?from=2026-10-22&to=2026-10-29" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.days.map((d: { date: string }) => d.date)).toEqual(["2026-10-22", "2026-10-29"]);
    const first = body.days[0].slots[0];
    expect(first).toMatchObject({ slotId: w.slot.id, blocked: false, practiceFieldIds: [w.fields[1]!.id] });
    expect(first.homeGames).toEqual([{ eventId: ev.id, teamId: w.teams[0]!.id, fieldId: w.fields[0]!.id }]);
    expect(first.awayGames).toHaveLength(1);
    expect(body.days[1].slots[0].practiceFieldIds).toEqual([w.fields[0]!.id, w.fields[1]!.id]);
  });

  it("shows a blocked slot without practice fields", async () => {
    await prisma.block.create({ data: { date: toDate("2026-10-29"), slotId: w.slot.id, reason: "Tournament" } });
    const res = await app.inject({ url: "/api/calendar?from=2026-10-29&to=2026-10-29" });
    expect(res.json().days[0].slots[0]).toMatchObject({
      blocked: true,
      blockReason: "Tournament",
      practiceFieldIds: [],
    });
  });

  it("rejects an invalid range with problem+json", async () => {
    const res = await app.inject({ url: "/api/calendar?from=nope" });
    expect(res.statusCode).toBe(400);
    expect(res.headers["content-type"]).toContain("application/problem+json");
    expect(res.json().code).toBe("VALIDATION_ERROR");
  });
});

describe("GET /api/teams/:id/schedule", () => {
  it("returns the status of the team for every slot date", async () => {
    const [t1, t2, t3] = [w.teams[0]!.id, w.teams[1]!.id, w.teams[2]!.id];
    await book(t1, "2026-10-22", "home", w.fields[0]!.id);
    await book(t2, "2026-10-22", "away", null);
    await prisma.block.create({ data: { date: toDate("2026-10-29"), slotId: w.slot.id } });
    await book(t2, "2026-11-05", "home", w.fields[0]!.id);
    await book(t3, "2026-11-05", "home", w.fields[1]!.id);

    const url = (id: number) => `/api/teams/${id}/schedule?from=2026-10-22&to=2026-11-05`;
    const first = (await app.inject({ url: url(t1) })).json();
    expect(first.teamId).toBe(t1);
    expect(first.days.map((d: { status: string }) => d.status)).toEqual(["home", "unavailable", "no_training"]);

    const second = (await app.inject({ url: url(t2) })).json();
    expect(second.days.map((d: { status: string }) => d.status)).toEqual(["away", "unavailable", "home"]);

    const fourth = (await app.inject({ url: url(w.teams[3]!.id) })).json();
    expect(fourth.days[0]).toMatchObject({ status: "training", eventId: null, fieldId: null });
    expect(fourth.days[0].practiceFieldIds).toEqual([w.fields[1]!.id]);
  });

  it("returns 404 for an unknown team", async () => {
    const res = await app.inject({ url: "/api/teams/999/schedule" });
    expect(res.statusCode).toBe(404);
    expect(res.json().code).toBe("NOT_FOUND");
  });
});

describe("unknown routes", () => {
  it("answer with a NOT_FOUND problem", async () => {
    const res = await app.inject({ url: "/api/nope" });
    expect(res.statusCode).toBe(404);
    expect(res.headers["content-type"]).toContain("application/problem+json");
    expect(res.json().code).toBe("NOT_FOUND");
  });
});
```

- [ ] **Step 2: Run to see failure**

Run: `pnpm --filter @volley/api exec vitest run test/read.test.ts`
Expected: FAIL, `../src/app.js` not found.

- [ ] **Step 3: Implement the app and the read routes**

`packages/api/src/app.ts`:

```ts
import cookie from "@fastify/cookie";
import Fastify from "fastify";
import type { Deps } from "./db.js";
import { AppError, sendProblem } from "./errors.js";
import { readRoutes } from "./routes/read.js";

export function buildApp(deps: Deps) {
  const app = Fastify({ logger: deps.production, trustProxy: deps.trustProxy ?? false });
  app.register(cookie);

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof AppError) return sendProblem(reply, err.code, err.message);
    const status = (err as { statusCode?: number }).statusCode;
    if (status && status >= 400 && status < 500) return sendProblem(reply, "VALIDATION_ERROR", err.message, status);
    req.log.error(err);
    return sendProblem(reply, "INTERNAL", "Unexpected error");
  });
  app.setNotFoundHandler((_req, reply) => sendProblem(reply, "NOT_FOUND", "Route not found"));

  readRoutes(app, deps);
  return app;
}

export type App = ReturnType<typeof buildApp>;
```

`packages/api/src/routes/read.ts`:

```ts
import { fmtDate, fmtTime, loadSettings, toDate, type Deps } from "../db.js";
import type { App } from "../app.js";
import { AppError } from "../errors.js";
import { datesWithWeekday, practiceFieldIds, resolveRange, teamStatus, todayIn } from "../rules.js";

type RangeQuery = { from?: string; to?: string };

export function readRoutes(app: App, deps: Deps): void {
  const { prisma } = deps;

  async function rangeFor(query: unknown) {
    const settings = await loadSettings(prisma);
    const today = todayIn(settings.timezone, deps.now());
    return { settings, today, ...resolveRange((query ?? {}) as RangeQuery, today, settings.seasonEnd) };
  }

  async function loadCells(from: string, to: string) {
    const range = { gte: toDate(from), lte: toDate(to) };
    const [slots, fields, events, blocks] = await Promise.all([
      prisma.slot.findMany({ orderBy: { id: "asc" } }),
      prisma.field.findMany({ orderBy: { id: "asc" } }),
      prisma.event.findMany({ where: { date: range } }),
      prisma.block.findMany({ where: { date: range } }),
    ]);
    const key = (date: string, slotId: number) => `${date}|${slotId}`;
    const eventsByKey = new Map<string, typeof events>();
    for (const e of events) {
      const k = key(fmtDate(e.date), e.slotId);
      eventsByKey.set(k, [...(eventsByKey.get(k) ?? []), e]);
    }
    const blockByKey = new Map(blocks.map((b) => [key(fmtDate(b.date), b.slotId), b]));
    const fieldIds = fields.map((f) => f.id);

    const cells = [];
    for (const slot of slots) {
      for (const date of datesWithWeekday(from, to, slot.weekday)) {
        const k = key(date, slot.id);
        const evs = eventsByKey.get(k) ?? [];
        const block = blockByKey.get(k);
        const homes = evs.filter((e) => e.type === "home");
        cells.push({
          date,
          slotId: slot.id,
          events: evs,
          homes,
          blocked: block !== undefined,
          blockReason: block?.reason ?? null,
          // the home_has_field check constraint guarantees fieldId on home games
          practiceFieldIds: practiceFieldIds(fieldIds, homes.map((e) => e.fieldId!), block !== undefined),
        });
      }
    }
    return cells.sort((a, b) => a.date.localeCompare(b.date) || a.slotId - b.slotId);
  }

  app.get("/api/config", async () => {
    const [teams, fields, slots, settings] = await Promise.all([
      prisma.team.findMany({ orderBy: { id: "asc" } }),
      prisma.field.findMany({ orderBy: { id: "asc" } }),
      prisma.slot.findMany({ orderBy: { id: "asc" } }),
      loadSettings(prisma),
    ]);
    return {
      teams: teams.map((t) => ({ id: t.id, name: t.name })),
      fields: fields.map((f) => ({ id: f.id, name: f.name, size: f.size })),
      slots: slots.map((s) => ({ id: s.id, weekday: s.weekday, start: fmtTime(s.start), end: fmtTime(s.end) })),
      seasonEnd: settings.seasonEnd,
      today: todayIn(settings.timezone, deps.now()),
    };
  });

  app.get("/api/calendar", async (req) => {
    const { from, to } = await rangeFor(req.query);
    const days = new Map<string, unknown[]>();
    for (const c of await loadCells(from, to)) {
      const entry = {
        slotId: c.slotId,
        blocked: c.blocked,
        blockReason: c.blockReason,
        homeGames: c.homes.map((e) => ({ eventId: e.id, teamId: e.teamId, fieldId: e.fieldId! })),
        awayGames: c.events.filter((e) => e.type === "away").map((e) => ({ eventId: e.id, teamId: e.teamId })),
        practiceFieldIds: c.practiceFieldIds,
      };
      days.set(c.date, [...(days.get(c.date) ?? []), entry]);
    }
    return { days: [...days.entries()].map(([date, slots]) => ({ date, slots })) };
  });

  app.get("/api/teams/:id/schedule", async (req) => {
    const id = Number((req.params as { id: string }).id);
    const team = Number.isInteger(id) ? await prisma.team.findUnique({ where: { id } }) : null;
    if (!team) throw new AppError("NOT_FOUND", "Team not found");
    const { from, to } = await rangeFor(req.query);
    const days = (await loadCells(from, to)).map((c) => {
      const mine = c.events.find((e) => e.teamId === id) ?? null;
      return {
        date: c.date,
        slotId: c.slotId,
        status: teamStatus({ event: mine, blocked: c.blocked, practiceFieldIds: c.practiceFieldIds }),
        eventId: mine?.id ?? null,
        fieldId: mine?.fieldId ?? null,
        practiceFieldIds: c.practiceFieldIds,
      };
    });
    return { teamId: id, days };
  });
}
```

`packages/api/src/main.ts`:

```ts
import "dotenv/config";
import { buildApp } from "./app.js";
import { createPrisma } from "./db.js";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required");

const app = buildApp({
  prisma: createPrisma(url),
  now: () => new Date(),
  production: process.env.NODE_ENV === "production",
  trustProxy: process.env.TRUST_PROXY === "1",
});

await app.listen({ port: Number(process.env.PORT ?? 3000), host: "0.0.0.0" });
```

- [ ] **Step 4: Run the tests**

Run: `pnpm --filter @volley/api exec vitest run test/read.test.ts`
Expected: all tests pass. Run `pnpm --filter @volley/api typecheck` too. Then start `pnpm --filter @volley/api dev` against the seeded dev database, run `curl localhost:3000/api/config` and stop the server.

- [ ] **Step 5: Commit**

```bash
git add packages/api
git commit -m "feat(api): add Fastify app with config, calendar and team schedule endpoints"
```

### Task 5: Authentication

**Files:**
- Create: `packages/api/src/auth.ts`, `packages/api/src/routes/auth.ts`
- Modify: `packages/api/src/app.ts` (register auth routes and the JSON content-type guard), `packages/api/test/helpers.ts` (add `loginAs`)
- Test: `packages/api/test/auth.test.ts`

**Interfaces:**
- Consumes: `Deps`, `AppError`, `Actor`, `hashPassword`, `verifyPassword`, `buildTestApp`, `seedWorld`, `PASSWORDS`, `clearBookings` (Tasks 1-4).
- Produces from `src/auth.ts`:
  - `SESSION_COOKIE = "session"`, `hashToken(token: string): string` (SHA-256 hex)
  - `createSession(deps: Deps, userId: string): Promise<string>` returning the raw token
  - `actorFromToken(deps: Deps, token: string): Promise<Actor | null>` which deletes sessions idle for more than 30 days and refreshes `lastUsedAt` at most once per hour
  - `requireActor(deps: Deps, req: FastifyRequest): Promise<Actor>` throwing `UNAUTHENTICATED`
  - `class FailureLimiter { constructor(max: number, windowMs: number); isBlocked(key: string, now: number): boolean; fail(key: string, now: number): void; clear(key: string): void }`
- Produces routes from `src/routes/auth.ts`: `authRoutes(app: App, deps: Deps): void`
  - `POST /api/auth/login` body `{ username, password }` returns 200 `{ id, username, role, teamId }` and sets the `session` cookie.
  - `POST /api/auth/logout` returns 204 and clears the cookie.
  - `GET /api/auth/me` returns the same user object or 401.
- Produces `loginAs(app: App, username: string, password: string): Promise<string>` in `test/helpers.ts`, returning a ready-to-send cookie header value such as `session=abc`.
- Note for the web client (Task 8): never send a `Content-Type: application/json` header on a request without a body, because Fastify answers an empty JSON body with a 400.

- [ ] **Step 1: Write the failing test**

Append to `packages/api/test/helpers.ts`:

```ts
export async function loginAs(app: App, username: string, password: string): Promise<string> {
  const res = await app.inject({ method: "POST", url: "/api/auth/login", payload: { username, password } });
  if (res.statusCode !== 200) throw new Error(`login failed: ${res.body}`);
  return `session=${res.cookies[0]!.value}`;
}
```

`packages/api/test/auth.test.ts`:

```ts
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { App } from "../src/app.js";
import { clearBookings, testPrisma } from "./db.js";
import { buildTestApp, loginAs, NOW, PASSWORDS, seedWorld, type World } from "./helpers.js";

const prisma = testPrisma();
let app: App;
let w: World;

beforeAll(async () => {
  w = await seedWorld(prisma);
});
beforeEach(async () => {
  await clearBookings(prisma);
  app = buildTestApp(prisma);
});
afterEach(() => app.close());
afterAll(() => prisma.$disconnect());

const login = (username: string, password: string) =>
  app.inject({ method: "POST", url: "/api/auth/login", payload: { username, password } });

describe("login", () => {
  it("signs in and sets an httpOnly session cookie", async () => {
    const res = await login("captain1", PASSWORDS.captain);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ username: "captain1", role: "captain", teamId: w.teams[0]!.id });
    const cookie = res.cookies.find((c) => c.name === "session")!;
    expect(cookie.httpOnly).toBe(true);
    expect(cookie.sameSite).toBe("Lax");
    expect(res.body).not.toContain("passwordHash");
  });

  it("stores only a hash of the token", async () => {
    const res = await login("manager", PASSWORDS.manager);
    const token = res.cookies[0]!.value;
    const rows = await prisma.session.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.tokenHash).not.toBe(token);
  });

  it("rejects a wrong password and an unknown user the same way", async () => {
    const wrong = await login("manager", "nope");
    const unknown = await login("ghost", "nope");
    expect(wrong.statusCode).toBe(401);
    expect(unknown.statusCode).toBe(401);
    expect(wrong.json().detail).toBe(unknown.json().detail);
    expect(wrong.json().code).toBe("UNAUTHENTICATED");
  });

  it("rejects a body without credentials", async () => {
    const res = await app.inject({ method: "POST", url: "/api/auth/login", payload: { username: "manager" } });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe("VALIDATION_ERROR");
  });

  it("rate limits repeated failures even for the right password", async () => {
    for (let i = 0; i < 5; i++) expect((await login("manager", "nope")).statusCode).toBe(401);
    const res = await login("manager", PASSWORDS.manager);
    expect(res.statusCode).toBe(429);
    expect(res.json().code).toBe("RATE_LIMITED");
  });

  it("refuses a body that is not application/json", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      headers: { "content-type": "text/plain" },
      payload: JSON.stringify({ username: "manager", password: PASSWORDS.manager }),
    });
    expect(res.statusCode).toBe(400);
    expect(res.cookies).toHaveLength(0);
  });
});

describe("me and logout", () => {
  it("returns the current user for a valid cookie", async () => {
    const cookie = await loginAs(app, "captain2", PASSWORDS.captain);
    const res = await app.inject({ url: "/api/auth/me", headers: { cookie } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ username: "captain2", role: "captain" });
  });

  it("returns 401 without a cookie", async () => {
    const res = await app.inject({ url: "/api/auth/me" });
    expect(res.statusCode).toBe(401);
    expect(res.json().code).toBe("UNAUTHENTICATED");
  });

  it("logout ends the session", async () => {
    const cookie = await loginAs(app, "manager", PASSWORDS.manager);
    const out = await app.inject({ method: "POST", url: "/api/auth/logout", headers: { cookie } });
    expect(out.statusCode).toBe(204);
    const me = await app.inject({ url: "/api/auth/me", headers: { cookie } });
    expect(me.statusCode).toBe(401);
    expect(await prisma.session.count()).toBe(0);
  });

  it("expires a session idle for more than 30 days", async () => {
    const cookie = await loginAs(app, "manager", PASSWORDS.manager);
    await prisma.session.updateMany({ data: { lastUsedAt: new Date(NOW.getTime() - 31 * 86_400_000) } });
    const me = await app.inject({ url: "/api/auth/me", headers: { cookie } });
    expect(me.statusCode).toBe(401);
    expect(await prisma.session.count()).toBe(0);
  });
});
```

- [ ] **Step 2: Run to see failure**

Run: `pnpm --filter @volley/api exec vitest run test/auth.test.ts`
Expected: FAIL, login route returns 404.

- [ ] **Step 3: Implement sessions and the limiter**

`packages/api/src/auth.ts`:

```ts
import { createHash, randomBytes } from "node:crypto";
import type { FastifyRequest } from "fastify";
import type { Deps } from "./db.js";
import { AppError } from "./errors.js";
import type { Actor } from "./rules.js";

export const SESSION_COOKIE = "session";
const SESSION_MAX_IDLE_MS = 30 * 86_400_000;
const TOUCH_AFTER_MS = 3_600_000;

export const hashToken = (token: string): string => createHash("sha256").update(token).digest("hex");

export async function createSession(deps: Deps, userId: string): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  const now = deps.now();
  await deps.prisma.session.create({
    data: { tokenHash: hashToken(token), userId, createdAt: now, lastUsedAt: now },
  });
  return token;
}

export async function actorFromToken(deps: Deps, token: string): Promise<Actor | null> {
  const session = await deps.prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });
  if (!session) return null;
  const now = deps.now();
  const idle = now.getTime() - session.lastUsedAt.getTime();
  if (idle > SESSION_MAX_IDLE_MS) {
    await deps.prisma.session.deleteMany({ where: { id: session.id } });
    return null;
  }
  if (idle > TOUCH_AFTER_MS) {
    await deps.prisma.session.updateMany({ where: { id: session.id }, data: { lastUsedAt: now } });
  }
  return { id: session.user.id, role: session.user.role, teamId: session.user.teamId };
}

export async function requireActor(deps: Deps, req: FastifyRequest): Promise<Actor> {
  const token = req.cookies[SESSION_COOKIE];
  const actor = token ? await actorFromToken(deps, token) : null;
  if (!actor) throw new AppError("UNAUTHENTICATED", "Sign in required");
  return actor;
}

export class FailureLimiter {
  private hits = new Map<string, number[]>();

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
  ) {}

  private recent(key: string, now: number): number[] {
    const kept = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (kept.length > 0) this.hits.set(key, kept);
    else this.hits.delete(key);
    return kept;
  }

  isBlocked(key: string, now: number): boolean {
    return this.recent(key, now).length >= this.max;
  }

  fail(key: string, now: number): void {
    if (this.hits.size > 10_000) for (const k of [...this.hits.keys()]) this.recent(k, now);
    const kept = this.recent(key, now);
    kept.push(now);
    this.hits.set(key, kept);
  }

  clear(key: string): void {
    this.hits.delete(key);
  }
}
```

`packages/api/src/routes/auth.ts`:

```ts
import type { App } from "../app.js";
import { createSession, FailureLimiter, hashToken, requireActor, SESSION_COOKIE } from "../auth.js";
import type { Deps } from "../db.js";
import { AppError } from "../errors.js";
import { hashPassword, verifyPassword } from "../password.js";

const WINDOW_MS = 15 * 60_000;

let dummyHash: Promise<string> | undefined;
const getDummyHash = () => (dummyHash ??= hashPassword("not-a-real-password"));

export function authRoutes(app: App, deps: Deps): void {
  const perPair = new FailureLimiter(5, WINDOW_MS);
  const perIp = new FailureLimiter(30, WINDOW_MS);

  app.post("/api/auth/login", async (req, reply) => {
    const body = req.body as { username?: unknown; password?: unknown } | null;
    if (typeof body?.username !== "string" || typeof body.password !== "string") {
      throw new AppError("VALIDATION_ERROR", "username and password are required");
    }
    const now = deps.now().getTime();
    const pairKey = `${req.ip}|${body.username.toLowerCase()}`;
    if (perPair.isBlocked(pairKey, now) || perIp.isBlocked(req.ip, now)) {
      throw new AppError("RATE_LIMITED", "Too many failed attempts, try again later");
    }

    const user = await deps.prisma.user.findUnique({ where: { username: body.username } });
    // always verify against some hash so unknown users cost the same time as wrong passwords
    const valid = await verifyPassword(user?.passwordHash ?? (await getDummyHash()), body.password);
    if (!user || !valid) {
      perPair.fail(pairKey, now);
      perIp.fail(req.ip, now);
      throw new AppError("UNAUTHENTICATED", "Invalid username or password");
    }

    perPair.clear(pairKey);
    const token = await createSession(deps, user.id);
    reply.setCookie(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: deps.production,
      path: "/",
      // the server enforces the 30 day sliding expiry, the cookie just has to outlive it
      maxAge: 365 * 86_400,
    });
    return { id: user.id, username: user.username, role: user.role, teamId: user.teamId };
  });

  app.post("/api/auth/logout", async (req, reply) => {
    const token = req.cookies[SESSION_COOKIE];
    if (token) await deps.prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
    reply.clearCookie(SESSION_COOKIE, { path: "/" });
    return reply.code(204).send();
  });

  app.get("/api/auth/me", async (req) => {
    const actor = await requireActor(deps, req);
    const user = await deps.prisma.user.findUniqueOrThrow({ where: { id: actor.id } });
    return { id: user.id, username: user.username, role: user.role, teamId: user.teamId };
  });
}
```

Modify `packages/api/src/app.ts`: add the import `import { authRoutes } from "./routes/auth.js";`, then add the guard and the registration so the end of `buildApp` reads:

```ts
  app.addHook("preHandler", async (req) => {
    const mutating = ["POST", "PUT", "PATCH", "DELETE"].includes(req.method);
    if (mutating && req.body != null && !req.headers["content-type"]?.startsWith("application/json")) {
      throw new AppError("VALIDATION_ERROR", "Content-Type must be application/json");
    }
  });

  readRoutes(app, deps);
  authRoutes(app, deps);
  return app;
}
```

Form-encoded bodies never reach the hook: Fastify answers them with 415 itself, and the error handler turns that into a problem response.

- [ ] **Step 4: Run the tests**

Run: `pnpm --filter @volley/api exec vitest run test/auth.test.ts test/read.test.ts`
Expected: all pass. Run `pnpm --filter @volley/api typecheck`.

- [ ] **Step 5: Commit**

```bash
git add packages/api
git commit -m "feat(api): add session cookie authentication with login rate limiting"
```

### Task 6: Create, cancel and move events

**Files:**
- Modify: `packages/api/src/db.ts` (add locking, transaction and conflict helpers), `packages/api/src/app.ts` (register routes)
- Create: `packages/api/src/routes/events.ts`
- Test: `packages/api/test/events.test.ts`

**Interfaces:**
- Consumes: `requireActor` (Task 5), rules and errors (Task 3), `Deps`, `toDate`, `fmtDate`, `loadSettings` (Task 4), `seedWorld`, `buildTestApp`, `loginAs`, `PASSWORDS`, `NOW`, `clearBookings` (Tasks 4-5).
- Produces additions to `src/db.ts`:
  - `type Tx = Prisma.TransactionClient`
  - `lockCells(tx: Tx, cells: { date: string; slotId: number }[]): Promise<void>` taking one `pg_advisory_xact_lock` per distinct (date, slot), always in ascending (date, slot) order so concurrent moves cannot deadlock.
  - `transact<T>(prisma: PrismaClient, fn: (tx: Tx) => Promise<T>): Promise<T>` using ReadCommitted, `maxWait` 3000 ms and `timeout` 5000 ms.
  - `conflictFromUnique(e: unknown): AppError | null` mapping a Prisma `P2002` on the field constraint to `FIELD_TAKEN` and on the team constraint to `TEAM_BUSY`.
- Produces `eventRoutes(app: App, deps: Deps): void`:
  - `POST /api/events` body `{ teamId, date, slotId, type, fieldId? }` returns 201 `{ id, teamId, date, slotId, type, fieldId }`.
  - `DELETE /api/events/:id` returns 204.
  - `POST /api/events/:id/move` body `{ date, slotId, fieldId? }` returns 200 with the new event in the same shape, with a new `id`. Type and team are kept.

- [ ] **Step 1: Write the failing test**

`packages/api/test/events.test.ts`:

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { App } from "../src/app.js";
import { toDate } from "../src/db.js";
import { clearBookings, testPrisma } from "./db.js";
import { buildTestApp, loginAs, PASSWORDS, seedWorld, type World } from "./helpers.js";

const prisma = testPrisma();
let app: App;
let w: World;
let manager: string;
let cap1: string;
let cap2: string;

const THU1 = "2026-10-22";
const THU2 = "2026-10-29";
const PAST_THU = "2026-10-15";

const send = (method: "POST" | "DELETE", url: string, cookie: string | null, payload?: object) =>
  app.inject({ method, url, headers: cookie ? { cookie } : {}, payload });

const bookBody = (teamIdx: number, date: string, type: "home" | "away", fieldIdx: number | null) => ({
  teamId: w.teams[teamIdx]!.id,
  date,
  slotId: w.slot.id,
  type,
  fieldId: fieldIdx === null ? null : w.fields[fieldIdx]!.id,
});

const insert = (teamIdx: number, date: string, type: "home" | "away", fieldIdx: number | null) =>
  prisma.event.create({
    data: {
      teamId: w.teams[teamIdx]!.id,
      date: toDate(date),
      slotId: w.slot.id,
      type,
      fieldId: fieldIdx === null ? null : w.fields[fieldIdx]!.id,
      createdBy: w.manager.id,
    },
  });

beforeAll(async () => {
  w = await seedWorld(prisma);
  app = buildTestApp(prisma);
});
beforeEach(async () => {
  await clearBookings(prisma);
  manager = await loginAs(app, "manager", PASSWORDS.manager);
  cap1 = await loginAs(app, "captain1", PASSWORDS.captain);
  cap2 = await loginAs(app, "captain2", PASSWORDS.captain);
});
afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

describe("create", () => {
  it("lets a captain reserve a home game for the own team", async () => {
    const res = await send("POST", "/api/events", cap1, bookBody(0, THU1, "home", 0));
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ teamId: w.teams[0]!.id, date: THU1, type: "home", fieldId: w.fields[0]!.id });
    expect(await prisma.event.count()).toBe(1);
  });

  it("lets several teams enter away games in the same slot", async () => {
    expect((await send("POST", "/api/events", cap1, bookBody(0, THU1, "away", null))).statusCode).toBe(201);
    expect((await send("POST", "/api/events", cap2, bookBody(1, THU1, "away", null))).statusCode).toBe(201);
  });

  it("lets the manager book for any team", async () => {
    const res = await send("POST", "/api/events", manager, bookBody(2, THU1, "home", 1));
    expect(res.statusCode).toBe(201);
  });

  it("requires login and ownership of the team", async () => {
    expect((await send("POST", "/api/events", null, bookBody(0, THU1, "home", 0))).statusCode).toBe(401);
    const res = await send("POST", "/api/events", cap1, bookBody(1, THU1, "home", 0));
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe("FORBIDDEN");
  });

  it("refuses a field that is already taken", async () => {
    await insert(1, THU1, "home", 0);
    const res = await send("POST", "/api/events", cap1, bookBody(0, THU1, "home", 0));
    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe("FIELD_TAKEN");
  });

  it("refuses a second event for the same team and slot", async () => {
    await insert(0, THU1, "away", null);
    const res = await send("POST", "/api/events", cap1, bookBody(0, THU1, "home", 1));
    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe("TEAM_BUSY");
  });

  it("refuses a home game in a blocked slot but allows an away game", async () => {
    await prisma.block.create({ data: { date: toDate(THU1), slotId: w.slot.id } });
    const home = await send("POST", "/api/events", cap1, bookBody(0, THU1, "home", 0));
    expect(home.statusCode).toBe(409);
    expect(home.json().code).toBe("SLOT_BLOCKED");
    expect((await send("POST", "/api/events", cap1, bookBody(0, THU1, "away", null))).statusCode).toBe(201);
  });

  it.each([
    ["FIELD_REQUIRED", bookBody(0, THU1, "home", null)],
    ["FIELD_NOT_ALLOWED", bookBody(0, THU1, "away", 0)],
    ["WEEKDAY_MISMATCH", bookBody(0, "2026-10-23", "away", null)],
    ["DATE_IN_PAST", bookBody(0, PAST_THU, "away", null)],
    ["OUT_OF_SEASON", bookBody(0, "2027-09-02", "away", null)],
  ])("rejects %s with 422", async (code, body) => {
    const res = await send("POST", "/api/events", manager, body);
    expect(res.statusCode).toBe(422);
    expect(res.json().code).toBe(code);
  });

  it("rejects malformed input and unknown references", async () => {
    const bad = await send("POST", "/api/events", manager, { teamId: "x", date: THU1, slotId: 1, type: "home" });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().code).toBe("VALIDATION_ERROR");
    const unknown = await send("POST", "/api/events", manager, { ...bookBody(0, THU1, "home", 0), fieldId: 999 });
    expect(unknown.statusCode).toBe(404);
  });
});

describe("cancel", () => {
  it("lets a captain cancel an own event and frees the field", async () => {
    const ev = await insert(0, THU1, "home", 0);
    expect((await send("DELETE", `/api/events/${ev.id}`, cap1)).statusCode).toBe(204);
    expect(await prisma.event.count()).toBe(0);
    expect((await send("POST", "/api/events", cap2, bookBody(1, THU1, "home", 0))).statusCode).toBe(201);
  });

  it("refuses to cancel the event of another team", async () => {
    const ev = await insert(1, THU1, "home", 0);
    const res = await send("DELETE", `/api/events/${ev.id}`, cap1);
    expect(res.statusCode).toBe(403);
    expect(await prisma.event.count()).toBe(1);
  });

  it("restricts cancelling past events to the manager", async () => {
    const ev = await insert(0, PAST_THU, "away", null);
    const res = await send("DELETE", `/api/events/${ev.id}`, cap1);
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe("PAST_EVENT_MANAGER_ONLY");
    expect((await send("DELETE", `/api/events/${ev.id}`, manager)).statusCode).toBe(204);
  });

  it("answers 404 for unknown and malformed ids", async () => {
    const unknown = await send("DELETE", "/api/events/3f2b8c1e-0000-4000-8000-000000000000", manager);
    expect(unknown.statusCode).toBe(404);
    expect((await send("DELETE", "/api/events/not-a-uuid", manager)).statusCode).toBe(404);
  });
});

describe("move", () => {
  it("moves a home game to another date and returns a new id", async () => {
    const ev = await insert(0, THU1, "home", 0);
    const res = await send("POST", `/api/events/${ev.id}/move`, cap1, {
      date: THU2,
      slotId: w.slot.id,
      fieldId: w.fields[0]!.id,
    });
    expect(res.statusCode).toBe(200);
    const moved = res.json();
    expect(moved).toMatchObject({ date: THU2, type: "home", teamId: w.teams[0]!.id });
    expect(moved.id).not.toBe(ev.id);
    expect(await prisma.event.findUnique({ where: { id: ev.id } })).toBeNull();
  });

  it("switches field inside the same slot", async () => {
    const ev = await insert(0, THU1, "home", 0);
    const res = await send("POST", `/api/events/${ev.id}/move`, cap1, {
      date: THU1,
      slotId: w.slot.id,
      fieldId: w.fields[1]!.id,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().fieldId).toBe(w.fields[1]!.id);
  });

  it("moves an away game without a field", async () => {
    const ev = await insert(0, THU1, "away", null);
    const res = await send("POST", `/api/events/${ev.id}/move`, cap1, { date: THU2, slotId: w.slot.id });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ type: "away", fieldId: null });
  });

  it("leaves the original untouched when the target is not allowed", async () => {
    const ev = await insert(0, THU1, "home", 0);
    await insert(1, THU2, "home", 0);
    await prisma.block.create({ data: { date: toDate("2026-11-05"), slotId: w.slot.id } });
    const taken = await send("POST", `/api/events/${ev.id}/move`, cap1, {
      date: THU2,
      slotId: w.slot.id,
      fieldId: w.fields[0]!.id,
    });
    expect(taken.json().code).toBe("FIELD_TAKEN");
    const blocked = await send("POST", `/api/events/${ev.id}/move`, cap1, {
      date: "2026-11-05",
      slotId: w.slot.id,
      fieldId: w.fields[0]!.id,
    });
    expect(blocked.json().code).toBe("SLOT_BLOCKED");
    const noField = await send("POST", `/api/events/${ev.id}/move`, cap1, { date: THU2, slotId: w.slot.id });
    expect(noField.json().code).toBe("FIELD_REQUIRED");
    expect(await prisma.event.findUnique({ where: { id: ev.id } })).not.toBeNull();
  });

  it("enforces ownership and the past rule", async () => {
    const other = await insert(1, THU1, "away", null);
    const forbidden = await send("POST", `/api/events/${other.id}/move`, cap1, { date: THU2, slotId: w.slot.id });
    expect(forbidden.statusCode).toBe(403);
    const past = await insert(0, PAST_THU, "away", null);
    const pastRes = await send("POST", `/api/events/${past.id}/move`, cap1, { date: THU2, slotId: w.slot.id });
    expect(pastRes.json().code).toBe("PAST_EVENT_MANAGER_ONLY");
    const asManager = await send("POST", `/api/events/${past.id}/move`, manager, { date: THU2, slotId: w.slot.id });
    expect(asManager.statusCode).toBe(200);
  });
});

describe("concurrency", () => {
  it("lets exactly one of two simultaneous bookings of the same field win", async () => {
    const [a, b] = await Promise.all([
      send("POST", "/api/events", cap1, bookBody(0, THU1, "home", 0)),
      send("POST", "/api/events", cap2, bookBody(1, THU1, "home", 0)),
    ]);
    expect([a.statusCode, b.statusCode].sort()).toEqual([201, 409]);
    const loser = a.statusCode === 409 ? a : b;
    expect(loser.json().code).toBe("FIELD_TAKEN");
    expect(await prisma.event.count()).toBe(1);
  });

  it("lets exactly one of two simultaneous bookings for the same team win", async () => {
    const [a, b] = await Promise.all([
      send("POST", "/api/events", manager, bookBody(0, THU1, "home", 0)),
      send("POST", "/api/events", manager, bookBody(0, THU1, "home", 1)),
    ]);
    expect([a.statusCode, b.statusCode].sort()).toEqual([201, 409]);
    expect(await prisma.event.count()).toBe(1);
  });

  it("completes two crossing moves without deadlock", async () => {
    const e1 = await insert(0, THU1, "home", 0);
    const e2 = await insert(1, THU2, "home", 0);
    const [a, b] = await Promise.all([
      send("POST", `/api/events/${e1.id}/move`, cap1, { date: THU2, slotId: w.slot.id, fieldId: w.fields[1]!.id }),
      send("POST", `/api/events/${e2.id}/move`, cap2, { date: THU1, slotId: w.slot.id, fieldId: w.fields[1]!.id }),
    ]);
    expect([a.statusCode, b.statusCode]).toEqual([200, 200]);
    expect(await prisma.event.count()).toBe(2);
  });
});
```

- [ ] **Step 2: Run to see failure**

Run: `pnpm --filter @volley/api exec vitest run test/events.test.ts`
Expected: FAIL, `/api/events` returns 404.

- [ ] **Step 3: Add the db helpers**

Append to `packages/api/src/db.ts` and add `import { AppError } from "./errors.js";` at the top:

```ts
export type Tx = Prisma.TransactionClient;

const epochDay = (date: string): number => Math.floor(Date.parse(`${date}T00:00:00Z`) / 86_400_000);

export async function lockCells(tx: Tx, cells: { date: string; slotId: number }[]): Promise<void> {
  const distinct = new Map(cells.map((c) => [`${c.date}|${c.slotId}`, c]));
  const ordered = [...distinct.values()].sort((a, b) => a.date.localeCompare(b.date) || a.slotId - b.slotId);
  for (const c of ordered) {
    // $executeRaw, not $queryRaw: the function returns void, which Prisma cannot deserialize
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${epochDay(c.date)}::int, ${c.slotId}::int)`;
  }
}

export function transact<T>(prisma: PrismaClient, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return prisma.$transaction(fn, {
    maxWait: 3000,
    timeout: 5000,
    isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
  });
}

// The advisory lock prevents conflicts, the unique constraints are the backstop.
export function conflictFromUnique(e: unknown): AppError | null {
  if (typeof e !== "object" || e === null || (e as { code?: string }).code !== "P2002") return null;
  const text = `${JSON.stringify((e as { meta?: unknown }).meta ?? {})} ${(e as Error).message}`;
  if (text.includes("fieldId")) return new AppError("FIELD_TAKEN", "That field is already taken");
  if (text.includes("teamId")) return new AppError("TEAM_BUSY", "This team already has an event in that slot");
  return null;
}
```

If the unique-violation shape you printed in Task 1 step 6 does not contain `fieldId` or `teamId` anywhere, adjust the two `includes` checks to the constraint names `Event_fieldId_date_slotId_key` and `Event_teamId_date_slotId_key` and re-run the concurrency tests.

- [ ] **Step 4: Implement the event routes**

`packages/api/src/routes/events.ts`:

```ts
import type { App } from "../app.js";
import { requireActor } from "../auth.js";
import { conflictFromUnique, fmtDate, loadSettings, lockCells, toDate, transact, type Deps, type Tx } from "../db.js";
import { AppError } from "../errors.js";
import { assertCanModify, assertOwnsTeam, checkEventInput, isValidDate, todayIn } from "../rules.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type NewEvent = {
  teamId: number;
  date: string;
  slotId: number;
  type: "home" | "away";
  fieldId: number | null;
  createdBy: string;
};

function parseFieldId(v: unknown): number | null {
  if (v === undefined || v === null) return null;
  if (!Number.isInteger(v)) throw new AppError("VALIDATION_ERROR", "fieldId must be an integer");
  return v as number;
}

function parseCell(b: Record<string, unknown>): { date: string; slotId: number; fieldId: number | null } {
  if (typeof b.date !== "string" || !isValidDate(b.date) || !Number.isInteger(b.slotId)) {
    throw new AppError("VALIDATION_ERROR", "date (YYYY-MM-DD) and slotId are required");
  }
  return { date: b.date, slotId: b.slotId as number, fieldId: parseFieldId(b.fieldId) };
}

function view(e: { id: string; teamId: number; date: Date; slotId: number; type: string; fieldId: number | null }) {
  return { id: e.id, teamId: e.teamId, date: fmtDate(e.date), slotId: e.slotId, type: e.type, fieldId: e.fieldId };
}

async function place(tx: Tx, e: NewEvent) {
  const date = toDate(e.date);
  if (e.type === "home") {
    const block = await tx.block.findUnique({ where: { date_slotId: { date, slotId: e.slotId } } });
    if (block) throw new AppError("SLOT_BLOCKED", "The slot is blocked on that date");
    const taken = await tx.event.findFirst({ where: { fieldId: e.fieldId, date, slotId: e.slotId } });
    if (taken) throw new AppError("FIELD_TAKEN", "That field is already taken");
  }
  const busy = await tx.event.findFirst({ where: { teamId: e.teamId, date, slotId: e.slotId } });
  if (busy) throw new AppError("TEAM_BUSY", "This team already has an event in that slot");
  return tx.event.create({ data: { ...e, date } });
}

export function eventRoutes(app: App, deps: Deps): void {
  const { prisma } = deps;

  async function context() {
    const settings = await loadSettings(prisma);
    return { seasonEnd: settings.seasonEnd, today: todayIn(settings.timezone, deps.now()) };
  }

  async function requireExisting(table: "team" | "field" | "slot", id: number | null) {
    if (id === null) return null;
    const found = await (prisma[table] as { findUnique(a: { where: { id: number } }): Promise<unknown> }).findUnique({
      where: { id },
    });
    if (!found) throw new AppError("NOT_FOUND", `Unknown ${table}`);
    return found as { weekday?: number };
  }

  app.post("/api/events", async (req, reply) => {
    const actor = await requireActor(deps, req);
    const b = (req.body ?? {}) as Record<string, unknown>;
    if (!Number.isInteger(b.teamId) || (b.type !== "home" && b.type !== "away")) {
      throw new AppError("VALIDATION_ERROR", "teamId and type (home or away) are required");
    }
    const teamId = b.teamId as number;
    const type = b.type;
    const cell = parseCell(b);
    assertOwnsTeam(actor, teamId);
    await requireExisting("team", teamId);
    const slot = await requireExisting("slot", cell.slotId);
    await requireExisting("field", cell.fieldId);
    const { seasonEnd, today } = await context();
    checkEventInput({ type, fieldId: cell.fieldId, date: cell.date, slotWeekday: slot!.weekday!, today, seasonEnd });

    try {
      const created = await transact(prisma, async (tx) => {
        await lockCells(tx, [cell]);
        return place(tx, { teamId, type, createdBy: actor.id, ...cell });
      });
      return reply.code(201).send(view(created));
    } catch (e) {
      throw conflictFromUnique(e) ?? e;
    }
  });

  app.delete("/api/events/:id", async (req, reply) => {
    const actor = await requireActor(deps, req);
    const id = (req.params as { id: string }).id;
    const event = UUID.test(id) ? await prisma.event.findUnique({ where: { id } }) : null;
    if (!event) throw new AppError("NOT_FOUND", "Event not found");
    const { today } = await context();
    assertCanModify(actor, { teamId: event.teamId, date: fmtDate(event.date) }, today);
    await prisma.event.deleteMany({ where: { id } });
    return reply.code(204).send();
  });

  app.post("/api/events/:id/move", async (req) => {
    const actor = await requireActor(deps, req);
    const id = (req.params as { id: string }).id;
    const event = UUID.test(id) ? await prisma.event.findUnique({ where: { id } }) : null;
    if (!event) throw new AppError("NOT_FOUND", "Event not found");
    const { today, seasonEnd } = await context();
    const from = { date: fmtDate(event.date), slotId: event.slotId };
    assertCanModify(actor, { teamId: event.teamId, date: from.date }, today);

    const target = parseCell((req.body ?? {}) as Record<string, unknown>);
    const slot = await requireExisting("slot", target.slotId);
    await requireExisting("field", target.fieldId);
    checkEventInput({
      type: event.type,
      fieldId: target.fieldId,
      date: target.date,
      slotWeekday: slot!.weekday!,
      today,
      seasonEnd,
    });

    try {
      const moved = await transact(prisma, async (tx) => {
        await lockCells(tx, [from, target]);
        const gone = await tx.event.deleteMany({ where: { id } });
        if (gone.count === 0) throw new AppError("NOT_FOUND", "Event not found");
        return place(tx, { teamId: event.teamId, type: event.type, createdBy: actor.id, ...target });
      });
      return view(moved);
    } catch (e) {
      throw conflictFromUnique(e) ?? e;
    }
  });
}
```

Modify `packages/api/src/app.ts`: add `import { eventRoutes } from "./routes/events.js";` and register it after `authRoutes(app, deps);` with `eventRoutes(app, deps);`.

- [ ] **Step 5: Run the tests**

Run: `pnpm --filter @volley/api exec vitest run test/events.test.ts`
Expected: all tests pass, including the three concurrency tests. Run them a few times, since races show up intermittently: `pnpm --filter @volley/api exec vitest run test/events.test.ts -t concurrency` three times. Then `pnpm --filter @volley/api typecheck`.

- [ ] **Step 6: Commit**

```bash
git add packages/api
git commit -m "feat(api): add event create, cancel and move with advisory locks"
```

### Task 7: Blocks

**Files:**
- Create: `packages/api/src/routes/blocks.ts`
- Modify: `packages/api/src/app.ts` (register routes)
- Test: `packages/api/test/blocks.test.ts`

**Interfaces:**
- Consumes: `requireActor` (Task 5), `lockCells`, `transact`, `toDate`, `Deps` (Tasks 4 and 6), `isValidDate`, `isoWeekday`, `AppError`, and the test helpers.
- Produces `blockRoutes(app: App, deps: Deps): void`:
  - `PUT /api/blocks/:date/:slotId` with an optional body `{ reason?: string }` returns 200 `{ date, slotId, reason }`. It is manager only, idempotent (a second PUT updates the reason), refuses with `BLOCK_HAS_HOME_GAMES` when home games exist in that slot and date, and rejects a date that is not on the slot weekday with `WEEKDAY_MISMATCH`.
  - `DELETE /api/blocks/:date/:slotId` returns 204, manager only, and is idempotent.

- [ ] **Step 1: Write the failing test**

`packages/api/test/blocks.test.ts`:

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { App } from "../src/app.js";
import { toDate } from "../src/db.js";
import { clearBookings, testPrisma } from "./db.js";
import { buildTestApp, loginAs, PASSWORDS, seedWorld, type World } from "./helpers.js";

const prisma = testPrisma();
let app: App;
let w: World;
let manager: string;
let cap1: string;

const THU1 = "2026-10-22";

const send = (method: "PUT" | "DELETE" | "POST", url: string, cookie: string | null, payload?: object) =>
  app.inject({ method, url, headers: cookie ? { cookie } : {}, payload });

const blockUrl = (date = THU1) => `/api/blocks/${date}/${w.slot.id}`;

const insert = (teamIdx: number, type: "home" | "away", fieldIdx: number | null) =>
  prisma.event.create({
    data: {
      teamId: w.teams[teamIdx]!.id,
      date: toDate(THU1),
      slotId: w.slot.id,
      type,
      fieldId: fieldIdx === null ? null : w.fields[fieldIdx]!.id,
      createdBy: w.manager.id,
    },
  });

beforeAll(async () => {
  w = await seedWorld(prisma);
  app = buildTestApp(prisma);
});
beforeEach(async () => {
  await clearBookings(prisma);
  manager = await loginAs(app, "manager", PASSWORDS.manager);
  cap1 = await loginAs(app, "captain1", PASSWORDS.captain);
});
afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

describe("PUT /api/blocks/:date/:slotId", () => {
  it("blocks a slot with a reason and updates it on a second call", async () => {
    const first = await send("PUT", blockUrl(), manager, { reason: "Tournament" });
    expect(first.statusCode).toBe(200);
    expect(first.json()).toEqual({ date: THU1, slotId: w.slot.id, reason: "Tournament" });
    const second = await send("PUT", blockUrl(), manager, { reason: "Hall closed" });
    expect(second.json().reason).toBe("Hall closed");
    expect(await prisma.block.count()).toBe(1);
  });

  it("accepts a request without a body", async () => {
    const res = await send("PUT", blockUrl(), manager);
    expect(res.statusCode).toBe(200);
    expect(res.json().reason).toBeNull();
  });

  it("is manager only", async () => {
    expect((await send("PUT", blockUrl(), null)).statusCode).toBe(401);
    const res = await send("PUT", blockUrl(), cap1);
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe("FORBIDDEN");
  });

  it("refuses while home games exist but allows away games", async () => {
    await insert(0, "away", null);
    expect((await send("PUT", blockUrl(), manager)).statusCode).toBe(200);
    await send("DELETE", blockUrl(), manager);
    await insert(1, "home", 0);
    const res = await send("PUT", blockUrl(), manager);
    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe("BLOCK_HAS_HOME_GAMES");
    expect(await prisma.block.count()).toBe(0);
  });

  it("validates the date, the slot and the weekday", async () => {
    expect((await send("PUT", blockUrl("2026-10-23"), manager)).json().code).toBe("WEEKDAY_MISMATCH");
    expect((await send("PUT", blockUrl("nope"), manager)).json().code).toBe("VALIDATION_ERROR");
    expect((await send("PUT", `/api/blocks/${THU1}/999`, manager)).statusCode).toBe(404);
  });
});

describe("DELETE /api/blocks/:date/:slotId", () => {
  it("removes a block and is idempotent", async () => {
    await send("PUT", blockUrl(), manager);
    expect((await send("DELETE", blockUrl(), manager)).statusCode).toBe(204);
    expect(await prisma.block.count()).toBe(0);
    expect((await send("DELETE", blockUrl(), manager)).statusCode).toBe(204);
  });

  it("is manager only", async () => {
    expect((await send("DELETE", blockUrl(), cap1)).statusCode).toBe(403);
  });
});

describe("blocking versus booking", () => {
  it("never ends with both a block and a home game", async () => {
    const [block, book] = await Promise.all([
      send("PUT", blockUrl(), manager),
      send("POST", "/api/events", cap1, {
        teamId: w.teams[0]!.id,
        date: THU1,
        slotId: w.slot.id,
        type: "home",
        fieldId: w.fields[0]!.id,
      }),
    ]);
    const blocks = await prisma.block.count();
    const homes = await prisma.event.count({ where: { type: "home" } });
    expect(blocks + homes).toBe(1);
    if (block.statusCode === 200) expect(book.json().code).toBe("SLOT_BLOCKED");
    else expect(block.json().code).toBe("BLOCK_HAS_HOME_GAMES");
  });
});
```

- [ ] **Step 2: Run to see failure**

Run: `pnpm --filter @volley/api exec vitest run test/blocks.test.ts`
Expected: FAIL, block routes return 404.

- [ ] **Step 3: Implement the block routes**

`packages/api/src/routes/blocks.ts`:

```ts
import type { FastifyRequest } from "fastify";
import type { App } from "../app.js";
import { requireActor } from "../auth.js";
import { lockCells, toDate, transact, type Deps } from "../db.js";
import { AppError } from "../errors.js";
import { isoWeekday, isValidDate } from "../rules.js";

export function blockRoutes(app: App, deps: Deps): void {
  const { prisma } = deps;

  async function managerCell(req: FastifyRequest) {
    const actor = await requireActor(deps, req);
    if (actor.role !== "manager") throw new AppError("FORBIDDEN", "Only the manager can manage blocks");
    const params = req.params as { date: string; slotId: string };
    const slotId = Number(params.slotId);
    if (!isValidDate(params.date) || !Number.isInteger(slotId)) {
      throw new AppError("VALIDATION_ERROR", "date (YYYY-MM-DD) and slotId must be valid");
    }
    return { date: params.date, slotId };
  }

  app.put("/api/blocks/:date/:slotId", async (req) => {
    const cell = await managerCell(req);
    const slot = await prisma.slot.findUnique({ where: { id: cell.slotId } });
    if (!slot) throw new AppError("NOT_FOUND", "Slot not found");
    if (isoWeekday(cell.date) !== slot.weekday) {
      throw new AppError("WEEKDAY_MISMATCH", "The date does not fall on the weekday of this slot");
    }
    const raw = (req.body as { reason?: unknown } | null | undefined)?.reason;
    if (raw !== undefined && raw !== null && (typeof raw !== "string" || raw.length > 200)) {
      throw new AppError("VALIDATION_ERROR", "reason must be text of at most 200 characters");
    }
    const reason = typeof raw === "string" && raw.trim() !== "" ? raw.trim() : null;
    const date = toDate(cell.date);

    await transact(prisma, async (tx) => {
      await lockCells(tx, [cell]);
      const homes = await tx.event.count({ where: { date, slotId: cell.slotId, type: "home" } });
      if (homes > 0) throw new AppError("BLOCK_HAS_HOME_GAMES", "Home games exist in that slot, cancel them first");
      await tx.block.upsert({
        where: { date_slotId: { date, slotId: cell.slotId } },
        update: { reason },
        create: { date, slotId: cell.slotId, reason },
      });
    });
    return { date: cell.date, slotId: cell.slotId, reason };
  });

  app.delete("/api/blocks/:date/:slotId", async (req, reply) => {
    const cell = await managerCell(req);
    await prisma.block.deleteMany({ where: { date: toDate(cell.date), slotId: cell.slotId } });
    return reply.code(204).send();
  });
}
```

Modify `packages/api/src/app.ts`: add `import { blockRoutes } from "./routes/blocks.js";` and register it after `eventRoutes(app, deps);` with `blockRoutes(app, deps);`.

- [ ] **Step 4: Run the whole api suite**

Run: `pnpm --filter @volley/api test`
Expected: every file passes. Run `pnpm --filter @volley/api typecheck` and `pnpm --filter @volley/api build`.

- [ ] **Step 5: Commit**

```bash
git add packages/api
git commit -m "feat(api): add manager block routes with race protection"
```

### Task 8: Web scaffold and read-only pages

**Files:**
- Create: `packages/web/package.json`, `packages/web/tsconfig.json`, `packages/web/vite.config.ts`, `packages/web/index.html`
- Create: `packages/web/src/types.ts`, `src/api.ts`, `src/api-context.tsx`, `src/auth-context.tsx`, `src/hooks.ts`, `src/format.ts`, `src/styles.css`, `src/test-setup.ts`, `src/test-utils.tsx`
- Create: `packages/web/src/pages/CalendarPage.tsx`, `src/pages/TeamPage.tsx`, `src/App.tsx`, `src/main.tsx`
- Test: `packages/web/src/api.test.ts`, `src/format.test.ts`, `src/pages/CalendarPage.test.tsx`, `src/pages/TeamPage.test.tsx`

**Interfaces:**
- Consumes: the HTTP API from Tasks 4-7 (shapes below mirror those tasks exactly).
- Produces `src/types.ts`: `Role`, `User { id, username, role, teamId: number | null }`, `Team { id, name }`, `Field { id, name, size }`, `Slot { id, weekday, start, end }`, `Config { teams, fields, slots, seasonEnd, today }`, `CalendarSlot { slotId, blocked, blockReason: string | null, homeGames: { eventId, teamId, fieldId }[], awayGames: { eventId, teamId }[], practiceFieldIds: number[] }`, `CalendarDay { date, slots: CalendarSlot[] }`, `TeamStatus`, `TeamDay { date, slotId, status: TeamStatus, eventId: string | null, fieldId: number | null, practiceFieldIds: number[] }`, `EventView { id, teamId, date, slotId, type: "home" | "away", fieldId: number | null }`, `NewEventInput { teamId, date, slotId, type, fieldId: number | null }`.
- Produces `src/api.ts`:
  - `class ApiError extends Error { status: number; code: string }` (the message is the problem `detail`)
  - `type Api` with `config()`, `calendar(range?)`, `teamSchedule(teamId)`, `login(username, password)`, `logout()`, `me()` (resolves `null` on 401), `createEvent(input)`, `cancelEvent(id)`, `moveEvent(id, { date, slotId, fieldId })`, `blockSlot(date, slotId, reason?)`, `unblockSlot(date, slotId)`
  - `createApi(fetchImpl?: typeof fetch): Api`. It sends a JSON `Content-Type` only when there is a body.
- Produces `src/api-context.tsx`: `ApiProvider({ api, children })`, `useApi(): Api`. Produces `src/auth-context.tsx`: `AuthProvider({ children })`, `useAuth(): { user: User | null; loading: boolean; login(u: string, p: string): Promise<void>; logout(): Promise<void> }`.
- Produces `src/hooks.ts`: `useLoad<T>(fn: () => Promise<T>, deps: unknown[]): { data: T | null; error: string | null; loading: boolean; reload(): void }`.
- Produces `src/format.ts`: `formatDay("2026-10-22") === "Thu 22 Oct"`, `formatSlot(slot) === "20:00-22:00"`, `statusLabel(status)`, `errorMessage(e: unknown): string`.
- Produces `src/test-utils.tsx`: fixtures `config`, `calendar`, `schedule`, `makeApi(overrides?: Partial<Api>): Api` (all methods are `vi.fn`), and `renderWithApp(ui, { api?, route?, path? })`.

- [ ] **Step 1: Create the package files**

`packages/web/package.json`:

```json
{
  "name": "@volley/web",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:e2e": "playwright test"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.27.0"
  },
  "devDependencies": {
    "@playwright/test": "^1.48.0",
    "@testing-library/jest-dom": "^6.6.0",
    "@testing-library/react": "^16.0.0",
    "@testing-library/user-event": "^14.5.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.0",
    "jsdom": "^25.0.0",
    "vite": "^5.4.0"
  }
}
```

`packages/web/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "skipLibCheck": true,
    "noEmit": true,
    "types": ["vite/client", "@testing-library/jest-dom"]
  },
  "include": ["src", "e2e", "vite.config.ts", "playwright.config.ts"]
}
```

`packages/web/vite.config.ts`:

```ts
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  server: { proxy: { "/api": "http://localhost:3000" } },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test-setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
```

`packages/web/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="theme-color" content="#0b5fff" />
    <title>Volley reservations</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`packages/web/src/test-setup.ts`:

```ts
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(cleanup);
```

Run: `pnpm install`

- [ ] **Step 2: Write the types and the failing client and format tests**

`packages/web/src/types.ts`:

```ts
export type Role = "captain" | "manager";
export type User = { id: string; username: string; role: Role; teamId: number | null };
export type Team = { id: number; name: string };
export type Field = { id: number; name: string; size: string };
export type Slot = { id: number; weekday: number; start: string; end: string };
export type Config = { teams: Team[]; fields: Field[]; slots: Slot[]; seasonEnd: string; today: string };

export type CalendarSlot = {
  slotId: number;
  blocked: boolean;
  blockReason: string | null;
  homeGames: { eventId: string; teamId: number; fieldId: number }[];
  awayGames: { eventId: string; teamId: number }[];
  practiceFieldIds: number[];
};
export type CalendarDay = { date: string; slots: CalendarSlot[] };

export type TeamStatus = "home" | "away" | "unavailable" | "training" | "no_training";
export type TeamDay = {
  date: string;
  slotId: number;
  status: TeamStatus;
  eventId: string | null;
  fieldId: number | null;
  practiceFieldIds: number[];
};

export type EventView = {
  id: string;
  teamId: number;
  date: string;
  slotId: number;
  type: "home" | "away";
  fieldId: number | null;
};
export type NewEventInput = {
  teamId: number;
  date: string;
  slotId: number;
  type: "home" | "away";
  fieldId: number | null;
};
```

`packages/web/src/api.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { ApiError, createApi } from "./api";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("createApi", () => {
  it("sends a JSON content type only when there is a body", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(json(200, { teams: [] })).mockResolvedValueOnce(json(200, {}));
    const api = createApi(fetchImpl);
    await api.config();
    await api.login("a", "b");
    expect(fetchImpl.mock.calls[0]![1].headers).toBeUndefined();
    expect(fetchImpl.mock.calls[1]![1].headers).toEqual({ "content-type": "application/json" });
    expect(fetchImpl.mock.calls[1]![1].body).toBe(JSON.stringify({ username: "a", password: "b" }));
  });

  it("resolves void on 204", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    await expect(createApi(fetchImpl).cancelEvent("e1")).resolves.toBeUndefined();
    expect(fetchImpl).toHaveBeenCalledWith("/api/events/e1", expect.objectContaining({ method: "DELETE" }));
  });

  it("turns problem responses into ApiError", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json(409, { code: "FIELD_TAKEN", detail: "taken" }));
    const error = await createApi(fetchImpl).config().catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 409, code: "FIELD_TAKEN", message: "taken" });
  });

  it("returns null from me() on 401 but rethrows other errors", async () => {
    const unauth = vi.fn().mockResolvedValue(json(401, { code: "UNAUTHENTICATED", detail: "no" }));
    await expect(createApi(unauth).me()).resolves.toBeNull();
    const broken = vi.fn().mockResolvedValue(json(500, { code: "INTERNAL", detail: "boom" }));
    await expect(createApi(broken).me()).rejects.toBeInstanceOf(ApiError);
  });

  it("builds range queries and block requests", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json(200, { days: [] }));
    const api = createApi(fetchImpl);
    await api.calendar({ from: "2026-10-22", to: "2026-11-05" });
    expect(fetchImpl.mock.calls[0]![0]).toBe("/api/calendar?from=2026-10-22&to=2026-11-05");
    await api.blockSlot("2026-10-22", 1);
    expect(fetchImpl.mock.calls[1]![0]).toBe("/api/blocks/2026-10-22/1");
    expect(fetchImpl.mock.calls[1]![1].body).toBeUndefined();
    await api.blockSlot("2026-10-22", 1, "Hall closed");
    expect(fetchImpl.mock.calls[2]![1].body).toBe(JSON.stringify({ reason: "Hall closed" }));
  });
});
```

`packages/web/src/format.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { ApiError } from "./api";
import { errorMessage, formatDay, formatSlot, statusLabel } from "./format";

describe("format", () => {
  it("formats days and slots", () => {
    expect(formatDay("2026-10-22")).toBe("Thu 22 Oct");
    expect(formatDay("2027-01-03")).toBe("Sun 3 Jan");
    expect(formatSlot({ id: 1, weekday: 4, start: "20:00", end: "22:00" })).toBe("20:00-22:00");
  });

  it("labels statuses", () => {
    expect(statusLabel("home")).toBe("Home game");
    expect(statusLabel("no_training")).toBe("No training");
  });

  it("maps api errors to friendly text and falls back for unknown ones", () => {
    expect(errorMessage(new ApiError(409, "FIELD_TAKEN", "x"))).toBe("That field is already taken.");
    expect(errorMessage(new ApiError(500, "SOMETHING_NEW", "server said no"))).toBe("server said no");
    expect(errorMessage(new Error("net"))).toBe("Something went wrong, please try again.");
  });
});
```

- [ ] **Step 3: Run to see failure**

Run: `pnpm --filter @volley/web exec vitest run`
Expected: FAIL, `./api` and `./format` not found.

- [ ] **Step 4: Implement the client, format helpers, contexts and hook**

`packages/web/src/api.ts`:

```ts
import type { CalendarDay, Config, EventView, NewEventInput, TeamDay, User } from "./types";

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, detail: string) {
    super(detail);
    this.status = status;
    this.code = code;
  }
}

export type Api = {
  config(): Promise<Config>;
  calendar(range?: { from?: string; to?: string }): Promise<{ days: CalendarDay[] }>;
  teamSchedule(teamId: number, range?: { from?: string; to?: string }): Promise<{ teamId: number; days: TeamDay[] }>;
  login(username: string, password: string): Promise<User>;
  logout(): Promise<void>;
  me(): Promise<User | null>;
  createEvent(input: NewEventInput): Promise<EventView>;
  cancelEvent(id: string): Promise<void>;
  moveEvent(id: string, target: { date: string; slotId: number; fieldId: number | null }): Promise<EventView>;
  blockSlot(date: string, slotId: number, reason?: string): Promise<void>;
  unblockSlot(date: string, slotId: number): Promise<void>;
};

function query(range?: { from?: string; to?: string }): string {
  const params = new URLSearchParams();
  if (range?.from) params.set("from", range.from);
  if (range?.to) params.set("to", range.to);
  const text = params.toString();
  return text ? `?${text}` : "";
}

export function createApi(fetchImpl: typeof fetch = (input, init) => fetch(input, init)): Api {
  async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetchImpl(path, {
      method,
      credentials: "same-origin",
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (res.status === 204) return undefined as T;
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new ApiError(res.status, data?.code ?? "INTERNAL", data?.detail ?? res.statusText);
    return data as T;
  }

  return {
    config: () => request("GET", "/api/config"),
    calendar: (range) => request("GET", `/api/calendar${query(range)}`),
    teamSchedule: (teamId, range) => request("GET", `/api/teams/${teamId}/schedule${query(range)}`),
    login: (username, password) => request("POST", "/api/auth/login", { username, password }),
    logout: () => request("POST", "/api/auth/logout"),
    me: async () => {
      try {
        return await request<User>("GET", "/api/auth/me");
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return null;
        throw e;
      }
    },
    createEvent: (input) => request("POST", "/api/events", input),
    cancelEvent: (id) => request("DELETE", `/api/events/${id}`),
    moveEvent: (id, target) => request("POST", `/api/events/${id}/move`, target),
    blockSlot: (date, slotId, reason) =>
      request("PUT", `/api/blocks/${date}/${slotId}`, reason === undefined ? undefined : { reason }),
    unblockSlot: (date, slotId) => request("DELETE", `/api/blocks/${date}/${slotId}`),
  };
}
```

`packages/web/src/format.ts`:

```ts
import { ApiError } from "./api";
import type { Slot, TeamStatus } from "./types";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function formatDay(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

export const formatSlot = (slot: Slot): string => `${slot.start}-${slot.end}`;

const STATUS: Record<TeamStatus, string> = {
  home: "Home game",
  away: "Away game",
  unavailable: "Unavailable",
  training: "Training",
  no_training: "No training",
};
export const statusLabel = (status: TeamStatus): string => STATUS[status];

const ERRORS: Record<string, string> = {
  FIELD_TAKEN: "That field is already taken.",
  TEAM_BUSY: "This team already has an event in that slot.",
  SLOT_BLOCKED: "The slot is blocked on that date.",
  BLOCK_HAS_HOME_GAMES: "Home games exist in that slot, cancel them first.",
  FIELD_REQUIRED: "Choose a field for a home game.",
  FIELD_NOT_ALLOWED: "An away game has no field.",
  WEEKDAY_MISMATCH: "That date is not on the weekday of the slot.",
  DATE_IN_PAST: "That date is in the past.",
  OUT_OF_SEASON: "That date is after the end of the season.",
  FORBIDDEN: "You are not allowed to do that.",
  PAST_EVENT_MANAGER_ONLY: "Only the manager can change past events.",
  UNAUTHENTICATED: "Please sign in again.",
  RATE_LIMITED: "Too many attempts, try again later.",
};

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) return ERRORS[e.code] ?? e.message;
  return "Something went wrong, please try again.";
}
```

`packages/web/src/api-context.tsx`:

```tsx
import { createContext, useContext, type ReactNode } from "react";
import type { Api } from "./api";

const ApiContext = createContext<Api | null>(null);

export function ApiProvider({ api, children }: { api: Api; children: ReactNode }) {
  return <ApiContext.Provider value={api}>{children}</ApiContext.Provider>;
}

export function useApi(): Api {
  const api = useContext(ApiContext);
  if (!api) throw new Error("useApi must be used inside ApiProvider");
  return api;
}
```

`packages/web/src/auth-context.tsx`:

```tsx
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useApi } from "./api-context";
import type { User } from "./types";

type AuthValue = {
  user: User | null;
  loading: boolean;
  login(username: string, password: string): Promise<void>;
  logout(): Promise<void>;
};

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const api = useApi();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    api
      .me()
      .then((u) => alive && setUser(u))
      .catch(() => undefined)
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [api]);

  const value = useMemo<AuthValue>(
    () => ({
      user,
      loading,
      login: async (username, password) => setUser(await api.login(username, password)),
      logout: async () => {
        await api.logout();
        setUser(null);
      },
    }),
    [api, user, loading],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
```

`packages/web/src/hooks.ts`:

```ts
import { useEffect, useState } from "react";
import { errorMessage } from "./format";

type LoadState<T> = { data: T | null; error: string | null; loading: boolean };

export function useLoad<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [state, setState] = useState<LoadState<T>>({ data: null, error: null, loading: true });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true }));
    fn()
      .then((data) => alive && setState({ data, error: null, loading: false }))
      .catch((e) => alive && setState({ data: null, error: errorMessage(e), loading: false }));
    return () => {
      alive = false;
    };
    // fn is recreated on every render, callers pass the values it depends on in deps
  }, [...deps, tick]);

  return { ...state, reload: () => setTick((t) => t + 1) };
}
```

- [ ] **Step 5: Write test utilities and the failing page tests**

`packages/web/src/test-utils.tsx`:

```tsx
import { render } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { vi } from "vitest";
import type { Api } from "./api";
import { ApiProvider } from "./api-context";
import { AuthProvider } from "./auth-context";
import type { CalendarDay, Config, TeamDay, User } from "./types";

export const config: Config = {
  teams: [1, 2, 3, 4].map((id) => ({ id, name: `Team ${id}` })),
  fields: [
    { id: 1, name: "Field 1", size: "big" },
    { id: 2, name: "Field 2", size: "small" },
  ],
  slots: [{ id: 1, weekday: 4, start: "20:00", end: "22:00" }],
  seasonEnd: "2027-08-31",
  today: "2026-10-20",
};

export const calendar: { days: CalendarDay[] } = {
  days: [
    {
      date: "2026-10-22",
      slots: [
        {
          slotId: 1,
          blocked: false,
          blockReason: null,
          homeGames: [{ eventId: "e1", teamId: 1, fieldId: 1 }],
          awayGames: [{ eventId: "e2", teamId: 2 }],
          practiceFieldIds: [2],
        },
      ],
    },
    {
      date: "2026-10-29",
      slots: [
        { slotId: 1, blocked: true, blockReason: "Tournament", homeGames: [], awayGames: [], practiceFieldIds: [] },
      ],
    },
    {
      date: "2026-11-05",
      slots: [
        { slotId: 1, blocked: false, blockReason: null, homeGames: [], awayGames: [], practiceFieldIds: [1, 2] },
      ],
    },
  ],
};

export const schedule: { teamId: number; days: TeamDay[] } = {
  teamId: 1,
  days: [
    { date: "2026-10-22", slotId: 1, status: "home", eventId: "e1", fieldId: 1, practiceFieldIds: [2] },
    { date: "2026-10-29", slotId: 1, status: "unavailable", eventId: null, fieldId: null, practiceFieldIds: [] },
    { date: "2026-11-05", slotId: 1, status: "training", eventId: null, fieldId: null, practiceFieldIds: [1, 2] },
  ],
};

export const captain: User = { id: "u1", username: "captain1", role: "captain", teamId: 1 };
export const manager: User = { id: "u2", username: "manager", role: "manager", teamId: null };

export function makeApi(overrides: Partial<Api> = {}): Api {
  return {
    config: vi.fn().mockResolvedValue(config),
    calendar: vi.fn().mockResolvedValue(calendar),
    teamSchedule: vi.fn().mockResolvedValue(schedule),
    login: vi.fn().mockResolvedValue(captain),
    logout: vi.fn().mockResolvedValue(undefined),
    me: vi.fn().mockResolvedValue(null),
    createEvent: vi.fn().mockResolvedValue({}),
    cancelEvent: vi.fn().mockResolvedValue(undefined),
    moveEvent: vi.fn().mockResolvedValue({}),
    blockSlot: vi.fn().mockResolvedValue(undefined),
    unblockSlot: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

export function renderWithApp(
  ui: ReactElement,
  opts: { api?: Api; route?: string; path?: string } = {},
) {
  const api = opts.api ?? makeApi();
  const view = render(
    <ApiProvider api={api}>
      <AuthProvider>
        <MemoryRouter initialEntries={[opts.route ?? "/"]}>
          <Routes>
            <Route path={opts.path ?? "*"} element={ui} />
            <Route path="/login" element={<p>login page</p>} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    </ApiProvider>,
  );
  return { api, ...view };
}
```

`packages/web/src/pages/CalendarPage.test.tsx`:

```tsx
import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../api";
import { CalendarPage } from "./CalendarPage";
import { makeApi, renderWithApp } from "../test-utils";

describe("CalendarPage", () => {
  it("shows home games, away games, blocks and free practice fields", async () => {
    renderWithApp(<CalendarPage />);
    expect(await screen.findByText("Thu 22 Oct")).toBeInTheDocument();
    expect(screen.getAllByText("20:00-22:00")).toHaveLength(3);
    expect(screen.getByText("Team 1 on Field 1")).toBeInTheDocument();
    expect(screen.getByText("Team 2 away")).toBeInTheDocument();
    expect(screen.getByText("Free to practice: Field 2")).toBeInTheDocument();
    expect(screen.getByText("Blocked: Tournament")).toBeInTheDocument();
    expect(screen.getByText("Free to practice: Field 1, Field 2")).toBeInTheDocument();
  });

  it("shows an error when loading fails", async () => {
    const api = makeApi({ calendar: vi.fn().mockRejectedValue(new ApiError(500, "INTERNAL", "boom")) });
    renderWithApp(<CalendarPage />, { api });
    expect(await screen.findByRole("alert")).toHaveTextContent("boom");
  });
});
```

`packages/web/src/pages/TeamPage.test.tsx`:

```tsx
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { TeamPage } from "./TeamPage";
import { renderWithApp } from "../test-utils";

describe("TeamPage", () => {
  it("shows the status of the team per date", async () => {
    const { api } = renderWithApp(<TeamPage />, { route: "/team/1", path: "/team/:teamId?" });
    expect(await screen.findByText("Home game")).toBeInTheDocument();
    expect(screen.getByText("Unavailable")).toBeInTheDocument();
    expect(screen.getByText("Training")).toBeInTheDocument();
    expect(screen.getByText("Field 1, Field 2")).toBeInTheDocument();
    expect(api.teamSchedule).toHaveBeenCalledWith(1);
  });

  it("defaults to the first team and switches team from the selector", async () => {
    const { api } = renderWithApp(<TeamPage />, { route: "/team", path: "/team/:teamId?" });
    await screen.findByText("Home game");
    expect(api.teamSchedule).toHaveBeenCalledWith(1);
    await userEvent.selectOptions(screen.getByLabelText("Team"), "3");
    expect(api.teamSchedule).toHaveBeenCalledWith(3);
  });
});
```

- [ ] **Step 6: Implement the pages and the app shell**

`packages/web/src/pages/CalendarPage.tsx`:

```tsx
import { useApi } from "../api-context";
import { formatDay, formatSlot } from "../format";
import { useLoad } from "../hooks";

export function CalendarPage() {
  const api = useApi();
  const config = useLoad(() => api.config(), [api]);
  const calendar = useLoad(() => api.calendar(), [api]);

  const failure = config.error ?? calendar.error;
  if (failure) return <p role="alert">{failure}</p>;
  if (!config.data || !calendar.data) return <p>Loading...</p>;

  const cfg = config.data;
  const team = (id: number) => cfg.teams.find((t) => t.id === id)?.name ?? `Team ${id}`;
  const field = (id: number) => cfg.fields.find((f) => f.id === id)?.name ?? `Field ${id}`;
  const slotOf = (id: number) => cfg.slots.find((s) => s.id === id);

  return (
    <section>
      <h1>Club calendar</h1>
      <ul className="cards">
        {calendar.data.days.map((day) => (
          <li key={day.date} className="card">
            <h2>{formatDay(day.date)}</h2>
            {day.slots.map((s) => (
              <div key={s.slotId} className="slot">
                <p className="muted">{slotOf(s.slotId) ? formatSlot(slotOf(s.slotId)!) : ""}</p>
                {s.blocked && <p className="blocked">{s.blockReason ? `Blocked: ${s.blockReason}` : "Blocked"}</p>}
                {s.homeGames.map((g) => (
                  <p key={g.eventId}>{`${team(g.teamId)} on ${field(g.fieldId)}`}</p>
                ))}
                {s.awayGames.map((g) => (
                  <p key={g.eventId} className="muted">{`${team(g.teamId)} away`}</p>
                ))}
                {!s.blocked && (
                  <p className="practice">
                    {s.practiceFieldIds.length > 0
                      ? `Free to practice: ${s.practiceFieldIds.map(field).join(", ")}`
                      : "No free field"}
                  </p>
                )}
              </div>
            ))}
          </li>
        ))}
      </ul>
    </section>
  );
}
```

`packages/web/src/pages/TeamPage.tsx`:

```tsx
import { useNavigate, useParams } from "react-router-dom";
import { useApi } from "../api-context";
import { formatDay, statusLabel } from "../format";
import { useLoad } from "../hooks";

export function TeamPage() {
  const api = useApi();
  const navigate = useNavigate();
  const params = useParams();
  const config = useLoad(() => api.config(), [api]);
  const teamId = params["teamId"] ? Number(params["teamId"]) : (config.data?.teams[0]?.id ?? null);
  const schedule = useLoad(() => (teamId === null ? Promise.resolve(null) : api.teamSchedule(teamId)), [api, teamId]);

  const failure = config.error ?? schedule.error;
  if (failure) return <p role="alert">{failure}</p>;
  if (!config.data || !schedule.data) return <p>Loading...</p>;

  const cfg = config.data;
  const field = (id: number) => cfg.fields.find((f) => f.id === id)?.name ?? `Field ${id}`;

  return (
    <section>
      <h1>Team schedule</h1>
      <label>
        Team{" "}
        <select value={teamId ?? ""} onChange={(e) => navigate(`/team/${e.target.value}`)}>
          {cfg.teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </label>
      <ul className="cards">
        {schedule.data.days.map((d) => (
          <li key={`${d.date}|${d.slotId}`} className="card">
            <h2>{formatDay(d.date)}</h2>
            <p className={`status status-${d.status}`}>{statusLabel(d.status)}</p>
            {d.fieldId !== null && <p className="muted">{field(d.fieldId)}</p>}
            {d.status === "training" && <p className="muted">{d.practiceFieldIds.map(field).join(", ")}</p>}
          </li>
        ))}
      </ul>
    </section>
  );
}
```

`packages/web/src/App.tsx`:

```tsx
import { NavLink, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth-context";
import { CalendarPage } from "./pages/CalendarPage";
import { LoginPage } from "./pages/LoginPage";
import { ManagePage } from "./pages/ManagePage";
import { TeamPage } from "./pages/TeamPage";

export function App() {
  const { user, logout } = useAuth();
  return (
    <div className="app">
      <nav className="nav">
        <NavLink to="/" end>
          Calendar
        </NavLink>
        <NavLink to="/team">Team</NavLink>
        {user ? (
          <>
            <NavLink to="/manage">Manage</NavLink>
            <button type="button" onClick={() => void logout()}>
              Sign out
            </button>
          </>
        ) : (
          <NavLink to="/login">Sign in</NavLink>
        )}
      </nav>
      <main>
        <Routes>
          <Route path="/" element={<CalendarPage />} />
          <Route path="/team" element={<TeamPage />} />
          <Route path="/team/:teamId" element={<TeamPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/manage" element={<ManagePage />} />
          <Route path="*" element={<p>Page not found</p>} />
        </Routes>
      </main>
    </div>
  );
}
```

`packages/web/src/main.tsx`:

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { createApi } from "./api";
import { ApiProvider } from "./api-context";
import { App } from "./App";
import { AuthProvider } from "./auth-context";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ApiProvider api={createApi()}>
      <AuthProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </AuthProvider>
    </ApiProvider>
  </StrictMode>,
);

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js");
  });
}
```

`packages/web/src/styles.css`:

```css
:root {
  --brand: #0b5fff;
  --bg: #f6f7f9;
  --card: #ffffff;
  --text: #1b1f24;
  --muted: #5d6673;
  --danger: #b3261e;
}
* { box-sizing: border-box; }
body { margin: 0; font-family: system-ui, sans-serif; background: var(--bg); color: var(--text); }
.app { max-width: 40rem; margin: 0 auto; padding-bottom: 2rem; }
.nav { display: flex; gap: 0.25rem; padding: 0.5rem; background: var(--brand); position: sticky; top: 0; flex-wrap: wrap; }
.nav a, .nav button { color: #fff; background: transparent; border: 0; font: inherit; padding: 0.6rem 0.8rem; min-height: 44px; border-radius: 6px; text-decoration: none; }
.nav a.active { background: rgba(255, 255, 255, 0.25); }
main { padding: 0 0.75rem; }
h1 { font-size: 1.4rem; }
h2 { font-size: 1.05rem; margin: 0 0 0.25rem; }
.cards, .rows { list-style: none; padding: 0; margin: 1rem 0; display: grid; gap: 0.75rem; }
.card, .row { background: var(--card); border-radius: 10px; padding: 0.75rem; box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08); }
.card p, .row p { margin: 0.2rem 0; }
.muted { color: var(--muted); }
.blocked, [role="alert"] { color: var(--danger); }
.status-home { color: var(--brand); font-weight: 600; }
.row-head { display: flex; justify-content: space-between; gap: 0.5rem; }
.row-actions, .row form { display: flex; gap: 0.5rem; flex-wrap: wrap; margin-top: 0.5rem; align-items: center; }
button, select, input { font: inherit; min-height: 44px; padding: 0.4rem 0.7rem; }
button { background: var(--brand); color: #fff; border: 0; border-radius: 6px; }
button.secondary { background: #e3e7ee; color: var(--text); }
label { display: inline-flex; gap: 0.4rem; align-items: center; }
form.login { display: grid; gap: 0.75rem; max-width: 20rem; }
```

`LoginPage` and `ManagePage` are created in Task 9, so create temporary stubs only if you run the app before then. The tests of this task do not import them. Typecheck is run in Task 9.

- [ ] **Step 7: Run the tests**

Run: `pnpm --filter @volley/web exec vitest run`
Expected: api, format, CalendarPage and TeamPage tests pass.

- [ ] **Step 8: Commit**

```bash
git add packages/web pnpm-lock.yaml
git commit -m "feat(web): add app shell, api client and read-only calendar and team pages"
```

### Task 9: Sign in, reserve, cancel and move

**Files:**
- Create: `packages/web/src/pages/LoginPage.tsx`, `packages/web/src/pages/ManagePage.tsx`
- Test: `packages/web/src/pages/LoginPage.test.tsx`, `packages/web/src/pages/ManagePage.test.tsx`

**Interfaces:**
- Consumes: everything from Task 8 (`useApi`, `useAuth`, `useLoad`, `errorMessage`, `formatDay`, `statusLabel`, `makeApi`, `renderWithApp`, fixtures `captain`, `manager`, `calendar`, `schedule`, `config`).
- Produces `LoginPage` (route `/login`) and `ManagePage` (route `/manage`). `ManagePage` redirects to `/login` when signed out. A captain manages the own team, the manager picks any team. Every date row has these controls, with the date in the accessible name:
  - `Reserve <date>`: opens a form with type (Home or Away) and, for home, a field chosen from that date's free practice fields. Submitting calls `api.createEvent`.
  - `Cancel <date>` (own events): calls `api.cancelEvent(eventId)`.
  - `Move <date>`: opens a form with target date and, for home games, target field. Submitting calls `api.moveEvent`.
  - On any API failure the friendly message is shown in a `role="alert"` element. After success both the schedule and the calendar reload.

- [ ] **Step 1: Write the failing tests**

`packages/web/src/pages/LoginPage.test.tsx`:

```tsx
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../api";
import { LoginPage } from "./LoginPage";
import { captain, makeApi, renderWithApp } from "../test-utils";

describe("LoginPage", () => {
  it("signs in and goes to the manage page", async () => {
    const api = makeApi({ login: vi.fn().mockResolvedValue(captain) });
    renderWithApp(<LoginPage />, { api, route: "/login", path: "/login" });
    await userEvent.type(await screen.findByLabelText("Username"), "captain1");
    await userEvent.type(screen.getByLabelText("Password"), "secret");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(api.login).toHaveBeenCalledWith("captain1", "secret");
  });

  it("shows a clear message for wrong credentials", async () => {
    const api = makeApi({ login: vi.fn().mockRejectedValue(new ApiError(401, "UNAUTHENTICATED", "no")) });
    renderWithApp(<LoginPage />, { api, route: "/login", path: "/login" });
    await userEvent.type(await screen.findByLabelText("Username"), "x");
    await userEvent.type(screen.getByLabelText("Password"), "y");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid username or password.");
  });
});
```

`packages/web/src/pages/ManagePage.test.tsx`:

```tsx
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../api";
import { ManagePage } from "./ManagePage";
import { captain, makeApi, manager, renderWithApp } from "../test-utils";

const setup = (user = captain, overrides = {}) =>
  renderWithApp(<ManagePage />, {
    api: makeApi({ me: vi.fn().mockResolvedValue(user), ...overrides }),
    route: "/manage",
    path: "/manage",
  });

describe("ManagePage", () => {
  it("redirects to the login page when signed out", async () => {
    renderWithApp(<ManagePage />, { route: "/manage", path: "/manage" });
    expect(await screen.findByText("login page")).toBeInTheDocument();
  });

  it("lets a captain cancel an own event", async () => {
    const { api } = setup();
    await userEvent.click(await screen.findByRole("button", { name: "Cancel 2026-10-22" }));
    expect(api.cancelEvent).toHaveBeenCalledWith("e1");
    expect(api.teamSchedule).toHaveBeenCalledTimes(2);
  });

  it("reserves a home game on a free field", async () => {
    const { api } = setup();
    await userEvent.click(await screen.findByRole("button", { name: "Reserve 2026-11-05" }));
    await userEvent.selectOptions(screen.getByLabelText("Field"), "Field 2");
    await userEvent.click(screen.getByRole("button", { name: "Save 2026-11-05" }));
    expect(api.createEvent).toHaveBeenCalledWith({
      teamId: 1,
      date: "2026-11-05",
      slotId: 1,
      type: "home",
      fieldId: 2,
    });
  });

  it("reserves an away game without a field", async () => {
    const { api } = setup();
    await userEvent.click(await screen.findByRole("button", { name: "Reserve 2026-11-05" }));
    await userEvent.selectOptions(screen.getByLabelText("Type"), "away");
    await userEvent.click(screen.getByRole("button", { name: "Save 2026-11-05" }));
    expect(api.createEvent).toHaveBeenCalledWith({
      teamId: 1,
      date: "2026-11-05",
      slotId: 1,
      type: "away",
      fieldId: null,
    });
  });

  it("does not offer a home game when no field is free", async () => {
    setup();
    await userEvent.click(await screen.findByRole("button", { name: "Reserve 2026-10-29" }));
    expect(screen.getByRole("option", { name: "Home game" })).toBeDisabled();
    expect(screen.getByLabelText("Type")).toHaveValue("away");
  });

  it("moves a home game to another date and field", async () => {
    const { api } = setup();
    await userEvent.click(await screen.findByRole("button", { name: "Move 2026-10-22" }));
    await userEvent.selectOptions(screen.getByLabelText("New date"), "2026-11-05");
    await userEvent.selectOptions(screen.getByLabelText("New field"), "Field 2");
    await userEvent.click(screen.getByRole("button", { name: "Save 2026-10-22" }));
    expect(api.moveEvent).toHaveBeenCalledWith("e1", { date: "2026-11-05", slotId: 1, fieldId: 2 });
  });

  it("shows a friendly message when the server refuses", async () => {
    setup(captain, { createEvent: vi.fn().mockRejectedValue(new ApiError(409, "FIELD_TAKEN", "x")) });
    await userEvent.click(await screen.findByRole("button", { name: "Reserve 2026-11-05" }));
    await userEvent.click(screen.getByRole("button", { name: "Save 2026-11-05" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("That field is already taken.");
  });

  it("lets the manager pick a team", async () => {
    const { api } = setup(manager);
    await screen.findByRole("button", { name: "Cancel 2026-10-22" });
    expect(api.teamSchedule).toHaveBeenCalledWith(1);
    await userEvent.selectOptions(screen.getByLabelText("Team"), "2");
    expect(api.teamSchedule).toHaveBeenCalledWith(2);
  });
});
```

- [ ] **Step 2: Run to see failure**

Run: `pnpm --filter @volley/web exec vitest run src/pages`
Expected: FAIL, `./LoginPage` and `./ManagePage` not found.

- [ ] **Step 3: Implement the pages**

`packages/web/src/pages/LoginPage.tsx`:

```tsx
import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { ApiError } from "../api";
import { useAuth } from "../auth-context";
import { errorMessage } from "../format";

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await login(username, password);
      navigate("/manage");
    } catch (err) {
      setError(
        err instanceof ApiError && err.code === "UNAUTHENTICATED" ? "Invalid username or password." : errorMessage(err),
      );
    }
  }

  return (
    <section>
      <h1>Sign in</h1>
      <form className="login" onSubmit={submit}>
        <label>
          Username
          <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </label>
        {error && <p role="alert">{error}</p>}
        <button type="submit">Sign in</button>
      </form>
    </section>
  );
}
```

`packages/web/src/pages/ManagePage.tsx`:

```tsx
import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useApi } from "../api-context";
import { useAuth } from "../auth-context";
import { errorMessage, formatDay, statusLabel } from "../format";
import { useLoad } from "../hooks";
import type { CalendarSlot, Config, TeamDay, User } from "../types";

export function ManagePage() {
  const { user, loading } = useAuth();
  if (loading) return <p>Loading...</p>;
  if (!user) return <Navigate to="/login" replace />;
  return <ManageTeam user={user} />;
}

function ManageTeam({ user }: { user: User }) {
  const api = useApi();
  const config = useLoad(() => api.config(), [api]);
  const [picked, setPicked] = useState<number | null>(null);
  const teamId = user.role === "captain" ? user.teamId : (picked ?? config.data?.teams[0]?.id ?? null);
  const schedule = useLoad(() => (teamId === null ? Promise.resolve(null) : api.teamSchedule(teamId)), [api, teamId]);
  const calendar = useLoad(() => api.calendar(), [api]);
  const [error, setError] = useState<string | null>(null);

  const failure = config.error ?? schedule.error ?? calendar.error;
  if (failure) return <p role="alert">{failure}</p>;
  if (!config.data || !schedule.data || !calendar.data || teamId === null) return <p>Loading...</p>;

  const cfg = config.data;
  const slotsByKey = new Map(
    calendar.data.days.flatMap((d) => d.slots.map((s) => [`${d.date}|${s.slotId}`, s] as const)),
  );

  async function run(action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
      schedule.reload();
      calendar.reload();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <section>
      <h1>Manage</h1>
      {user.role === "manager" && (
        <label>
          Team
          <select value={teamId} onChange={(e) => setPicked(Number(e.target.value))}>
            {cfg.teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {error && <p role="alert">{error}</p>}
      <ul className="rows">
        {schedule.data.days.map((day) => (
          <DayRow
            key={`${day.date}|${day.slotId}`}
            day={day}
            slot={slotsByKey.get(`${day.date}|${day.slotId}`)}
            config={cfg}
            teamId={teamId}
            days={schedule.data!.days}
            run={run}
          />
        ))}
      </ul>
    </section>
  );
}

type RowProps = {
  day: TeamDay;
  slot: CalendarSlot | undefined;
  config: Config;
  teamId: number;
  days: TeamDay[];
  run: (action: () => Promise<unknown>) => Promise<void>;
};

function DayRow({ day, config, teamId, days, run }: RowProps) {
  const api = useApi();
  const [mode, setMode] = useState<"reserve" | "move" | null>(null);
  const fieldName = (id: number) => config.fields.find((f) => f.id === id)?.name ?? `Field ${id}`;

  const reserveFields = day.practiceFieldIds;
  const [type, setType] = useState<"home" | "away">(reserveFields.length > 0 ? "home" : "away");
  const [reserveField, setReserveField] = useState<number | null>(null);
  const chosenField = reserveField ?? reserveFields[0] ?? null;

  const [moveDate, setMoveDate] = useState(days[0]?.date ?? day.date);
  const [moveField, setMoveField] = useState<number | null>(null);
  const chosenMoveField = moveField ?? day.fieldId ?? config.fields[0]?.id ?? null;

  const toggle = (next: "reserve" | "move") => setMode(mode === next ? null : next);

  return (
    <li className="row">
      <div className="row-head">
        <strong>{formatDay(day.date)}</strong>
        <span className={`status status-${day.status}`}>{statusLabel(day.status)}</span>
        {day.fieldId !== null && <span className="muted">{fieldName(day.fieldId)}</span>}
      </div>
      <div className="row-actions">
        {day.eventId ? (
          <>
            <button type="button" aria-label={`Cancel ${day.date}`} onClick={() => void run(() => api.cancelEvent(day.eventId!))}>
              Cancel
            </button>
            <button type="button" className="secondary" aria-label={`Move ${day.date}`} onClick={() => toggle("move")}>
              Move
            </button>
          </>
        ) : (
          <button type="button" aria-label={`Reserve ${day.date}`} onClick={() => toggle("reserve")}>
            Reserve
          </button>
        )}
      </div>
      {mode === "reserve" && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              await api.createEvent({
                teamId,
                date: day.date,
                slotId: day.slotId,
                type,
                fieldId: type === "home" ? chosenField : null,
              });
              setMode(null);
            });
          }}
        >
          <label>
            Type
            <select value={type} onChange={(e) => setType(e.target.value as "home" | "away")}>
              <option value="home" disabled={reserveFields.length === 0}>
                Home game
              </option>
              <option value="away">Away game</option>
            </select>
          </label>
          {type === "home" && (
            <label>
              Field
              <select value={chosenField ?? ""} onChange={(e) => setReserveField(Number(e.target.value))}>
                {reserveFields.map((id) => (
                  <option key={id} value={id}>
                    {fieldName(id)}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button type="submit" aria-label={`Save ${day.date}`}>
            Save
          </button>
        </form>
      )}
      {mode === "move" && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              await api.moveEvent(day.eventId!, {
                date: moveDate,
                slotId: day.slotId,
                fieldId: day.status === "home" ? chosenMoveField : null,
              });
              setMode(null);
            });
          }}
        >
          <label>
            New date
            <select value={moveDate} onChange={(e) => setMoveDate(e.target.value)}>
              {days.map((d) => (
                <option key={d.date} value={d.date}>
                  {d.date}
                </option>
              ))}
            </select>
          </label>
          {day.status === "home" && (
            <label>
              New field
              <select value={chosenMoveField ?? ""} onChange={(e) => setMoveField(Number(e.target.value))}>
                {config.fields.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button type="submit" aria-label={`Save ${day.date}`}>
            Save
          </button>
        </form>
      )}
    </li>
  );
}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `pnpm --filter @volley/web exec vitest run`
Expected: all web tests pass. Then `pnpm --filter @volley/web typecheck` passes.

The move test selects "2026-11-05" in "New date": the options come from the team's schedule dates, so that date exists in the fixture.

- [ ] **Step 5: Try it in the browser**

Run in two terminals: `pnpm --filter @volley/api dev` and `pnpm --filter @volley/web dev`. Open `http://localhost:5173`, sign in as `captain1` with the seed password, reserve a home game, check it on the Calendar page, move it to another date and cancel it. Stop both servers.

- [ ] **Step 6: Commit**

```bash
git add packages/web
git commit -m "feat(web): add sign in and reserve, cancel and move for captains and manager"
```

### Task 10: Manager block and unblock

**Files:**
- Create: `packages/web/src/pages/BlockPanel.tsx`
- Modify: `packages/web/src/pages/ManagePage.tsx` (render the panel for managers)
- Test: `packages/web/src/pages/BlockPanel.test.tsx`

**Interfaces:**
- Consumes: `CalendarDay` and `Config` from `src/types.ts`, `useApi` (Task 8), `ManageTeam.run(action)` from Task 9 (runs the action, reloads schedule and calendar, shows errors in the shared `role="alert"`), `api.blockSlot(date, slotId, reason?)` and `api.unblockSlot(date, slotId)`.
- Produces: `BlockPanel({ days, config, run })`, shown only to the manager. Controls: select `Date` (unblocked dates only), input `Reason`, button `Block slot`, and one `Unblock <date>` button per blocked date.

- [ ] **Step 1: Write the failing tests**

`packages/web/src/pages/BlockPanel.test.tsx`:

```tsx
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../api";
import { ManagePage } from "./ManagePage";
import { captain, makeApi, manager, renderWithApp } from "../test-utils";

const setup = (user = manager, overrides = {}) =>
  renderWithApp(<ManagePage />, {
    api: makeApi({ me: vi.fn().mockResolvedValue(user), ...overrides }),
    route: "/manage",
    path: "/manage",
  });

describe("BlockPanel", () => {
  it("is not shown to captains", async () => {
    setup(captain);
    await screen.findByRole("button", { name: "Cancel 2026-10-22" });
    expect(screen.queryByRole("button", { name: "Block slot" })).not.toBeInTheDocument();
  });

  it("blocks a slot with a reason", async () => {
    const { api } = setup();
    await userEvent.selectOptions(await screen.findByLabelText("Date"), "2026-11-05");
    await userEvent.type(screen.getByLabelText("Reason"), "Hall closed");
    await userEvent.click(screen.getByRole("button", { name: "Block slot" }));
    expect(api.blockSlot).toHaveBeenCalledWith("2026-11-05", 1, "Hall closed");
    expect(api.calendar).toHaveBeenCalledTimes(2);
  });

  it("blocks without a reason", async () => {
    const { api } = setup();
    await screen.findByLabelText("Date");
    await userEvent.click(screen.getByRole("button", { name: "Block slot" }));
    expect(api.blockSlot).toHaveBeenCalledWith("2026-10-22", 1, undefined);
  });

  it("unblocks a blocked date", async () => {
    const { api } = setup();
    await userEvent.click(await screen.findByRole("button", { name: "Unblock 2026-10-29" }));
    expect(api.unblockSlot).toHaveBeenCalledWith("2026-10-29", 1);
  });

  it("explains why blocking is refused when home games exist", async () => {
    setup(manager, { blockSlot: vi.fn().mockRejectedValue(new ApiError(409, "BLOCK_HAS_HOME_GAMES", "x")) });
    await screen.findByLabelText("Date");
    await userEvent.click(screen.getByRole("button", { name: "Block slot" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Home games exist in that slot, cancel them first.");
  });
});
```

- [ ] **Step 2: Run to see failure**

Run: `pnpm --filter @volley/web exec vitest run src/pages/BlockPanel.test.tsx`
Expected: FAIL, no `Date` field in the manager view.

- [ ] **Step 3: Implement the panel and wire it in**

`packages/web/src/pages/BlockPanel.tsx`:

```tsx
import { useState } from "react";
import { useApi } from "../api-context";
import { formatDay } from "../format";
import type { CalendarDay, Config } from "../types";

type Props = {
  days: CalendarDay[];
  config: Config;
  run: (action: () => Promise<unknown>) => Promise<void>;
};

export function BlockPanel({ days, run }: Props) {
  const api = useApi();
  const free = days.filter((d) => d.slots.some((s) => !s.blocked));
  const blocked = days.flatMap((d) => d.slots.filter((s) => s.blocked).map((s) => ({ date: d.date, slot: s })));
  const [date, setDate] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const chosen = date ?? free[0]?.date ?? null;

  return (
    <section className="card">
      <h2>Block a slot</h2>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const day = days.find((d) => d.date === chosen);
          const slot = day?.slots.find((s) => !s.blocked);
          if (!day || !slot) return;
          void run(async () => {
            await api.blockSlot(day.date, slot.slotId, reason.trim() === "" ? undefined : reason.trim());
            setReason("");
          });
        }}
      >
        <label>
          Date
          <select value={chosen ?? ""} onChange={(e) => setDate(e.target.value)}>
            {free.map((d) => (
              <option key={d.date} value={d.date}>
                {d.date}
              </option>
            ))}
          </select>
        </label>
        <label>
          Reason
          <input value={reason} onChange={(e) => setReason(e.target.value)} />
        </label>
        <button type="submit">Block slot</button>
      </form>
      <ul className="rows">
        {blocked.map(({ date: d, slot }) => (
          <li key={`${d}|${slot.slotId}`} className="row">
            <div className="row-head">
              <strong>{formatDay(d)}</strong>
              <span className="muted">{slot.blockReason ?? "Blocked"}</span>
            </div>
            <div className="row-actions">
              <button
                type="button"
                className="secondary"
                aria-label={`Unblock ${d}`}
                onClick={() => void run(() => api.unblockSlot(d, slot.slotId))}
              >
                Unblock
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
```

In `packages/web/src/pages/ManagePage.tsx` add the import `import { BlockPanel } from "./BlockPanel";` and render the panel after the closing `</ul>` of the rows, inside the `<section>`:

```tsx
      {user.role === "manager" && <BlockPanel days={calendar.data.days} config={cfg} run={run} />}
```

- [ ] **Step 4: Run all web tests and typecheck**

Run: `pnpm --filter @volley/web exec vitest run`
Expected: all pass. Then `pnpm --filter @volley/web typecheck` passes.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/pages
git commit -m "feat(web): add manager block and unblock panel"
```

### Task 11: PWA polish, e2e and CI

**Files:**
- Create: `packages/web/public/manifest.webmanifest`, `packages/web/public/icon.svg`, `packages/web/public/sw.js`
- Modify: `packages/web/index.html` (manifest link)
- Create: `packages/web/playwright.config.ts`, `packages/web/e2e/reserve.spec.ts`
- Create: `.github/workflows/ci.yml`
- Modify: `README.md` (run, test and deploy notes)

**Interfaces:**
- Consumes: the service worker registration already in `src/main.tsx` (Task 8, production builds only), the seed users from Task 2 and the dev servers of Tasks 4 and 8.
- Produces: an installable PWA, a CI pipeline, and an optional e2e smoke test configured by `E2E_BASE_URL`, `E2E_USER` and `E2E_PASSWORD`.

- [ ] **Step 1: Add the manifest, icon and link**

`packages/web/public/manifest.webmanifest`:

```json
{
  "name": "Volley reservations",
  "short_name": "Volley",
  "start_url": "/",
  "scope": "/",
  "display": "standalone",
  "background_color": "#f6f7f9",
  "theme_color": "#0b5fff",
  "icons": [{ "src": "/icon.svg", "sizes": "any", "type": "image/svg+xml", "purpose": "any maskable" }]
}
```

`packages/web/public/icon.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#0b5fff" />
  <circle cx="256" cy="256" r="150" fill="#ffffff" />
  <path d="M256 106c40 60 40 240 0 300M106 256c60-40 240-40 300 0" fill="none" stroke="#0b5fff" stroke-width="18" />
</svg>
```

In `packages/web/index.html`, add inside `<head>` after the theme-color meta:

```html
    <link rel="manifest" href="/manifest.webmanifest" />
    <link rel="icon" href="/icon.svg" type="image/svg+xml" />
```

- [ ] **Step 2: Add the service worker**

`packages/web/public/sw.js`:

```js
const CACHE = "volley-shell-v1";
const SHELL = ["/", "/manifest.webmanifest", "/icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/api/")) {
    event.respondWith(
      fetch(request).catch(() => new Response(JSON.stringify({ code: "OFFLINE", detail: "You are offline." }), {
        status: 503,
        headers: { "content-type": "application/json" },
      })),
    );
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match("/")));
    return;
  }

  event.respondWith(
    caches.match(request).then(
      (hit) =>
        hit ||
        fetch(request).then((res) => {
          const copy = res.clone();
          void caches.open(CACHE).then((cache) => cache.put(request, copy));
          return res;
        }),
    ),
  );
});
```

API responses are never cached, so a captain never sees a stale schedule as if it were current. Only the app shell and hashed assets are served offline.

- [ ] **Step 3: Verify the build and the PWA basics**

Run: `pnpm --filter @volley/web build`
Expected: typecheck and Vite build succeed, `packages/web/dist` contains `manifest.webmanifest`, `icon.svg` and `sw.js`.

Run: `pnpm --filter @volley/web preview`, open `http://localhost:4173` in Chrome, DevTools > Application: the manifest has no errors, the service worker is activated, and "Install app" is offered. Stop the preview server.

- [ ] **Step 4: Add the optional e2e smoke test**

`packages/web/playwright.config.ts`:

```ts
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  use: { baseURL: process.env["E2E_BASE_URL"] ?? "http://localhost:5173", viewport: { width: 390, height: 844 } },
});
```

`packages/web/e2e/reserve.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

const user = process.env["E2E_USER"] ?? "captain1";
const password = process.env["E2E_PASSWORD"] ?? "";

test("captain reserves an away game and cancels it", async ({ page }) => {
  test.skip(password === "", "set E2E_PASSWORD to the seeded password of the e2e user");

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Club calendar" })).toBeVisible();

  await page.getByRole("link", { name: "Sign in" }).click();
  await page.getByLabel("Username").fill(user);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Manage" })).toBeVisible();

  const reserve = page.getByRole("button", { name: /^Reserve \d{4}-\d{2}-\d{2}$/ }).first();
  const label = (await reserve.getAttribute("aria-label")) ?? "";
  const date = label.replace("Reserve ", "");
  await reserve.click();
  await page.getByLabel("Type").selectOption("away");
  await page.getByRole("button", { name: `Save ${date}` }).click();

  const cancel = page.getByRole("button", { name: `Cancel ${date}` });
  await expect(cancel).toBeVisible();
  await cancel.click();
  await expect(page.getByRole("button", { name: `Reserve ${date}` })).toBeVisible();
});
```

Run (needs both dev servers and a seeded dev database): `E2E_PASSWORD=<seeded captain1 password> pnpm --filter @volley/web test:e2e`
Expected: 1 passed. Without the variable the test is skipped. The e2e test is not part of CI.

- [ ] **Step 5: Add CI**

`.github/workflows/ci.yml`:

```yaml
name: ci

on:
  push:
    branches: [main]
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_USER: volley
          POSTGRES_PASSWORD: volley
          POSTGRES_DB: volley_test
        ports:
          - 5433:5432
        options: >-
          --health-cmd "pg_isready -U volley"
          --health-interval 5s
          --health-timeout 5s
          --health-retries 10
    env:
      DATABASE_URL: postgresql://volley:volley@localhost:5433/volley_test
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter @volley/api exec prisma generate
      - run: pnpm -r typecheck
      - run: pnpm -r test
      - run: pnpm --filter @volley/web build
```

If the root `package.json` does not pin `packageManager`, add `"packageManager": "pnpm@9.12.0"` (or the version you use locally) so `pnpm/action-setup` can resolve it.

- [ ] **Step 6: Document run, test and deploy in the README**

Append to `README.md`:

````markdown
## Development

```bash
docker compose up -d
pnpm install
cp packages/api/.env.example packages/api/.env
pnpm --filter @volley/api exec prisma generate
pnpm --filter @volley/api exec prisma migrate deploy
pnpm --filter @volley/api seed
pnpm --filter @volley/api dev     # http://localhost:3000
pnpm --filter @volley/web dev     # http://localhost:5173, proxies /api
```

## Tests

```bash
pnpm -r typecheck
pnpm -r test                      # api tests need the volley_test database from docker compose
```

## Deploy

Build with `pnpm --filter @volley/web build` and serve `packages/web/dist` and the API from the same origin
(for example one reverse proxy that serves the static files and forwards `/api` to the Fastify process).
Set `NODE_ENV=production` so the session cookie is `Secure`, and serve over HTTPS (required for the service worker).
````

- [ ] **Step 7: Run the whole suite and commit**

Run: `pnpm -r typecheck` then `pnpm -r test`
Expected: both pass for `@volley/api` and `@volley/web`.

```bash
git add packages/web .github README.md
git commit -m "feat: add PWA manifest and service worker, e2e smoke test and CI"
```

## Self-Review

**Spec coverage** (checked against `docs/superpowers/specs/2026-10-20-volleyball-reservations-design.md`):

- Reserve a home game on a free field, enter an away game: Tasks 6 (API) and 9 (UI).
- Cancel and move for the own team, manager for any team: Tasks 3 (`assertOwnsTeam`, `assertCanModify`), 6 and 9.
- Manager blocks and unblocks slots, refused while home games exist: Tasks 7 and 10.
- Public read-only club calendar and per-team view, practice fields derived from free fields: Tasks 3, 4 and 8.
- No double booking of a field or a team under concurrency: DB unique constraints (Task 1), advisory locks and transactional move (Task 6), race tests in Tasks 6 and 7.
- Accounts for captains and the manager, secure sessions and rate limiting: Tasks 2 and 5.
- Mobile-first installable PWA: Tasks 8 and 11.
- Deferred on purpose, as agreed: the Java port, OpenAPI codegen and a separate api-tests suite.

**Placeholder scan:** no TBD or TODO markers. The only intentionally open points are the two notes in Tasks 1 and 6 about confirming the Prisma P2002 error shape under `@prisma/adapter-pg`, with concrete instructions on how to adjust `conflictFromUnique`.

**Type and name consistency:** API shapes in `packages/web/src/types.ts` mirror the response shapes of Tasks 4 to 7 (`config`, `calendar`, `teams/:id/schedule`, `events`, `blocks`, `auth`). Error codes in `packages/web/src/format.ts` match the `ErrorCode` union in `packages/api/src/errors.ts`. The `run(action)` helper introduced in Task 9 is the same one `BlockPanel` consumes in Task 10.
