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
