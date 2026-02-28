"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { t } from "../lib/translations";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ConversationalIntakeProps {
  onComplete: (data: {
    csvContent: string;
    profile: {
      checking_balance: number;
      monthly_income: number;
      goal: string;
      debts?: Array<{
        name: string;
        balance: number;
        apr: number;
        minimum_payment: number;
        due_day: number;
      }>;
      income?: Array<{
        source: string;
        amount: number;
        frequency: "monthly";
        next_date: string;
      }>;
    };
  }) => void;
  onBack: () => void;
  lang?: string;
}

interface BillEntry {
  name: string;
  amount: string;
}

interface DebtEntry {
  name: string;
  balance: string;
  apr: string;
  minimum_payment: string;
}

interface ChatMessage {
  id: string;
  role: "bot" | "user";
  content: string;
}

type StepId =
  | "income"
  | "housing"
  | "bills"
  | "subscriptions"
  | "debts"
  | "checking"
  | "goal"
  | "done";

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

function getGoals(lang: string) {
  return [
    { value: "stability", label: t(lang, "goalStability"), description: t(lang, "goalStabilityDesc") },
    { value: "debt", label: t(lang, "goalDebt"), description: t(lang, "goalDebtDesc") },
    { value: "emergency", label: t(lang, "goalEmergency"), description: t(lang, "goalEmergencyDesc") },
    { value: "auto", label: t(lang, "goalAuto"), description: t(lang, "goalAutoDesc") },
  ] as const;
}

const BOT_QUESTION_KEYS: Record<StepId, string> = {
  income: "incomeQuestion",
  housing: "housingQuestion",
  bills: "billsQuestion",
  subscriptions: "subscriptionsQuestion",
  debts: "debtsQuestion",
  checking: "checkingQuestion",
  goal: "goalQuestion",
  done: "doneMessage",
};

function getBotQuestion(step: StepId, lang: string): string {
  return t(lang, BOT_QUESTION_KEYS[step]);
}

function generateId(): string {
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function fmt(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/* ------------------------------------------------------------------ */
/*  CSV generation                                                     */
/* ------------------------------------------------------------------ */

function buildCsv(answers: {
  income: number;
  housing: number;
  bills: BillEntry[];
  subscriptions: BillEntry[];
  debts: DebtEntry[];
  checking: number;
}): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-indexed
  const rows: string[] = ["date,description,amount,category"];

  const d = (day: number) => {
    const clamped = Math.min(day, 28);
    const date = new Date(year, month, clamped);
    return date.toISOString().split("T")[0];
  };

  // Income — split biweekly: 1st and 15th
  const halfIncome = answers.income / 2;
  rows.push(`${d(1)},Payroll Direct Deposit,${halfIncome.toFixed(2)},Income`);
  rows.push(`${d(15)},Payroll Direct Deposit,${halfIncome.toFixed(2)},Income`);

  // Housing — 1st of the month
  if (answers.housing > 0) {
    rows.push(`${d(1)},Rent / Mortgage,${(-answers.housing).toFixed(2)},Housing`);
  }

  // Bills — spread across different days
  const billDays = [5, 10, 15, 20, 25, 8, 12, 18, 22, 28];
  answers.bills.forEach((b, i) => {
    const amt = parseFloat(b.amount);
    if (!isNaN(amt) && amt > 0) {
      rows.push(`${d(billDays[i % billDays.length])},${b.name},${(-amt).toFixed(2)},Bills`);
    }
  });

  // Subscriptions — various days
  const subDays = [3, 7, 12, 17, 21, 26, 9, 14, 19, 24];
  answers.subscriptions.forEach((s, i) => {
    const amt = parseFloat(s.amount);
    if (!isNaN(amt) && amt > 0) {
      rows.push(`${d(subDays[i % subDays.length])},${s.name},${(-amt).toFixed(2)},Subscriptions`);
    }
  });

  // Debt minimum payments — around the 20th–28th
  const debtDays = [20, 22, 24, 26, 28];
  answers.debts.forEach((debt, i) => {
    const minPay = parseFloat(debt.minimum_payment);
    if (!isNaN(minPay) && minPay > 0) {
      rows.push(
        `${d(debtDays[i % debtDays.length])},${debt.name} Payment,${(-minPay).toFixed(2)},Debt Payment`
      );
    }
  });

  // Discretionary spending — estimate from leftover
  const totalBills = answers.bills.reduce(
    (s, b) => s + (parseFloat(b.amount) || 0),
    0
  );
  const totalSubs = answers.subscriptions.reduce(
    (s, b) => s + (parseFloat(b.amount) || 0),
    0
  );
  const totalDebtPayments = answers.debts.reduce(
    (s, b) => s + (parseFloat(b.minimum_payment) || 0),
    0
  );
  const leftover =
    answers.income - answers.housing - totalBills - totalSubs - totalDebtPayments;
  const discretionary = Math.max(leftover * 0.7, 0); // assume 70% of leftover is spent

  if (discretionary > 0) {
    const categories = [
      { name: "Grocery Store", cat: "Groceries", pct: 0.35 },
      { name: "Restaurant / Dining", cat: "Dining", pct: 0.2 },
      { name: "Gas Station", cat: "Transportation", pct: 0.15 },
      { name: "Online Shopping", cat: "Shopping", pct: 0.15 },
      { name: "Coffee Shop", cat: "Dining", pct: 0.05 },
      { name: "Entertainment", cat: "Entertainment", pct: 0.1 },
    ];

    // Spread each discretionary category across multiple days
    categories.forEach((c) => {
      const total = discretionary * c.pct;
      const txCount = c.pct >= 0.15 ? 4 : 2;
      const perTx = total / txCount;
      for (let t = 0; t < txCount; t++) {
        const day = 2 + Math.floor(((t + 1) * 26) / (txCount + 1));
        // Add small randomness via a simple deterministic offset
        const jitter = ((c.name.length + t * 7) % 5) - 2;
        const amt = Math.max(perTx + jitter, 1);
        rows.push(`${d(day)},${c.name},${(-amt).toFixed(2)},${c.cat}`);
      }
    });
  }

  // Sort by date
  const header = rows[0];
  const data = rows.slice(1).sort((a, b) => a.split(",")[0].localeCompare(b.split(",")[0]));
  return [header, ...data].join("\n");
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function ConversationalIntake({
  onComplete,
  onBack,
  lang = "en",
}: ConversationalIntakeProps) {
  /* ---- state ---- */
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [currentStep, setCurrentStep] = useState<StepId>("income");
  const [stepIndex, setStepIndex] = useState(0);
  const [isTyping, setIsTyping] = useState(true); // bot typing on mount

  // Single-value inputs
  const [numberInput, setNumberInput] = useState("");

  // Multi-entry: bills & subscriptions
  const [multiEntries, setMultiEntries] = useState<BillEntry[]>([
    { name: "", amount: "" },
  ]);

  // Multi-entry: debts
  const [debtEntries, setDebtEntries] = useState<DebtEntry[]>([
    { name: "", balance: "", apr: "", minimum_payment: "" },
  ]);

  // Goal selection
  const [selectedGoal, setSelectedGoal] = useState("auto");

  // Collected answers
  const [answers, setAnswers] = useState<{
    income: number;
    housing: number;
    bills: BillEntry[];
    subscriptions: BillEntry[];
    debts: DebtEntry[];
    checking: number;
    goal: string;
  }>({
    income: 0,
    housing: 0,
    bills: [],
    subscriptions: [],
    debts: [],
    checking: 0,
    goal: "auto",
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  /* ---- auto-scroll ---- */
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  /* ---- initial bot message ---- */
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsTyping(false);
      setMessages([
        {
          id: generateId(),
          role: "bot",
          content: getBotQuestion("income", lang),
        },
      ]);
    }, 600);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---- helpers ---- */

  const addBotMessage = useCallback((text: string) => {
    setIsTyping(true);
    setTimeout(() => {
      setIsTyping(false);
      setMessages((prev) => [
        ...prev,
        { id: generateId(), role: "bot", content: text },
      ]);
    }, 400);
  }, []);

  const addUserMessage = useCallback((text: string) => {
    setMessages((prev) => [
      ...prev,
      { id: generateId(), role: "user", content: text },
    ]);
  }, []);

  const advanceStep = useCallback(
    (nextStep: StepId) => {
      setCurrentStep(nextStep);
      setStepIndex((i) => i + 1);
      setNumberInput("");
      setMultiEntries([{ name: "", amount: "" }]);
      setDebtEntries([{ name: "", balance: "", apr: "", minimum_payment: "" }]);
      addBotMessage(getBotQuestion(nextStep, lang));
    },
    [addBotMessage, lang]
  );

  /* ---- step handlers ---- */

  const handleNumberSubmit = useCallback(() => {
    const val = parseFloat(numberInput);
    if (isNaN(val) || (currentStep === "income" && val <= 0)) return;
    if (currentStep === "checking" && val < 0) return;

    addUserMessage(`$${fmt(val)}`);

    const nextAnswers = { ...answers };
    if (currentStep === "income") {
      nextAnswers.income = val;
      setAnswers(nextAnswers);
      advanceStep("housing");
    } else if (currentStep === "housing") {
      nextAnswers.housing = val;
      setAnswers(nextAnswers);
      advanceStep("bills");
    } else if (currentStep === "checking") {
      nextAnswers.checking = val;
      setAnswers(nextAnswers);
      advanceStep("goal");
    }
  }, [numberInput, currentStep, answers, addUserMessage, advanceStep]);

  const handleMultiSubmit = useCallback(
    (skip: boolean) => {
      if (currentStep === "bills" || currentStep === "subscriptions") {
        const valid = skip
          ? []
          : multiEntries.filter(
              (e) => e.name.trim() && parseFloat(e.amount) > 0
            );
        const summary =
          valid.length === 0
            ? currentStep === "bills"
              ? "No recurring bills"
              : "No subscriptions"
            : valid.map((e) => `${e.name}: $${fmt(parseFloat(e.amount))}`).join(", ");
        addUserMessage(summary);

        const nextAnswers = { ...answers };
        if (currentStep === "bills") {
          nextAnswers.bills = valid;
          setAnswers(nextAnswers);
          advanceStep("subscriptions");
        } else {
          nextAnswers.subscriptions = valid;
          setAnswers(nextAnswers);
          advanceStep("debts");
        }
      }
    },
    [currentStep, multiEntries, answers, addUserMessage, advanceStep]
  );

  const handleDebtSubmit = useCallback(
    (skip: boolean) => {
      const valid = skip
        ? []
        : debtEntries.filter(
            (e) =>
              e.name.trim() &&
              parseFloat(e.balance) > 0 &&
              parseFloat(e.apr) >= 0 &&
              parseFloat(e.minimum_payment) >= 0
          );
      const summary =
        valid.length === 0
          ? "No debts"
          : valid
              .map(
                (e) =>
                  `${e.name}: $${fmt(parseFloat(e.balance))} @ ${e.apr}% APR, min $${fmt(parseFloat(e.minimum_payment))}`
              )
              .join("; ");
      addUserMessage(summary);

      const nextAnswers = { ...answers, debts: valid };
      setAnswers(nextAnswers);
      advanceStep("checking");
    },
    [debtEntries, answers, addUserMessage, advanceStep]
  );

  const handleGoalSubmit = useCallback(() => {
    const goals = getGoals(lang);
    const label = goals.find((g) => g.value === selectedGoal)?.label ?? selectedGoal;
    addUserMessage(label);

    const finalAnswers = { ...answers, goal: selectedGoal };
    setAnswers(finalAnswers);

    // Show "done" message, then call onComplete
    setStepIndex(7);
    setCurrentStep("done");
    setIsTyping(true);

    setTimeout(() => {
      setIsTyping(false);
      setMessages((prev) => [
        ...prev,
        { id: generateId(), role: "bot", content: getBotQuestion("done", lang) },
      ]);

      // Build CSV and profile, then call onComplete after a brief pause
      setTimeout(() => {
        const csvContent = buildCsv(finalAnswers);
        const now = new Date();
        const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        const nextDateStr = nextMonth.toISOString().split("T")[0];

        const debtDays = [20, 22, 24, 26, 28];
        const profile = {
          checking_balance: finalAnswers.checking,
          monthly_income: finalAnswers.income,
          goal: finalAnswers.goal,
          debts: finalAnswers.debts.length > 0
            ? finalAnswers.debts.map((d, i) => ({
                name: d.name,
                balance: parseFloat(d.balance),
                apr: parseFloat(d.apr),
                minimum_payment: parseFloat(d.minimum_payment),
                due_day: debtDays[i % debtDays.length],
              }))
            : undefined,
          income: [
            {
              source: "Payroll",
              amount: finalAnswers.income,
              frequency: "monthly" as const,
              next_date: nextDateStr,
            },
          ],
        };

        onComplete({ csvContent, profile });
      }, 800);
    }, 500);
  }, [selectedGoal, answers, addUserMessage, onComplete, lang]);

  /* ---- multi-entry helpers ---- */

  const updateMultiEntry = (index: number, field: keyof BillEntry, value: string) => {
    setMultiEntries((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const addMultiEntry = () => {
    setMultiEntries((prev) => [...prev, { name: "", amount: "" }]);
  };

  const removeMultiEntry = (index: number) => {
    setMultiEntries((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));
  };

  const updateDebtEntry = (index: number, field: keyof DebtEntry, value: string) => {
    setDebtEntries((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const addDebtEntry = () => {
    setDebtEntries((prev) => [
      ...prev,
      { name: "", balance: "", apr: "", minimum_payment: "" },
    ]);
  };

  const removeDebtEntry = (index: number) => {
    setDebtEntries((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));
  };

  /* ---- key handler ---- */
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (currentStep === "income" || currentStep === "housing" || currentStep === "checking") {
        handleNumberSubmit();
      }
    }
  };

  /* ---- render helpers ---- */

  const isNumberStep =
    currentStep === "income" ||
    currentStep === "housing" ||
    currentStep === "checking";

  const isMultiStep =
    currentStep === "bills" || currentStep === "subscriptions";

  const isDebtStep = currentStep === "debts";
  const isGoalStep = currentStep === "goal";
  const isDone = currentStep === "done";

  const numberValid = (() => {
    const val = parseFloat(numberInput);
    if (isNaN(val)) return false;
    if (currentStep === "income" && val <= 0) return false;
    if (val < 0) return false;
    return true;
  })();

  return (
    <div className="flex flex-col h-full max-h-[85vh] sm:max-h-[700px] glass-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 bg-slate-900/30 border-b border-slate-800/30">
        <div className="flex items-center gap-3">
          {/* Bot avatar */}
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-cyan-500 to-blue-500 flex items-center justify-center flex-shrink-0">
            <svg
              className="w-4 h-4 text-white"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M12 2L9.19 8.63 2 9.24l5.46 4.73L5.82 21 12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2z" />
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-100">
              {t(lang, "financialSetupAssistant")}
            </h3>
            <p className="text-[11px] text-slate-500">
              {t(lang, "step")} {Math.min(stepIndex + 1, 7)} {t(lang, "of7")}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onBack}
          className="text-xs text-slate-500 underline underline-offset-2 hover:text-slate-400 transition-colors"
        >
          {t(lang, "backToUpload")}
        </button>
      </div>

      {/* Progress bar */}
      <div className="h-1 bg-slate-800">
        <div
          className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 transition-all duration-500 ease-out"
          style={{ width: `${(Math.min(stepIndex + 1, 7) / 7) * 100}%` }}
        />
      </div>

      {/* Messages area */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto px-4 py-4 space-y-3"
      >
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex items-start gap-2.5 animate-slideUp ${
              msg.role === "user" ? "flex-row-reverse" : ""
            }`}
          >
            {msg.role === "bot" && (
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-cyan-500 to-blue-500 flex items-center justify-center flex-shrink-0 mt-0.5">
                <svg
                  className="w-3.5 h-3.5 text-white"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M12 2L9.19 8.63 2 9.24l5.46 4.73L5.82 21 12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2z" />
                </svg>
              </div>
            )}
            <div
              className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed max-w-[80%] ${
                msg.role === "user"
                  ? "bg-cyan-500/20 text-slate-100 rounded-tr-md"
                  : "bg-slate-700/60 text-slate-100 rounded-tl-md"
              }`}
            >
              {msg.content}
            </div>
          </div>
        ))}

        {/* Typing indicator */}
        {isTyping && (
          <div className="flex items-start gap-2.5 animate-slideUp">
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-cyan-500 to-blue-500 flex items-center justify-center flex-shrink-0 mt-0.5">
              <svg
                className="w-3.5 h-3.5 text-white"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M12 2L9.19 8.63 2 9.24l5.46 4.73L5.82 21 12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2z" />
              </svg>
            </div>
            <div className="bg-slate-700/60 rounded-2xl rounded-tl-md px-4 py-3">
              <div className="flex items-center gap-1.5">
                <span
                  className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce"
                  style={{ animationDelay: "0ms" }}
                />
                <span
                  className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce"
                  style={{ animationDelay: "150ms" }}
                />
                <span
                  className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce"
                  style={{ animationDelay: "300ms" }}
                />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      {!isDone && !isTyping && (
        <div className="border-t border-slate-800/30 bg-slate-900/30 px-4 py-4 animate-slideUp">
          {/* Number input steps */}
          {isNumberStep && (
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-500">
                  $
                </span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={numberInput}
                  onChange={(e) => setNumberInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="0.00"
                  autoFocus
                  className="block w-full rounded-lg border border-slate-800/30 bg-slate-900/40 py-2.5 pl-7 pr-4 text-sm text-slate-100 placeholder-slate-600 shadow-lg shadow-black/20 transition-all duration-300 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
                />
              </div>
              <button
                type="button"
                onClick={handleNumberSubmit}
                disabled={!numberValid}
                className="btn-primary rounded-lg px-5 py-2.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40"
              >
                {t(lang, "next")}
              </button>
            </div>
          )}

          {/* Multi-entry: bills & subscriptions */}
          {isMultiStep && (
            <div className="space-y-3">
              {multiEntries.map((entry, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 rounded-lg border border-slate-800/30 bg-slate-900/40 p-2.5"
                >
                  <input
                    type="text"
                    placeholder="Name"
                    value={entry.name}
                    onChange={(e) => updateMultiEntry(i, "name", e.target.value)}
                    autoFocus={i === multiEntries.length - 1}
                    className="flex-1 min-w-0 rounded-md border border-slate-800/30 bg-slate-900/40 px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500/20"
                  />
                  <div className="relative w-28">
                    <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-2.5 text-slate-500 text-sm">
                      $
                    </span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      value={entry.amount}
                      onChange={(e) =>
                        updateMultiEntry(i, "amount", e.target.value)
                      }
                      className="w-full rounded-md border border-slate-800/30 bg-slate-900/40 py-2 pl-6 pr-2 text-sm text-slate-100 placeholder-slate-600 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500/20"
                    />
                  </div>
                  {multiEntries.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeMultiEntry(i)}
                      className="p-1.5 text-slate-500 hover:text-red-400 transition-colors"
                      aria-label="Remove entry"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
              ))}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={addMultiEntry}
                  className="flex items-center gap-1.5 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-xs font-medium text-cyan-400 hover:bg-cyan-500/20 transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  {t(lang, "addAnother")}
                </button>
                <div className="flex-1" />
                {currentStep !== "bills" && (
                  <button
                    type="button"
                    onClick={() => handleMultiSubmit(true)}
                    className="rounded-lg px-4 py-2 text-xs font-medium text-slate-400 hover:text-slate-300 transition-colors"
                  >
                    {t(lang, "skip")}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => handleMultiSubmit(false)}
                  className="btn-primary rounded-lg px-5 py-2 text-sm font-semibold"
                >
                  {t(lang, "next")}
                </button>
              </div>
            </div>
          )}

          {/* Debt entries */}
          {isDebtStep && (
            <div className="space-y-3">
              {debtEntries.map((entry, i) => (
                <div
                  key={i}
                  className="rounded-lg border border-slate-800/30 bg-slate-900/40 p-3 space-y-2"
                >
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="Debt name"
                      value={entry.name}
                      onChange={(e) =>
                        updateDebtEntry(i, "name", e.target.value)
                      }
                      autoFocus={i === debtEntries.length - 1}
                      className="flex-1 min-w-0 rounded-md border border-slate-800/30 bg-slate-900/40 px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500/20"
                    />
                    {debtEntries.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeDebtEntry(i)}
                        className="p-1.5 text-slate-500 hover:text-red-400 transition-colors"
                        aria-label="Remove debt"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-2.5 text-slate-500 text-xs">
                        $
                      </span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="Balance"
                        value={entry.balance}
                        onChange={(e) =>
                          updateDebtEntry(i, "balance", e.target.value)
                        }
                        className="w-full rounded-md border border-slate-800/30 bg-slate-900/40 py-2 pl-6 pr-2 text-sm text-slate-100 placeholder-slate-600 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500/20"
                      />
                    </div>
                    <div className="relative w-20">
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        placeholder="APR %"
                        value={entry.apr}
                        onChange={(e) =>
                          updateDebtEntry(i, "apr", e.target.value)
                        }
                        className="w-full rounded-md border border-slate-800/30 bg-slate-900/40 py-2 px-2.5 pr-7 text-sm text-slate-100 placeholder-slate-600 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500/20"
                      />
                      <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2.5 text-slate-500 text-xs">
                        %
                      </span>
                    </div>
                    <div className="relative flex-1">
                      <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-2.5 text-slate-500 text-xs">
                        $
                      </span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="Min payment"
                        value={entry.minimum_payment}
                        onChange={(e) =>
                          updateDebtEntry(i, "minimum_payment", e.target.value)
                        }
                        className="w-full rounded-md border border-slate-800/30 bg-slate-900/40 py-2 pl-6 pr-2 text-sm text-slate-100 placeholder-slate-600 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500/20"
                      />
                    </div>
                  </div>
                </div>
              ))}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={addDebtEntry}
                  className="flex items-center gap-1.5 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-xs font-medium text-cyan-400 hover:bg-cyan-500/20 transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  {t(lang, "addAnother")}
                </button>
                <div className="flex-1" />
                <button
                  type="button"
                  onClick={() => handleDebtSubmit(true)}
                  className="rounded-lg px-4 py-2 text-xs font-medium text-slate-400 hover:text-slate-300 transition-colors"
                >
                  {t(lang, "skip")}
                </button>
                <button
                  type="button"
                  onClick={() => handleDebtSubmit(false)}
                  className="btn-primary rounded-lg px-5 py-2 text-sm font-semibold"
                >
                  {t(lang, "next")}
                </button>
              </div>
            </div>
          )}

          {/* Goal selection */}
          {isGoalStep && (
            <div className="space-y-3">
              <div className="space-y-2">
                {getGoals(lang).map((g) => (
                  <label
                    key={g.value}
                    className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-all duration-300 ${
                      selectedGoal === g.value
                        ? "border-cyan-500 bg-cyan-500/10 ring-1 ring-cyan-500"
                        : "border-slate-800/30 bg-slate-900/40 hover:border-slate-500 hover:bg-slate-800/50"
                    }`}
                  >
                    <input
                      type="radio"
                      name="goal"
                      value={g.value}
                      checked={selectedGoal === g.value}
                      onChange={(e) => setSelectedGoal(e.target.value)}
                      className="mt-0.5 h-4 w-4 border-slate-600 text-cyan-500 focus:ring-cyan-500"
                    />
                    <div>
                      <span className="text-sm font-medium text-slate-200">
                        {g.label}
                      </span>
                      <p className="text-xs text-slate-500">{g.description}</p>
                    </div>
                  </label>
                ))}
              </div>
              <button
                type="button"
                onClick={handleGoalSubmit}
                className="btn-primary w-full rounded-lg px-5 py-2.5 text-sm font-semibold"
              >
                {t(lang, "analyzeFinances")}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Inline styles for animations (no external deps) */}
      <style jsx>{`
        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-slideUp {
          animation: slideUp 0.3s ease-out forwards;
        }
      `}</style>
    </div>
  );
}
