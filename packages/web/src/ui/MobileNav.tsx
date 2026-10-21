import { NavLink } from "react-router-dom";
import { css } from "styled-system/css";
import { Icon } from "./Icon";

const nav = css({
  display: { base: "none", mdDown: "grid" },
  position: "fixed",
  gridTemplateColumns: "repeat(3, 1fr)",
  height: "70px",
  bottom: 0,
  left: 0,
  right: 0,
  zIndex: "mobileNav",
  bg: "paper",
  borderTop: "1px solid",
  borderColor: "line",
  "& a": {
    color: "muted",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: "4px",
    fontSize: "10px",
    fontWeight: 700,
    textDecoration: "none",
    position: "relative",
  },
  "& a.active": {
    color: "ink",
    _before: {
      content: '""',
      position: "absolute",
      top: 0,
      width: "35px",
      height: "3px",
      bg: "crimson",
    },
  },
});

export function MobileNav({ signedIn }: { signedIn: boolean }) {
  return (
    <nav className={nav} aria-label="Mobile navigation">
      <NavLink to="/" end>
        <Icon name="calendar" size={20} />
        <span>Calendar</span>
      </NavLink>
      <NavLink to="/team">
        <Icon name="users" size={20} />
        <span>Team</span>
      </NavLink>
      {signedIn ? (
        <NavLink to="/manage">
          <Icon name="settings" size={20} />
          <span>Manage</span>
        </NavLink>
      ) : (
        <NavLink to="/login">
          <Icon name="login" size={20} />
          <span>Sign in</span>
        </NavLink>
      )}
    </nav>
  );
}
