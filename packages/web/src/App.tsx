import { Route, Routes } from "react-router-dom";
import { css } from "styled-system/css";
import { useAuth } from "./auth-context";
import { CalendarPage } from "./pages/CalendarPage";
import { LoginPage } from "./pages/LoginPage";
import { ManagePage } from "./pages/ManagePage";
import { TeamPage } from "./pages/TeamPage";
import { useTheme } from "./theme";
import { Header } from "./ui/Header";
import { MobileNav } from "./ui/MobileNav";

const app = css({ minHeight: "100vh", mdDown: { pb: "74px" } });

const shell = css({
  maxWidth: "1180px",
  m: "0 auto",
  p: { base: "58px 24px 80px", mdDown: "36px 16px 60px" },
});

export function App() {
  const { user, logout } = useAuth();
  const { dark, toggle } = useTheme();
  return (
    <div className={app}>
      <Header user={user} dark={dark} onToggleTheme={toggle} onLogout={() => void logout().catch(() => undefined)} />
      <div className={shell}>
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
      <MobileNav signedIn={user !== null} />
    </div>
  );
}
