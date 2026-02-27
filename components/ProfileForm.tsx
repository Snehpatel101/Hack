"use client";

import { FormEvent, useState } from "react";

interface ProfileFormProps {
  onSubmit: (profile: { checking_balance: number; goal: string }) => void;
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

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const parsed = parseFloat(balance);
    if (isNaN(parsed) || parsed < 0) return;
    onSubmit({ checking_balance: parsed, goal });
  };

  const isValid = balance !== "" && !isNaN(parseFloat(balance)) && parseFloat(balance) >= 0;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Checking Balance */}
      <div>
        <label
          htmlFor="checking_balance"
          className="block text-sm font-medium text-slate-800"
        >
          Current Checking Balance
        </label>
        <p className="mt-1 text-xs text-slate-500">
          Enter the current balance in your primary checking account.
        </p>
        <div className="relative mt-2">
          <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-500">
            $
          </span>
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
            className="block w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-7 pr-4 text-sm text-slate-800 placeholder-slate-400 shadow-sm transition-colors focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          />
        </div>
      </div>

      {/* Goal Selection */}
      <fieldset>
        <legend className="block text-sm font-medium text-slate-800">
          Financial Goal
        </legend>
        <p className="mt-1 text-xs text-slate-500">
          Choose what matters most to you right now.
        </p>
        <div className="mt-3 space-y-2">
          {GOALS.map((g) => (
            <label
              key={g.value}
              className={`
                flex cursor-pointer items-start gap-3 rounded-lg border p-3
                transition-colors duration-150
                ${
                  goal === g.value
                    ? "border-indigo-500 bg-indigo-50 ring-1 ring-indigo-500"
                    : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                }
              `}
            >
              <input
                type="radio"
                name="goal"
                value={g.value}
                checked={goal === g.value}
                onChange={(e) => setGoal(e.target.value)}
                className="mt-0.5 h-4 w-4 border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              <div>
                <span className="text-sm font-medium text-slate-800">
                  {g.label}
                </span>
                <p className="text-xs text-slate-500">{g.description}</p>
              </div>
            </label>
          ))}
        </div>
      </fieldset>

      {/* Submit */}
      <button
        type="submit"
        disabled={!isValid}
        className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Generate Financial Plan
      </button>
    </form>
  );
}
