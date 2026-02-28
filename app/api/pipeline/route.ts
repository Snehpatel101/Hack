// ============================================================
// Equity Finance Copilot — POST /api/pipeline
// Full pipeline: parse → snapshot → optimize → plan
// This is the main endpoint the UI calls.
// Accepts FormData (file + profile JSON) and returns CopilotResponse.
// ============================================================
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import {
  RawTransaction,
  RawIncome,
  RawDebt,
  UploadPayload,
  FinancialSnapshot,
  SelectedAction,
  QUBOInput,
  QUBOActionInput,
  QUBOResult,
  WeeklyPlan,
  WeeklyPlanAction,
  TraceStep,
  WorkflowTrace,
  CopilotResponse,
} from "@/lib/types";
import { buildSnapshot } from "@/lib/parser";
import { normalizeFinancialData } from "@/lib/normalizer";
import { getEligibleActions } from "@/lib/actions";
import { solveQUBO } from "@/lib/qubo";
import {
  SYSTEM_PROMPT,
  DEVELOPER_PROMPT,
  buildUserMessage,
} from "@/lib/prompts";

// Default constraints
const DEFAULT_EFFORT_BUDGET_MINUTES = 180;
const DEFAULT_UPFRONT_CASH = 200;
const DEFAULT_MIN_CASH_BUFFER = 50;

function mapGoal(goal: string): QUBOInput["goal"] {
  switch (goal) {
    case "stability": return "stabilize_cashflow";
    case "debt": return "pay_down_debt";
    case "emergency": return "build_emergency_fund";
    default: return "stabilize_cashflow";
  }
}

/**
 * Generate a unique trace ID (simple UUID-like).
 * Uses crypto.randomUUID when available, otherwise falls back.
 */
function generateTraceId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `trace-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

/**
 * Build a deterministic fallback plan when OpenAI is unavailable.
 */
function buildFallbackPlan(
  snapshot: FinancialSnapshot,
  selectedActions: SelectedAction[]
): WeeklyPlan {
  const sorted = [...selectedActions].sort(
    (a, b) => b.risk_reduction - a.risk_reduction
  );

  const week1 = sorted.slice(0, Math.min(3, sorted.length));
  const week2 = sorted.slice(3, Math.min(6, sorted.length));
  const ongoing = sorted.slice(6);

  const mapAction = (
    a: SelectedAction,
    priority: "must_do" | "should_do" | "nice_to_have"
  ): WeeklyPlanAction => ({
    action_id: a.id,
    action_name: a.name,
    why: a.description,
    how: `1. Review the details for "${a.name}". 2. Set aside ${a.effort_minutes} minutes to complete it. 3. Track your progress.`,
    estimated_savings: `$${a.estimated_monthly_impact[0]}-$${a.estimated_monthly_impact[1]}/month`,
    priority,
  });

  const riskAlerts = snapshot.risk_windows
    .filter((w) => w.risk_level === "critical" || w.risk_level === "high")
    .map((w) => `${w.date}: ${w.description} - ${w.suggestion}`);

  const totalLow = selectedActions.reduce(
    (s, a) => s + a.estimated_monthly_impact[0],
    0
  );
  const totalHigh = selectedActions.reduce(
    (s, a) => s + a.estimated_monthly_impact[1],
    0
  );

  return {
    summary: `Based on your financial snapshot, we have identified ${selectedActions.length} actions to help you ${snapshot.goal === "auto" ? "improve your financial health" : `focus on ${snapshot.goal}`}. Start with the highest-impact items this week.`,
    total_estimated_monthly_savings: [totalLow, totalHigh],
    risk_alerts:
      riskAlerts.length > 0
        ? riskAlerts
        : ["No urgent risk alerts at this time."],
    week_1: week1.map((a) => mapAction(a, "must_do")),
    week_2: week2.map((a) => mapAction(a, "should_do")),
    ongoing: ongoing.map((a) => mapAction(a, "nice_to_have")),
    encouragement:
      "Every small step you take today builds momentum toward a more stable financial future. You are making progress!",
    disclaimer:
      "This is educational coaching, not financial advice. Results vary. Always consult a qualified financial advisor for personal financial decisions.",
  };
}

export async function POST(request: NextRequest) {
  const traceId = generateTraceId();
  const traceSteps: TraceStep[] = [];
  const pipelineStart = Date.now();

  try {
    // ============================================================
    // STEP 1: Parse the upload (FormData with file + optional profile)
    // ============================================================
    const stepParseStart = Date.now();

    const formData = await request.formData();
    const file = formData.get("file");
    const profileField = formData.get("profile");

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: "Missing required field: 'file'. Upload a CSV or JSON file." },
        { status: 400 }
      );
    }

    const text = await file.text();

    if (!text.trim()) {
      return NextResponse.json(
        { error: "Uploaded file is empty." },
        { status: 400 }
      );
    }

    // Determine file type
    const fileName = file.name.toLowerCase();
    let fileType: "csv" | "json";

    if (fileName.endsWith(".csv")) {
      fileType = "csv";
    } else if (fileName.endsWith(".json")) {
      fileType = "json";
    } else {
      const trimmed = text.trim();
      fileType =
        trimmed.startsWith("[") || trimmed.startsWith("{") ? "json" : "csv";
    }

    // Parse transactions using universal normalizer as the sole parser
    const normResult = normalizeFinancialData(text, fileType);

    if (normResult.normalizedTransactions.length === 0) {
      return NextResponse.json(
        { error: normResult.warnings.length > 0 ? normResult.warnings.join("; ") : "No valid transactions found in the uploaded file." },
        { status: 422 }
      );
    }

    const transactions: RawTransaction[] = normResult.normalizedTransactions.map(nt => ({
      date: nt.dateISO,
      description: nt.description,
      amount: nt.amountSigned,
      category: nt.category !== "uncategorized" ? nt.category : undefined,
    }));

    // Parse profile (optional)
    let profile: {
      checking_balance?: number;
      monthly_income?: number;
      income?: RawIncome[];
      debts?: RawDebt[];
      goal?: "stability" | "debt" | "emergency" | "auto";
    } = {};

    if (profileField && typeof profileField === "string") {
      try {
        profile = JSON.parse(profileField);
      } catch {
        return NextResponse.json(
          { error: "Invalid JSON in 'profile' field." },
          { status: 422 }
        );
      }
    }

    // If user provided monthly income but no income schedule, create one
    if (profile.monthly_income && (!profile.income || profile.income.length === 0)) {
      const nextPayDate = new Date();
      nextPayDate.setDate(nextPayDate.getDate() + 14); // Assume next pay in ~2 weeks
      profile.income = [{
        source: "Monthly Income",
        amount: profile.monthly_income / 2, // Assume biweekly pay
        frequency: "biweekly" as const,
        next_date: nextPayDate.toISOString().split("T")[0],
      }];
    }

    traceSteps.push({
      tool: "universal-normalizer",
      input_summary: `${fileType.toUpperCase()} file: "${file.name}" (${text.length} bytes), schema inference on ${normResult.schemaMap.length} columns`,
      output_summary: `${transactions.length} transactions parsed, ${Object.keys(normResult.categoryTotals).length} categories, ${normResult.warnings.length} warnings`,
      timestamp: new Date(stepParseStart).toISOString(),
      duration_ms: Date.now() - stepParseStart,
    });

    // ============================================================
    // STEP 2: Build the financial snapshot
    // ============================================================
    const stepSnapshotStart = Date.now();

    const payload: UploadPayload = {
      transactions,
      income: profile.income,
      debts: profile.debts,
      checking_balance: profile.checking_balance,
      goal: profile.goal || "auto",
    };

    const snapshot: FinancialSnapshot = buildSnapshot(payload);

    traceSteps.push({
      tool: "build-snapshot",
      input_summary: `${transactions.length} txns, balance=$${snapshot.checking_balance}, goal=${snapshot.goal}`,
      output_summary: `Snapshot: income=$${snapshot.monthly_income}/mo, ${snapshot.debts.length} debts, ${snapshot.risk_windows.length} risk windows, free_cash=$${snapshot.free_cash_monthly}/mo`,
      timestamp: new Date(stepSnapshotStart).toISOString(),
      duration_ms: Date.now() - stepSnapshotStart,
    });

    // ============================================================
    // STEP 3: Optimize (QUBO solver)
    // ============================================================
    const stepOptimizeStart = Date.now();

    const eligibleActions = getEligibleActions(snapshot);

    const selectedActions: SelectedAction[] = eligibleActions.map(
      (action, idx) => ({
        ...action,
        priority: eligibleActions.length - idx,
      })
    );

    // Determine required actions
    const requiredIds: string[] = [];
    if (snapshot.debts.length > 0) {
      if (selectedActions.some((a) => a.id === "automate_min_payments")) {
        requiredIds.push("automate_min_payments");
      }
    }
    if (snapshot.risk_windows.some((w) => w.risk_level === "critical" || w.risk_level === "high")) {
      if (selectedActions.some((a) => a.id === "set_overdraft_alert")) {
        requiredIds.push("set_overdraft_alert");
      }
    }

    // Convert to QUBOActionInput[]
    const quboActions: QUBOActionInput[] = selectedActions.map((a) => ({
      id: a.id,
      label: a.name,
      effort_minutes: a.effort_minutes,
      upfront_cash_cost: a.upfront_cash_cost,
      monthly_cashflow_delta: a.cash_buffer_effect,
      risk_reduction_score: a.risk_reduction,
      eligibility: true,
      conflicts_with: a.conflicts_with,
      synergy_with: a.synergy_with,
    }));

    const quboInput: QUBOInput = {
      goal: mapGoal(snapshot.goal),
      constraints: {
        max_effort_minutes_week: DEFAULT_EFFORT_BUDGET_MINUTES,
        max_upfront_cash_week: DEFAULT_UPFRONT_CASH,
        must_keep_balance_at_least: DEFAULT_MIN_CASH_BUFFER,
      },
      snapshot: {
        starting_balance: snapshot.checking_balance,
        monthly_income_est: snapshot.monthly_income,
        monthly_essential_spend_est: snapshot.monthly_spending.essentials,
        risk_flags: snapshot.risk_windows
          .filter((w) => w.risk_level === "critical" || w.risk_level === "high")
          .map((w) => w.description),
      },
      actions: quboActions,
      required_action_ids: requiredIds,
    };

    const quboResult: QUBOResult = solveQUBO(quboInput);

    const chosenActions = selectedActions.filter((a) =>
      quboResult.selected_action_ids.includes(a.id)
    );

    traceSteps.push({
      tool: "qubo-optimizer",
      input_summary: `${selectedActions.length} candidate actions, budget=${DEFAULT_EFFORT_BUDGET_MINUTES}min, required=[${requiredIds.join(", ")}]`,
      output_summary: `Selected ${quboResult.selected_action_ids.length} actions via ${quboResult.solver.solver_type}, score=${quboResult.score.optimization_score.toFixed(3)}`,
      timestamp: new Date(stepOptimizeStart).toISOString(),
      duration_ms: Date.now() - stepOptimizeStart,
    });

    // ============================================================
    // STEP 4: Generate the WeeklyPlan (LLM or fallback)
    // ============================================================
    const stepPlanStart = Date.now();
    let plan: WeeklyPlan;
    let planSource = "fallback";

    const apiKey = process.env.OPENAI_API_KEY;

    if (apiKey && chosenActions.length > 0) {
      try {
        const openai = new OpenAI({ apiKey });

        const userMessage = buildUserMessage(
          snapshot,
          chosenActions,
          snapshot.goal || "auto"
        );

        const completion = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          temperature: 0.3,
          max_tokens: 2048,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "developer", content: DEVELOPER_PROMPT },
            { role: "user", content: userMessage },
          ],
        });

        const content = completion.choices[0]?.message?.content;

        if (content) {
          try {
            const parsed = JSON.parse(content) as WeeklyPlan;
            if (parsed.summary && parsed.week_1 && parsed.disclaimer) {
              plan = parsed;
              planSource = "openai/gpt-4o-mini";
            } else {
              console.warn(
                "[pipeline] OpenAI response missing required fields. Using fallback."
              );
              plan = buildFallbackPlan(snapshot, chosenActions);
            }
          } catch {
            console.warn(
              "[pipeline] Failed to parse OpenAI JSON response. Using fallback."
            );
            plan = buildFallbackPlan(snapshot, chosenActions);
          }
        } else {
          console.warn("[pipeline] Empty OpenAI response. Using fallback.");
          plan = buildFallbackPlan(snapshot, chosenActions);
        }
      } catch (err: unknown) {
        console.error("[pipeline] OpenAI API error:", err);
        plan = buildFallbackPlan(snapshot, chosenActions);
      }
    } else {
      if (!apiKey) {
        console.warn(
          "[pipeline] OPENAI_API_KEY not set. Using fallback plan."
        );
      }
      plan = buildFallbackPlan(snapshot, chosenActions);
    }

    traceSteps.push({
      tool: "planner",
      input_summary: `${chosenActions.length} selected actions, goal=${snapshot.goal}`,
      output_summary: `Plan generated via ${planSource}: ${plan.week_1.length} week-1, ${plan.week_2.length} week-2, ${plan.ongoing.length} ongoing actions`,
      timestamp: new Date(stepPlanStart).toISOString(),
      duration_ms: Date.now() - stepPlanStart,
    });

    // ============================================================
    // Build trace and final response
    // ============================================================
    const trace: WorkflowTrace = {
      id: traceId,
      steps: traceSteps,
      started_at: new Date(pipelineStart).toISOString(),
      completed_at: new Date().toISOString(),
    };

    const response: CopilotResponse = {
      snapshot,
      qubo_result: quboResult,
      plan,
      trace,
      normalizer: {
        categoryTotals: normResult.categoryTotals,
        totalSpend: normResult.totalSpend,
        schemaMap: normResult.schemaMap,
        warnings: normResult.warnings,
        transactionCount: normResult.normalizedTransactions.length,
      },
    };

    return NextResponse.json(response);
  } catch (err: unknown) {
    console.error("[pipeline] Unexpected error:", err);
    const message =
      err instanceof Error ? err.message : "Internal server error";

    // Still return trace for debugging if we have steps
    const trace: WorkflowTrace = {
      id: traceId,
      steps: traceSteps,
      started_at: new Date(pipelineStart).toISOString(),
      completed_at: new Date().toISOString(),
    };

    return NextResponse.json(
      { error: `Pipeline failed: ${message}`, trace },
      { status: 500 }
    );
  }
}
