import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../api";
import { ManagePage } from "./ManagePage";
import { captain, makeApi, manager, renderWithApp } from "../test-utils";

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
    await userEvent.selectOptions(screen.getByLabelText("New date"), "2026-11-05");
    await userEvent.selectOptions(screen.getByLabelText("New field"), "Field 2");
    await userEvent.click(screen.getByRole("button", { name: "Save 2026-10-22" }));
    expect(api.moveEvent).toHaveBeenCalledWith("e1", { date: "2026-11-05", slotId: 1, fieldId: 2 });
  });

  it("shows a friendly message when the server refuses", async () => {
    setup(captain, { createEvent: vi.fn().mockRejectedValue(new ApiError(409, "FIELD_TAKEN", "x")) });
    await userEvent.click(await screen.findByRole("button", { name: "Reserve 2026-11-05" }));
    await userEvent.click(screen.getByRole("button", { name: "Save 2026-11-05" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("That field is already taken.");
  });

  it("lets the manager pick a team", async () => {
    const { api } = setup(manager);
    await screen.findByRole("button", { name: "Cancel 2026-10-22" });
    expect(api.teamSchedule).toHaveBeenCalledWith(1);
    await userEvent.selectOptions(screen.getByLabelText("Team"), "2");
    expect(api.teamSchedule).toHaveBeenCalledWith(2);
  });
});
