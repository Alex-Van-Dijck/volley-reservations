import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../api";
import { ManagePage } from "./ManagePage";
import { captain, makeApi, manager, renderWithApp, schedule } from "../test-utils";

const setup = (user = captain, overrides = {}) =>
  renderWithApp(<ManagePage />, {
    api: makeApi({ me: vi.fn().mockResolvedValue(user), ...overrides }),
    route: "/manage",
    path: "/manage",
  });

describe("ManagePage", () => {
  it("redirects to the login page when signed out", async () => {
    renderWithApp(<ManagePage />, { route: "/manage", path: "/manage" });
    expect(await screen.findByText("login page")).toBeInTheDocument();
  });

  it("lets a captain cancel an own event", async () => {
    const { api } = setup();
    await userEvent.click(await screen.findByRole("button", { name: "Cancel 2026-10-22" }));
    expect(api.cancelEvent).toHaveBeenCalledWith("e1");
    expect(api.teamSchedule).toHaveBeenCalledTimes(2);
    expect(api.calendar).toHaveBeenCalledTimes(2);
  });

  it("reserves a home game on a free field", async () => {
    const { api } = setup();
    await userEvent.click(await screen.findByRole("button", { name: "Reserve 2026-11-05" }));
    await userEvent.selectOptions(screen.getByLabelText("Field"), "Field 2");
    await userEvent.click(screen.getByRole("button", { name: "Save 2026-11-05" }));
    expect(api.createEvent).toHaveBeenCalledWith({
      teamId: 1,
      date: "2026-11-05",
      slotId: 1,
      type: "home",
      fieldId: 2,
    });
  });

  it("reserves an away game without a field", async () => {
    const { api } = setup();
    await userEvent.click(await screen.findByRole("button", { name: "Reserve 2026-11-05" }));
    await userEvent.selectOptions(screen.getByLabelText("Type"), "away");
    await userEvent.click(screen.getByRole("button", { name: "Save 2026-11-05" }));
    expect(api.createEvent).toHaveBeenCalledWith({
      teamId: 1,
      date: "2026-11-05",
      slotId: 1,
      type: "away",
      fieldId: null,
    });
  });

  it("does not offer a home game when no field is free", async () => {
    setup();
    await userEvent.click(await screen.findByRole("button", { name: "Reserve 2026-10-29" }));
    expect(screen.getByRole("option", { name: "Home game" })).toBeDisabled();
    expect(screen.getByLabelText("Type")).toHaveValue("away");
  });

  it("moves a home game to another date and field", async () => {
    const { api } = setup();
    await userEvent.click(await screen.findByRole("button", { name: "Move 2026-10-22" }));
    await userEvent.selectOptions(screen.getByLabelText("New date"), "Thu 5 Nov");
    await userEvent.selectOptions(screen.getByLabelText("New field"), "Field 2");
    await userEvent.click(screen.getByRole("button", { name: "Save 2026-10-22" }));
    expect(api.moveEvent).toHaveBeenCalledWith("e1", { date: "2026-11-05", slotId: 1, fieldId: 2 });
  });

  it("keeps a move on the game's own date when only the field changes", async () => {
    const { api } = setup(captain, {
      teamSchedule: vi.fn().mockResolvedValue({
        teamId: 1,
        days: [
          { date: "2026-10-22", slotId: 1, status: "home", eventId: "e1", fieldId: 1, practiceFieldIds: [2] },
          { date: "2026-11-05", slotId: 1, status: "home", eventId: "e3", fieldId: 1, practiceFieldIds: [1, 2] },
        ],
      }),
    });
    await userEvent.click(await screen.findByRole("button", { name: "Move 2026-11-05" }));
    await userEvent.selectOptions(screen.getByLabelText("New field"), "Field 2");
    await userEvent.click(screen.getByRole("button", { name: "Save 2026-11-05" }));
    expect(api.moveEvent).toHaveBeenCalledWith("e3", { date: "2026-11-05", slotId: 1, fieldId: 2 });
  });

  it("closes an open move form when the manager switches team", async () => {
    const team2Schedule = {
      teamId: 2,
      days: [{ date: "2026-10-22", slotId: 1, status: "training", eventId: null, fieldId: null, practiceFieldIds: [2] }],
    };
    const { api } = setup(manager, {
      teamSchedule: vi.fn((teamId: number) => Promise.resolve(teamId === 2 ? team2Schedule : schedule)),
    });
    await userEvent.click(await screen.findByRole("button", { name: "Move 2026-10-22" }));
    expect(screen.getByLabelText("New date")).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText("Team"), "2");
    expect(await screen.findByRole("button", { name: "Reserve 2026-10-22" })).toBeInTheDocument();
    expect(screen.queryByLabelText("New date")).not.toBeInTheDocument();
    expect(api.moveEvent).not.toHaveBeenCalled();
  });

  it("shows a friendly message when the server refuses", async () => {
    setup(captain, { createEvent: vi.fn().mockRejectedValue(new ApiError(409, "FIELD_TAKEN", "x")) });
    await userEvent.click(await screen.findByRole("button", { name: "Reserve 2026-11-05" }));
    await userEvent.click(screen.getByRole("button", { name: "Save 2026-11-05" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("That field is already taken.");
  });

  it("only offers fields that are free on the target date when moving", async () => {
    setup();
    await userEvent.click(await screen.findByRole("button", { name: "Move 2026-10-22" }));
    const field = screen.getByLabelText("New field");
    expect(within(field).getAllByRole("option").map((o) => o.textContent)).toEqual(["Field 1", "Field 2"]);
    await userEvent.selectOptions(screen.getByLabelText("New date"), "Thu 29 Oct");
    expect(screen.getByLabelText("New field")).toHaveDisplayValue("No free field");
    expect(screen.getByRole("button", { name: "Save 2026-10-22" })).toBeDisabled();
  });

  it("ignores a second click while a request is running", async () => {
    let finish = () => {};
    const { api } = setup(captain, {
      cancelEvent: vi.fn(() => new Promise<void>((resolve) => (finish = resolve))),
    });
    const cancel = await screen.findByRole("button", { name: "Cancel 2026-10-22" });
    await userEvent.click(cancel);
    await userEvent.click(cancel);
    expect(api.cancelEvent).toHaveBeenCalledTimes(1);
    finish();
  });

  it("explains when a captain has no team", async () => {
    setup({ ...captain, teamId: null });
    expect(await screen.findByRole("alert")).toHaveTextContent("not linked to a team");
  });

  it("lets the manager pick a team", async () => {
    const { api } = setup(manager);
    await screen.findByRole("button", { name: "Cancel 2026-10-22" });
    expect(api.teamSchedule).toHaveBeenCalledWith(1);
    await userEvent.selectOptions(screen.getByLabelText("Team"), "2");
    expect(api.teamSchedule).toHaveBeenCalledWith(2);
  });
});
