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
          className="block text-sm font-medium text-gray-100"
        >
          Current Checking Balance
        </label>
        <p className="mt-1 text-xs text-gray-500">
          Enter the current balance in your primary checking account.
        </p>
        <div className="relative mt-2">
          <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-gray-500">
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
            className="block w-full rounded-lg border border-gray-700/50 bg-[#1a1a1a] py-2.5 pl-7 pr-4 text-sm text-gray-100 placeholder-gray-600 shadow-lg shadow-black/20 transition-all duration-300 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
          />
        </div>
      </div>

      {/* Goal Selection */}
      <fieldset>
        <legend className="block text-sm font-medium text-gray-100">
          Financial Goal
        </legend>
        <p className="mt-1 text-xs text-gray-500">
          Choose what matters most to you right now.
        </p>
        <div className="mt-3 space-y-2">
          {GOALS.map((g) => (
            <label
              key={g.value}
              className={`
                flex cursor-pointer items-start gap-3 rounded-lg border p-3
                transition-all duration-300
                ${
                  goal === g.value
                    ? "border-orange-500 bg-orange-500/10 ring-1 ring-orange-500"
                    : "border-gray-700/50 bg-card-hover hover:border-gray-600 hover:bg-[#1f1f1f]"
                }
              `}
            >
              <input
                type="radio"
                name="goal"
                value={g.value}
                checked={goal === g.value}
                onChange={(e) => setGoal(e.target.value)}
                className="mt-0.5 h-4 w-4 border-gray-600 text-orange-500 focus:ring-orange-500"
              />
              <div>
                <span className="text-sm font-medium text-gray-200">
                  {g.label}
                </span>
                <p className="text-xs text-gray-500">{g.description}</p>
              </div>
            </label>
          ))}
        </div>
      </fieldset>

      {/* Submit */}
      <button
        type="submit"
        disabled={!isValid}
        className="w-full rounded-lg bg-gradient-to-r from-orange-500 to-amber-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-orange-500/20 transition-all duration-300 hover:from-orange-600 hover:to-amber-600 hover:shadow-orange-500/40 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 focus:ring-offset-[#0a0a0a] disabled:cursor-not-allowed disabled:opacity-50"
      >
        Generate Financial Plan
      </button>
    </form>
  );
}
