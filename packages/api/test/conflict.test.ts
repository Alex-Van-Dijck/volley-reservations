import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { conflictFromUnique, toDate } from "../src/db.js";
import { AppError } from "../src/errors.js";
import { clearBookings, testPrisma } from "./db.js";
import { seedWorld, type World } from "./helpers.js";

const prisma = testPrisma();
let w: World;

const THU = "2026-10-22";

const insert = (teamIdx: number, fieldIdx: number) =>
  prisma.event.create({
    data: {
      teamId: w.teams[teamIdx]!.id,
      date: toDate(THU),
      slotId: w.slot.id,
      type: "home",
      fieldId: w.fields[fieldIdx]!.id,
      createdBy: w.manager.id,
    },
  });

async function uniqueViolation(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (e) {
    return e;
  }
  throw new Error("expected a unique constraint violation");
}

beforeAll(async () => {
  w = await seedWorld(prisma);
});
afterAll(async () => {
  await prisma.$disconnect();
});

describe("conflictFromUnique", () => {
  it("maps a real violation of the field constraint to FIELD_TAKEN", async () => {
    await clearBookings(prisma);
    await insert(0, 0);
    const err = await uniqueViolation(insert(1, 0));
    expect((err as { code?: string }).code).toBe("P2002");
    const mapped = conflictFromUnique(err);
    expect(mapped).toBeInstanceOf(AppError);
    expect(mapped?.code).toBe("FIELD_TAKEN");
  });

  it("maps a real violation of the team constraint to TEAM_BUSY", async () => {
    await clearBookings(prisma);
    await insert(0, 0);
    const err = await uniqueViolation(insert(0, 1));
    expect((err as { code?: string }).code).toBe("P2002");
    const mapped = conflictFromUnique(err);
    expect(mapped).toBeInstanceOf(AppError);
    expect(mapped?.code).toBe("TEAM_BUSY");
  });

  it("returns null for errors that are not unique violations", () => {
    expect(conflictFromUnique(new Error("boom"))).toBeNull();
    expect(conflictFromUnique(null)).toBeNull();
  });
});
