import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../api";
import { CalendarPage } from "./CalendarPage";
import { makeApi, renderWithApp } from "../test-utils";

describe("CalendarPage", () => {
  it("shows home games, away games, blocks and free practice fields", async () => {
    renderWithApp(<CalendarPage />);
    expect(await screen.findByText("Thu 22 Oct")).toBeInTheDocument();
    expect(screen.getAllByText("20:00-22:00")).toHaveLength(3);
    expect(screen.getByText("Team 1 on Field 1")).toBeInTheDocument();
    expect(screen.getByText("Team 2 away")).toBeInTheDocument();
    expect(screen.getByText("Free to practice: Field 2")).toBeInTheDocument();
    expect(screen.getByText("Blocked: Tournament")).toBeInTheDocument();
    expect(screen.getByText("Free to practice: Field 1, Field 2")).toBeInTheDocument();
  });

  it("shows an error when loading fails", async () => {
    const api = makeApi({ calendar: vi.fn().mockRejectedValue(new ApiError(500, "INTERNAL", "boom")) });
    renderWithApp(<CalendarPage />, { api });
    expect(await screen.findByRole("alert")).toHaveTextContent("boom");
  });
});
