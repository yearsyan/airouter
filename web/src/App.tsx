import { useState } from "react";
import { EventProvider } from "./context";
import { TextModalProvider } from "./components/TextModal";
import ThemeSwitcher from "./components/ThemeSwitcher";
import Dashboard from "./pages/Dashboard";
import RoutesPage from "./pages/RoutesPage";

type View = "monitor" | "routes";

export default function App() {
  const [view, setView] = useState<View>("monitor");

  return (
    <EventProvider>
      <TextModalProvider>
        {view === "monitor" ? (
          <Dashboard view={view} onViewChange={setView} />
        ) : (
          <RoutesPage view={view} onViewChange={setView} />
        )}
      </TextModalProvider>
    </EventProvider>
  );
}

export function Header({
  view,
  onViewChange,
  children,
}: {
  view: View;
  onViewChange: (v: View) => void;
  children?: React.ReactNode;
}) {
  return (
    <header className="header">
      <div className="header-left">
        <h1>airouter</h1>
        <nav className="header-nav">
          <button
            className={`nav-btn ${view === "monitor" ? "nav-btn-active" : ""}`}
            onClick={() => onViewChange("monitor")}
          >
            Monitor
          </button>
          <button
            className={`nav-btn ${view === "routes" ? "nav-btn-active" : ""}`}
            onClick={() => onViewChange("routes")}
          >
            Routes
          </button>
        </nav>
      </div>
      <div className="header-actions">
        <ThemeSwitcher />
        {children}
      </div>
    </header>
  );
}
