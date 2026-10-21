import { NavLink } from "react-router-dom";
import { Icon } from "./Icon";

export function MobileNav({ signedIn }: { signedIn: boolean }) {
  return (
    <nav className="mobile-nav" aria-label="Mobile navigation">
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
