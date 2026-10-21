import { useEffect, useState } from "react";

const KEY = "volley-theme";

// index.html resolves the stored or system preference before first paint
const initialDark = () => document.documentElement.classList.contains("dark");

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
