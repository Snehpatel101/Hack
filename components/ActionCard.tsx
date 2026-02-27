"use client";

import type { WeeklyPlanAction } from "../lib/types";

interface ActionCardProps {
  action: WeeklyPlanAction;
}

const PRIORITY_STYLES: Record<
  WeeklyPlanAction["priority"],
  { badge: string; border: string; label: string }
> = {
  must_do: {
    badge: "bg-red-500/20 text-red-400",
    border: "border-l-red-500",
    label: "Must Do",
  },
  should_do: {
    badge: "bg-teal-500/20 text-teal-400",
    border: "border-l-teal-500",
    label: "Should Do",
  },
  nice_to_have: {
    badge: "bg-slate-600/50 text-slate-400",
    border: "border-l-slate-600",
    label: "Nice to Have",
  },
};

export default function ActionCard({ action }: ActionCardProps) {
  const style = PRIORITY_STYLES[action.priority];

  // Parse the "how" field — split on newlines or numbered steps
  const howSteps = action.how
    .split(/\n|(?=\d+\.\s)/)
    .map((s) => s.replace(/^\d+\.\s*/, "").trim())
    .filter((s) => s.length > 0);

  return (
    <article
      className={`rounded-xl border border-slate-600/50 border-l-4 ${style.border} bg-[#1e293b] p-5 shadow-lg shadow-black/20 card-glow transition-all duration-300 animate-slide-up`}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <h4 className="text-sm font-semibold text-slate-100">
          {action.action_name}
        </h4>
        <span
          className={`flex-shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${style.badge}`}
        >
          {style.label}
        </span>
      </div>

      {/* Why */}
      <p className="mt-2 text-sm text-slate-400">{action.why}</p>

      {/* How */}
      {howSteps.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            How
          </p>
          <ol className="mt-1.5 space-y-1">
            {howSteps.map((step, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-slate-300">
                <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-teal-500/15 text-xs font-medium text-teal-400">
                  {i + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* Estimated Savings */}
      {action.estimated_savings && (
        <div className="mt-3 flex items-center gap-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-3 py-2">
          <svg
            className="h-4 w-4 text-emerald-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1"
            />
          </svg>
          <span className="text-xs font-medium text-emerald-400">
            Estimated savings: {action.estimated_savings}
          </span>
        </div>
      )}
    </article>
  );
}
