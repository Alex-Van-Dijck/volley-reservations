import { describe, expect, it } from "vitest";
import { ApiError } from "./api";
import { errorMessage, formatDay, slotTime, statusLabel } from "./format";
import { config } from "./test-utils";

describe("format", () => {
  it("formats days and slots", () => {
    expect(formatDay("2026-10-22")).toBe("Thu 22 Oct");
    expect(formatDay("2027-01-03")).toBe("Sun 3 Jan");
    expect(slotTime(config, 1)).toBe("20:00-22:00");
    expect(slotTime(config, 99)).toBe("");
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
