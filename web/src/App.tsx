import { NavLink, Outlet } from "react-router";
import { EventProvider } from "./context";
import { TextModalProvider } from "./components/TextModal";
import ThemeSwitcher from "./components/ThemeSwitcher";

export default function App() {
  return (
    <EventProvider>
      <TextModalProvider>
        <Outlet />
      </TextModalProvider>
    </EventProvider>
  );
}

export function Header({ children }: { children?: React.ReactNode }) {
  return (
    <header className="header">
      <div className="header-left">
        <h1>airouter</h1>
        <nav className="header-nav">
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              `nav-btn ${isActive ? "nav-btn-active" : ""}`
            }
          >
            Monitor
          </NavLink>
          <NavLink
            to="/routes"
            className={({ isActive }) =>
              `nav-btn ${isActive ? "nav-btn-active" : ""}`
            }
          >
            Routes
          </NavLink>
          <NavLink
            to="/history"
            className={({ isActive }) =>
              `nav-btn ${isActive ? "nav-btn-active" : ""}`
            }
          >
            History
          </NavLink>
        </nav>
      </div>
      <div className="header-actions">
        <ThemeSwitcher />
        {children}
      </div>
    </header>
  );
}
