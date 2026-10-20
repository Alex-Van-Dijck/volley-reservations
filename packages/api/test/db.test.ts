import { describe, expect, it } from "vitest";
import { fmtDate, fmtTime, toDate } from "../src/db.js";

describe("date mapper", () => {
  it.each(["2026-03-29", "2026-10-25", "2026-12-31", "2027-01-01"])("round-trips the date %s", (date) => {
    expect(fmtDate(toDate(date))).toBe(date);
  });

  it("maps a date to UTC midnight", () => {
    expect(toDate("2026-03-29").toISOString()).toBe("2026-03-29T00:00:00.000Z");
  });

  it("keeps the calendar day across the spring DST change", () => {
    expect(fmtDate(toDate("2026-03-29"))).toBe("2026-03-29");
    expect(fmtDate(toDate("2026-03-30"))).toBe("2026-03-30");
  });

  it("keeps the calendar day across the autumn DST change", () => {
    expect(fmtDate(toDate("2026-10-25"))).toBe("2026-10-25");
    expect(fmtDate(toDate("2026-10-26"))).toBe("2026-10-26");
  });

  it("keeps the calendar day across the year boundary", () => {
    expect(fmtDate(toDate("2026-12-31"))).toBe("2026-12-31");
    expect(fmtDate(toDate("2027-01-01"))).toBe("2027-01-01");
  });

  it("formats a time-of-day as HH:MM in UTC", () => {
    expect(fmtTime(new Date("1970-01-01T20:00:00Z"))).toBe("20:00");
    expect(fmtTime(new Date("1970-01-01T09:05:00Z"))).toBe("09:05");
  });
});
