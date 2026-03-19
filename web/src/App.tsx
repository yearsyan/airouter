import { NavLink, Outlet } from "react-router";
import { useTranslation } from "react-i18next";
import { EventProvider } from "./context";
import { TextModalProvider } from "./components/TextModal";
import ThemeSwitcher from "./components/ThemeSwitcher";
import LangSwitcher from "./components/LangSwitcher";

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
  const { t } = useTranslation();
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
            {t("nav.monitor")}
          </NavLink>
          <NavLink
            to="/routes"
            className={({ isActive }) =>
              `nav-btn ${isActive ? "nav-btn-active" : ""}`
            }
          >
            {t("nav.routes")}
          </NavLink>
          <NavLink
            to="/history"
            className={({ isActive }) =>
              `nav-btn ${isActive ? "nav-btn-active" : ""}`
            }
          >
            {t("nav.history")}
          </NavLink>
          <NavLink
            to="/analytics"
            className={({ isActive }) =>
              `nav-btn ${isActive ? "nav-btn-active" : ""}`
            }
          >
            {t("nav.analytics")}
          </NavLink>
        </nav>
      </div>
      <div className="header-actions">
        <LangSwitcher />
        <ThemeSwitcher />
        {children}
      </div>
    </header>
  );
}
