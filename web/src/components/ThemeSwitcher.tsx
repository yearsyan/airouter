import { useState, useEffect, useRef } from "react";

const THEMES = [
  { value: "dark", label: "Dark" },
  { value: "light", label: "Light" },
  { value: "dim", label: "Dim" },
] as const;

type Theme = (typeof THEMES)[number]["value"];

function getInitial(): Theme {
  const stored = localStorage.getItem("theme");
  if (stored && THEMES.some((t) => t.value === stored)) return stored as Theme;
  return "dark";
}

export default function ThemeSwitcher() {
  const [theme, setTheme] = useState<Theme>(getInitial);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("theme", theme);
  }, [theme]);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  const current = THEMES.find((t) => t.value === theme)!;

  return (
    <div className="theme-switcher" ref={ref}>
      <button className="theme-trigger" onClick={() => setOpen(!open)}>
        <span className="theme-dot" />
        {current.label}
        <span className={`theme-chevron ${open ? "theme-chevron-open" : ""}`} />
      </button>
      {open && (
        <div className="theme-dropdown">
          {THEMES.map((t) => (
            <button
              key={t.value}
              className={`theme-option ${t.value === theme ? "theme-option-active" : ""}`}
              onClick={() => {
                setTheme(t.value);
                setOpen(false);
              }}
            >
              <span className={`theme-swatch theme-swatch-${t.value}`} />
              {t.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
