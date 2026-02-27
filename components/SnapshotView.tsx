"use client";

import type {
  FinancialSnapshot,
  RiskWindow,
  Subscription,
  DebtInfo,
} from "../lib/types";

interface SnapshotViewProps {
  snapshot: FinancialSnapshot;
}

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

const RISK_COLORS: Record<RiskWindow["risk_level"], { bg: string; text: string; dot: string }> = {
  critical: { bg: "bg-red-900/30", text: "text-red-400", dot: "bg-red-500" },
  high: { bg: "bg-orange-900/30", text: "text-orange-400", dot: "bg-orange-500" },
  medium: { bg: "bg-yellow-900/30", text: "text-yellow-400", dot: "bg-yellow-500" },
  low: { bg: "bg-emerald-900/30", text: "text-emerald-400", dot: "bg-emerald-500" },
};

const RISK_BADGE_COLORS: Record<RiskWindow["risk_level"], string> = {
  critical: "bg-red-500/20 text-red-400",
  high: "bg-orange-500/20 text-orange-400",
  medium: "bg-yellow-500/20 text-yellow-400",
  low: "bg-emerald-500/20 text-emerald-400",
};

export default function SnapshotView({ snapshot }: SnapshotViewProps) {
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
    1
  );

  const spendingCategories = [
    { label: "Essentials", value: spending.essentials, color: "bg-orange-500" },
    { label: "Discretionary", value: spending.discretionary, color: "bg-amber-400" },
    { label: "Debt Payments", value: spending.debt_payments, color: "bg-red-500" },
    { label: "Subscriptions", value: spending.subscriptions, color: "bg-orange-300" },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header Stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard
          label="Checking Balance"
          value={formatCurrency(snapshot.checking_balance)}
          accent={snapshot.checking_balance < 200 ? "text-red-400" : "text-orange-400"}
        />
        <StatCard
          label="Monthly Income"
          value={formatCurrency(snapshot.monthly_income)}
          accent="text-emerald-400"
        />
        <StatCard
          label="Monthly Spending"
          value={formatCurrency(totalSpending)}
          accent="text-gray-100"
        />
        <StatCard
          label="Free Cash"
          value={formatCurrency(snapshot.free_cash_monthly)}
          accent={snapshot.free_cash_monthly < 50 ? "text-red-400" : "text-emerald-400"}
        />
      </div>

      {/* Monthly Spending Breakdown */}
      <section className="rounded-xl bg-card border border-gray-700/50 p-6 shadow-lg shadow-black/20 card-glow transition-all duration-300">
        <h3 className="text-sm font-semibold text-gray-100">
          Monthly Spending Breakdown
        </h3>
        <div className="mt-4 space-y-3">
          {spendingCategories.map((cat) => (
            <div key={cat.label}>
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-gray-300">{cat.label}</span>
                <span className="text-gray-500">
                  {formatCurrency(cat.value)}
                </span>
              </div>
              <div className="mt-1 h-2.5 w-full overflow-hidden rounded-full bg-gray-800">
                <div
                  className={`h-full rounded-full ${cat.color} transition-all duration-500`}
                  style={{
                    width: `${maxSpending > 0 ? (cat.value / maxSpending) * 100 : 0}%`,
                  }}
                  role="meter"
                  aria-label={`${cat.label}: ${formatCurrency(cat.value)}`}
                  aria-valuenow={cat.value}
                  aria-valuemin={0}
                  aria-valuemax={maxSpending}
                />
              </div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-gray-500">
          Total: {formatCurrency(totalSpending)} / month
        </p>
      </section>

      {/* Risk Windows */}
      {snapshot.risk_windows.length > 0 && (
        <section className="rounded-xl bg-card border border-gray-700/50 p-6 shadow-lg shadow-black/20 card-glow transition-all duration-300">
          <h3 className="text-sm font-semibold text-gray-100">
            Risk Windows
          </h3>
          <p className="mt-1 text-xs text-gray-500">
            Upcoming dates when your balance may be dangerously low.
          </p>
          <div className="mt-4 space-y-2">
            {snapshot.risk_windows.map((rw, i) => (
              <RiskWindowRow key={i} riskWindow={rw} />
            ))}
          </div>
        </section>
      )}

      {/* Subscription Leaks */}
      {snapshot.subscription_leaks.length > 0 && (
        <section className="rounded-xl bg-card border border-gray-700/50 p-6 shadow-lg shadow-black/20 card-glow transition-all duration-300">
          <h3 className="text-sm font-semibold text-gray-100">
            Subscription Leaks
          </h3>
          <p className="mt-1 text-xs text-gray-500">
            Subscriptions that may be wasting your money.
          </p>
          <div className="mt-4 space-y-2">
            {snapshot.subscription_leaks.map((sub, i) => (
              <SubscriptionLeakRow key={i} subscription={sub} />
            ))}
          </div>
        </section>
      )}

      {/* Debts */}
      {snapshot.debts.length > 0 && (
        <section className="rounded-xl bg-card border border-gray-700/50 p-6 shadow-lg shadow-black/20 card-glow transition-all duration-300">
          <h3 className="text-sm font-semibold text-gray-100">Debts</h3>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-gray-700/50">
                  <th className="pb-2 pr-4 font-medium text-gray-500">Name</th>
                  <th className="pb-2 pr-4 font-medium text-gray-500">Balance</th>
                  <th className="pb-2 pr-4 font-medium text-gray-500">APR</th>
                  <th className="pb-2 pr-4 font-medium text-gray-500">Min Payment</th>
                  <th className="pb-2 pr-4 font-medium text-gray-500">Monthly Interest</th>
                  <th className="pb-2 font-medium text-gray-500">Payoff (months)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {snapshot.debts.map((debt, i) => (
                  <DebtRow key={i} debt={debt} />
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Meta */}
      <p className="text-center text-xs text-gray-600">
        Snapshot as of {snapshot.as_of} | Goal: {snapshot.goal}
      </p>
    </div>
  );
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent: string;
}) {
  return (
    <div className="rounded-xl bg-card border border-gray-700/50 p-4 shadow-lg shadow-black/20 card-glow transition-all duration-300">
      <p className="text-xs font-medium text-gray-500">{label}</p>
      <p className={`mt-1 text-lg font-bold ${accent}`}>{value}</p>
    </div>
  );
}

function RiskWindowRow({ riskWindow }: { riskWindow: RiskWindow }) {
  const colors = RISK_COLORS[riskWindow.risk_level];
  const badgeColor = RISK_BADGE_COLORS[riskWindow.risk_level];

  return (
    <div className={`rounded-lg ${colors.bg} border border-gray-700/30 p-3`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2">
          <span
            className={`mt-1.5 h-2 w-2 flex-shrink-0 rounded-full ${colors.dot}`}
            aria-hidden="true"
          />
          <div>
            <p className={`text-sm font-medium ${colors.text}`}>
              {riskWindow.description}
            </p>
            <p className="mt-0.5 text-xs text-gray-500">
              {riskWindow.date} &mdash; Projected balance:{" "}
              {formatCurrencyPrecise(riskWindow.projected_balance)}
            </p>
            <p className="mt-1 text-xs text-gray-400">
              {riskWindow.suggestion}
            </p>
          </div>
        </div>
        <span
          className={`flex-shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${badgeColor}`}
        >
          {riskWindow.risk_level}
        </span>
      </div>
    </div>
  );
}

function SubscriptionLeakRow({ subscription }: { subscription: Subscription }) {
  return (
    <div className="flex items-center justify-between rounded-lg bg-amber-500/10 border border-amber-500/20 px-4 py-3">
      <div className="flex items-center gap-2">
        <span className="text-amber-400" aria-hidden="true">
          <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.168 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 6a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 6zm0 9a1 1 0 100-2 1 1 0 000 2z"
              clipRule="evenodd"
            />
          </svg>
        </span>
        <div>
          <p className="text-sm font-medium text-amber-300">
            {subscription.name}
          </p>
          {subscription.leak_reason && (
            <p className="text-xs text-amber-400/70">{subscription.leak_reason}</p>
          )}
        </div>
      </div>
      <span className="text-sm font-semibold text-amber-300">
        {formatCurrencyPrecise(subscription.amount)}/mo
      </span>
    </div>
  );
}

function DebtRow({ debt }: { debt: DebtInfo }) {
  const aprClass = debt.apr >= 20 ? "text-red-400 font-semibold" : "text-gray-300";

  return (
    <tr>
      <td className="py-2 pr-4 font-medium text-gray-200">{debt.name}</td>
      <td className="py-2 pr-4 text-gray-300">
        {formatCurrencyPrecise(debt.balance)}
      </td>
      <td className={`py-2 pr-4 ${aprClass}`}>{debt.apr.toFixed(1)}%</td>
      <td className="py-2 pr-4 text-gray-300">
        {formatCurrencyPrecise(debt.minimum_payment)}
      </td>
      <td className="py-2 pr-4 text-gray-300">
        {formatCurrencyPrecise(debt.monthly_interest)}
      </td>
      <td className="py-2 text-gray-300">{debt.payoff_months_minimum}</td>
    </tr>
  );
}
