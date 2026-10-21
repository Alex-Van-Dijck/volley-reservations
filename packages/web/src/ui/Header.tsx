import { Link, NavLink } from "react-router-dom";
import { button } from "styled-system/recipes";
import { css, cx } from "styled-system/css";
import type { User } from "../types";
import { Icon } from "./Icon";

type Props = {
  user: User | null;
  dark: boolean;
  onToggleTheme: () => void;
  onLogout: () => void;
};

const topbar = css({
  height: { base: "76px", mdDown: "64px" },
  bg: "paper",
  borderBottom: "1px solid",
  borderColor: "line",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  px: { base: "max(20px, calc((100vw - 1180px) / 2))", mdDown: "16px" },
  position: "sticky",
  top: 0,
  zIndex: "topbar",
});

const brandLink = css({ color: "inherit", textDecoration: "none" });

const brandStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "10px",
  textAlign: "left",
});

const brandMark = css({
  width: { base: "42px", mdDown: "36px" },
  height: { base: "42px", mdDown: "36px" },
  display: "grid",
  placeItems: "center",
  color: "crimson",
  "& svg": { width: "100%", height: "100%" },
});

const brandName = css({
  display: "block",
  fontFamily: "heading",
  fontWeight: 700,
  fontSize: { base: "16px", mdDown: "14px" },
  letterSpacing: "-0.02em",
});

const brandTagline = css({
  display: { base: "block", mdDown: "none" },
  fontSize: "10px",
  textTransform: "uppercase",
  letterSpacing: "0.12em",
  color: "muted",
  mt: "1px",
});

const desktopNav = css({
  display: { base: "flex", mdDown: "none" },
  alignItems: "stretch",
  alignSelf: "stretch",
  gap: "30px",
  "& a": {
    display: "flex",
    alignItems: "center",
    color: "muted",
    fontWeight: 700,
    textDecoration: "none",
    position: "relative",
    px: "2px",
  },
  "& a.active": {
    color: "ink",
    _after: {
      content: '""',
      position: "absolute",
      height: "3px",
      bg: "crimson",
      bottom: 0,
      left: 0,
      right: 0,
    },
  },
});

const headerActions = css({ display: "flex", alignItems: "center", gap: "10px" });

const iconButton = css({
  width: "42px",
  height: "42px",
  border: "1px solid",
  borderColor: "line",
  borderRadius: "50%",
  bg: "paper",
  color: "ink",
  display: "inline-grid",
  placeItems: "center",
  flex: "none",
});

const accountButton = css({
  display: "flex",
  alignItems: "center",
  gap: "8px",
  border: 0,
  bg: "transparent",
  color: "ink",
  mdDown: {
    width: "42px",
    height: "42px",
    border: "1px solid",
    borderColor: "line",
    borderRadius: "50%",
    display: "grid",
    placeItems: "center",
  },
});

const accountInitials = css({
  width: "34px",
  height: "34px",
  borderRadius: "50%",
  color: "white",
  bg: "crimson",
  display: { base: "grid", mdDown: "none" },
  placeItems: "center",
  fontWeight: 700,
  fontSize: "12px",
});

const accountName = css({ display: { mdDown: "none" } });

function Brand() {
  return (
    <div className={brandStyle}>
      <div className={brandMark} aria-hidden="true">
        <svg viewBox="0 0 48 48">
          <circle cx="24" cy="24" r="21" fill="none" stroke="currentColor" strokeWidth="3" />
          <path
            d="M9 18c9-1 16 3 20 11M18 8c0 10 5 18 14 23M37 12c-8 5-12 13-11 25"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </svg>
      </div>
      <div>
        <strong className={brandName}>Volley</strong>
        <span className={brandTagline}>Field reservations</span>
      </div>
    </div>
  );
}

export function Header({ user, dark, onToggleTheme, onLogout }: Props) {
  return (
    <header className={topbar}>
      <Link to="/" className={brandLink}>
        <Brand />
      </Link>
      <nav className={desktopNav} aria-label="Main navigation">
        <NavLink to="/" end>
          Calendar
        </NavLink>
        <NavLink to="/team">Team</NavLink>
        {user && <NavLink to="/manage">Manage</NavLink>}
      </nav>
      <div className={headerActions}>
        <button
          type="button"
          className={iconButton}
          onClick={onToggleTheme}
          aria-label={`Switch to ${dark ? "light" : "dark"} mode`}
        >
          <Icon name={dark ? "sun" : "moon"} />
        </button>
        {user ? (
          <button type="button" className={accountButton} aria-label="Sign out" onClick={onLogout}>
            <span className={accountInitials}>{user.username.slice(0, 2).toUpperCase()}</span>
            <b className={accountName}>{user.username}</b>
            <Icon name="logout" size={16} />
          </button>
        ) : (
          <NavLink
            to="/login"
            className={cx(button({ size: "sm" }), css({ display: { mdDown: "none" } }))}
          >
            Sign in
          </NavLink>
        )}
      </div>
    </header>
  );
}
