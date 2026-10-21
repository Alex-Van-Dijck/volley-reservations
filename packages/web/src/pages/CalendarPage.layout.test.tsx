import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithApp } from "../test-utils";
import { CalendarPage } from "./CalendarPage";

describe("CalendarPage layout", () => {
  it("shows the status legend and the page heading", async () => {
    renderWithApp(<CalendarPage />);
    expect(await screen.findByRole("heading", { level: 1, name: "Club calendar" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Status legend" })).toBeInTheDocument();
  });

  it("marks blocked days", async () => {
    renderWithApp(<CalendarPage />);
    const blocked = (await screen.findByText("Blocked: Tournament")).closest("li");
    expect(blocked).toHaveClass("is-blocked");
  });
});
