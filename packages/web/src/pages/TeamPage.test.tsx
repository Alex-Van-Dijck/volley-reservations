import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { TeamPage } from "./TeamPage";
import { renderWithApp } from "../test-utils";

describe("TeamPage", () => {
  it("shows the status of the team per date", async () => {
    const { api } = renderWithApp(<TeamPage />, { route: "/team/1", path: "/team/:teamId?" });
    expect(await screen.findByText("Home game")).toBeInTheDocument();
    expect(screen.getByText("Unavailable")).toBeInTheDocument();
    expect(screen.getByText("Training")).toBeInTheDocument();
    expect(screen.getByText("Field 1, Field 2")).toBeInTheDocument();
    expect(api.teamSchedule).toHaveBeenCalledWith(1);
  });

  it("defaults to the first team and switches team from the selector", async () => {
    const { api } = renderWithApp(<TeamPage />, { route: "/team", path: "/team/:teamId?" });
    await screen.findByText("Home game");
    expect(api.teamSchedule).toHaveBeenCalledWith(1);
    await userEvent.selectOptions(screen.getByLabelText("Team"), "3");
    expect(api.teamSchedule).toHaveBeenCalledWith(3);
  });
});
