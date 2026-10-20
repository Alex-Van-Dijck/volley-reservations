import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../api";
import { LoginPage } from "./LoginPage";
import { captain, makeApi, renderWithApp } from "../test-utils";

describe("LoginPage", () => {
  it("signs in and goes to the manage page", async () => {
    const api = makeApi({ login: vi.fn().mockResolvedValue(captain) });
    renderWithApp(<LoginPage />, { api, route: "/login", path: "/login" });
    await userEvent.type(await screen.findByLabelText("Username"), "captain1");
    await userEvent.type(screen.getByLabelText("Password"), "secret");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(api.login).toHaveBeenCalledWith("captain1", "secret");
  });

  it("shows a clear message for wrong credentials", async () => {
    const api = makeApi({ login: vi.fn().mockRejectedValue(new ApiError(401, "UNAUTHENTICATED", "no")) });
    renderWithApp(<LoginPage />, { api, route: "/login", path: "/login" });
    await userEvent.type(await screen.findByLabelText("Username"), "x");
    await userEvent.type(screen.getByLabelText("Password"), "y");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid username or password.");
  });
});
