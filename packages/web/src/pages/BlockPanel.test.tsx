import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../api";
import { ManagePage } from "./ManagePage";
import { calendar, captain, makeApi, manager, renderWithApp } from "../test-utils";

const setup = (user = manager, overrides = {}) =>
  renderWithApp(<ManagePage />, {
    api: makeApi({ me: vi.fn().mockResolvedValue(user), ...overrides }),
    route: "/manage",
    path: "/manage",
  });

describe("BlockPanel", () => {
  it("is not shown to captains", async () => {
    setup(captain);
    await screen.findByRole("button", { name: "Cancel 2026-10-22" });
    expect(screen.queryByRole("button", { name: "Block slot" })).not.toBeInTheDocument();
  });

  it("blocks a slot with a reason", async () => {
    const { api } = setup();
    await userEvent.selectOptions(await screen.findByLabelText("Date"), "2026-11-05");
    await userEvent.type(screen.getByLabelText("Reason"), "Hall closed");
    await userEvent.click(screen.getByRole("button", { name: "Block slot" }));
    expect(api.blockSlot).toHaveBeenCalledWith("2026-11-05", 1, "Hall closed");
    expect(api.calendar).toHaveBeenCalledTimes(2);
    expect(api.teamSchedule).toHaveBeenCalledTimes(2);
  });

  it("blocks without a reason", async () => {
    const { api } = setup();
    await screen.findByLabelText("Date");
    await userEvent.click(screen.getByRole("button", { name: "Block slot" }));
    expect(api.blockSlot).toHaveBeenCalledWith("2026-10-22", 1, undefined);
  });

  it("keeps the selected date valid after a block reloads the calendar", async () => {
    const blockedNov5 = {
      days: calendar.days.map((d) =>
        d.date === "2026-11-05"
          ? { ...d, slots: d.slots.map((s) => ({ ...s, blocked: true, blockReason: "Hall closed" })) }
          : d,
      ),
    };
    const { api } = setup(manager, {
      calendar: vi.fn().mockResolvedValueOnce(calendar).mockResolvedValue(blockedNov5),
    });
    await userEvent.selectOptions(await screen.findByLabelText("Date"), "2026-11-05");
    await userEvent.click(screen.getByRole("button", { name: "Block slot" }));
    await waitFor(() => expect(api.calendar).toHaveBeenCalledTimes(2));
    await screen.findByRole("button", { name: "Unblock 2026-11-05" });
    await userEvent.click(screen.getByRole("button", { name: "Block slot" }));
    expect(api.blockSlot).toHaveBeenNthCalledWith(2, "2026-10-22", 1, undefined);
    expect(screen.getByLabelText("Date")).toHaveValue("2026-10-22");
  });

  it("unblocks a blocked date", async () => {
    const { api } = setup();
    await userEvent.click(await screen.findByRole("button", { name: "Unblock 2026-10-29" }));
    expect(api.unblockSlot).toHaveBeenCalledWith("2026-10-29", 1);
    await waitFor(() => expect(api.calendar).toHaveBeenCalledTimes(2));
    expect(api.teamSchedule).toHaveBeenCalledTimes(2);
  });

  it("explains why blocking is refused when home games exist", async () => {
    setup(manager, { blockSlot: vi.fn().mockRejectedValue(new ApiError(409, "BLOCK_HAS_HOME_GAMES", "x")) });
    await screen.findByLabelText("Date");
    await userEvent.click(screen.getByRole("button", { name: "Block slot" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Home games exist in that slot, cancel them first.");
  });
});
