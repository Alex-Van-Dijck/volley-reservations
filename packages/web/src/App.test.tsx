import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { captain, makeApi, renderWithApp } from "./test-utils";

afterEach(() => {
  localStorage.clear();
  document.documentElement.classList.remove("dark");
});

describe("App shell", () => {
  it("offers sign in and hides manage when signed out", async () => {
    renderWithApp(<App />);
    expect(await screen.findByRole("heading", { name: "October 2026" })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Sign in" }).length).toBeGreaterThan(0);
    expect(screen.queryByRole("link", { name: "Manage" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sign out" })).not.toBeInTheDocument();
  });

  it("shows manage and sign out when signed in, and signs out", async () => {
    const api = makeApi({ me: async () => captain });
    renderWithApp(<App />, { api });
    const signOut = await screen.findByRole("button", { name: "Sign out" });
    expect(screen.getAllByRole("link", { name: "Manage" }).length).toBeGreaterThan(0);
    expect(screen.queryByRole("link", { name: "Sign in" })).not.toBeInTheDocument();
    await userEvent.click(signOut);
    expect(api.logout).toHaveBeenCalled();
  });

  it("signs out locally even when the logout request fails", async () => {
    const api = makeApi({ me: async () => captain, logout: vi.fn().mockRejectedValue(new Error("offline")) });
    renderWithApp(<App />, { api });
    await userEvent.click(await screen.findByRole("button", { name: "Sign out" }));
    expect((await screen.findAllByRole("link", { name: "Sign in" })).length).toBeGreaterThan(0);
  });

  it("toggles the theme", async () => {
    renderWithApp(<App />);
    await userEvent.click(await screen.findByRole("button", { name: "Switch to dark mode" }));
    expect(document.documentElement).toHaveClass("dark");
    expect(screen.getByRole("button", { name: "Switch to light mode" })).toBeInTheDocument();
  });

  it("keeps the not found page", async () => {
    renderWithApp(<App />, { route: "/nope" });
    expect(await screen.findByText("Page not found")).toBeInTheDocument();
  });
});
