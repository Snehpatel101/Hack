"use client";

import { FormEvent, useState } from "react";

interface ProfileFormProps {
  onSubmit: (profile: { checking_balance: number; goal: string; monthly_income?: number }) => void;
  defaultBalance?: number;
}

const GOALS = [
  {
    value: "stability",
    label: "Stability",
    description: "Avoid overdrafts and late fees",
  },
  {
    value: "debt",
    label: "Pay Down Debt",
    description: "Reduce high-interest debt fastest",
  },
  {
    value: "emergency",
    label: "Emergency Fund",
    description: "Build a safety net for surprises",
  },
  {
    value: "auto",
    label: "Auto (Recommended)",
    description: "Let the copilot choose the best strategy",
  },
] as const;

export default function ProfileForm({
  onSubmit,
  defaultBalance,
}: ProfileFormProps) {
  const [balance, setBalance] = useState<string>(
    defaultBalance !== undefined ? String(defaultBalance) : ""
  );
  const [goal, setGoal] = useState<string>("auto");
  const [income, setIncome] = useState<string>("");

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const parsed = parseFloat(balance);
    if (isNaN(parsed) || parsed < 0) return;
    const incomeVal = parseFloat(income);
    onSubmit({ checking_balance: parsed, goal, monthly_income: incomeVal > 0 ? incomeVal : undefined });
  };

  const isValid = balance !== "" && !isNaN(parseFloat(balance)) && parseFloat(balance) >= 0;

  return (
    <form onSubmit={handleSubmit} className="space-y-10">
      {/* Money Inputs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <div className="space-y-3">
          <div>
            <label
              htmlFor="checking_balance"
              className="text-xs font-semibold text-slate-300 block mb-1.5"
            >
              Checking Balance
            </label>
            <div className="relative group">
              <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none transition-colors group-focus-within:text-cyan-300 text-slate-500">
                <span className="text-lg font-bold tracking-tight">$</span>
              </div>
              <input
                id="checking_balance"
                name="checking_balance"
                type="number"
                step="0.01"
                min="0"
                value={balance}
                onChange={(e) => setBalance(e.target.value)}
                placeholder="0.00"
                required
                className="input-field w-full pl-9 text-lg font-bold tracking-tight bg-slate-900/50 border-slate-700/50 focus:border-cyan-400 focus:bg-slate-900"
              />
            </div>
            <p className="text-[11px] text-slate-500 leading-relaxed pl-1">
              Current balance in your main account.
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <label htmlFor="monthly_income" className="text-xs font-semibold text-slate-300 block mb-1.5">
              Monthly Income
            </label>
            <div className="relative group">
              <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none transition-colors group-focus-within:text-cyan-300 text-slate-500">
                <span className="text-lg font-bold tracking-tight">$</span>
              </div>
              <input
                id="monthly_income"
                name="monthly_income"
                type="number"
                step="1"
                min="0"
                value={income}
                onChange={(e) => setIncome(e.target.value)}
                placeholder="0"
                className="input-field w-full pl-9 text-lg font-bold tracking-tight bg-slate-900/50 border-slate-700/50 focus:border-cyan-400 focus:bg-slate-900"
              />
            </div>
            <p className="text-[11px] text-slate-500 leading-relaxed pl-1">
              Total monthly take-home pay (optional).
            </p>
          </div>
        </div>
      </div>

      {/* Goal Selection */}
      <fieldset className="space-y-4">
        <div>
          <legend className="text-xs font-semibold text-slate-300 mb-1.5">
            Primary Financial Goal
          </legend>
          <p className="text-xs text-slate-500">
            Choose what matters most right now.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {GOALS.map((g) => (
            <label
              key={g.value}
              className={`
                group cursor-pointer relative flex items-start gap-4 rounded-xl border p-4 transition-all duration-200
                ${
                  goal === g.value
                    ? "border-cyan-400/60 bg-cyan-500/10 shadow-lg shadow-cyan-500/5"
                    : "border-slate-800 bg-slate-900/30 hover:border-slate-700 hover:bg-slate-900/60"
                }
              `}
            >
              <div className="flex items-center h-5">
                <input
                  type="radio"
                  name="goal"
                  value={g.value}
                  checked={goal === g.value}
                  onChange={(e) => setGoal(e.target.value)}
                  className="peer h-4 w-4 border-slate-600 text-cyan-400 focus:ring-cyan-400 focus:ring-offset-0 opacity-0 absolute"
                />
                <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors ${goal === g.value ? 'border-cyan-400' : 'border-slate-600 group-hover:border-slate-500'}`}>
                  <div className={`w-2 h-2 rounded-full bg-cyan-400 transition-transform duration-200 ${goal === g.value ? 'scale-100' : 'scale-0'}`} />
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <span className={`block text-sm font-bold tracking-tight transition-colors ${goal === g.value ? 'text-white' : 'text-slate-300 group-hover:text-slate-200'}`}>
                  {g.label}
                </span>
                <p className={`text-xs mt-0.5 leading-relaxed transition-colors ${goal === g.value ? 'text-cyan-100/70' : 'text-slate-500'}`}>{g.description}</p>
              </div>
            </label>
          ))}
        </div>
      </fieldset>

      {/* Submit */}
      <div className="pt-2">
        <button
          type="submit"
          disabled={!isValid}
          className="btn-primary w-full group"
        >
          <span className="flex items-center justify-center gap-2">
            Generate Financial Plan
            <svg className="w-4 h-4 transition-transform group-hover:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </span>
        </button>
      </div>
    </form>
  );
}
