"use client";
import { useState, useRef, useEffect } from "react";

const LANGUAGES = [
  { code: "en", label: "English", flag: "EN" },
  { code: "es", label: "Espanol", flag: "ES" },
  { code: "fr", label: "Francais", flag: "FR" },
  { code: "zh", label: "Chinese", flag: "ZH" },
  { code: "hi", label: "Hindi", flag: "HI" },
  { code: "ar", label: "Arabic", flag: "AR" },
];

interface LanguageSelectorProps {
  currentLang: string;
  onLanguageChange: (lang: string) => void;
}

export default function LanguageSelector({
  currentLang,
  onLanguageChange,
}: LanguageSelectorProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const current = LANGUAGES.find((l) => l.code === currentLang) || LANGUAGES[0];

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800/60 border border-slate-600/40 text-sm text-slate-300 hover:text-teal-400 hover:border-teal-500/40 transition-all duration-200"
      >
        <svg
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M12 21a9 9 0 100-18 9 9 0 000 18z"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M3.6 9h16.8M3.6 15h16.8"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M12 3a15.3 15.3 0 014 9 15.3 15.3 0 01-4 9 15.3 15.3 0 01-4-9 15.3 15.3 0 014-9z"
          />
        </svg>
        <span className="font-medium">{current.flag}</span>
        <svg
          className={`w-3 h-3 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-44 bg-[#1e293b] border border-slate-600/50 rounded-lg shadow-xl shadow-black/30 py-1 z-50 animate-fade-in">
          {LANGUAGES.map((lang) => (
            <button
              key={lang.code}
              onClick={() => {
                onLanguageChange(lang.code);
                setOpen(false);
              }}
              className={`w-full text-left px-4 py-2 text-sm flex items-center justify-between transition-colors ${
                lang.code === currentLang
                  ? "text-teal-400 bg-teal-500/10"
                  : "text-slate-300 hover:bg-slate-700/50 hover:text-slate-100"
              }`}
            >
              <span>{lang.label}</span>
              <span
                className={`text-xs font-mono ${
                  lang.code === currentLang
                    ? "text-teal-500"
                    : "text-slate-500"
                }`}
              >
                {lang.flag}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
