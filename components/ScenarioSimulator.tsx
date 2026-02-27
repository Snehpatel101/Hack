"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import SchemaInferencePanel from "./SchemaInferencePanel";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Transaction {
  date: string;
  description: string;
  amount: number;
  category?: string;
}

interface ScenarioSimulatorProps {
  transactions: Array<Transaction>;
  normalizer?: {
    schemaMap: Array<{ sourceColumn: string; internalField: string; confidence: number; method: string }>;
    warnings: string[];
    transactionCount: number;
  };
  onBack: () => void;
}

type ScenarioType = "rent_spike" | "medical_emergency" | "job_loss" | "car_repair";
type Timeframe = 30 | 60 | 90;
type EffortLevel = "Low" | "Medium" | "High";

interface ScenarioCard {
  id: ScenarioType;
  title: string;
  description: string;
  color: string;
  iconPath: string;
}

interface ActionItem {
  title: string;
  description: string;
  estimatedImpact: string;
  effort: EffortLevel;
}

interface NegotiationScript {
  title: string;
  body: string;
}

interface RiskWindow {
  day: number;
  date: string;
  balance: number;
  severity: "critical" | "high" | "medium";
}

interface SimulationResult {
  monthlyShortfall: number;
  daysUntilRisk: number;
  recoveryTime: number;
  riskWindows: RiskWindow[];
  categoryBreakdown: Record<string, number>;
  totalSpend: number;
  dailyProjection: number[];
  actions: ActionItem[];
  scripts: NegotiationScript[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const COLD_PALETTE = [
  "#3B82F6", "#06B6D4", "#8B5CF6", "#0EA5E9",
  "#6366F1", "#14B8A6", "#A78BFA", "#22D3EE",
];

const SCENARIOS: ScenarioCard[] = [
  {
    id: "rent_spike",
    title: "Rent Spike",
    description: "Your rent increases by 15-25%",
    color: "#3B82F6",
    iconPath:
      "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1",
  },
  {
    id: "medical_emergency",
    title: "Medical Emergency",
    description: "An unexpected $2,000-5,000 medical bill",
    color: "#F87171",
    iconPath:
      "M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z",
  },
  {
    id: "job_loss",
    title: "Job Loss",
    description: "You lose your primary income for 1-3 months",
    color: "#FBBF24",
    iconPath:
      "M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m8 0H8m8 0h2a2 2 0 012 2v6.138A23.93 23.93 0 0112 17c-3.183 0-6.22-.62-9-1.745V8a2 2 0 012-2h2",
  },
  {
    id: "car_repair",
    title: "Car Repair",
    description: "Emergency vehicle repair $800-2,500",
    color: "#8B5CF6",
    iconPath:
      "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z",
  },
];

const TIMEFRAMES: Timeframe[] = [30, 60, 90];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDollars(value: number): string {
  const abs = Math.abs(value);
  return `${value < 0 ? "-" : ""}$${abs.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

function capitalize(str: string): string {
  return str
    .split(/[\s_-]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

function effortColor(effort: EffortLevel): string {
  switch (effort) {
    case "Low":
      return "text-teal-400 bg-teal-500/10 border-teal-500/30";
    case "Medium":
      return "text-amber-400 bg-amber-500/10 border-amber-500/30";
    case "High":
      return "text-red-400 bg-red-500/10 border-red-500/30";
  }
}

function severityColor(severity: "critical" | "high" | "medium"): string {
  switch (severity) {
    case "critical":
      return "border-red-500";
    case "high":
      return "border-amber-400";
    case "medium":
      return "border-teal-500";
  }
}

function severityBg(severity: "critical" | "high" | "medium"): string {
  switch (severity) {
    case "critical":
      return "bg-red-500/10";
    case "high":
      return "bg-amber-400/10";
    case "medium":
      return "bg-teal-500/10";
  }
}

function severityLabel(severity: "critical" | "high" | "medium"): string {
  switch (severity) {
    case "critical":
      return "Critical";
    case "high":
      return "High Risk";
    case "medium":
      return "Medium Risk";
  }
}

// ---------------------------------------------------------------------------
// Scenario-specific data generators
// ---------------------------------------------------------------------------

function getActions(scenario: ScenarioType): ActionItem[] {
  switch (scenario) {
    case "rent_spike":
      return [
        {
          title: "Negotiate with your landlord",
          description:
            "Request a meeting to discuss the increase. Present your track record as a reliable tenant and propose a smaller increase or phased adjustment.",
          estimatedImpact: "Could reduce increase by 5-10%",
          effort: "Low",
        },
        {
          title: "Find a roommate",
          description:
            "Splitting rent can immediately offset the increase. Check local housing groups and trusted networks for compatible roommates.",
          estimatedImpact: "Could save 30-50% on rent",
          effort: "High",
        },
        {
          title: "Apply for assistance programs",
          description:
            "Research local rental assistance programs, housing vouchers, or emergency funds that you may qualify for based on income.",
          estimatedImpact: "Could cover $200-500/month",
          effort: "Medium",
        },
      ];
    case "medical_emergency":
      return [
        {
          title: "Negotiate a payment plan",
          description:
            "Most hospitals and medical providers offer interest-free payment plans. Call billing and ask to spread payments over 6-12 months.",
          estimatedImpact: "Reduces monthly impact by 80-90%",
          effort: "Low",
        },
        {
          title: "Check for financial assistance",
          description:
            "Many hospitals have charity care or financial hardship programs. Ask for an itemized bill and request a financial assistance application.",
          estimatedImpact: "Could reduce bill by 20-80%",
          effort: "Medium",
        },
        {
          title: "Review your insurance coverage",
          description:
            "Double-check that your insurance was billed correctly. Request an itemized bill and compare with your Explanation of Benefits.",
          estimatedImpact: "Could identify billing errors saving $500+",
          effort: "Medium",
        },
      ];
    case "job_loss":
      return [
        {
          title: "File for unemployment benefits",
          description:
            "Apply for unemployment insurance as soon as possible. Most states allow online applications and benefits typically cover 40-50% of prior wages.",
          estimatedImpact: "Could provide $1,000-2,000/month",
          effort: "Low",
        },
        {
          title: "Cut discretionary spending",
          description:
            "Review subscriptions, dining out, and non-essential expenses. Temporarily reduce to essentials only to extend your financial runway.",
          estimatedImpact: "Could save $300-800/month",
          effort: "Low",
        },
        {
          title: "Contact creditors proactively",
          description:
            "Reach out to credit card companies, loan servicers, and utility providers. Many offer hardship programs with reduced payments or deferrals.",
          estimatedImpact: "Could defer $500-1,500/month",
          effort: "Medium",
        },
      ];
    case "car_repair":
      return [
        {
          title: "Get multiple repair quotes",
          description:
            "Visit at least 2-3 mechanics for estimates. Independent shops are often 20-40% cheaper than dealerships for the same repair.",
          estimatedImpact: "Could save $200-600 on repair",
          effort: "Low",
        },
        {
          title: "Check warranty coverage",
          description:
            "Review your vehicle warranty, extended warranty, or any applicable recalls. Some repairs may be partially or fully covered.",
          estimatedImpact: "Could save 50-100% if covered",
          effort: "Low",
        },
        {
          title: "Explore payment plans",
          description:
            "Many repair shops offer financing or payment plans. Some credit unions also offer small emergency loans at lower rates than credit cards.",
          estimatedImpact: "Spreads cost over 3-6 months",
          effort: "Medium",
        },
      ];
  }
}

function getScripts(scenario: ScenarioType): NegotiationScript[] {
  switch (scenario) {
    case "rent_spike":
      return [
        {
          title: "Landlord Negotiation Email",
          body: `Dear [Landlord],

I've been a reliable tenant for [X] months and have always paid rent on time and maintained the property well. I'd like to discuss the recent rent increase.

Would you be open to a smaller adjustment, perhaps phased in over a few months? I value living here and would like to find a solution that works for both of us.

I'm available to discuss this at your convenience.

Thank you,
[Your Name]`,
        },
        {
          title: "Request for Lease Terms Discussion",
          body: `Dear [Landlord],

I received the notice about the rent increase and understand costs are rising. I'd like to propose extending my lease for a longer term in exchange for a more moderate increase.

A longer commitment provides you with stability and guaranteed income. Could we discuss options like a 15-18 month lease at a reduced rate?

Best regards,
[Your Name]`,
        },
      ];
    case "medical_emergency":
      return [
        {
          title: "Payment Plan Request Call Script",
          body: `Hello, I'm calling about bill #[Bill Number] for [amount].

I'd like to discuss payment plan options. I'm committed to paying this bill but need to spread it over several months to manage it responsibly.

Could you set up a monthly payment plan? I can commit to [amount] per month. Do you offer any interest-free arrangements?

Thank you for your help.`,
        },
        {
          title: "Financial Assistance Application Request",
          body: `Dear Billing Department,

I am writing regarding account #[Account Number]. I am experiencing financial hardship and would like to apply for your financial assistance or charity care program.

Could you please send me the application and let me know what documentation is required? I would also appreciate an itemized bill for my records.

Thank you for your consideration,
[Your Name]`,
        },
        {
          title: "Insurance Dispute / Review Request",
          body: `Dear [Insurance Company],

I am writing to request a review of the Explanation of Benefits for claim #[Claim Number], dated [Date]. After comparing with my itemized bill, I believe there may be a discrepancy.

Please review the following charges: [describe charges]. I believe these should be covered under my plan.

Please contact me at [phone/email] to discuss.

Sincerely,
[Your Name]`,
        },
      ];
    case "job_loss":
      return [
        {
          title: "Creditor Hardship Request",
          body: `Dear [Creditor],

I am experiencing a temporary income disruption and would like to discuss hardship options for my account #[Account Number].

I have been a customer in good standing and am committed to meeting my obligations. Could we discuss options such as temporary payment reduction, deferral, or a modified payment plan?

I expect to resume normal payments within [timeframe]. Thank you for your understanding.

Sincerely,
[Your Name]`,
        },
        {
          title: "Utility Assistance Request",
          body: `Dear [Utility Company],

I am writing to inquire about payment assistance programs. I am currently between jobs and need temporary help managing my utility payments.

Do you offer any hardship programs, budget billing, or connections to local assistance programs? I want to keep my account current and avoid any service interruptions.

Thank you,
[Your Name]`,
        },
      ];
    case "car_repair":
      return [
        {
          title: "Repair Estimate Breakdown Request",
          body: `Hi, I'd like to get a detailed breakdown of the repair estimate for my [Vehicle Year/Make/Model].

Could you separate the parts cost from labor, and let me know which repairs are most urgent vs. which can safely wait? I'd also like to know if there are any aftermarket parts options that could reduce the cost.

Thank you for your help.`,
        },
        {
          title: "Warranty Coverage Inquiry",
          body: `Dear [Dealership / Warranty Provider],

I need a repair on my [Vehicle Year/Make/Model], VIN: [VIN Number]. The issue is [describe problem].

Could you check if this is covered under my [manufacturer warranty / extended warranty]? If partially covered, what would my out-of-pocket cost be?

Please let me know what documentation or inspection is needed.

Thank you,
[Your Name]`,
        },
      ];
  }
}

// ---------------------------------------------------------------------------
// Simulation engine
// ---------------------------------------------------------------------------

function runSimulation(
  transactions: Transaction[],
  scenario: ScenarioType,
  timeframeDays: Timeframe
): SimulationResult {
  // 1. Compute baseline financials from transactions
  const expenses = transactions.filter((t) => t.amount < 0);
  const incomes = transactions.filter((t) => t.amount > 0);

  const totalExpense = expenses.reduce((s, t) => s + Math.abs(t.amount), 0);
  const totalIncome = incomes.reduce((s, t) => s + t.amount, 0);

  // Determine the time span of transactions to normalize to monthly
  const dates = transactions.map((t) => new Date(t.date).getTime()).filter((d) => !isNaN(d));
  const minDate = dates.length > 0 ? Math.min(...dates) : Date.now();
  const maxDate = dates.length > 0 ? Math.max(...dates) : Date.now();
  const spanDays = Math.max((maxDate - minDate) / (1000 * 60 * 60 * 24), 1);
  const spanMonths = Math.max(spanDays / 30, 1);

  const monthlyExpense = totalExpense / spanMonths;
  const monthlyIncome = totalIncome / spanMonths;
  const dailyExpense = monthlyExpense / 30;
  const dailyIncome = monthlyIncome / 30;

  // Category breakdown
  const categoryBreakdown: Record<string, number> = {};
  for (const t of expenses) {
    const cat = t.category || "Uncategorized";
    categoryBreakdown[cat] = (categoryBreakdown[cat] || 0) + Math.abs(t.amount);
  }

  // Normalize category breakdown to monthly
  for (const cat of Object.keys(categoryBreakdown)) {
    categoryBreakdown[cat] = categoryBreakdown[cat] / spanMonths;
  }

  // Housing category amount (for rent spike)
  const housingKeys = Object.keys(categoryBreakdown).filter((k) =>
    /rent|housing|mortgage|home/i.test(k)
  );
  const monthlyHousing = housingKeys.reduce((s, k) => s + (categoryBreakdown[k] || 0), 0);
  const dailyHousing = monthlyHousing / 30;

  // 2. Compute scenario shock
  let oneTimeShock = 0;
  let shockDay = 0;
  let dailyExtraExpense = 0;
  let incomeMultiplier = 1;

  switch (scenario) {
    case "rent_spike":
      dailyExtraExpense = dailyHousing * 0.2; // 20% increase on housing
      break;
    case "medical_emergency":
      oneTimeShock = 3500;
      shockDay = 5;
      break;
    case "job_loss":
      incomeMultiplier = 0; // no income
      break;
    case "car_repair":
      oneTimeShock = 1500;
      shockDay = 3;
      break;
  }

  // 3. Project daily balance
  const startingBalance = Math.max(monthlyIncome - monthlyExpense, 0) * 2 + 500; // rough starting balance heuristic
  const projection: number[] = [];
  let balance = startingBalance;
  let daysUntilRisk: number = timeframeDays; // default = never
  let foundRisk = false;

  const riskWindows: RiskWindow[] = [];
  const startDate =
    dates.length > 0
      ? new Date(maxDate).toISOString().split("T")[0]
      : new Date().toISOString().split("T")[0];

  for (let day = 0; day <= timeframeDays; day++) {
    // Daily income (affected by job loss)
    balance += dailyIncome * incomeMultiplier;
    // Daily baseline expense
    balance -= dailyExpense;
    // Daily extra (rent spike)
    balance -= dailyExtraExpense;
    // One-time shock
    if (day === shockDay && oneTimeShock > 0) {
      balance -= oneTimeShock;
    }

    projection.push(balance);

    // Track risk windows
    if (balance < 100) {
      const severity: "critical" | "high" | "medium" =
        balance < 0 ? "critical" : balance < 50 ? "high" : "medium";

      // Only record one per severity transition
      if (
        riskWindows.length === 0 ||
        riskWindows[riskWindows.length - 1].severity !== severity
      ) {
        riskWindows.push({
          day,
          date: addDays(startDate, day),
          balance: Math.round(balance),
          severity,
        });
      }

      if (!foundRisk) {
        daysUntilRisk = day;
        foundRisk = true;
      }
    }
  }

  // 4. Compute summary stats
  const scenarioMonthlyExtra =
    scenario === "rent_spike"
      ? dailyExtraExpense * 30
      : scenario === "job_loss"
        ? monthlyIncome
        : oneTimeShock;

  const monthlyShortfall = Math.round(scenarioMonthlyExtra);

  const netMonthly = monthlyIncome * incomeMultiplier - monthlyExpense - dailyExtraExpense * 30;
  const recoveryMonths =
    netMonthly >= 0
      ? scenario === "job_loss"
        ? Math.ceil(timeframeDays / 30) + 2
        : Math.max(Math.ceil(oneTimeShock / Math.max(netMonthly, 1)), 1)
      : Math.ceil(timeframeDays / 30) + 3;

  return {
    monthlyShortfall,
    daysUntilRisk,
    recoveryTime: Math.min(recoveryMonths, 12),
    riskWindows: riskWindows.slice(0, 8),
    categoryBreakdown,
    totalSpend: monthlyExpense,
    dailyProjection: projection,
    actions: getActions(scenario),
    scripts: getScripts(scenario),
  };
}

// ---------------------------------------------------------------------------
// SVG Chart Components
// ---------------------------------------------------------------------------

function SpendingPieChart({
  categoryBreakdown,
  totalSpend,
}: {
  categoryBreakdown: Record<string, number>;
  totalSpend: number;
}) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const slices = useMemo(() => {
    const entries = Object.entries(categoryBreakdown)
      .filter(([, v]) => v > 0)
      .sort(([, a], [, b]) => b - a);

    if (entries.length === 0 || totalSpend <= 0) return [];

    let currentAngle = 0;
    return entries.map(([category, value], index) => {
      const percentage = (value / totalSpend) * 100;
      const sliceAngle = (percentage / 100) * 360;
      const startAngle = currentAngle;
      const endAngle = currentAngle + sliceAngle;
      currentAngle = endAngle;

      return {
        category,
        value,
        percentage,
        color: COLD_PALETTE[index % COLD_PALETTE.length],
        startAngle,
        endAngle,
      };
    });
  }, [categoryBreakdown, totalSpend]);

  if (slices.length === 0) return null;

  const CX = 120;
  const CY = 120;
  const R = 100;

  function polarToCart(angle: number, r: number) {
    const rad = ((angle - 90) * Math.PI) / 180;
    return { x: CX + r * Math.cos(rad), y: CY + r * Math.sin(rad) };
  }

  function arcPath(start: number, end: number) {
    const s = polarToCart(end, R);
    const e = polarToCart(start, R);
    const large = end - start > 180 ? "1" : "0";
    return `M ${CX} ${CY} L ${s.x} ${s.y} A ${R} ${R} 0 ${large} 0 ${e.x} ${e.y} Z`;
  }

  return (
    <div className="bg-[#1e293b] rounded-xl border border-slate-600/50 p-5">
      <h4 className="text-base font-semibold text-slate-100 mb-4">
        Monthly Spending Breakdown
      </h4>
      <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
        <svg viewBox="0 0 240 240" className="w-48 h-48 flex-shrink-0">
          {slices.length === 1 ? (
            <circle
              cx={CX}
              cy={CY}
              r={R}
              fill={slices[0].color}
              stroke="#1e293b"
              strokeWidth={2}
              style={{
                transform: hoveredIndex === 0 ? "scale(1.03)" : "scale(1)",
                transformOrigin: `${CX}px ${CY}px`,
                transition: "transform 0.2s ease-out",
                cursor: "pointer",
              }}
              onMouseEnter={() => setHoveredIndex(0)}
              onMouseLeave={() => setHoveredIndex(null)}
            />
          ) : (
            slices.map((slice, i) => {
              const midAngle = (slice.startAngle + slice.endAngle) / 2;
              const midRad = ((midAngle - 90) * Math.PI) / 180;
              const tx = hoveredIndex === i ? Math.cos(midRad) * 6 : 0;
              const ty = hoveredIndex === i ? Math.sin(midRad) * 6 : 0;
              return (
                <path
                  key={slice.category}
                  d={arcPath(slice.startAngle, slice.endAngle)}
                  fill={slice.color}
                  stroke="#1e293b"
                  strokeWidth={2}
                  style={{
                    transform: `translate(${tx}px, ${ty}px)`,
                    transition: "transform 0.2s ease-out",
                    cursor: "pointer",
                  }}
                  onMouseEnter={() => setHoveredIndex(i)}
                  onMouseLeave={() => setHoveredIndex(null)}
                />
              );
            })
          )}
          {slices.map((slice) => {
            if (slice.percentage < 6) return null;
            const mid = (slice.startAngle + slice.endAngle) / 2;
            const pos = polarToCart(mid, R * 0.65);
            return (
              <text
                key={`lbl-${slice.category}`}
                x={pos.x}
                y={pos.y}
                textAnchor="middle"
                dominantBaseline="central"
                fill="white"
                fontSize={11}
                fontWeight={600}
                style={{ pointerEvents: "none" }}
              >
                {slice.percentage.toFixed(1)}%
              </text>
            );
          })}
        </svg>
        <ul className="space-y-1.5 flex-1 min-w-0">
          {slices.map((slice, i) => (
            <li
              key={slice.category}
              className={`flex items-center gap-2 text-sm transition-colors ${
                hoveredIndex === i ? "text-slate-100" : "text-slate-300"
              }`}
              onMouseEnter={() => setHoveredIndex(i)}
              onMouseLeave={() => setHoveredIndex(null)}
            >
              <span
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: slice.color }}
              />
              <span className="truncate">{capitalize(slice.category)}</span>
              <span className="text-slate-500 ml-auto tabular-nums">
                {formatDollars(slice.value)}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function BalanceProjectionChart({
  projection,
  timeframeDays,
}: {
  projection: number[];
  timeframeDays: number;
}) {
  if (projection.length === 0) return null;

  const W = 600;
  const H = 280;
  const PAD_L = 60;
  const PAD_R = 20;
  const PAD_T = 20;
  const PAD_B = 40;

  const chartW = W - PAD_L - PAD_R;
  const chartH = H - PAD_T - PAD_B;

  const minBal = Math.min(...projection, 0);
  const maxBal = Math.max(...projection, 100);
  const range = maxBal - minBal || 1;

  const dangerThreshold = 100;

  function xPos(day: number): number {
    return PAD_L + (day / timeframeDays) * chartW;
  }
  function yPos(val: number): number {
    return PAD_T + chartH - ((val - minBal) / range) * chartH;
  }

  // Main line
  const linePath = projection
    .map((val, day) => `${day === 0 ? "M" : "L"} ${xPos(day).toFixed(1)} ${yPos(val).toFixed(1)}`)
    .join(" ");

  // Danger area (below threshold)
  const dangerY = yPos(dangerThreshold);
  const dangerAreaPath =
    projection
      .map(
        (val, day) =>
          `${day === 0 ? "M" : "L"} ${xPos(day).toFixed(1)} ${yPos(Math.min(val, dangerThreshold)).toFixed(1)}`
      )
      .join(" ") +
    ` L ${xPos(projection.length - 1).toFixed(1)} ${yPos(minBal).toFixed(1)} L ${xPos(0).toFixed(1)} ${yPos(minBal).toFixed(1)} Z`;

  // Y-axis ticks
  const yTicks: number[] = [];
  const tickStep = Math.max(Math.ceil(range / 5 / 100) * 100, 100);
  for (let v = Math.floor(minBal / tickStep) * tickStep; v <= maxBal; v += tickStep) {
    yTicks.push(v);
  }

  // X-axis ticks
  const xStep = timeframeDays <= 30 ? 7 : timeframeDays <= 60 ? 14 : 15;
  const xTicks: number[] = [];
  for (let d = 0; d <= timeframeDays; d += xStep) {
    xTicks.push(d);
  }
  if (xTicks[xTicks.length - 1] !== timeframeDays) {
    xTicks.push(timeframeDays);
  }

  return (
    <div className="bg-[#1e293b] rounded-xl border border-slate-600/50 p-5">
      <h4 className="text-base font-semibold text-slate-100 mb-4">
        Balance Projection
      </h4>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="xMidYMid meet">
        {/* Grid lines */}
        {yTicks.map((v) => (
          <line
            key={`grid-${v}`}
            x1={PAD_L}
            y1={yPos(v)}
            x2={W - PAD_R}
            y2={yPos(v)}
            stroke="#334155"
            strokeWidth={0.5}
            strokeDasharray="4,4"
          />
        ))}

        {/* Danger zone fill */}
        <path d={dangerAreaPath} fill="#EF4444" opacity={0.08} />

        {/* Danger threshold line */}
        <line
          x1={PAD_L}
          y1={dangerY}
          x2={W - PAD_R}
          y2={dangerY}
          stroke="#EF4444"
          strokeWidth={1.5}
          strokeDasharray="6,4"
          opacity={0.6}
        />
        <text
          x={W - PAD_R - 2}
          y={dangerY - 6}
          textAnchor="end"
          fill="#EF4444"
          fontSize={10}
          opacity={0.8}
        >
          Danger: $100
        </text>

        {/* Zero line if visible */}
        {minBal < 0 && (
          <line
            x1={PAD_L}
            y1={yPos(0)}
            x2={W - PAD_R}
            y2={yPos(0)}
            stroke="#EF4444"
            strokeWidth={1}
            opacity={0.4}
          />
        )}

        {/* Main projection line */}
        <path d={linePath} fill="none" stroke="#14B8A6" strokeWidth={2.5} strokeLinejoin="round" />

        {/* Y-axis labels */}
        {yTicks.map((v) => (
          <text
            key={`ylabel-${v}`}
            x={PAD_L - 8}
            y={yPos(v) + 4}
            textAnchor="end"
            fill="#94A3B8"
            fontSize={10}
          >
            {formatDollars(v)}
          </text>
        ))}

        {/* X-axis labels */}
        {xTicks.map((d) => (
          <text
            key={`xlabel-${d}`}
            x={xPos(d)}
            y={H - 8}
            textAnchor="middle"
            fill="#94A3B8"
            fontSize={10}
          >
            Day {d}
          </text>
        ))}

        {/* Axes */}
        <line
          x1={PAD_L}
          y1={PAD_T}
          x2={PAD_L}
          y2={H - PAD_B}
          stroke="#475569"
          strokeWidth={1}
        />
        <line
          x1={PAD_L}
          y1={H - PAD_B}
          x2={W - PAD_R}
          y2={H - PAD_B}
          stroke="#475569"
          strokeWidth={1}
        />
      </svg>
      <div className="flex items-center gap-4 mt-3 text-xs text-slate-400">
        <span className="flex items-center gap-1.5">
          <span className="w-4 h-0.5 bg-teal-500 rounded" />
          Projected Balance
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-4 h-0.5 bg-red-500 rounded" style={{ borderTop: "1.5px dashed #EF4444", background: "none" }} />
          Danger Threshold ($100)
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step Components
// ---------------------------------------------------------------------------

function ScenarioSelection({
  onSelect,
}: {
  onSelect: (scenario: ScenarioType) => void;
}) {
  const [hovered, setHovered] = useState<ScenarioType | null>(null);

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold text-slate-100">
          Choose a Financial Scenario
        </h2>
        <p className="text-slate-400 text-sm max-w-lg mx-auto">
          Select a scenario to simulate its impact on your finances. We will
          project the effects using your actual transaction data.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl mx-auto">
        {SCENARIOS.map((s) => (
          <button
            key={s.id}
            onClick={() => onSelect(s.id)}
            onMouseEnter={() => setHovered(s.id)}
            onMouseLeave={() => setHovered(null)}
            className="text-left bg-[#1e293b] rounded-xl border p-5 transition-all duration-200"
            style={{
              borderColor: hovered === s.id ? s.color : "rgba(100,116,139,0.5)",
              transform: hovered === s.id ? "scale(1.02)" : "scale(1)",
            }}
          >
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center mb-3"
              style={{ backgroundColor: `${s.color}20` }}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke={s.color}
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d={s.iconPath} />
              </svg>
            </div>
            <h3 className="text-base font-semibold text-slate-100 mb-1">
              {s.title}
            </h3>
            <p className="text-sm text-slate-400">{s.description}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

function TimeframeSelection({
  scenario,
  onSelect,
  onBack,
}: {
  scenario: ScenarioType;
  onSelect: (tf: Timeframe) => void;
  onBack: () => void;
}) {
  const [selected, setSelected] = useState<Timeframe | null>(null);

  const scenarioData = SCENARIOS.find((s) => s.id === scenario)!;

  const handleSelect = (tf: Timeframe) => {
    setSelected(tf);
    onSelect(tf);
  };

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <div
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium mb-2"
          style={{
            backgroundColor: `${scenarioData.color}20`,
            color: scenarioData.color,
          }}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d={scenarioData.iconPath} />
          </svg>
          {scenarioData.title}
        </div>
        <h2 className="text-2xl font-bold text-slate-100">
          Select Simulation Timeframe
        </h2>
        <p className="text-slate-400 text-sm">
          How far into the future should we project?
        </p>
      </div>

      <div className="flex items-center justify-center gap-3">
        {TIMEFRAMES.map((tf) => (
          <button
            key={tf}
            onClick={() => handleSelect(tf)}
            className={`px-6 py-2.5 rounded-full text-sm font-medium transition-all duration-200 ${
              selected === tf
                ? "bg-teal-500 text-white shadow-lg shadow-teal-500/25"
                : "bg-[#1e293b] text-slate-300 border border-slate-600/50 hover:border-teal-500/50 hover:text-teal-300"
            }`}
          >
            {tf} days
          </button>
        ))}
      </div>

      <div className="flex justify-center">
        <button
          onClick={onBack}
          className="text-sm text-slate-400 hover:text-slate-200 transition-colors"
        >
          &larr; Choose a different scenario
        </button>
      </div>
    </div>
  );
}

function LoadingSpinner() {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-4">
      <div className="relative">
        <div className="w-12 h-12 rounded-full border-2 border-slate-600" />
        <div
          className="absolute inset-0 w-12 h-12 rounded-full border-2 border-transparent border-t-teal-500"
          style={{ animation: "spin 0.8s linear infinite" }}
        />
      </div>
      <p className="text-slate-400 text-sm">Running simulation...</p>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement("textarea");
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [text]);

  return (
    <button
      onClick={handleCopy}
      className={`px-3 py-1 rounded text-xs font-medium transition-all duration-200 ${
        copied
          ? "bg-teal-500/20 text-teal-300 border border-teal-500/40"
          : "bg-slate-700/50 text-slate-400 border border-slate-600/30 hover:bg-slate-700 hover:text-slate-300"
      }`}
    >
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}

function ResultsView({
  result,
  scenario,
  timeframeDays,
  onBack,
  onRestart,
}: {
  result: SimulationResult;
  scenario: ScenarioType;
  timeframeDays: Timeframe;
  onBack: () => void;
  onRestart: () => void;
}) {
  const scenarioData = SCENARIOS.find((s) => s.id === scenario)!;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium mb-2"
            style={{
              backgroundColor: `${scenarioData.color}20`,
              color: scenarioData.color,
            }}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d={scenarioData.iconPath} />
            </svg>
            {scenarioData.title} &middot; {timeframeDays} days
          </div>
          <h2 className="text-2xl font-bold text-slate-100">
            Simulation Results
          </h2>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onRestart}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-[#1e293b] text-slate-300 border border-slate-600/50 hover:border-teal-500/50 hover:text-teal-300 transition-all"
          >
            New Scenario
          </button>
          <button
            onClick={onBack}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-gradient-to-r from-teal-500 to-cyan-500 text-white hover:from-teal-400 hover:to-cyan-400 transition-all"
          >
            Back to Dashboard
          </button>
        </div>
      </div>

      {/* (a) Impact Summary — 3 stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-[#1e293b] rounded-xl border border-slate-600/50 p-5">
          <p className="text-sm text-slate-400 mb-1">Monthly Shortfall</p>
          <p className="text-2xl font-bold text-red-400">{formatDollars(result.monthlyShortfall)}</p>
          <p className="text-xs text-slate-500 mt-1">Extra expense vs current spending</p>
        </div>
        <div className="bg-[#1e293b] rounded-xl border border-slate-600/50 p-5">
          <p className="text-sm text-slate-400 mb-1">Days Until Risk</p>
          <p className="text-2xl font-bold text-amber-400">
            {result.daysUntilRisk >= timeframeDays ? `${timeframeDays}+` : result.daysUntilRisk}
          </p>
          <p className="text-xs text-slate-500 mt-1">When balance gets critical</p>
        </div>
        <div className="bg-[#1e293b] rounded-xl border border-slate-600/50 p-5">
          <p className="text-sm text-slate-400 mb-1">Recovery Time</p>
          <p className="text-2xl font-bold text-teal-400">
            {result.recoveryTime} {result.recoveryTime === 1 ? "month" : "months"}
          </p>
          <p className="text-xs text-slate-500 mt-1">Estimated time to recover</p>
        </div>
      </div>

      {/* (b) Risk Windows */}
      {result.riskWindows.length > 0 && (
        <div className="bg-[#1e293b] rounded-xl border border-slate-600/50 p-5">
          <h4 className="text-base font-semibold text-slate-100 mb-4">
            Risk Windows
          </h4>
          <div className="space-y-2">
            {result.riskWindows.map((rw, i) => (
              <div
                key={i}
                className={`flex items-center justify-between border-l-4 rounded-r-lg px-4 py-3 ${severityColor(rw.severity)} ${severityBg(rw.severity)}`}
              >
                <div>
                  <span className="text-sm font-medium text-slate-100">
                    Day {rw.day}
                  </span>
                  <span className="text-sm text-slate-400 ml-2">{rw.date}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium tabular-nums text-slate-200">
                    Balance: {formatDollars(rw.balance)}
                  </span>
                  <span
                    className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      rw.severity === "critical"
                        ? "bg-red-500/20 text-red-300"
                        : rw.severity === "high"
                          ? "bg-amber-500/20 text-amber-300"
                          : "bg-teal-500/20 text-teal-300"
                    }`}
                  >
                    {severityLabel(rw.severity)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* (c) Spending Breakdown Pie Chart */}
      <SpendingPieChart
        categoryBreakdown={result.categoryBreakdown}
        totalSpend={result.totalSpend}
      />

      {/* (d) Balance Projection Line Chart */}
      <BalanceProjectionChart
        projection={result.dailyProjection}
        timeframeDays={timeframeDays}
      />

      {/* (e) Top 3 Actions */}
      <div className="bg-[#1e293b] rounded-xl border border-slate-600/50 p-5">
        <h4 className="text-base font-semibold text-slate-100 mb-4">
          Top 3 Recommended Actions
        </h4>
        <div className="space-y-4">
          {result.actions.map((action, i) => (
            <div
              key={i}
              className="bg-[#0f172a] rounded-lg border border-slate-700/50 p-4"
            >
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-teal-500/20 text-teal-400 flex items-center justify-center text-xs font-bold flex-shrink-0">
                    {i + 1}
                  </span>
                  <h5 className="text-sm font-semibold text-slate-100">
                    {action.title}
                  </h5>
                </div>
                <span
                  className={`text-xs font-medium px-2 py-0.5 rounded-full border flex-shrink-0 ${effortColor(action.effort)}`}
                >
                  {action.effort} Effort
                </span>
              </div>
              <p className="text-sm text-slate-400 ml-8 mb-2">
                {action.description}
              </p>
              <p className="text-xs text-teal-400 ml-8 font-medium">
                Estimated impact: {action.estimatedImpact}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* (f) Negotiation Scripts */}
      <div className="bg-[#1e293b] rounded-xl border border-slate-600/50 p-5">
        <h4 className="text-base font-semibold text-slate-100 mb-4">
          Negotiation Scripts
        </h4>
        <p className="text-sm text-slate-400 mb-4">
          Ready-to-use templates you can copy and customize for your situation.
        </p>
        <div className="space-y-4">
          {result.scripts.map((script, i) => (
            <div key={i} className="bg-[#0f172a] rounded-lg border border-slate-700/50 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2.5 bg-slate-800/50 border-b border-slate-700/50">
                <span className="text-sm font-medium text-slate-200">
                  {script.title}
                </span>
                <CopyButton text={script.body} />
              </div>
              <pre className="p-4 text-sm text-slate-300 whitespace-pre-wrap font-mono leading-relaxed overflow-x-auto">
                {script.body}
              </pre>
            </div>
          ))}
        </div>
      </div>

      {/* (g) Tone Notice */}
      <div className="bg-[#0f172a] rounded-xl border border-slate-600/30 p-4 text-center">
        <p className="text-sm text-slate-500 leading-relaxed">
          This is an educational simulation, not financial advice. Estimates are
          approximate. Everyone&#39;s situation is different &mdash; these are
          practical starting points.
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function ScenarioSimulator({
  transactions,
  normalizer,
  onBack,
}: ScenarioSimulatorProps) {
  const [step, setStep] = useState<"scenario" | "timeframe" | "loading" | "results">("scenario");
  const [selectedScenario, setSelectedScenario] = useState<ScenarioType | null>(null);
  const [selectedTimeframe, setSelectedTimeframe] = useState<Timeframe | null>(null);
  const [result, setResult] = useState<SimulationResult | null>(null);

  const handleScenarioSelect = useCallback((scenario: ScenarioType) => {
    setSelectedScenario(scenario);
    setStep("timeframe");
  }, []);

  const handleTimeframeSelect = useCallback(
    (tf: Timeframe) => {
      setSelectedTimeframe(tf);
      setStep("loading");
    },
    []
  );

  // Run simulation after brief loading state
  useEffect(() => {
    if (step !== "loading" || !selectedScenario || !selectedTimeframe) return;

    const timer = setTimeout(() => {
      const simResult = runSimulation(transactions, selectedScenario, selectedTimeframe);
      setResult(simResult);
      setStep("results");
    }, 1200);

    return () => clearTimeout(timer);
  }, [step, selectedScenario, selectedTimeframe, transactions]);

  const handleRestart = useCallback(() => {
    setSelectedScenario(null);
    setSelectedTimeframe(null);
    setResult(null);
    setStep("scenario");
  }, []);

  return (
    <div className="min-h-screen bg-[#0f172a] text-slate-100">
      {/* Top bar */}
      <div className="border-b border-slate-600/50 bg-[#0f172a]/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-sm text-slate-400 hover:text-slate-200 transition-colors"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Back
          </button>
          <h1 className="text-base font-semibold text-slate-200">
            Scenario Simulator
          </h1>
          <div className="w-16" /> {/* Spacer for centering */}
        </div>
      </div>

      {/* Content */}
      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Progress indicator */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {["Scenario", "Timeframe", "Results"].map((label, i) => {
            const stepIndex =
              step === "scenario" ? 0 : step === "timeframe" ? 1 : 2;
            const isActive = i === stepIndex;
            const isCompleted = i < stepIndex;

            return (
              <div key={label} className="flex items-center gap-2">
                {i > 0 && (
                  <div
                    className={`w-8 h-px ${
                      isCompleted ? "bg-teal-500" : "bg-slate-600"
                    }`}
                  />
                )}
                <div className="flex items-center gap-1.5">
                  <div
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium transition-all ${
                      isActive
                        ? "bg-teal-500 text-white"
                        : isCompleted
                          ? "bg-teal-500/20 text-teal-400"
                          : "bg-slate-700 text-slate-500"
                    }`}
                  >
                    {isCompleted ? (
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-3.5 w-3.5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2.5}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      i + 1
                    )}
                  </div>
                  <span
                    className={`text-xs font-medium ${
                      isActive
                        ? "text-teal-400"
                        : isCompleted
                          ? "text-slate-400"
                          : "text-slate-500"
                    }`}
                  >
                    {label}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Step content */}
        {step === "scenario" && (
          <ScenarioSelection onSelect={handleScenarioSelect} />
        )}
        {step === "timeframe" && selectedScenario && (
          <TimeframeSelection
            scenario={selectedScenario}
            onSelect={handleTimeframeSelect}
            onBack={() => setStep("scenario")}
          />
        )}
        {step === "loading" && <LoadingSpinner />}
        {step === "results" && result && selectedScenario && selectedTimeframe && (
          <ResultsView
            result={result}
            scenario={selectedScenario}
            timeframeDays={selectedTimeframe}
            onBack={onBack}
            onRestart={handleRestart}
          />
        )}

        {normalizer && (
          <SchemaInferencePanel
            schemaMap={normalizer.schemaMap}
            warnings={normalizer.warnings}
            transactionCount={normalizer.transactionCount}
            isCollapsible={true}
            defaultOpen={false}
          />
        )}
      </div>
    </div>
  );
}
