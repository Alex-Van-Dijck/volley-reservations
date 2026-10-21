import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { App } from "../src/app.js";
import { toDate } from "../src/dates.js";
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
    ["FIELD_REQUIRED", () => bookBody(0, THU1, "home", null)],
    ["FIELD_NOT_ALLOWED", () => bookBody(0, THU1, "away", 0)],
    ["WEEKDAY_MISMATCH", () => bookBody(0, "2026-10-23", "away", null)],
    ["DATE_IN_PAST", () => bookBody(0, PAST_THU, "away", null)],
    ["OUT_OF_SEASON", () => bookBody(0, "2027-09-02", "away", null)],
  ])("rejects %s with 422", async (code, makeBody) => {
    const res = await send("POST", "/api/events", manager, makeBody());
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

  it("rejects an impossible calendar date", async () => {
    const res = await send("POST", "/api/events", manager, bookBody(0, "2026-02-30", "away", null));
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe("VALIDATION_ERROR");
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
