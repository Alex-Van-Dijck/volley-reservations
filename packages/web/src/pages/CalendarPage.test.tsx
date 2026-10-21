import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../api";
import { CalendarPage } from "./CalendarPage";
import { makeApi, renderWithApp } from "../test-utils";

const selectedPanel = () => screen.getByRole("region", { name: "Selected day" });

describe("CalendarPage", () => {
  it("opens on the first day from today with its details", async () => {
    renderWithApp(<CalendarPage />);
    expect(await screen.findByRole("heading", { level: 2, name: "Thu 22 Oct" })).toBeInTheDocument();
    const panel = within(selectedPanel());
    expect(panel.getByText("20:00-22:00")).toBeInTheDocument();
    expect(panel.getByText("Field 1").nextElementSibling).toHaveTextContent("Team 1");
    expect(panel.getByText("Field 2").nextElementSibling).toHaveTextContent("Free to practice");
    expect(panel.getByText("Team 2 away")).toBeInTheDocument();
  });

  it("shows the status of each day with events and disables days without", async () => {
    renderWithApp(<CalendarPage />);
    expect(await screen.findByRole("button", { name: "Thu 22 Oct, Home game" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Thu 29 Oct, Unavailable" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Wed 21 Oct, no events" })).toBeDisabled();
  });

  it("shows another day when it is selected", async () => {
    renderWithApp(<CalendarPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Thu 29 Oct, Unavailable" }));
    expect(screen.getByRole("heading", { level: 2, name: "Thu 29 Oct" })).toBeInTheDocument();
    expect(within(selectedPanel()).getByText("Blocked: Tournament")).toBeInTheDocument();
  });

  it("moves between months that have data", async () => {
    renderWithApp(<CalendarPage />);
    expect(await screen.findByRole("heading", { level: 1, name: "October 2026" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous month" })).toBeDisabled();

    await userEvent.click(screen.getByRole("button", { name: "Next month" }));
    expect(screen.getByRole("heading", { level: 1, name: "November 2026" })).toBeInTheDocument();
    expect(within(selectedPanel()).getAllByText("Free to practice")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Next month" })).toBeDisabled();

    await userEvent.click(screen.getByRole("button", { name: "Previous month" }));
    expect(screen.getByRole("heading", { level: 1, name: "October 2026" })).toBeInTheDocument();
  });

  it("shows an error when loading fails", async () => {
    const api = makeApi({ calendar: vi.fn().mockRejectedValue(new ApiError(500, "INTERNAL", "boom")) });
    renderWithApp(<CalendarPage />, { api });
    expect(await screen.findByRole("alert")).toHaveTextContent("boom");
  });
});
