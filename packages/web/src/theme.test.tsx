import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useTheme } from "./theme";

afterEach(() => {
  localStorage.clear();
  document.documentElement.classList.remove("dark");
});

describe("useTheme", () => {
  it("starts light when nothing is stored and the system has no preference", () => {
    const { result } = renderHook(() => useTheme());
    expect(result.current.dark).toBe(false);
    expect(document.documentElement).not.toHaveClass("dark");
  });

  it("starts from the class the boot script set", () => {
    document.documentElement.classList.add("dark");
    const { result } = renderHook(() => useTheme());
    expect(result.current.dark).toBe(true);
    expect(document.documentElement).toHaveClass("dark");
  });

  it("toggles the class and remembers the choice", () => {
    const { result } = renderHook(() => useTheme());
    act(() => result.current.toggle());
    expect(result.current.dark).toBe(true);
    expect(document.documentElement).toHaveClass("dark");
    expect(localStorage.getItem("volley-theme")).toBe("dark");
    act(() => result.current.toggle());
    expect(document.documentElement).not.toHaveClass("dark");
    expect(localStorage.getItem("volley-theme")).toBe("light");
  });
});
