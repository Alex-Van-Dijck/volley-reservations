import { NavLink, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth-context";
import { CalendarPage } from "./pages/CalendarPage";
import { LoginPage } from "./pages/LoginPage";
import { ManagePage } from "./pages/ManagePage";
import { TeamPage } from "./pages/TeamPage";

export function App() {
  const { user, logout } = useAuth();
  return (
    <div className="app">
      <nav className="nav">
        <NavLink to="/" end>
          Calendar
        </NavLink>
        <NavLink to="/team">Team</NavLink>
        {user ? (
          <>
            <NavLink to="/manage">Manage</NavLink>
            <button type="button" onClick={() => void logout()}>
              Sign out
            </button>
          </>
        ) : (
          <NavLink to="/login">Sign in</NavLink>
        )}
      </nav>
      <main>
        <Routes>
          <Route path="/" element={<CalendarPage />} />
          <Route path="/team" element={<TeamPage />} />
          <Route path="/team/:teamId" element={<TeamPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/manage" element={<ManagePage />} />
          <Route path="*" element={<p>Page not found</p>} />
        </Routes>
      </main>
    </div>
  );
}
