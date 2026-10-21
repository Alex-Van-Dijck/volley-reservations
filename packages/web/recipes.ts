import { defineRecipe, defineSlotRecipe } from "@pandacss/dev";

export const button = defineRecipe({
  className: "button",
  base: {
    border: "1px solid",
    borderColor: "ink",
    minHeight: "46px",
    px: "20px",
    fontWeight: 700,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "10px",
    bg: "ink",
    color: "paper",
    borderRadius: "2px",
    textDecoration: "none",
  },
  variants: {
    visual: {
      solid: { _hover: { opacity: 0.82 } },
      outline: { bg: "transparent", color: "ink" },
      danger: { bg: "crimsonDark", borderColor: "crimsonDark", color: "white" },
    },
    size: {
      md: {},
      sm: { minHeight: "38px", px: "14px", fontSize: "13px" },
    },
    full: {
      true: { width: "100%" },
    },
  },
  defaultVariants: { visual: "solid", size: "md" },
});

export const badge = defineSlotRecipe({
  className: "badge",
  slots: ["root", "mark"],
  base: {
    root: {
      display: "inline-flex",
      alignItems: "center",
      gap: "7px",
      whiteSpace: "nowrap",
      fontWeight: 700,
      fontSize: "12px",
    },
    mark: {
      width: "10px",
      height: "10px",
      borderRadius: "50%",
      bg: "ink",
      flex: "none",
    },
  },
  variants: {
    status: {
      home: {},
      away: {
        mark: { bg: "transparent", border: "2px solid", borderColor: "ink" },
      },
      unavailable: {
        root: { color: "crimson" },
        mark: { bg: "crimson", borderRadius: "1px", transform: "rotate(45deg)" },
      },
      training: {
        mark: { borderRadius: 0, height: "3px" },
      },
      no_training: {
        root: { color: "crimson" },
        mark: {
          bg: "transparent",
          border: "2px solid",
          borderColor: "crimson",
          position: "relative",
          _after: {
            content: '""',
            width: "11px",
            height: "2px",
            bg: "crimson",
            position: "absolute",
            left: "-2px",
            top: "2px",
            transform: "rotate(-45deg)",
          },
        },
      },
    },
    compact: {
      true: {
        root: { fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.06em" },
      },
    },
  },
});

export const calendarDay = defineRecipe({
  className: "calendarDay",
  base: {
    height: { base: "64px", mdDown: "47px" },
    fontSize: { mdDown: "12px" },
    border: "1px solid transparent",
    bg: "canvas",
    color: "ink",
    position: "relative",
    fontWeight: 700,
    borderRadius: "2px",
    "&:not(:disabled):hover": { borderColor: "ink" },
    _disabled: { cursor: "default", color: "muted" },
  },
  variants: {
    blank: { true: { bg: "transparent" } },
    selected: { true: { bg: "ink", color: "paper" } },
    today: {
      true: {
        _after: {
          content: '""',
          position: "absolute",
          left: "50%",
          bottom: "8px",
          width: "16px",
          height: "2px",
          bg: "crimson",
          transform: "translateX(-50%)",
        },
      },
    },
  },
});

export const dot = defineRecipe({
  className: "dot",
  base: {
    position: "absolute",
    top: { base: "8px", mdDown: "5px" },
    right: { base: "8px", mdDown: "5px" },
    width: { base: "7px", mdDown: "6px" },
    height: { base: "7px", mdDown: "6px" },
    borderRadius: "50%",
    bg: "currentColor",
  },
  variants: {
    status: {
      home: {},
      training: {},
      unavailable: { bg: "crimson" },
      no_training: { bg: "crimson" },
      away: { bg: "transparent", border: "1.5px solid", borderColor: "currentColor" },
    },
  },
});

export const fieldSection = defineSlotRecipe({
  className: "fieldSection",
  slots: ["root", "name", "label"],
  base: {
    root: {
      border: "2px solid",
      borderColor: "ink",
      display: "flex",
      flexDirection: "column",
      justifyContent: "center",
      alignItems: "center",
      textAlign: "center",
      gap: "4px",
      py: "8px",
      px: "12px",
      minWidth: 0,
    },
    name: {
      display: { mdDown: "none" },
      fontSize: "10px",
      fontWeight: 800,
      letterSpacing: "0.1em",
      textTransform: "uppercase",
      opacity: 0.7,
    },
    label: {
      fontSize: "14px",
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: { base: "nowrap", mdDown: "normal" },
    },
  },
  variants: {
    state: {
      home: { root: { bg: "ink", color: "paper" } },
      training: {
        root: {
          background: "repeating-linear-gradient(135deg, transparent 0 6px, {colors.soft} 6px 12px)",
          color: "ink",
        },
      },
      unavailable: { root: { bg: "soft", color: "muted" } },
      blocked: { root: { bg: "crimson", color: "white" } },
      spare: { root: { bg: "canvas" } },
    },
  },
});
