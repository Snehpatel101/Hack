"use client";

import { useState } from "react";

interface CollapsibleSectionProps {
  title: string;
  subtitle?: string;
  defaultOpen?: boolean;
  badge?: string;
  children: React.ReactNode;
}

export default function CollapsibleSection({
  title,
  subtitle,
  defaultOpen = false,
  badge,
  children,
}: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div>
      {/* Clickable header bar */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className={`
          w-full flex items-center justify-between
          bg-[#1e293b] rounded-xl border border-slate-600/50
          px-6 py-4 cursor-pointer
          hover:bg-[#263548] transition-colors
          text-left
          ${isOpen ? "rounded-b-none border-b-transparent" : ""}
        `}
        aria-expanded={isOpen}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3">
            <h3 className="text-lg font-semibold text-slate-100">{title}</h3>
            {badge && (
              <span className="bg-teal-500/15 text-teal-400 text-xs px-2 py-0.5 rounded-full whitespace-nowrap">
                {badge}
              </span>
            )}
          </div>
          {subtitle && (
            <p className="text-sm text-slate-400 mt-1">{subtitle}</p>
          )}
        </div>

        {/* Chevron icon */}
        <svg
          className={`
            w-5 h-5 text-slate-400 flex-shrink-0 ml-4
            transition-transform duration-300 ease-in-out
            ${isOpen ? "rotate-0" : "-rotate-90"}
          `}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {/* Collapsible content — always mounted, never unmounted */}
      <div
        className={`
          overflow-hidden transition-all duration-500 ease-in-out
          ${isOpen ? "max-h-[5000px] opacity-100" : "max-h-0 opacity-0"}
        `}
      >
        <div className="pt-2">{children}</div>
      </div>
    </div>
  );
}
