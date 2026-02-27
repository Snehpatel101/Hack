"use client";

import React, { useState, useMemo, useCallback } from "react";
import SchemaInferencePanel from "./SchemaInferencePanel";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Transaction {
  date: string;
  description: string;
  amount: number;
  category?: string;
}

interface ClimateWalletProps {
  transactions: Transaction[];
  normalizer?: {
    schemaMap: Array<{
      sourceColumn: string;
      internalField: string;
      confidence: number;
      method: string;
    }>;
    warnings: string[];
    transactionCount: number;
  };
  onBack: () => void;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const COLD_COLORS = [
  "#14B8A6", // teal-500
  "#06B6D4", // cyan-500
  "#3B82F6", // blue-500
  "#8B5CF6", // violet-500
  "#0EA5E9", // sky-500
  "#6366F1", // indigo-500
  "#10B981", // emerald-500
  "#A78BFA", // violet-400
  "#22D3EE", // cyan-400
  "#818CF8", // indigo-400
  "#2DD4BF", // teal-400
  "#60A5FA", // blue-400
];

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  housing: ["rent", "mortgage", "hoa", "property", "lease"],
  utilities: [
    "electric",
    "water",
    "gas bill",
    "utility",
    "power",
    "energy",
    "sewage",
    "internet",
    "wifi",
    "comcast",
    "verizon fios",
  ],
  "gas/fuel": [
    "shell",
    "chevron",
    "exxon",
    "bp",
    "fuel",
    "gasoline",
    "petrol",
    "gas station",
    "wawa fuel",
    "speedway",
  ],
  groceries: [
    "walmart",
    "kroger",
    "safeway",
    "whole foods",
    "trader joe",
    "aldi",
    "costco",
    "publix",
    "grocery",
    "market",
  ],
  dining: [
    "restaurant",
    "mcdonald",
    "starbucks",
    "chipotle",
    "subway",
    "doordash",
    "uber eats",
    "grubhub",
    "cafe",
    "pizza",
    "burger",
    "taco",
  ],
  shopping: [
    "amazon",
    "target",
    "best buy",
    "nike",
    "apple store",
    "etsy",
    "ebay",
    "shop",
    "store",
    "mall",
  ],
  transportation: [
    "uber",
    "lyft",
    "taxi",
    "parking",
    "toll",
    "transit",
    "metro",
    "bus pass",
  ],
  "travel/flights": [
    "airline",
    "flight",
    "hotel",
    "airbnb",
    "booking",
    "expedia",
    "delta",
    "united",
    "american air",
    "southwest",
  ],
  subscription: [
    "netflix",
    "spotify",
    "hulu",
    "disney",
    "hbo",
    "youtube",
    "apple music",
    "subscription",
  ],
  medical: [
    "hospital",
    "pharmacy",
    "cvs",
    "walgreens",
    "doctor",
    "dental",
    "medical",
    "health",
  ],
  insurance: ["insurance", "geico", "allstate", "state farm", "progressive"],
  debt_payment: ["loan payment", "credit card payment", "debt"],
  transfer: ["transfer", "zelle", "venmo", "paypal transfer"],
  income: ["payroll", "direct deposit", "salary", "income"],
};

/** Categories that represent expenses (used for the all-positive-amounts safety check) */
const EXPENSE_CATEGORIES = new Set([
  "housing",
  "groceries",
  "dining",
  "shopping",
  "utilities",
  "gas/fuel",
  "subscription",
  "medical",
  "insurance",
  "debt_payment",
  "transportation",
  "travel/flights",
  "other",
]);

const INSIGHT_BORDER_COLORS = [
  "border-l-teal-500",
  "border-l-blue-500",
  "border-l-violet-500",
  "border-l-amber-500",
  "border-l-cyan-500",
  "border-l-emerald-500",
];

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function inferCategory(description: string): string {
  const lower = description.toLowerCase();
  for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    for (const kw of keywords) {
      if (lower.includes(kw)) return cat;
    }
  }
  return "other";
}

function normalizeMerchant(desc: string): string {
  return desc
    .toUpperCase()
    .replace(/[0-9#*]/g, "")
    .replace(/[^A-Z\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function fmtDollars(n: number): string {
  return `$${Math.abs(n).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function fmtCompact(n: number): string {
  return `$${Math.abs(n).toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

function capitalize(str: string): string {
  return str
    .split(/[\s_/-]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

function polarToCartesian(
  cx: number,
  cy: number,
  r: number,
  angle: number
): { x: number; y: number } {
  const rad = ((angle - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function describeArc(
  cx: number,
  cy: number,
  r: number,
  startAngle: number,
  endAngle: number
): string {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  return `M ${cx} ${cy} L ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y} Z`;
}

function parseDate(dateStr: string): Date {
  const d = new Date(dateStr);
  if (!isNaN(d.getTime())) return d;
  // Fallback: try MM/DD/YYYY
  const parts = dateStr.split(/[/-]/);
  if (parts.length === 3) {
    return new Date(
      parseInt(parts[2]),
      parseInt(parts[0]) - 1,
      parseInt(parts[1])
    );
  }
  return new Date();
}

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function daysBetween(a: Date, b: Date): number {
  return Math.max(
    1,
    Math.round(Math.abs(b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24)) + 1
  );
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function ClimateWallet({
  transactions,
  normalizer,
  onBack,
}: ClimateWalletProps) {
  const [hoveredSlice, setHoveredSlice] = useState<number | null>(null);
  const [hoveredBar, setHoveredBar] = useState<number | null>(null);
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(
    new Set()
  );

  const handleSliceEnter = useCallback(
    (i: number) => setHoveredSlice(i),
    []
  );
  const handleSliceLeave = useCallback(() => setHoveredSlice(null), []);
  const handleBarEnter = useCallback((i: number) => setHoveredBar(i), []);
  const handleBarLeave = useCallback(() => setHoveredBar(null), []);

  /* ---------- core computation ------------------------------------- */

  /**
   * Safety check: if ALL amounts are positive (e.g., a bank statement that
   * lists debits as positive numbers), infer which transactions are expenses
   * based on their category and negate those amounts so the rest of the
   * component works correctly.
   */
  const normalizedTransactions = useMemo(() => {
    if (transactions.length === 0) return transactions;

    const hasNegative = transactions.some((tx) => tx.amount < 0);
    if (hasNegative) {
      // Amounts already have proper signs — no adjustment needed
      return transactions;
    }

    // All amounts are positive. Infer expenses from category keywords.
    return transactions.map((tx) => {
      const cat = tx.category || inferCategory(tx.description);
      if (EXPENSE_CATEGORIES.has(cat)) {
        // Treat as an expense — negate the amount
        return { ...tx, amount: -Math.abs(tx.amount) };
      }
      // Keep as-is (income, transfer, or unrecognised)
      return tx;
    });
  }, [transactions]);

  const expenses = useMemo(
    () => normalizedTransactions.filter((tx) => tx.amount < 0),
    [normalizedTransactions]
  );

  const incomeTransactions = useMemo(
    () => normalizedTransactions.filter((tx) => tx.amount > 0),
    [normalizedTransactions]
  );

  const totalSpending = useMemo(
    () => expenses.reduce((s, tx) => s + Math.abs(tx.amount), 0),
    [expenses]
  );

  const totalIncome = useMemo(
    () => incomeTransactions.reduce((s, tx) => s + tx.amount, 0),
    [incomeTransactions]
  );

  const netCashFlow = totalIncome - totalSpending;

  const dateRange = useMemo(() => {
    if (transactions.length === 0)
      return { earliest: new Date(), latest: new Date(), days: 1 };
    const dates = transactions.map((tx) => parseDate(tx.date));
    const sorted = dates.sort((a, b) => a.getTime() - b.getTime());
    const earliest = sorted[0];
    const latest = sorted[sorted.length - 1];
    return { earliest, latest, days: daysBetween(earliest, latest) };
  }, [transactions]);

  const avgDailySpend = totalSpending / dateRange.days;

  /* ---------- spending by category --------------------------------- */

  const categoryData = useMemo(() => {
    const sums: Record<string, number> = {};
    for (const tx of expenses) {
      const cat = tx.category || inferCategory(tx.description);
      const absAmt = Math.abs(tx.amount);
      sums[cat] = (sums[cat] || 0) + absAmt;
    }
    const result: { category: string; amount: number }[] = [];
    for (const [cat, amount] of Object.entries(sums)) {
      if (amount > 0) {
        result.push({ category: cat, amount });
      }
    }
    result.sort((a, b) => b.amount - a.amount);
    return result;
  }, [expenses]);

  const allCategories = useMemo(
    () => categoryData.map((d) => d.category),
    [categoryData]
  );

  const filteredCategoryData = useMemo(() => {
    if (selectedCategories.size === 0) return categoryData;
    return categoryData.filter((d) => selectedCategories.has(d.category));
  }, [categoryData, selectedCategories]);

  const filteredTotal = useMemo(
    () => filteredCategoryData.reduce((s, d) => s + d.amount, 0),
    [filteredCategoryData]
  );

  const toggleCategory = useCallback((cat: string) => {
    setSelectedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) {
        next.delete(cat);
      } else {
        next.add(cat);
      }
      return next;
    });
  }, []);

  /* ---------- pie chart geometry ----------------------------------- */

  const CX = 200;
  const CY = 200;
  const R = 140;

  const pieSlices = useMemo(() => {
    if (filteredTotal === 0) return [];
    let currentAngle = 0;
    return filteredCategoryData.map((d, i) => {
      const pct = d.amount / filteredTotal;
      const sweep = pct * 360;
      const startAngle = currentAngle;
      const endAngle = currentAngle + sweep;
      const midAngle = startAngle + sweep / 2;
      currentAngle = endAngle;
      return {
        ...d,
        startAngle,
        endAngle,
        midAngle,
        pct,
        color: COLD_COLORS[i % COLD_COLORS.length],
      };
    });
  }, [filteredCategoryData, filteredTotal]);

  /* ---------- bar chart data --------------------------------------- */

  const barData = useMemo(() => categoryData.slice(0, 8), [categoryData]);
  const maxBarAmount = useMemo(
    () => (barData.length > 0 ? barData[0].amount : 1),
    [barData]
  );
  const barChartHeight = barData.length * 44 + 20;

  /* ---------- top merchants ---------------------------------------- */

  const merchantData = useMemo(() => {
    const map: Record<
      string,
      { name: string; total: number; count: number }
    > = {};
    for (const tx of expenses) {
      const norm = normalizeMerchant(tx.description);
      if (!norm) continue;
      if (!map[norm]) map[norm] = { name: norm, total: 0, count: 0 };
      map[norm].total += Math.abs(tx.amount);
      map[norm].count += 1;
    }
    return Object.values(map)
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);
  }, [expenses]);

  const maxMerchantSpend = useMemo(
    () => (merchantData.length > 0 ? merchantData[0].total : 1),
    [merchantData]
  );

  /* ---------- spending over time ----------------------------------- */

  const timeSeriesData = useMemo(() => {
    if (expenses.length === 0) return [];

    const useWeekly = dateRange.days > 14;

    const buckets: Record<string, { label: string; total: number; date: Date }> =
      {};

    for (const tx of expenses) {
      const d = parseDate(tx.date);
      let key: string;
      let label: string;

      if (useWeekly) {
        // Week start (Sunday)
        const weekStart = new Date(d);
        weekStart.setDate(d.getDate() - d.getDay());
        key = weekStart.toISOString().slice(0, 10);
        label = `Wk ${formatDate(weekStart)}`;
      } else {
        key = d.toISOString().slice(0, 10);
        label = formatDate(d);
      }

      if (!buckets[key]) {
        buckets[key] = { label, total: 0, date: new Date(key) };
      }
      buckets[key].total += Math.abs(tx.amount);
    }

    return Object.values(buckets).sort(
      (a, b) => a.date.getTime() - b.date.getTime()
    );
  }, [expenses, dateRange.days]);

  const maxTimeValue = useMemo(
    () =>
      timeSeriesData.length > 0
        ? Math.max(...timeSeriesData.map((d) => d.total))
        : 1,
    [timeSeriesData]
  );

  /* ---------- spending insights ------------------------------------ */

  const insights = useMemo(() => {
    const result: string[] = [];

    if (categoryData.length > 0) {
      const top = categoryData[0];
      const pct = totalSpending > 0 ? (top.amount / totalSpending) * 100 : 0;
      result.push(
        `Your largest category is ${capitalize(top.category)} at ${pct.toFixed(1)}% of total spending`
      );
    }

    if (merchantData.length > 0) {
      const topMerchant = merchantData[0];
      result.push(
        `You spent ${fmtDollars(topMerchant.total)} across ${topMerchant.count} transaction${topMerchant.count !== 1 ? "s" : ""} at ${topMerchant.name}`
      );
    }

    // Highest spending day
    if (expenses.length > 0) {
      const dailySums: Record<string, number> = {};
      for (const tx of expenses) {
        const key = parseDate(tx.date).toISOString().slice(0, 10);
        dailySums[key] = (dailySums[key] || 0) + Math.abs(tx.amount);
      }
      const entries = Object.entries(dailySums).sort(([, a], [, b]) => b - a);
      if (entries.length > 0) {
        const [dateStr, amount] = entries[0];
        const d = new Date(dateStr);
        result.push(
          `Your highest spending day was ${d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })} at ${fmtDollars(amount)}`
        );
      }
    }

    // Category > 40% warning
    if (categoryData.length > 0 && totalSpending > 0) {
      const top = categoryData[0];
      const pct = (top.amount / totalSpending) * 100;
      if (pct > 40) {
        result.push(
          `Consider reviewing your ${capitalize(top.category)} spending \u2014 it\u2019s ${pct.toFixed(0)}% of your total`
        );
      }
    }

    // Spending > Income warning
    if (totalSpending > totalIncome && totalIncome > 0) {
      const diff = totalSpending - totalIncome;
      result.push(
        `Heads up: your spending exceeds your income by ${fmtDollars(diff)} this period`
      );
    }

    return result;
  }, [categoryData, merchantData, expenses, totalSpending, totalIncome]);

  /* ---------- line chart geometry ---------------------------------- */

  const LINE_W = 700;
  const LINE_H = 220;
  const LINE_PAD_X = 50;
  const LINE_PAD_Y = 30;
  const LINE_PAD_BOTTOM = 50;
  const chartW = LINE_W - LINE_PAD_X * 2;
  const chartH = LINE_H - LINE_PAD_Y - LINE_PAD_BOTTOM;

  const linePoints = useMemo(() => {
    if (timeSeriesData.length === 0) return "";
    const xStep =
      timeSeriesData.length > 1 ? chartW / (timeSeriesData.length - 1) : 0;
    return timeSeriesData
      .map((d, i) => {
        const x = LINE_PAD_X + i * xStep;
        const y =
          LINE_PAD_Y + chartH - (d.total / (maxTimeValue || 1)) * chartH;
        return `${x},${y}`;
      })
      .join(" ");
  }, [timeSeriesData, chartW, chartH, maxTimeValue]);

  const areaPath = useMemo(() => {
    if (timeSeriesData.length === 0) return "";
    const xStep =
      timeSeriesData.length > 1 ? chartW / (timeSeriesData.length - 1) : 0;
    const points = timeSeriesData.map((d, i) => {
      const x = LINE_PAD_X + i * xStep;
      const y =
        LINE_PAD_Y + chartH - (d.total / (maxTimeValue || 1)) * chartH;
      return `${x},${y}`;
    });
    const baseline = LINE_PAD_Y + chartH;
    const firstX = LINE_PAD_X;
    const lastX = LINE_PAD_X + (timeSeriesData.length - 1) * xStep;
    return `M ${firstX},${baseline} L ${points.join(" L ")} L ${lastX},${baseline} Z`;
  }, [timeSeriesData, chartW, chartH, maxTimeValue]);

  /* ---------- render ----------------------------------------------- */

  return (
    <div className="min-h-screen bg-[#0f172a] text-slate-100 px-4 py-8 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto space-y-8">
        {/* ============================================================ */}
        {/* Header with Back Button                                      */}
        {/* ============================================================ */}
        <div>
          <button
            onClick={onBack}
            className="inline-flex items-center gap-2 text-slate-400 hover:text-slate-200 transition-colors text-sm mb-4"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              className="shrink-0"
            >
              <path
                d="M10 12L6 8L10 4"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Back
          </button>

          <h1 className="text-2xl font-bold tracking-tight text-slate-100">
            Climate Wallet &mdash; Your Spending Ecosystem
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Understand where your money flows
          </p>
        </div>

        {/* ============================================================ */}
        {/* Section 1: Summary Stats                                     */}
        {/* ============================================================ */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Total Spending */}
          <div className="bg-[#1e293b] rounded-xl border border-slate-600/50 p-5">
            <p className="text-slate-400 text-xs font-medium uppercase tracking-wider mb-1">
              Total Spending
            </p>
            <p className="text-3xl font-bold text-teal-400">
              {fmtDollars(totalSpending)}
            </p>
            <p className="text-slate-500 text-sm mt-0.5">
              {expenses.length} transaction{expenses.length !== 1 ? "s" : ""}
            </p>
          </div>

          {/* Total Income */}
          <div className="bg-[#1e293b] rounded-xl border border-slate-600/50 p-5">
            <p className="text-slate-400 text-xs font-medium uppercase tracking-wider mb-1">
              Total Income
            </p>
            <p className="text-3xl font-bold text-emerald-400">
              {fmtDollars(totalIncome)}
            </p>
            <p className="text-slate-500 text-sm mt-0.5">
              {incomeTransactions.length} deposit
              {incomeTransactions.length !== 1 ? "s" : ""}
            </p>
          </div>

          {/* Net Cash Flow */}
          <div className="bg-[#1e293b] rounded-xl border border-slate-600/50 p-5">
            <p className="text-slate-400 text-xs font-medium uppercase tracking-wider mb-1">
              Net Cash Flow
            </p>
            <p
              className={`text-3xl font-bold ${
                netCashFlow >= 0 ? "text-emerald-400" : "text-red-400"
              }`}
            >
              {netCashFlow >= 0 ? "+" : "-"}
              {fmtDollars(Math.abs(netCashFlow))}
            </p>
            <p className="text-slate-500 text-sm mt-0.5">
              {netCashFlow >= 0 ? "Surplus" : "Deficit"} this period
            </p>
          </div>

          {/* Avg Daily Spend */}
          <div className="bg-[#1e293b] rounded-xl border border-slate-600/50 p-5">
            <p className="text-slate-400 text-xs font-medium uppercase tracking-wider mb-1">
              Avg Daily Spend
            </p>
            <p className="text-3xl font-bold text-cyan-400">
              {fmtDollars(avgDailySpend)}
            </p>
            <p className="text-slate-500 text-sm mt-0.5">
              Over {dateRange.days} day{dateRange.days !== 1 ? "s" : ""}
            </p>
          </div>
        </div>

        {/* ============================================================ */}
        {/* Section 2: Spending by Category - Pie Chart                  */}
        {/* ============================================================ */}
        <div className="bg-[#1e293b] rounded-xl border border-slate-600/50 p-6">
          <h2 className="text-lg font-semibold text-slate-100 mb-1">
            Spending by Category
          </h2>
          <p className="text-slate-500 text-xs mb-4">
            Breakdown of where your money goes
          </p>

          {/* Filter pills */}
          {allCategories.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-5">
              <button
                onClick={() => setSelectedCategories(new Set())}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                  selectedCategories.size === 0
                    ? "bg-teal-500/20 text-teal-300 border border-teal-500/40"
                    : "bg-slate-700/50 text-slate-400 border border-slate-600/30 hover:bg-slate-700"
                }`}
              >
                All
              </button>
              {allCategories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => toggleCategory(cat)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                    selectedCategories.has(cat)
                      ? "bg-teal-500/20 text-teal-300 border border-teal-500/40"
                      : "bg-slate-700/50 text-slate-400 border border-slate-600/30 hover:bg-slate-700"
                  }`}
                >
                  {capitalize(cat)}
                </button>
              ))}
            </div>
          )}

          {pieSlices.length === 0 ? (
            <p className="text-slate-400 text-sm text-center py-12">
              No spending data to display.
            </p>
          ) : (
            <div className="flex flex-col lg:flex-row items-center gap-8">
              {/* Pie SVG */}
              <svg
                viewBox="0 0 400 400"
                className="w-full max-w-[280px] shrink-0"
                role="img"
                aria-label="Pie chart of spending by category"
              >
                {pieSlices.length === 1 ? (
                  <g
                    onMouseEnter={() => handleSliceEnter(0)}
                    onMouseLeave={handleSliceLeave}
                    style={{ cursor: "pointer" }}
                  >
                    <circle
                      cx={CX}
                      cy={CY}
                      r={R}
                      fill={pieSlices[0].color}
                      stroke="#0f172a"
                      strokeWidth="2"
                      style={{
                        transform:
                          hoveredSlice === 0 ? "scale(1.03)" : "scale(1)",
                        transformOrigin: `${CX}px ${CY}px`,
                        transition: "transform 0.2s ease",
                      }}
                    />
                    <text
                      x={CX}
                      y={CY}
                      textAnchor="middle"
                      dominantBaseline="central"
                      fill="#f1f5f9"
                      fontSize="12"
                      fontWeight="600"
                      style={{ pointerEvents: "none" }}
                    >
                      100%
                    </text>
                  </g>
                ) : (
                  pieSlices.map((slice, i) => {
                    const isHovered = hoveredSlice === i;
                    const midRad = ((slice.midAngle - 90) * Math.PI) / 180;
                    const tx = isHovered ? Math.cos(midRad) * 8 : 0;
                    const ty = isHovered ? Math.sin(midRad) * 8 : 0;

                    const d =
                      slice.endAngle - slice.startAngle >= 359.9
                        ? (() => {
                            const s1 = polarToCartesian(CX, CY, R, 0);
                            const s2 = polarToCartesian(CX, CY, R, 180);
                            return `M ${CX} ${CY} L ${s1.x} ${s1.y} A ${R} ${R} 0 0 0 ${s2.x} ${s2.y} A ${R} ${R} 0 0 0 ${s1.x} ${s1.y} Z`;
                          })()
                        : describeArc(
                            CX,
                            CY,
                            R,
                            slice.startAngle,
                            slice.endAngle
                          );

                    const labelR = R * 0.65;
                    const labelPos = polarToCartesian(
                      CX,
                      CY,
                      labelR,
                      slice.midAngle
                    );

                    return (
                      <g
                        key={i}
                        onMouseEnter={() => handleSliceEnter(i)}
                        onMouseLeave={handleSliceLeave}
                        style={{
                          transform: `translate(${tx}px, ${ty}px)`,
                          transition: "transform 0.2s ease",
                          cursor: "pointer",
                        }}
                      >
                        <path
                          d={d}
                          fill={slice.color}
                          stroke="#0f172a"
                          strokeWidth="2"
                          opacity={
                            hoveredSlice !== null && hoveredSlice !== i
                              ? 0.5
                              : 1
                          }
                          style={{ transition: "opacity 0.2s ease" }}
                        />
                        {slice.pct > 0.05 && (
                          <text
                            x={labelPos.x}
                            y={labelPos.y}
                            textAnchor="middle"
                            dominantBaseline="central"
                            fill="#f1f5f9"
                            fontSize="11"
                            fontWeight="600"
                            style={{ pointerEvents: "none" }}
                          >
                            {(slice.pct * 100).toFixed(0)}%
                          </text>
                        )}
                      </g>
                    );
                  })
                )}
              </svg>

              {/* Legend */}
              <div className="flex-1 w-full">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
                  {pieSlices.map((slice, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-2 py-1 cursor-pointer"
                      onMouseEnter={() => handleSliceEnter(i)}
                      onMouseLeave={handleSliceLeave}
                    >
                      <span
                        className="w-3 h-3 rounded-sm shrink-0"
                        style={{ backgroundColor: slice.color }}
                      />
                      <span className="text-sm text-slate-300 truncate flex-1 capitalize">
                        {capitalize(slice.category)}
                      </span>
                      <span className="text-xs text-slate-400 tabular-nums whitespace-nowrap">
                        {fmtDollars(slice.amount)}
                      </span>
                      <span className="text-xs text-slate-500 tabular-nums w-12 text-right">
                        {(slice.pct * 100).toFixed(1)}%
                      </span>
                    </div>
                  ))}
                </div>

                {/* Total row */}
                <div className="mt-3 pt-3 border-t border-slate-600/50 flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-400">
                    Total
                  </span>
                  <span className="text-sm font-semibold text-slate-100">
                    {fmtDollars(
                      selectedCategories.size > 0 ? filteredTotal : totalSpending
                    )}
                  </span>
                </div>
                {selectedCategories.size > 0 && (
                  <p className="text-xs text-slate-500 mt-1">
                    Showing {selectedCategories.size} of {allCategories.length}{" "}
                    categories ({fmtDollars(filteredTotal)} of{" "}
                    {fmtDollars(totalSpending)})
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ============================================================ */}
        {/* Section 3: Top Spending Categories - Bar Chart                */}
        {/* ============================================================ */}
        {barData.length > 0 && (
          <div className="bg-[#1e293b] rounded-xl border border-slate-600/50 p-6">
            <h2 className="text-lg font-semibold text-slate-100 mb-4">
              Top Spending Categories
            </h2>

            <svg
              viewBox={`0 0 560 ${barChartHeight}`}
              className="w-full"
              role="img"
              aria-label="Horizontal bar chart of top spending categories"
            >
              <defs>
                {barData.map((_, i) => (
                  <linearGradient
                    key={i}
                    id={`spend-bar-grad-${i}`}
                    x1="0"
                    y1="0"
                    x2="1"
                    y2="0"
                  >
                    <stop
                      offset="0%"
                      stopColor={COLD_COLORS[i % COLD_COLORS.length]}
                      stopOpacity="0.85"
                    />
                    <stop
                      offset="100%"
                      stopColor={
                        COLD_COLORS[(i + 1) % COLD_COLORS.length]
                      }
                      stopOpacity="1"
                    />
                  </linearGradient>
                ))}
              </defs>

              {barData.map((d, i) => {
                const y = i * 44 + 10;
                const barMaxWidth = 320;
                const barWidth = Math.max(
                  8,
                  (d.amount / maxBarAmount) * barMaxWidth
                );
                const isHov = hoveredBar === i;
                const labelX = 140;
                const barX = 150;

                return (
                  <g
                    key={i}
                    onMouseEnter={() => handleBarEnter(i)}
                    onMouseLeave={handleBarLeave}
                    style={{ cursor: "pointer" }}
                  >
                    {/* category label */}
                    <text
                      x={labelX}
                      y={y + 18}
                      textAnchor="end"
                      fill={isHov ? "#e2e8f0" : "#94a3b8"}
                      fontSize="12"
                      fontWeight="500"
                      style={{ transition: "fill 0.15s" }}
                    >
                      {capitalize(d.category)}
                    </text>

                    {/* bar background */}
                    <rect
                      x={barX}
                      y={y + 5}
                      width={barMaxWidth}
                      height={24}
                      rx="6"
                      fill="#0f172a"
                      opacity="0.5"
                    />

                    {/* bar fill */}
                    <rect
                      x={barX}
                      y={y + 5}
                      width={barWidth}
                      height={24}
                      rx="6"
                      fill={`url(#spend-bar-grad-${i})`}
                      opacity={isHov ? 1 : 0.85}
                      style={{
                        transition: "opacity 0.15s, width 0.3s ease",
                      }}
                    />

                    {/* dollar amount */}
                    <text
                      x={barX + barWidth + 10}
                      y={y + 20}
                      fill={isHov ? "#e2e8f0" : "#64748b"}
                      fontSize="11"
                      fontWeight="600"
                      style={{ transition: "fill 0.15s" }}
                    >
                      {fmtDollars(d.amount)}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        )}

        {/* ============================================================ */}
        {/* Section 4: Top Merchants                                     */}
        {/* ============================================================ */}
        {merchantData.length > 0 && (
          <div className="bg-[#1e293b] rounded-xl border border-slate-600/50 p-6">
            <h2 className="text-lg font-semibold text-slate-100 mb-4">
              Top Merchants
            </h2>

            <div className="space-y-3">
              {merchantData.map((m, i) => {
                const relWidth =
                  maxMerchantSpend > 0
                    ? (m.total / maxMerchantSpend) * 100
                    : 0;

                return (
                  <div
                    key={i}
                    className="flex items-center gap-3 group"
                  >
                    {/* Rank number */}
                    <span
                      className="text-sm font-bold w-7 text-right shrink-0"
                      style={{
                        color: COLD_COLORS[i % COLD_COLORS.length],
                      }}
                    >
                      {i + 1}
                    </span>

                    {/* Merchant info + bar */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-slate-200 truncate">
                          {m.name}
                        </span>
                        <div className="flex items-center gap-3 shrink-0 ml-3">
                          <span className="text-xs text-slate-500">
                            {m.count} txn{m.count !== 1 ? "s" : ""}
                          </span>
                          <span className="text-sm tabular-nums font-semibold text-slate-300">
                            {fmtDollars(m.total)}
                          </span>
                        </div>
                      </div>

                      {/* Relative spending bar */}
                      <div className="w-full h-1.5 rounded-full bg-slate-700/60 overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500 ease-out"
                          style={{
                            width: `${relWidth}%`,
                            backgroundColor:
                              COLD_COLORS[i % COLD_COLORS.length],
                            opacity: 0.7,
                          }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* Section 5: Spending Over Time - Line Chart                   */}
        {/* ============================================================ */}
        {timeSeriesData.length > 1 && (
          <div className="bg-[#1e293b] rounded-xl border border-slate-600/50 p-6">
            <h2 className="text-lg font-semibold text-slate-100 mb-1">
              Spending Over Time
            </h2>
            <p className="text-slate-500 text-xs mb-4">
              {dateRange.days > 14 ? "Weekly" : "Daily"} spending from{" "}
              {formatDate(dateRange.earliest)} to {formatDate(dateRange.latest)}
            </p>

            <svg
              viewBox={`0 0 ${LINE_W} ${LINE_H}`}
              className="w-full"
              role="img"
              aria-label="Line chart of spending over time"
              preserveAspectRatio="xMidYMid meet"
            >
              <defs>
                <linearGradient
                  id="area-fill-grad"
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop
                    offset="0%"
                    stopColor="#14B8A6"
                    stopOpacity="0.25"
                  />
                  <stop
                    offset="100%"
                    stopColor="#14B8A6"
                    stopOpacity="0.02"
                  />
                </linearGradient>
              </defs>

              {/* Y-axis grid lines */}
              {[0, 0.25, 0.5, 0.75, 1].map((frac) => {
                const y = LINE_PAD_Y + chartH - frac * chartH;
                const val = frac * maxTimeValue;
                return (
                  <g key={frac}>
                    <line
                      x1={LINE_PAD_X}
                      y1={y}
                      x2={LINE_W - LINE_PAD_X}
                      y2={y}
                      stroke="#334155"
                      strokeWidth="0.5"
                      strokeDasharray="4 4"
                    />
                    <text
                      x={LINE_PAD_X - 8}
                      y={y + 4}
                      textAnchor="end"
                      fill="#64748b"
                      fontSize="9"
                    >
                      {fmtCompact(val)}
                    </text>
                  </g>
                );
              })}

              {/* Area fill */}
              {areaPath && (
                <path
                  d={areaPath}
                  fill="url(#area-fill-grad)"
                />
              )}

              {/* Line */}
              {linePoints && (
                <polyline
                  points={linePoints}
                  fill="none"
                  stroke="#14B8A6"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}

              {/* Data points */}
              {timeSeriesData.map((d, i) => {
                const xStep =
                  timeSeriesData.length > 1
                    ? chartW / (timeSeriesData.length - 1)
                    : 0;
                const x = LINE_PAD_X + i * xStep;
                const y =
                  LINE_PAD_Y +
                  chartH -
                  (d.total / (maxTimeValue || 1)) * chartH;

                return (
                  <g key={i}>
                    <circle
                      cx={x}
                      cy={y}
                      r="4"
                      fill="#0f172a"
                      stroke="#14B8A6"
                      strokeWidth="2"
                    />
                    {/* X-axis label (show every Nth to avoid crowding) */}
                    {(timeSeriesData.length <= 10 ||
                      i % Math.ceil(timeSeriesData.length / 8) === 0 ||
                      i === timeSeriesData.length - 1) && (
                      <text
                        x={x}
                        y={LINE_H - 10}
                        textAnchor="middle"
                        fill="#64748b"
                        fontSize="9"
                        style={{
                          transform: "rotate(-30deg)",
                          transformOrigin: `${x}px ${LINE_H - 10}px`,
                        }}
                      >
                        {d.label}
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>
          </div>
        )}

        {/* ============================================================ */}
        {/* Section 6: Spending Insights                                  */}
        {/* ============================================================ */}
        {insights.length > 0 && (
          <div>
            <h2 className="text-lg font-semibold text-slate-100 mb-4">
              Spending Insights
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {insights.map((insight, i) => (
                <div
                  key={i}
                  className={`bg-[#1e293b] rounded-xl border border-slate-600/50 border-l-4 ${
                    INSIGHT_BORDER_COLORS[i % INSIGHT_BORDER_COLORS.length]
                  } p-4`}
                >
                  <p className="text-sm text-slate-300 leading-relaxed">
                    {insight}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* Section 7: Schema Inference Panel                            */}
        {/* ============================================================ */}
        {normalizer && (
          <SchemaInferencePanel
            schemaMap={normalizer.schemaMap}
            warnings={normalizer.warnings}
            transactionCount={normalizer.transactionCount}
            isCollapsible={true}
            defaultOpen={false}
          />
        )}

        {/* ============================================================ */}
        {/* Footer                                                       */}
        {/* ============================================================ */}
        <div className="border-t border-slate-600/30 pt-6 pb-4">
          <p className="text-slate-500 text-xs leading-relaxed max-w-2xl">
            Climate Wallet provides spending analysis based on your uploaded
            data. This is an educational tool &mdash; not financial advice.
          </p>
        </div>

        {/* ============================================================ */}
        {/* Prominent "Start Over" button                                 */}
        {/* ============================================================ */}
        <div className="text-center pt-4 pb-8">
          <button
            onClick={onBack}
            className="px-6 py-2.5 bg-gradient-to-r from-teal-500 to-cyan-500 rounded-lg text-white font-medium hover:from-teal-600 hover:to-cyan-600 transition-all duration-300 shadow-lg shadow-teal-500/20 hover:shadow-teal-500/40"
          >
            Start Over
          </button>
        </div>
      </div>
    </div>
  );
}
