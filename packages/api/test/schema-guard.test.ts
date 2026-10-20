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
