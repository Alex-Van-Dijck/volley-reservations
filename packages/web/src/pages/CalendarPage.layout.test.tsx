import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { renderWithApp } from "../test-utils";
import { CalendarPage } from "./CalendarPage";

describe("CalendarPage layout", () => {
  it("shows the status legend and the month heading", async () => {
    renderWithApp(<CalendarPage />);
    expect(await screen.findByRole("heading", { level: 1, name: "October 2026" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Status legend" })).toBeInTheDocument();
  });

  it("marks a blocked day in the selected panel", async () => {
    renderWithApp(<CalendarPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Thu 29 Oct, Unavailable" }));
    expect(screen.getByRole("region", { name: "Selected day" })).toHaveClass("is-blocked");
  });
});
