import { defineConfig } from "@pandacss/dev";
import { badge, button, calendarDay, dot, fieldSection } from "./recipes";

export default defineConfig({
  presets: ["@pandacss/preset-base", "@pandacss/preset-panda"],
  preflight: true,
  include: ["./src/**/*.{ts,tsx}"],
  exclude: ["./src/**/*.test.{ts,tsx}"],
  outdir: "styled-system",
  staticCss: {
    recipes: {
      calendarDay: [{ selected: ["true"], today: ["true"], blank: ["true"] }],
      fieldSection: [{ state: ["*"] }],
      badge: [{ status: ["*"], compact: ["true"] }],
      button: [{ visual: ["*"], size: ["*"], full: ["true"] }],
    },
  },
  jsxFramework: "react",

  conditions: {
    extend: {
      // index.html sets .dark on <html> before first paint, useTheme toggles it
      dark: "&.dark, .dark &",
    },
  },

  theme: {
    extend: {
      // md is the phone/desktop cut-off, use `mdDown` for phone overrides
      breakpoints: { md: "47.5625rem" },
      recipes: { button, calendarDay, dot },
      slotRecipes: { badge, fieldSection },
      tokens: {
        fonts: {
          body: { value: '"DM Sans", system-ui, sans-serif' },
          heading: { value: '"Space Grotesk", system-ui, sans-serif' },
        },
        zIndex: {
          topbar: { value: 20 },
          mobileNav: { value: 30 },
        },
      },
      textStyles: {
        eyebrow: {
          value: { fontSize: "11px", lineHeight: 1, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.16em" },
        },
        pill: {
          value: { fontSize: "11px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em" },
        },
        label: { value: { fontSize: "12px", fontWeight: 800 } },
        small: { value: { fontSize: "13px" } },
      },
      layerStyles: {
        card: { value: { bg: "paper", border: "1px solid", borderColor: "line" } },
      },
      semanticTokens: {
        colors: {
          ink: { value: { base: "#111111", _dark: "#ffffff" } },
          paper: { value: { base: "#ffffff", _dark: "#111111" } },
          canvas: { value: { base: "#f4f4f2", _dark: "#050505" } },
          muted: { value: { base: "#6e6e6a", _dark: "#b8b8b2" } },
          line: { value: { base: "#d9d9d5", _dark: "#3a3a38" } },
          soft: { value: { base: "#eeeeeb", _dark: "#222220" } },
          crimson: { value: { base: "#c8102e", _dark: "#ed2648" } },
          crimsonDark: { value: "#c8102e" },
          crimsonTint: { value: { base: "#fbe9ec", _dark: "#2a1216" } },
        },
      },
    },
  },

  globalCss: {
    html: {
      fontFamily: "body",
      fontSynthesis: "none",
      colorScheme: "light",
      "&.dark": { colorScheme: "dark" },
    },
    body: {
      minWidth: "320px",
      minHeight: "100vh",
      bg: "canvas",
      color: "ink",
    },
    "html.theme-ready body": {
      transition: "background 0.2s, color 0.2s",
    },
    "button:focus-visible, input:focus-visible, select:focus-visible, a:focus-visible": {
      outline: "3px solid",
      outlineColor: "crimson",
      outlineOffset: "3px",
    },
    "h1, h2, h3": {
      fontFamily: "heading",
      letterSpacing: "-0.035em",
    },
    h1: {
      fontSize: "clamp(38px, 6vw, 70px)",
      lineHeight: 0.95,
      marginBottom: "15px",
    },
    h2: {
      fontSize: "clamp(24px, 3vw, 34px)",
      lineHeight: 1,
      marginBottom: "10px",
    },
    h3: {
      fontSize: "17px",
      lineHeight: 1.15,
      marginBottom: "7px",
    },
    p: {
      color: "muted",
      lineHeight: 1.5,
    },
    "input, select": {
      minHeight: "48px",
      border: "1px solid",
      borderColor: "line",
      bg: "paper",
      color: "ink",
      px: 3.5,
      borderRadius: "1px",
    },
    "input::placeholder": { color: "muted" },
    button: { cursor: "pointer" },
    "@media (prefers-reduced-motion: reduce)": {
      "*, *::before, *::after": {
        scrollBehavior: "auto !important",
        animationDuration: "0.01ms !important",
        animationIterationCount: "1 !important",
        transitionDuration: "0.01ms !important",
      },
    },
  },
});
