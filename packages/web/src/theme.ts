import { useEffect, useState } from "react";

const KEY = "volley-theme";

function initialDark(): boolean {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === "dark" || saved === "light") return saved === "dark";
  } catch {
    // storage can be blocked, fall through to the system preference
  }
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
}

export function useTheme() {
  const [dark, setDark] = useState(initialDark);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  function toggle() {
    const next = !dark;
    setDark(next);
    try {
      localStorage.setItem(KEY, next ? "dark" : "light");
    } catch {
      // the choice still applies for this session
    }
  }

  return { dark, toggle };
}
