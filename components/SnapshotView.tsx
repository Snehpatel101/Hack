"use client";

import { useState } from "react";
import type {
  FinancialSnapshot,
  RiskWindow,
  Subscription,
  DebtInfo,
} from "../lib/types";

/* ------------------------------------------------------------------ */
/*  Formatters                                                         */
/* ------------------------------------------------------------------ */

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatCurrencyPrecise(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/* ------------------------------------------------------------------ */
/*  Inline SVG Icons                                                   */
/* ------------------------------------------------------------------ */

function WalletIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
      <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
      <path d="M18 12a2 2 0 0 0 0 4h4v-4Z" />
    </svg>
  );
}

function ArrowUpIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 19V5" />
      <path d="m5 12 7-7 7 7" />
    </svg>
  );
}

function ArrowDownIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 5v14" />
      <path d="m19 12-7 7-7-7" />
    </svg>
  );
}

function SparklesIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 3l1.912 5.813a2 2 0 0 0 1.275 1.275L21 12l-5.813 1.912a2 2 0 0 0-1.275 1.275L12 21l-1.912-5.813a2 2 0 0 0-1.275-1.275L3 12l5.813-1.912a2 2 0 0 0 1.275-1.275L12 3Z" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/*  Risk-level styling maps                                            */
/* ------------------------------------------------------------------ */

const RISK_BORDER: Record<RiskWindow["risk_level"], string> = {
  critical: "border-l-red-500",
  high: "border-l-red-400",
  medium: "border-l-amber-400",
  low: "border-l-emerald-400",
};

const RISK_BADGE: Record<RiskWindow["risk_level"], string> = {
  critical: "bg-red-500/20 text-red-400",
  high: "bg-red-500/15 text-red-400",
  medium: "bg-amber-500/15 text-amber-400",
  low: "bg-emerald-500/15 text-emerald-400",
};

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export default function SnapshotView({ snapshot }: { snapshot: FinancialSnapshot }) {
  const spending = snapshot.monthly_spending;
  const totalSpending =
    spending.essentials +
    spending.discretionary +
    spending.debt_payments +
    spending.subscriptions;
  const maxSpending = Math.max(
    spending.essentials,
    spending.discretionary,
    spending.debt_payments,
    spending.subscriptions,
    1,
  );

  const spendingCategories = [
    { label: "Essentials", value: spending.essentials, color: "bg-cyan-500" },
    { label: "Discretionary", value: spending.discretionary, color: "bg-cyan-400" },
    { label: "Debt Payments", value: spending.debt_payments, color: "bg-red-500" },
    { label: "Subscriptions", value: spending.subscriptions, color: "bg-sky-400" },
  ];

  const highestApr =
    snapshot.debts.length > 0
      ? Math.max(...snapshot.debts.map((d) => d.apr))
      : 0;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* ---- Header Stats ---- */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        <StatCard
          icon={<WalletIcon className="h-4 w-4" />}
          label="Checking Balance"
          value={formatCurrency(snapshot.checking_balance)}
          accent={snapshot.checking_balance < 200 ? "text-red-400" : "text-cyan-400"}
          border="border-l-cyan-500"
        />
        <StatCard
          icon={<ArrowUpIcon className="h-4 w-4" />}
          label="Monthly Income"
          value={formatCurrency(snapshot.monthly_income)}
          accent="text-emerald-400"
          border="border-l-emerald-500"
        />
        <StatCard
          icon={<ArrowDownIcon className="h-4 w-4" />}
          label="Monthly Spending"
          value={formatCurrency(totalSpending)}
          accent="text-slate-100"
          border="border-l-slate-400"
        />
        <StatCard
          icon={<SparklesIcon className="h-4 w-4" />}
          label="Free Cash"
          value={formatCurrency(snapshot.free_cash_monthly)}
          accent={snapshot.free_cash_monthly < 50 ? "text-red-400" : "text-emerald-400"}
          border={snapshot.free_cash_monthly < 50 ? "border-l-red-500" : "border-l-emerald-500"}
        />
      </div>

      {/* ---- Monthly Spending Breakdown ---- */}
      <Section title="Monthly Spending Breakdown">
        {totalSpending === 0 ? (
          <p className="mt-4 text-xs text-slate-500">
            No spending data detected. Upload transactions that include expense
            amounts (negative values) to see your breakdown.
          </p>
        ) : (
          <div className="mt-4 space-y-3">
            {spendingCategories.map((cat) => {
              const rawPct = maxSpending > 0 ? (cat.value / maxSpending) * 100 : 0;
              const displayPct = cat.value > 0 ? Math.max(rawPct, 2) : 0;
              const shareOfTotal =
                totalSpending > 0
                  ? Math.round((cat.value / totalSpending) * 100)
                  : 0;

              return (
                <div key={cat.label}>
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-slate-300">
                      {cat.label}
                    </span>
                    <span className="flex items-center gap-2 text-slate-400 tabular-nums">
                      {formatCurrency(cat.value)}
                      <span className="w-8 text-right text-slate-500">
                        {shareOfTotal}%
                      </span>
                    </span>
                  </div>
                  <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-slate-700/60">
                    <div
                      className={`h-full rounded-full ${cat.color} transition-all duration-500`}
                      style={{ width: `${displayPct}%` }}
                      role="meter"
                      aria-label={`${cat.label}: ${formatCurrency(cat.value)} (${shareOfTotal}%)`}
                      aria-valuenow={cat.value}
                      aria-valuemin={0}
                      aria-valuemax={maxSpending}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <p className="mt-3 text-xs text-slate-500">
          Total: {formatCurrency(totalSpending)} / month
        </p>
      </Section>

      {/* ---- Risk Windows ---- */}
      {snapshot.risk_windows.length > 0 && (
        <Section
          title="Risk Windows"
          subtitle="Upcoming dates when your balance may be dangerously low."
        >
          <div className="mt-4 space-y-2">
            {snapshot.risk_windows.map((rw, i) => (
              <RiskWindowRow key={i} riskWindow={rw} />
            ))}
          </div>
        </Section>
      )}

      {/* ---- Subscription Leaks ---- */}
      {snapshot.subscription_leaks.length > 0 && (
        <Section
          title="Subscription Leaks"
          subtitle="Subscriptions that may be wasting your money."
        >
          <div className="mt-3 divide-y divide-slate-700/50">
            {snapshot.subscription_leaks.map((sub, i) => (
              <SubscriptionLeakRow key={i} subscription={sub} />
            ))}
          </div>
        </Section>
      )}

      {/* ---- Debts ---- */}
      {snapshot.debts.length > 0 && (
        <Section title="Debts">
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-700/60">
                  <th className="pb-2 pr-4 font-medium text-slate-500">Name</th>
                  <th className="pb-2 pr-4 font-medium text-slate-500">Balance</th>
                  <th className="pb-2 pr-4 font-medium text-slate-500">APR</th>
                  <th className="pb-2 pr-4 font-medium text-slate-500">Min Payment</th>
                  <th className="pb-2 pr-4 font-medium text-slate-500">Monthly Interest</th>
                  <th className="pb-2 font-medium text-slate-500">Payoff (mo)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/40">
                {snapshot.debts.map((debt, i) => (
                  <DebtRow
                    key={i}
                    debt={debt}
                    isHighestApr={debt.apr === highestApr && snapshot.debts.length > 1}
                  />
                ))}
              </tbody>
            </table>
          </div>
          {snapshot.debts.length > 1 && (
            <p className="mt-3 text-xs text-slate-500 italic">
              Focus on the highest APR debt first (avalanche method) to save the
              most on interest.
            </p>
          )}
        </Section>
      )}

      {/* ---- Meta ---- */}
      <p className="text-center text-xs text-slate-600">
        Snapshot as of {snapshot.as_of} | Goal: {snapshot.goal}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Shared Section Wrapper                                             */
/* ------------------------------------------------------------------ */

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="glass-card p-5 transition-all duration-300">
      <h3 className="text-sm font-semibold text-slate-100">{title}</h3>
      {subtitle && (
        <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>
      )}
      {children}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Stat Card                                                          */
/* ------------------------------------------------------------------ */

function StatCard({
  icon,
  label,
  value,
  accent,
  border,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  accent: string;
  border: string;
}) {
  return (
    <div
      className={`glass-card border-l-2 ${border} p-4 transition-all duration-300`}
    >
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <div className="mt-1.5 flex items-center gap-2">
        <span className={accent} aria-hidden="true">
          {icon}
        </span>
        <p className={`text-xl font-bold tabular-nums ${accent}`}>{value}</p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Risk Window Row                                                    */
/* ------------------------------------------------------------------ */

function RiskWindowRow({ riskWindow }: { riskWindow: RiskWindow }) {
  const [showTip, setShowTip] = useState(false);
  const borderClass = RISK_BORDER[riskWindow.risk_level];
  const badgeClass = RISK_BADGE[riskWindow.risk_level];

  return (
    <div
      className={`rounded-lg border border-slate-700/30 border-l-2 ${borderClass} bg-slate-800/40 px-4 py-2.5 transition-colors duration-200`}
      onMouseEnter={() => setShowTip(true)}
      onMouseLeave={() => setShowTip(false)}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className="shrink-0 text-xs text-slate-500 tabular-nums w-20">
            {riskWindow.date}
          </span>
          <span className="truncate text-sm text-slate-300">
            {riskWindow.description}
          </span>
          <span className="shrink-0 text-xs tabular-nums text-slate-500">
            {formatCurrencyPrecise(riskWindow.projected_balance)}
          </span>
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ${badgeClass}`}
        >
          {riskWindow.risk_level}
        </span>
      </div>
      {showTip && riskWindow.suggestion && (
        <p className="mt-1.5 text-xs text-slate-400 animate-fade-in">
          {riskWindow.suggestion}
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Subscription Leak Row                                              */
/* ------------------------------------------------------------------ */

function SubscriptionLeakRow({ subscription }: { subscription: Subscription }) {
  return (
    <div className="flex items-center justify-between py-2.5 text-sm">
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-slate-300 truncate">{subscription.name}</span>
        {subscription.leak_reason && (
          <span className="text-xs text-slate-500 truncate hidden sm:inline">
            {subscription.leak_reason}
          </span>
        )}
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <span className="text-xs tabular-nums text-slate-400">
          {formatCurrencyPrecise(subscription.amount)}/mo
        </span>
        <span className="text-xs text-amber-400/80 cursor-pointer hover:text-amber-300 transition-colors">
          Cancel?
        </span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Debt Row                                                           */
/* ------------------------------------------------------------------ */

function DebtRow({ debt, isHighestApr }: { debt: DebtInfo; isHighestApr: boolean }) {
  const aprClass = debt.apr >= 20 ? "text-red-400 font-semibold" : "text-slate-300";

  return (
    <tr
      className={
        isHighestApr
          ? "border-l-2 border-l-red-500"
          : ""
      }
    >
      <td className="py-2 pr-4 font-medium text-slate-200">{debt.name}</td>
      <td className="py-2 pr-4 text-slate-300 tabular-nums">
        {formatCurrencyPrecise(debt.balance)}
      </td>
      <td className={`py-2 pr-4 tabular-nums ${aprClass}`}>
        {debt.apr.toFixed(1)}%
      </td>
      <td className="py-2 pr-4 text-slate-300 tabular-nums">
        {formatCurrencyPrecise(debt.minimum_payment)}
      </td>
      <td className="py-2 pr-4 text-slate-300 tabular-nums">
        {formatCurrencyPrecise(debt.monthly_interest)}
      </td>
      <td className="py-2 text-slate-300 tabular-nums">
        {debt.payoff_months_minimum}
      </td>
    </tr>
  );
}
