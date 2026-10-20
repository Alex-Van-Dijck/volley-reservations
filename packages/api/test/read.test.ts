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

  it("returns no days when the range starts after the season end", async () => {
    const res = await app.inject({ url: "/api/calendar?from=2027-09-01&to=2027-09-30" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ days: [] });
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

  it("returns no days when the range starts after the season end", async () => {
    const res = await app.inject({ url: `/api/teams/${w.teams[0]!.id}/schedule?from=2027-09-01&to=2027-09-30` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ teamId: w.teams[0]!.id, days: [] });
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
