// ============================================================
// Equity Finance Copilot — Tool Orchestration Layer
// ============================================================
import OpenAI from "openai";
import {
  RawTransaction,
  UploadPayload,
  FinancialSnapshot,
  RiskWindow,
  Subscription,
  DebtInfo,
  SelectedAction,
  QUBOInput,
  QUBOResult,
  WeeklyPlan,
  WeeklyPlanAction,
  TraceStep,
  WorkflowTrace,
  CopilotResponse,
} from "./types";
import { parseCSV, buildSnapshot } from "./parser";
import { getEligibleActions } from "./actions";
import { solveQUBO } from "./qubo";
import { SYSTEM_PROMPT, DEVELOPER_PROMPT, buildUserMessage } from "./prompts";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ---- Utility ----

function generateTraceId(): string {
  return `trace_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function traceStep(
  tool: string,
  inputSummary: string,
  fn: () => unknown
): { result: unknown; step: TraceStep } {
  const start = Date.now();
  const timestamp = new Date().toISOString();
  const result = fn();
  const duration = Date.now() - start;

  return {
    result,
    step: {
      tool,
      input_summary: inputSummary,
      output_summary: summarizeOutput(result),
      timestamp,
      duration_ms: duration,
    },
  };
}

async function traceStepAsync(
  tool: string,
  inputSummary: string,
  fn: () => Promise<unknown>
): Promise<{ result: unknown; step: TraceStep }> {
  const start = Date.now();
  const timestamp = new Date().toISOString();
  const result = await fn();
  const duration = Date.now() - start;

  return {
    result,
    step: {
      tool,
      input_summary: inputSummary,
      output_summary: summarizeOutput(result),
      timestamp,
      duration_ms: duration,
    },
  };
}

function summarizeOutput(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (Array.isArray(value)) return `array[${value.length}]`;
  if (typeof value === "object") {
    const keys = Object.keys(value);
    return `{${keys.slice(0, 4).join(", ")}${keys.length > 4 ? ", ..." : ""}}`;
  }
  return String(value).slice(0, 80);
}

// ============================================================
// Tool 1: parseUpload
// ============================================================

export function parseUpload(
  file: string,
  fileType: "csv" | "json"
): RawTransaction[] {
  if (fileType === "csv") {
    return parseCSV(file);
  }

  const parsed = JSON.parse(file);
  if (Array.isArray(parsed)) {
    return parsed as RawTransaction[];
  }
  if (parsed.transactions && Array.isArray(parsed.transactions)) {
    return parsed.transactions as RawTransaction[];
  }
  throw new Error(
    "JSON input must be an array of transactions or an object with a 'transactions' key."
  );
}

// ============================================================
// Tool 2: buildFinancialSnapshot
// ============================================================

export function buildFinancialSnapshot(
  payload: UploadPayload
): FinancialSnapshot {
  return buildSnapshot(payload);
}

// ============================================================
// Tool 3: cashflowRiskScan
// ============================================================

export interface CashflowRiskResult {
  risk_windows: (RiskWindow & { severity: string })[];
  has_critical: boolean;
  has_high: boolean;
  summary: string;
}

function severityLabel(
  risk: RiskWindow["risk_level"]
): string {
  switch (risk) {
    case "critical":
      return "URGENT — overdraft likely";
    case "high":
      return "WARNING — balance dangerously low";
    case "medium":
      return "CAUTION — tight cash window";
    case "low":
      return "OK — minor concern";
  }
}

export function cashflowRiskScan(
  snapshot: FinancialSnapshot
): CashflowRiskResult {
  const windows = snapshot.risk_windows.map((rw) => ({
    ...rw,
    severity: severityLabel(rw.risk_level),
  }));

  const hasCritical = windows.some((w) => w.risk_level === "critical");
  const hasHigh = windows.some((w) => w.risk_level === "high");

  let summary: string;
  if (hasCritical) {
    summary = `Found ${windows.length} risk window(s) including CRITICAL overdraft risk. Immediate action needed.`;
  } else if (hasHigh) {
    summary = `Found ${windows.length} risk window(s) with HIGH risk. Balance will be very low on certain dates.`;
  } else if (windows.length > 0) {
    summary = `Found ${windows.length} risk window(s) with moderate concern. Monitor closely.`;
  } else {
    summary = "No cashflow risk windows detected in the next 30 days.";
  }

  return {
    risk_windows: windows,
    has_critical: hasCritical,
    has_high: hasHigh,
    summary,
  };
}

// ============================================================
// Tool 4: subscriptionLeakFinder
// ============================================================

export interface SubscriptionLeakResult {
  subscription_leaks: (Subscription & { cancel_instructions: string })[];
  total_monthly_leak: number;
  summary: string;
}

function cancelInstructions(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes("netflix"))
    return "Go to netflix.com/account > Cancel Membership. You keep access until the end of your billing period.";
  if (lower.includes("hulu"))
    return "Go to hulu.com/account > Cancel. You can resubscribe anytime.";
  if (lower.includes("spotify"))
    return "Go to spotify.com/account > Subscription > Cancel Premium.";
  if (lower.includes("disney"))
    return "Go to disneyplus.com/account > Subscription > Cancel.";
  if (lower.includes("fitness") || lower.includes("gym"))
    return "Visit your gym in person or call them to cancel. Ask for written confirmation. Some gyms allow online cancellation.";
  if (lower.includes("amazon") && lower.includes("prime"))
    return "Go to amazon.com/prime > Manage Membership > End Membership.";
  if (lower.includes("hbo"))
    return "Go to hbomax.com > Settings > Subscription > Cancel.";
  if (lower.includes("peloton"))
    return "Go to members.onepeloton.com > Subscription > Cancel.";
  return `Contact ${name} customer service to cancel. Request written confirmation and check for cancellation fees.`;
}

export function subscriptionLeakFinder(
  snapshot: FinancialSnapshot
): SubscriptionLeakResult {
  const leaks = snapshot.subscription_leaks.map((sub) => ({
    ...sub,
    cancel_instructions: cancelInstructions(sub.name),
  }));

  const totalLeak = leaks.reduce((sum, l) => sum + l.amount, 0);

  let summary: string;
  if (leaks.length === 0) {
    summary = "No subscription leaks detected. All active subscriptions appear to be in use.";
  } else {
    summary = `Found ${leaks.length} subscription leak(s) totaling ~$${totalLeak.toFixed(2)}/month that could be canceled.`;
  }

  return {
    subscription_leaks: leaks,
    total_monthly_leak: Math.round(totalLeak * 100) / 100,
    summary,
  };
}

// ============================================================
// Tool 5: debtPayoffCalc
// ============================================================

export interface DebtPayoffComparison {
  avalanche: DebtPayoffStrategy;
  snowball: DebtPayoffStrategy;
  recommendation: string;
  interest_saved_with_avalanche: number;
}

interface DebtPayoffStrategy {
  method: "avalanche" | "snowball";
  order: { name: string; balance: number; apr: number }[];
  total_interest_paid: number;
  months_to_payoff: number;
  monthly_payment: number;
}

function simulatePayoff(
  debts: DebtInfo[],
  extraMonthly: number,
  sortFn: (a: DebtInfo, b: DebtInfo) => number
): DebtPayoffStrategy & { method: "avalanche" | "snowball" } {
  if (debts.length === 0) {
    return {
      method: "avalanche",
      order: [],
      total_interest_paid: 0,
      months_to_payoff: 0,
      monthly_payment: 0,
    };
  }

  const sorted = [...debts].sort(sortFn);
  const balances = sorted.map((d) => d.balance);
  const rates = sorted.map((d) => d.apr / 100 / 12);
  const mins = sorted.map((d) => d.minimum_payment);

  let totalInterest = 0;
  let months = 0;
  const maxMonths = 360; // 30-year cap
  const totalMinPayment = mins.reduce((a, b) => a + b, 0);

  while (balances.some((b) => b > 0.01) && months < maxMonths) {
    months++;
    let extra = extraMonthly;

    for (let i = 0; i < balances.length; i++) {
      if (balances[i] <= 0) continue;

      const interest = balances[i] * rates[i];
      totalInterest += interest;
      balances[i] += interest;

      const payment = Math.min(balances[i], mins[i]);
      balances[i] -= payment;
    }

    // Apply extra payment to target debt (first non-zero balance in sorted order)
    for (let i = 0; i < balances.length; i++) {
      if (balances[i] <= 0) continue;
      const extraPayment = Math.min(balances[i], extra);
      balances[i] -= extraPayment;
      extra -= extraPayment;
      if (extra <= 0) break;
    }
  }

  return {
    method: sorted === [...debts].sort((a, b) => b.apr - a.apr)
      ? "avalanche"
      : "snowball",
    order: sorted.map((d) => ({
      name: d.name,
      balance: d.balance,
      apr: d.apr,
    })),
    total_interest_paid: Math.round(totalInterest * 100) / 100,
    months_to_payoff: months,
    monthly_payment: Math.round((totalMinPayment + extraMonthly) * 100) / 100,
  };
}

export function debtPayoffCalc(
  snapshot: FinancialSnapshot
): DebtPayoffComparison {
  const debts = snapshot.debts;
  const extraMonthly = Math.max(0, snapshot.free_cash_monthly * 0.5);

  const avalanche = simulatePayoff(debts, extraMonthly, (a, b) => b.apr - a.apr);
  avalanche.method = "avalanche";

  const snowball = simulatePayoff(debts, extraMonthly, (a, b) => a.balance - b.balance);
  snowball.method = "snowball";

  const saved = Math.round((snowball.total_interest_paid - avalanche.total_interest_paid) * 100) / 100;

  let recommendation: string;
  if (debts.length === 0) {
    recommendation = "No debts found. Great job staying debt-free!";
  } else if (saved > 50) {
    recommendation = `Avalanche method saves ~$${saved} in interest. Recommended unless you need the motivational boost of paying off small balances first.`;
  } else {
    recommendation = `Both methods cost about the same in interest (difference: $${saved}). Choose snowball if you want quick wins, avalanche for pure math optimization.`;
  }

  return {
    avalanche,
    snowball,
    recommendation,
    interest_saved_with_avalanche: Math.max(0, saved),
  };
}

// ============================================================
// Tool 6: quboOptimizeActions
// ============================================================

export interface QUBOOptimizeResult {
  qubo_result: QUBOResult;
  selected_actions: SelectedAction[];
  total_effort_minutes: number;
  total_estimated_savings: [number, number];
}

export function quboOptimizeActions(
  snapshot: FinancialSnapshot
): QUBOOptimizeResult {
  // Get eligible actions and convert to SelectedAction with priority
  const eligible = getEligibleActions(snapshot);
  const actions: SelectedAction[] = eligible.map((a, i) => ({
    ...a,
    priority: i + 1,
  }));

  // Determine required actions
  const requiredIds: string[] = [];
  if (snapshot.debts.length > 0) {
    requiredIds.push("automate_min_payments");
  }
  const hasHighOrCriticalRisk = snapshot.risk_windows.some(
    (rw) => rw.risk_level === "high" || rw.risk_level === "critical"
  );
  if (hasHighOrCriticalRisk) {
    requiredIds.push("set_overdraft_alert");
  }

  // Filter required IDs to only those present in the eligible actions
  const validRequiredIds = requiredIds.filter((id) =>
    actions.some((a) => a.id === id)
  );

  const quboInput: QUBOInput = {
    actions,
    effort_budget_minutes: 120,
    min_cash_buffer: 100,
    current_balance: snapshot.checking_balance,
    required_action_ids: validRequiredIds,
  };

  const quboResult = solveQUBO(quboInput, snapshot.goal);

  const selectedActions = actions.filter((a) =>
    quboResult.selected_action_ids.includes(a.id)
  );

  const totalEffort = selectedActions.reduce(
    (sum, a) => sum + a.effort_minutes,
    0
  );

  const totalSavingsLow = selectedActions.reduce(
    (sum, a) => sum + a.estimated_monthly_impact[0],
    0
  );
  const totalSavingsHigh = selectedActions.reduce(
    (sum, a) => sum + a.estimated_monthly_impact[1],
    0
  );

  return {
    qubo_result: quboResult,
    selected_actions: selectedActions,
    total_effort_minutes: totalEffort,
    total_estimated_savings: [totalSavingsLow, totalSavingsHigh],
  };
}

// ============================================================
// Tool 7: generateWeeklyPlan
// ============================================================

function buildFallbackPlan(
  selectedActions: SelectedAction[],
  snapshot: FinancialSnapshot
): WeeklyPlan {
  const toAction = (a: SelectedAction, priority: WeeklyPlanAction["priority"]): WeeklyPlanAction => ({
    action_id: a.id,
    action_name: a.name,
    why: a.description,
    how: `1. Review details for "${a.name}". 2. Follow the suggested steps. 3. Track your progress.`,
    estimated_savings: `$${a.estimated_monthly_impact[0]}–$${a.estimated_monthly_impact[1]}/month`,
    priority,
  });

  // Sort by risk_reduction descending to put high-impact items first
  const sorted = [...selectedActions].sort(
    (a, b) => b.risk_reduction - a.risk_reduction
  );

  const week1 = sorted.slice(0, Math.ceil(sorted.length / 3));
  const week2 = sorted.slice(
    Math.ceil(sorted.length / 3),
    Math.ceil((sorted.length * 2) / 3)
  );
  const ongoing = sorted.slice(Math.ceil((sorted.length * 2) / 3));

  const totalLow = selectedActions.reduce(
    (s, a) => s + a.estimated_monthly_impact[0],
    0
  );
  const totalHigh = selectedActions.reduce(
    (s, a) => s + a.estimated_monthly_impact[1],
    0
  );

  const riskAlerts = snapshot.risk_windows
    .filter((rw) => rw.risk_level === "critical" || rw.risk_level === "high")
    .map((rw) => `${rw.date}: ${rw.description} — ${rw.suggestion}`);

  return {
    summary: `Based on your financial snapshot, we have selected ${selectedActions.length} actions to help you improve your finances. Focus on the week 1 tasks first — they address the most urgent items.`,
    total_estimated_monthly_savings: [totalLow, totalHigh],
    risk_alerts: riskAlerts,
    week_1: week1.map((a) => toAction(a, "must_do")),
    week_2: week2.map((a) => toAction(a, "should_do")),
    ongoing: ongoing.map((a) => toAction(a, "nice_to_have")),
    encouragement:
      "Every small step matters. You are already ahead by taking the time to understand your finances.",
    disclaimer:
      "This is educational coaching, not financial advice. Results vary. Always consult a qualified financial advisor for personal financial decisions.",
  };
}

export async function generateWeeklyPlan(
  snapshot: FinancialSnapshot,
  selectedActions: SelectedAction[],
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  quboResult: QUBOResult
): Promise<WeeklyPlan> {
  const userMessage = buildUserMessage(
    snapshot,
    selectedActions,
    snapshot.goal
  );

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "developer", content: DEVELOPER_PROMPT },
        { role: "user", content: userMessage },
      ],
      temperature: 0.4,
      max_tokens: 2000,
      response_format: { type: "json_object" },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("Empty response from OpenAI");
    }

    const parsed = JSON.parse(content) as WeeklyPlan;

    // Validate essential fields exist
    if (
      !parsed.summary ||
      !Array.isArray(parsed.week_1) ||
      !Array.isArray(parsed.week_2) ||
      !Array.isArray(parsed.ongoing)
    ) {
      throw new Error("Response missing required WeeklyPlan fields");
    }

    // Ensure disclaimer is always present
    if (!parsed.disclaimer) {
      parsed.disclaimer =
        "This is educational coaching, not financial advice. Results vary. Always consult a qualified financial advisor for personal financial decisions.";
    }

    return parsed;
  } catch (error) {
    console.error(
      "OpenAI plan generation failed, using fallback:",
      error instanceof Error ? error.message : String(error)
    );
    return buildFallbackPlan(selectedActions, snapshot);
  }
}

// ============================================================
// Full Pipeline: runFullPipeline
// ============================================================

export async function runFullPipeline(
  file: string,
  fileType: "csv" | "json",
  profileJson?: string
): Promise<CopilotResponse> {
  const trace: WorkflowTrace = {
    id: generateTraceId(),
    steps: [],
    started_at: new Date().toISOString(),
  };

  // Step 1: Parse upload
  const { result: transactions, step: parseStep } = traceStep(
    "parseUpload",
    `${fileType} file (${file.length} chars)`,
    () => parseUpload(file, fileType)
  );
  trace.steps.push(parseStep);
  const txns = transactions as RawTransaction[];

  // Step 2: Build payload and snapshot
  let payload: UploadPayload = { transactions: txns };
  if (profileJson) {
    try {
      const profile = JSON.parse(profileJson);
      payload = {
        ...payload,
        income: profile.income,
        debts: profile.debts,
        checking_balance: profile.checking_balance,
        goal: profile.goal,
      };
    } catch {
      console.error("Failed to parse profile JSON, continuing with transactions only.");
    }
  }

  const { result: snapshot, step: snapshotStep } = traceStep(
    "buildFinancialSnapshot",
    `${txns.length} transactions, balance=$${payload.checking_balance ?? "auto"}`,
    () => buildFinancialSnapshot(payload)
  );
  trace.steps.push(snapshotStep);
  const snap = snapshot as FinancialSnapshot;

  // Step 3: Cashflow risk scan
  const { step: riskStep } = traceStep(
    "cashflowRiskScan",
    `balance=$${snap.checking_balance}, ${snap.recurring_bills.length} bills`,
    () => cashflowRiskScan(snap)
  );
  trace.steps.push(riskStep);

  // Step 4: Subscription leak finder
  const { step: leakStep } = traceStep(
    "subscriptionLeakFinder",
    `${snap.subscriptions.length} subscriptions detected`,
    () => subscriptionLeakFinder(snap)
  );
  trace.steps.push(leakStep);

  // Step 5: Debt payoff calc
  const { step: debtStep } = traceStep(
    "debtPayoffCalc",
    `${snap.debts.length} debts, free_cash=$${snap.free_cash_monthly}`,
    () => debtPayoffCalc(snap)
  );
  trace.steps.push(debtStep);

  // Step 6: QUBO optimize
  const { result: quboOptResult, step: quboStep } = traceStep(
    "quboOptimizeActions",
    `${snap.goal} goal, balance=$${snap.checking_balance}`,
    () => quboOptimizeActions(snap)
  );
  trace.steps.push(quboStep);
  const optimized = quboOptResult as QUBOOptimizeResult;

  // Step 7: Generate weekly plan (async — OpenAI call)
  const { result: plan, step: planStep } = await traceStepAsync(
    "generateWeeklyPlan",
    `${optimized.selected_actions.length} actions, model=gpt-4o`,
    () =>
      generateWeeklyPlan(snap, optimized.selected_actions, optimized.qubo_result)
  );
  trace.steps.push(planStep);

  trace.completed_at = new Date().toISOString();

  return {
    snapshot: snap,
    qubo_result: optimized.qubo_result,
    plan: plan as WeeklyPlan,
    trace,
  };
}
