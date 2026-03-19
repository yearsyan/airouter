import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";

const LANGS = [
  { value: "en", label: "English" },
  { value: "zh", label: "中文" },
] as const;

export default function LangSwitcher() {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

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

  const changeLang = (lng: string) => {
    i18n.changeLanguage(lng);
    localStorage.setItem("lang", lng);
    setOpen(false);
  };

  const current = LANGS.find((l) => l.value === i18n.language) || LANGS[0];

  return (
    <div className="lang-switcher" ref={ref}>
      <button className="lang-trigger" onClick={() => setOpen(!open)}>
        {current.label}
        <span className={`lang-chevron ${open ? "lang-chevron-open" : ""}`} />
      </button>
      {open && (
        <div className="lang-dropdown">
          {LANGS.map((l) => (
            <button
              key={l.value}
              className={`lang-option ${l.value === i18n.language ? "lang-option-active" : ""}`}
              onClick={() => changeLang(l.value)}
            >
              {t(`lang.${l.value}`)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
