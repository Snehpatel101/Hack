"use client";

import type { WeeklyPlan, WeeklyPlanAction } from "../lib/types";
import { t } from "../lib/translations";
import RiskAlert from "./RiskAlert";

interface PlanViewProps {
  plan: WeeklyPlan;
  lang?: string;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function getPriorityBadge(priority: WeeklyPlanAction["priority"], lang: string) {
  const badges: Record<WeeklyPlanAction["priority"], { className: string; label: string }> = {
    must_do: { className: "bg-red-500/20 text-red-400", label: t(lang, "mustDo") },
    should_do: { className: "bg-cyan-500/20 text-cyan-400", label: t(lang, "shouldDo") },
    nice_to_have: { className: "bg-slate-600/50 text-slate-400", label: t(lang, "niceToHave") },
  };
  return badges[priority];
}

export default function PlanView({ plan, lang = "en" }: PlanViewProps) {
  const [savingsLow, savingsHigh] = plan.total_estimated_monthly_savings;

  // Collect top 3 from week_1 and everything else into remaining
  const top3 = plan.week_1.slice(0, 3);
  const remaining = [
    ...plan.week_1.slice(3),
    ...plan.week_2,
    ...plan.ongoing,
  ];

  return (
    <div className="space-y-8 animate-fade-in">
      {/* ── Summary ── */}
      <section className="glass-card p-6 card-glow shadow-black/40 transition-all duration-300">
        <h2 className="text-lg font-bold text-slate-100">
          {t(lang, "yourFinancialPlan")}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-400">
          {plan.summary}
        </p>
        <p className="mt-3 text-sm font-medium text-cyan-400">
          {t(lang, "estimatedSavings")} {formatCurrency(savingsLow)}&ndash;
          {formatCurrency(savingsHigh)}/month
        </p>
      </section>

      {/* ── Risk Alerts ── */}
      {plan.risk_alerts.length > 0 && <RiskAlert alerts={plan.risk_alerts} lang={lang} />}

      {/* ── Top 3 Priority Actions ── */}
      {top3.length > 0 && (
        <section>
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-cyan-400/80">
            {t(lang, "top3PriorityActions")}
          </h3>
          <div className="space-y-4">
            {top3.map((action, index) => (
              <TopActionCard
                key={action.action_id || index}
                action={action}
                step={index + 1}
                lang={lang}
              />
            ))}
          </div>
        </section>
      )}

      {/* ── Remaining Actions (compact) ── */}
      {remaining.length > 0 && (
        <section>
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
            {t(lang, "moreActions")}
          </h3>
          <ul className="space-y-1">
            {remaining.map((action, index) => (
              <li
                key={action.action_id || `remaining-${index}`}
                className="flex items-center justify-between bg-slate-900/30 border border-slate-800/30 rounded-lg px-4 py-2"
              >
                <span className="text-sm text-slate-300 truncate mr-3">
                  {action.action_name}
                </span>
                {action.estimated_savings && (
                  <span className="flex-shrink-0 text-xs text-cyan-400/70">
                    {action.estimated_savings}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── Encouragement ── */}
      {plan.encouragement && (
        <p className="text-sm italic text-slate-500 px-1">
          {plan.encouragement}
        </p>
      )}

      {/* ── Disclaimer ── */}
      {plan.disclaimer && (
        <p className="text-xs text-slate-600 px-1">{plan.disclaimer}</p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Top Action Card — prominent card with step number, why, how, etc. */
/* ------------------------------------------------------------------ */

function TopActionCard({
  action,
  step,
  lang,
}: {
  action: WeeklyPlanAction;
  step: number;
  lang: string;
}) {
  const badge = getPriorityBadge(action.priority, lang);

  const howSteps = action.how
    .split(/\n|(?=\d+\.\s)/)
    .map((s) => s.replace(/^\d+\.\s*/, "").trim())
    .filter((s) => s.length > 0);

  return (
    <article className="glass-card p-3 sm:p-5 card-glow shadow-black/40 transition-all duration-300 animate-slide-up">
      {/* Header row */}
      <div className="flex items-start gap-3">
        {/* Step number */}
        <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-cyan-500/15 text-sm font-bold text-cyan-400">
          {step}
        </span>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3">
            <h4 className="text-base font-bold text-slate-100">
              {action.action_name}
            </h4>
            <span
              className={`flex-shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${badge.className}`}
            >
              {badge.label}
            </span>
          </div>

          {/* Why */}
          <p className="mt-1.5 text-sm text-slate-400">{action.why}</p>
        </div>
      </div>

      {/* How steps */}
      {howSteps.length > 0 && (
        <div className="mt-4 pl-4 sm:pl-10">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            {t(lang, "how")}
          </p>
          <ol className="mt-1.5 space-y-1">
            {howSteps.map((s, i) => (
              <li
                key={i}
                className="flex items-start gap-2 text-sm text-slate-300"
              >
                <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-cyan-500/15 text-xs font-medium text-cyan-400">
                  {i + 1}
                </span>
                <span>{s}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* Estimated savings */}
      {action.estimated_savings && (
        <p className="mt-3 pl-4 sm:pl-10 text-xs font-medium text-cyan-400/80">
          {t(lang, "estimatedSavings")} {action.estimated_savings}
        </p>
      )}
    </article>
  );
}
