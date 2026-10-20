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
