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
