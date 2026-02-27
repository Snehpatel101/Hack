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
    schemaMap: Array<{ sourceColumn: string; internalField: string; confidence: number; method: string }>;
    warnings: string[];
    transactionCount: number;
  };
  onBack: () => void;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const CO2_FACTORS: Record<string, number> = {
  housing: 0.4,
  utilities: 1.5,
  "gas/fuel": 2.3,
  groceries: 0.7,
  dining: 0.8,
  shopping: 0.5,
  transportation: 1.8,
  "travel/flights": 2.5,
  subscription: 0.2,
  medical: 0.3,
  insurance: 0.1,
  debt_payment: 0.0,
  transfer: 0.0,
  income: 0.0,
  other: 0.4,
};

const COLD_COLORS = [
  "#3B82F6",
  "#06B6D4",
  "#8B5CF6",
  "#0EA5E9",
  "#6366F1",
  "#14B8A6",
  "#A78BFA",
  "#22D3EE",
  "#818CF8",
  "#2DD4BF",
];

const NATIONAL_AVG_KG = 1200;

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  housing: ["rent", "mortgage", "hoa", "property"],
  utilities: ["electric", "water", "gas bill", "utility", "power", "energy", "sewage", "internet", "wifi"],
  "gas/fuel": ["shell", "chevron", "exxon", "bp", "fuel", "gasoline", "petrol", "gas station", "wawa fuel", "speedway"],
  groceries: ["walmart", "kroger", "safeway", "whole foods", "trader joe", "aldi", "costco", "publix", "grocery", "market"],
  dining: ["restaurant", "mcdonald", "starbucks", "chipotle", "subway", "doordash", "uber eats", "grubhub", "cafe", "pizza", "burger", "taco"],
  shopping: ["amazon", "target", "best buy", "nike", "apple store", "etsy", "ebay", "shop", "store", "mall"],
  transportation: ["uber", "lyft", "taxi", "parking", "toll", "transit", "metro", "bus pass"],
  "travel/flights": ["airline", "flight", "hotel", "airbnb", "booking", "expedia", "delta", "united", "american air", "southwest"],
  subscription: ["netflix", "spotify", "hulu", "disney", "hbo", "youtube", "apple music", "subscription"],
  medical: ["hospital", "pharmacy", "cvs", "walgreens", "doctor", "dental", "medical", "health"],
  insurance: ["insurance", "geico", "allstate", "state farm", "progressive"],
  debt_payment: ["loan payment", "credit card payment", "debt"],
  transfer: ["transfer", "zelle", "venmo", "paypal transfer"],
  income: ["payroll", "direct deposit", "salary", "income"],
};

const SWAP_RULES: Record<string, { title: string; description: string; effort: "Easy" | "Medium" }> = {
  "gas/fuel": {
    title: "Reduce driving days",
    description: "Consider carpooling or public transit 2 days/week — could reduce transport emissions by ~40%",
    effort: "Medium",
  },
  dining: {
    title: "Cook more at home",
    description: "Try cooking at home 2 more meals per week — saves money AND reduces food-related emissions",
    effort: "Easy",
  },
  utilities: {
    title: "Upgrade home efficiency",
    description: "Switch to LED bulbs and use a smart thermostat — typical savings of 10-15% on energy",
    effort: "Easy",
  },
  groceries: {
    title: "Eat seasonal & plant-forward",
    description: "Buy seasonal produce and reduce red meat by 1 meal/week — meaningful impact without big sacrifice",
    effort: "Easy",
  },
  shopping: {
    title: "Adopt the 48-hour rule",
    description: "Try a 48-hour rule before purchases — reduces impulse buys and associated shipping emissions",
    effort: "Easy",
  },
  "travel/flights": {
    title: "Choose surface travel",
    description: "For trips under 500 miles, consider train or bus — up to 80% less carbon than flying",
    effort: "Medium",
  },
  housing: {
    title: "Seal & insulate",
    description: "Weatherstrip doors and add window insulation film — low-cost ways to cut heating/cooling waste",
    effort: "Easy",
  },
  transportation: {
    title: "Bundle errands",
    description: "Combine trips and plan routes — fewer cold starts and less idling mean measurable savings",
    effort: "Easy",
  },
};

const INCENTIVES: Record<string, Array<{ name: string; description: string }>> = {
  "New York": [
    { name: "NYSERDA home energy rebates", description: "Up to $10,000 in rebates for home energy upgrades including insulation, heat pumps, and solar." },
    { name: "MTA reduced fare programs", description: "Discounted MetroCards for eligible residents — cuts commuting costs and emissions." },
    { name: "ConEd smart usage rewards", description: "Earn bill credits by reducing energy use during peak demand periods." },
  ],
  California: [
    { name: "SGIP battery storage rebates", description: "Incentives for residential battery storage systems to pair with rooftop solar." },
    { name: "Clean Vehicle Rebate Project", description: "Up to $7,500 back on the purchase or lease of eligible zero-emission vehicles." },
    { name: "PG&E energy efficiency programs", description: "Free home energy assessments and rebates on efficient appliances." },
  ],
  Texas: [
    { name: "Texas PACE program", description: "Financing for commercial energy efficiency and water conservation projects." },
    { name: "CPS Energy rebates", description: "Cash rebates for ENERGY STAR appliances, HVAC systems, and solar installations." },
    { name: "TxDOT rideshare incentives", description: "Employer-based commuter benefits and vanpool subsidies in major metro areas." },
  ],
  Florida: [
    { name: "FPL energy efficiency rebates", description: "Rebates on qualifying high-efficiency AC systems, water heaters, and insulation." },
    { name: "SunPass toll savings", description: "Prepaid toll discounts that also reduce stop-and-go emissions at toll plazas." },
    { name: "Duke Energy smart home program", description: "Free smart thermostat and energy-saving kits for qualifying households." },
  ],
  Illinois: [
    { name: "ComEd energy efficiency program", description: "Free energy assessments and rebates on LED lighting, smart thermostats, and more." },
    { name: "Metra commuter benefits", description: "Pre-tax transit benefits and employer-subsidized passes for Metra rail commuters." },
    { name: "IL Solar for All", description: "Solar energy for income-eligible households at no upfront cost." },
  ],
  Washington: [
    { name: "PSE energy rebates", description: "Puget Sound Energy rebates for insulation, windows, heat pumps, and water heaters." },
    { name: "ORCA transit card benefits", description: "Employer-subsidized ORCA cards and low-income fare programs across the Puget Sound." },
    { name: "WA state EV incentives", description: "Sales tax exemptions on qualifying electric and plug-in hybrid vehicles." },
  ],
  Oregon: [
    { name: "Energy Trust of Oregon rebates", description: "Cash incentives for energy-efficient heating, cooling, insulation, and solar." },
    { name: "TriMet employer programs", description: "Subsidized transit passes and commuter benefits through participating employers." },
    { name: "OR clean vehicle rebate", description: "Up to $5,000 for purchase or lease of qualifying battery electric vehicles." },
  ],
  Colorado: [
    { name: "Xcel Energy rebates", description: "Rebates on ENERGY STAR appliances, EV chargers, and home weatherization." },
    { name: "RTD EcoPass", description: "Unlimited rides on all RTD services — offered through employers and neighborhoods." },
    { name: "CO EV tax credits", description: "State tax credit up to $5,000 for new electric vehicle purchases." },
  ],
};

const LOCATIONS = ["New York", "California", "Texas", "Florida", "Illinois", "Washington", "Oregon", "Colorado"];

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

function fmt(n: number): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: 1 });
}

function polarToCartesian(cx: number, cy: number, r: number, angle: number) {
  const rad = ((angle - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number) {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  return `M ${cx} ${cy} L ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y} Z`;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function ClimateWallet({ transactions, normalizer, onBack }: ClimateWalletProps) {
  const [hoveredSlice, setHoveredSlice] = useState<number | null>(null);
  const [hoveredBar, setHoveredBar] = useState<number | null>(null);
  const [selectedLocation, setSelectedLocation] = useState("");

  /* ---------- data computation ------------------------------------ */

  const categoryData = useMemo(() => {
    const sums: Record<string, number> = {};

    for (const tx of transactions) {
      const cat = tx.category || inferCategory(tx.description);
      const absAmt = Math.abs(tx.amount);
      sums[cat] = (sums[cat] || 0) + absAmt;
    }

    const result: { category: string; dollars: number; co2: number }[] = [];
    for (const [cat, dollars] of Object.entries(sums)) {
      const factor = CO2_FACTORS[cat] ?? CO2_FACTORS.other;
      const co2 = dollars * factor;
      if (co2 > 0) {
        result.push({ category: cat, dollars, co2 });
      }
    }

    result.sort((a, b) => b.co2 - a.co2);
    return result;
  }, [transactions]);

  const totalCO2 = useMemo(() => categoryData.reduce((s, d) => s + d.co2, 0), [categoryData]);

  const rankLabel = totalCO2 <= NATIONAL_AVG_KG ? "Below Average" : "Above Average";
  const rankColor = totalCO2 <= NATIONAL_AVG_KG ? "text-emerald-400" : "text-amber-400";

  const merchantData = useMemo(() => {
    const map: Record<string, { name: string; co2: number }> = {};
    for (const tx of transactions) {
      const cat = tx.category || inferCategory(tx.description);
      const factor = CO2_FACTORS[cat] ?? CO2_FACTORS.other;
      if (factor === 0) continue;
      const norm = normalizeMerchant(tx.description);
      if (!norm) continue;
      if (!map[norm]) map[norm] = { name: norm, co2: 0 };
      map[norm].co2 += Math.abs(tx.amount) * factor;
    }
    return Object.values(map)
      .sort((a, b) => b.co2 - a.co2)
      .slice(0, 5);
  }, [transactions]);

  const swaps = useMemo(() => {
    const topCats = categoryData.slice(0, 6).map((d) => d.category);
    const chosen: { title: string; description: string; effort: "Easy" | "Medium"; impact: number }[] = [];
    for (const cat of topCats) {
      if (chosen.length >= 3) break;
      const rule = SWAP_RULES[cat];
      if (!rule) continue;
      const catEntry = categoryData.find((d) => d.category === cat);
      const estimatedSaving = catEntry ? catEntry.co2 * 0.25 : 10;
      chosen.push({ ...rule, impact: estimatedSaving });
    }
    // fill remaining slots if needed
    if (chosen.length < 3) {
      const allKeys = Object.keys(SWAP_RULES);
      for (const key of allKeys) {
        if (chosen.length >= 3) break;
        if (chosen.some((c) => c.title === SWAP_RULES[key].title)) continue;
        chosen.push({ ...SWAP_RULES[key], impact: 15 });
      }
    }
    return chosen.slice(0, 3);
  }, [categoryData]);

  /* ---------- pie chart geometry ---------------------------------- */

  const pieSlices = useMemo(() => {
    if (totalCO2 === 0) return [];
    let currentAngle = 0;
    return categoryData.map((d, i) => {
      const pct = d.co2 / totalCO2;
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
  }, [categoryData, totalCO2]);

  /* ---------- bar chart data -------------------------------------- */

  const barData = useMemo(() => categoryData.slice(0, 8), [categoryData]);
  const maxBarCO2 = useMemo(() => (barData.length > 0 ? barData[0].co2 : 1), [barData]);

  /* ---------- event handlers -------------------------------------- */

  const handleSliceEnter = useCallback((i: number) => setHoveredSlice(i), []);
  const handleSliceLeave = useCallback(() => setHoveredSlice(null), []);
  const handleBarEnter = useCallback((i: number) => setHoveredBar(i), []);
  const handleBarLeave = useCallback(() => setHoveredBar(null), []);

  /* ---------- render ---------------------------------------------- */

  const CX = 200;
  const CY = 200;
  const R = 140;

  const barChartHeight = barData.length * 40 + 20;

  return (
    <div className="min-h-screen bg-[#0f172a] text-slate-100 px-4 py-8 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Back button */}
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 text-slate-400 hover:text-slate-200 transition-colors text-sm"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="shrink-0">
            <path d="M10 12L6 8L10 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Back
        </button>

        {/* Title */}
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-100">Climate Wallet</h1>
          <p className="text-slate-400 text-sm mt-1">
            Your estimated carbon footprint based on spending patterns
          </p>
        </div>

        {/* ============================================================ */}
        {/* Section 1: Footprint Summary Header                          */}
        {/* ============================================================ */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Estimated Monthly Footprint */}
          <div className="bg-[#1e293b] rounded-xl border border-slate-600/50 p-5">
            <p className="text-slate-400 text-xs font-medium uppercase tracking-wider mb-1">
              Estimated Monthly Footprint
            </p>
            <p className="text-3xl font-bold text-emerald-400">{fmt(totalCO2)}</p>
            <p className="text-emerald-500 text-sm mt-0.5">kg CO&#x2082;e</p>
          </div>

          {/* National Average */}
          <div className="bg-[#1e293b] rounded-xl border border-slate-600/50 p-5">
            <p className="text-slate-400 text-xs font-medium uppercase tracking-wider mb-1">
              National Average
            </p>
            <p className="text-3xl font-bold text-slate-300">{fmt(NATIONAL_AVG_KG)}</p>
            <p className="text-slate-500 text-sm mt-0.5">kg CO&#x2082;e/mo</p>
          </div>

          {/* Your Rank */}
          <div className="bg-[#1e293b] rounded-xl border border-slate-600/50 p-5">
            <p className="text-slate-400 text-xs font-medium uppercase tracking-wider mb-1">
              Your Rank
            </p>
            <p className={`text-3xl font-bold ${rankColor}`}>{rankLabel}</p>
            <p className="text-slate-500 text-sm mt-0.5">
              {totalCO2 <= NATIONAL_AVG_KG
                ? `${fmt(NATIONAL_AVG_KG - totalCO2)} kg below avg`
                : `${fmt(totalCO2 - NATIONAL_AVG_KG)} kg above avg`}
            </p>
          </div>
        </div>

        {/* ============================================================ */}
        {/* Section 2: Footprint by Category — Pie Chart                 */}
        {/* ============================================================ */}
        <div className="bg-[#1e293b] rounded-xl border border-slate-600/50 p-6">
          <h2 className="text-lg font-semibold text-slate-100 mb-1">Footprint by Category</h2>
          <p className="text-slate-500 text-xs mb-5">
            Estimates based on industry averages per dollar spent
          </p>

          {pieSlices.length === 0 ? (
            <p className="text-slate-400 text-sm text-center py-12">No emissions data to display.</p>
          ) : (
            <div className="flex flex-col lg:flex-row items-center gap-8">
              {/* Pie SVG */}
              <svg viewBox="0 0 400 400" className="w-full max-w-[280px] shrink-0" role="img" aria-label="Pie chart of carbon footprint by category">
                {pieSlices.map((slice, i) => {
                  const isHovered = hoveredSlice === i;
                  const midRad = ((slice.midAngle - 90) * Math.PI) / 180;
                  const tx = isHovered ? Math.cos(midRad) * 8 : 0;
                  const ty = isHovered ? Math.sin(midRad) * 8 : 0;

                  const d = slice.endAngle - slice.startAngle >= 359.9
                    ? (() => {
                        const s1 = polarToCartesian(CX, CY, R, 0);
                        const s2 = polarToCartesian(CX, CY, R, 180);
                        return `M ${CX} ${CY} L ${s1.x} ${s1.y} A ${R} ${R} 0 0 0 ${s2.x} ${s2.y} A ${R} ${R} 0 0 0 ${s1.x} ${s1.y} Z`;
                      })()
                    : describeArc(CX, CY, R, slice.startAngle, slice.endAngle);

                  const labelR = R * 0.65;
                  const labelPos = polarToCartesian(CX, CY, labelR, slice.midAngle);

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
                        opacity={hoveredSlice !== null && hoveredSlice !== i ? 0.5 : 1}
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
                })}
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
                        {slice.category}
                      </span>
                      <span className="text-xs text-slate-400 tabular-nums whitespace-nowrap">
                        {fmt(slice.co2)} kg
                      </span>
                      <span className="text-xs text-slate-500 tabular-nums w-10 text-right">
                        {(slice.pct * 100).toFixed(1)}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ============================================================ */}
        {/* Section 3: Top Categories — Horizontal Bar Chart             */}
        {/* ============================================================ */}
        {barData.length > 0 && (
          <div className="bg-[#1e293b] rounded-xl border border-slate-600/50 p-6">
            <h2 className="text-lg font-semibold text-slate-100 mb-4">Top Categories</h2>

            <svg
              viewBox={`0 0 500 ${barChartHeight}`}
              className="w-full"
              role="img"
              aria-label="Horizontal bar chart of top emission categories"
            >
              <defs>
                {barData.map((_, i) => (
                  <linearGradient key={i} id={`bar-grad-${i}`} x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor={COLD_COLORS[i % COLD_COLORS.length]} stopOpacity="0.85" />
                    <stop offset="100%" stopColor={COLD_COLORS[(i + 1) % COLD_COLORS.length]} stopOpacity="1" />
                  </linearGradient>
                ))}
              </defs>

              {barData.map((d, i) => {
                const y = i * 40 + 10;
                const barMaxWidth = 310;
                const barWidth = Math.max(8, (d.co2 / maxBarCO2) * barMaxWidth);
                const isHov = hoveredBar === i;
                const labelX = 130;
                const barX = 140;

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
                      y={y + 16}
                      textAnchor="end"
                      fill={isHov ? "#e2e8f0" : "#94a3b8"}
                      fontSize="12"
                      fontWeight="500"
                      className="capitalize"
                      style={{ transition: "fill 0.15s" }}
                    >
                      {d.category}
                    </text>

                    {/* bar background */}
                    <rect
                      x={barX}
                      y={y + 4}
                      width={barMaxWidth}
                      height={22}
                      rx="4"
                      fill="#0f172a"
                      opacity="0.5"
                    />

                    {/* bar fill */}
                    <rect
                      x={barX}
                      y={y + 4}
                      width={barWidth}
                      height={22}
                      rx="4"
                      fill={`url(#bar-grad-${i})`}
                      opacity={isHov ? 1 : 0.85}
                      style={{ transition: "opacity 0.15s, width 0.3s ease" }}
                    />

                    {/* value label */}
                    <text
                      x={barX + barWidth + 8}
                      y={y + 18}
                      fill={isHov ? "#e2e8f0" : "#64748b"}
                      fontSize="11"
                      fontWeight="600"
                      style={{ transition: "fill 0.15s" }}
                    >
                      {fmt(d.co2)} kg
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        )}

        {/* ============================================================ */}
        {/* Section 4: Top Merchants by Footprint                        */}
        {/* ============================================================ */}
        {merchantData.length > 0 && (
          <div className="bg-[#1e293b] rounded-xl border border-slate-600/50 p-6">
            <h2 className="text-lg font-semibold text-slate-100 mb-4">Top Merchants by Footprint</h2>

            <ol className="space-y-3">
              {merchantData.map((m, i) => (
                <li key={i} className="flex items-center gap-3">
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: COLD_COLORS[i % COLD_COLORS.length] }}
                  />
                  <span className="text-sm font-medium text-slate-200 flex-1 truncate">
                    {m.name}
                  </span>
                  <span className="text-sm tabular-nums text-slate-400">
                    {fmt(m.co2)} kg CO&#x2082;e
                  </span>
                </li>
              ))}
            </ol>
          </div>
        )}

        {/* ============================================================ */}
        {/* Section 5: Low-Friction Swaps                                 */}
        {/* ============================================================ */}
        {swaps.length > 0 && (
          <div>
            <h2 className="text-lg font-semibold text-slate-100 mb-4">Simple Swaps to Lower Your Footprint</h2>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {swaps.map((swap, i) => (
                <div
                  key={i}
                  className="bg-[#1e293b] rounded-xl border border-slate-600/50 p-5 flex flex-col gap-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-sm font-semibold text-slate-100">{swap.title}</h3>
                    <span
                      className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full shrink-0 ${
                        swap.effort === "Easy"
                          ? "bg-emerald-500/20 text-emerald-400"
                          : "bg-cyan-500/20 text-cyan-400"
                      }`}
                    >
                      {swap.effort}
                    </span>
                  </div>
                  <p className="text-slate-400 text-xs leading-relaxed flex-1">{swap.description}</p>
                  <p className="text-teal-400 text-xs font-medium">
                    ~{fmt(swap.impact)} kg CO&#x2082;/month saved
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* Section 6: Incentives Panel                                   */}
        {/* ============================================================ */}
        <div className="bg-[#1e293b] rounded-xl border border-slate-600/50 p-6">
          <h2 className="text-lg font-semibold text-slate-100 mb-1">Local Incentives &amp; Rebates</h2>
          <p className="text-slate-500 text-xs mb-4">
            Programs that can help you save money while reducing your footprint
          </p>

          {/* Location selector */}
          <div className="mb-5">
            <label htmlFor="climate-location-select" className="sr-only">
              Select your area
            </label>
            <select
              id="climate-location-select"
              value={selectedLocation}
              onChange={(e) => setSelectedLocation(e.target.value)}
              className="bg-[#0f172a] border border-slate-600/50 text-slate-200 text-sm rounded-lg px-4 py-2.5 w-full sm:w-64 focus:outline-none focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500 appearance-none"
              style={{
                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12' fill='none'%3E%3Cpath d='M3 5L6 8L9 5' stroke='%2394a3b8' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`,
                backgroundRepeat: "no-repeat",
                backgroundPosition: "right 12px center",
              }}
            >
              <option value="">Select your area</option>
              {LOCATIONS.map((loc) => (
                <option key={loc} value={loc}>
                  {loc}
                </option>
              ))}
            </select>
          </div>

          {/* Incentives list */}
          {selectedLocation && INCENTIVES[selectedLocation] ? (
            <div className="space-y-3">
              {INCENTIVES[selectedLocation].map((inc, i) => (
                <div
                  key={i}
                  className="bg-[#0f172a] rounded-lg border border-slate-600/30 p-4 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-200">{inc.name}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{inc.description}</p>
                  </div>
                  <a
                    href="#"
                    className="text-xs font-medium text-teal-400 hover:text-teal-300 transition-colors whitespace-nowrap shrink-0"
                  >
                    Learn More &rarr;
                  </a>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-slate-500 text-sm">
              {selectedLocation
                ? "No incentive data available for this area."
                : "Choose a location above to see available programs."}
            </p>
          )}
        </div>

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
        {/* Section 7: Footer Notice                                     */}
        {/* ============================================================ */}
        <div className="border-t border-slate-600/30 pt-6 pb-4">
          <p className="text-slate-500 text-xs leading-relaxed max-w-2xl">
            Footprint estimates use simplified industry-average emission factors per dollar spent.
            Actual emissions vary based on specific products, energy sources, and personal choices.
            This is an educational tool &mdash; not a certified carbon audit.
          </p>
        </div>
      </div>
    </div>
  );
}
