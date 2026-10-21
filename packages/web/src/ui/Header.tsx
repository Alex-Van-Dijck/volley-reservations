import { Link, NavLink } from "react-router-dom";
import type { User } from "../types";
import { Icon } from "./Icon";

type Props = {
  user: User | null;
  dark: boolean;
  onToggleTheme: () => void;
  onLogout: () => void;
};

function Brand() {
  return (
    <div className="brand">
      <div className="brand-mark" aria-hidden="true">
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
        <strong>Volley</strong>
        <span>Field reservations</span>
      </div>
    </div>
  );
}

export function Header({ user, dark, onToggleTheme, onLogout }: Props) {
  return (
    <header className="topbar">
      <Link to="/" className="brand-link" aria-label="Go to club calendar">
        <Brand />
      </Link>
      <nav className="desktop-nav" aria-label="Main navigation">
        <NavLink to="/" end>
          Calendar
        </NavLink>
        <NavLink to="/team">Team</NavLink>
        {user && <NavLink to="/manage">Manage</NavLink>}
      </nav>
      <div className="header-actions">
        <button
          type="button"
          className="icon-button"
          onClick={onToggleTheme}
          aria-label={`Switch to ${dark ? "light" : "dark"} mode`}
        >
          <Icon name={dark ? "sun" : "moon"} />
        </button>
        {user ? (
          <button type="button" className="account-button" aria-label="Sign out" onClick={onLogout}>
            <span>{user.username.slice(0, 2).toUpperCase()}</span>
            <b>{user.username}</b>
            <Icon name="logout" size={16} />
          </button>
        ) : (
          <NavLink to="/login" className="solid-button small signin-link">
            Sign in
          </NavLink>
        )}
      </div>
    </header>
  );
}
