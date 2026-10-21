import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { App } from "../src/app.js";
import { lockCells, toDate, transact } from "../src/db.js";
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
  cap1 = await loginAs(app, "koen", PASSWORDS.captain);
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
  it("queues both writers behind the cell lock and keeps block and home game exclusive", async () => {
    let locked!: () => void;
    const lockHeld = new Promise<void>((resolve) => (locked = resolve));
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const holder = transact(prisma, async (tx) => {
      await lockCells(tx, [{ date: THU1, slotId: w.slot.id }]);
      locked();
      await gate;
    });
    await lockHeld;

    const settled = { block: false, book: false };
    const blockReq = send("PUT", blockUrl(), manager).then((res) => {
      settled.block = true;
      return res;
    });
    const bookReq = send("POST", "/api/events", cap1, {
      teamId: w.teams[0]!.id,
      date: THU1,
      slotId: w.slot.id,
      type: "home",
      fieldId: w.fields[0]!.id,
    }).then((res) => {
      settled.book = true;
      return res;
    });

    await new Promise((resolve) => setTimeout(resolve, 200));
    const whileLocked = { ...settled };
    release();
    await holder;
    const [block, book] = await Promise.all([blockReq, bookReq]);

    expect(whileLocked).toEqual({ block: false, book: false });
    const blocks = await prisma.block.count();
    const homes = await prisma.event.count({ where: { type: "home" } });
    expect(blocks + homes).toBe(1);
    if (block.statusCode === 200) {
      expect(blocks).toBe(1);
      expect(book.statusCode).toBe(409);
      expect(book.json().code).toBe("SLOT_BLOCKED");
    } else {
      expect(homes).toBe(1);
      expect(block.statusCode).toBe(409);
      expect(block.json().code).toBe("BLOCK_HAS_HOME_GAMES");
      expect(book.statusCode).toBe(201);
    }
  });
});
