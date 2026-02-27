"use client";

import type { WeeklyPlan } from "../lib/types";
import ActionCard from "./ActionCard";
import RiskAlert from "./RiskAlert";

interface PlanViewProps {
  plan: WeeklyPlan;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export default function PlanView({ plan }: PlanViewProps) {
  const [savingsLow, savingsHigh] = plan.total_estimated_monthly_savings;

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Summary */}
      <section className="rounded-xl bg-card border border-gray-700/50 p-6 shadow-lg shadow-black/20 card-glow transition-all duration-300">
        <h2 className="text-lg font-bold text-gray-100">Your Financial Plan</h2>
        <p className="mt-2 text-sm leading-relaxed text-gray-400">
          {plan.summary}
        </p>

        {/* Total Savings Banner */}
        <div className="mt-4 flex items-center gap-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-4 py-3">
          <svg
            className="h-6 w-6 text-emerald-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
            />
          </svg>
          <div>
            <p className="text-xs font-medium text-emerald-400">
              Estimated Monthly Savings
            </p>
            <p className="text-lg font-bold text-emerald-300">
              {formatCurrency(savingsLow)} &ndash; {formatCurrency(savingsHigh)}
            </p>
          </div>
        </div>
      </section>

      {/* Risk Alerts */}
      {plan.risk_alerts.length > 0 && (
        <RiskAlert alerts={plan.risk_alerts} />
      )}

      {/* Week 1 Actions */}
      {plan.week_1.length > 0 && (
        <ActionSection title="Week 1 Actions" actions={plan.week_1} />
      )}

      {/* Week 2 Actions */}
      {plan.week_2.length > 0 && (
        <ActionSection title="Week 2 Actions" actions={plan.week_2} />
      )}

      {/* Ongoing Actions */}
      {plan.ongoing.length > 0 && (
        <ActionSection title="Ongoing Actions" actions={plan.ongoing} />
      )}

      {/* Encouragement */}
      {plan.encouragement && (
        <section className="rounded-xl border border-orange-500/20 bg-orange-500/10 p-6 animate-slide-up">
          <div className="flex items-start gap-3">
            <svg
              className="mt-0.5 h-5 w-5 flex-shrink-0 text-orange-400 animate-float"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"
              />
            </svg>
            <p className="text-sm font-medium text-orange-300">
              {plan.encouragement}
            </p>
          </div>
        </section>
      )}

      {/* Disclaimer */}
      {plan.disclaimer && (
        <footer className="rounded-lg bg-[#1a1a1a] border border-gray-700/50 px-4 py-3">
          <p className="text-xs leading-relaxed text-gray-500">
            {plan.disclaimer}
          </p>
        </footer>
      )}
    </div>
  );
}

function ActionSection({
  title,
  actions,
}: {
  title: string;
  actions: import("../lib/types").WeeklyPlanAction[];
}) {
  return (
    <section>
      <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-orange-400/80">
        {title}
      </h3>
      <div className="space-y-3">
        {actions.map((action, index) => (
          <ActionCard key={action.action_id || index} action={action} />
        ))}
      </div>
    </section>
  );
}
