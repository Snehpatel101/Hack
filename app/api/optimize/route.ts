// ============================================================
// Equity Finance Copilot — POST /api/optimize
// Accepts a FinancialSnapshot, runs the QUBO optimizer,
// and returns selected actions.
// ============================================================
import { NextRequest, NextResponse } from "next/server";
import {
  FinancialSnapshot,
  QUBOInput,
  SelectedAction,
} from "@/lib/types";
import { getEligibleActions } from "@/lib/actions";
import { solveQUBO } from "@/lib/qubo";

// Default constraints
const DEFAULT_EFFORT_BUDGET_MINUTES = 180; // 3 hours/week
const DEFAULT_MIN_CASH_BUFFER = 50;

export async function POST(request: NextRequest) {
  try {
    let snapshot: FinancialSnapshot;

    try {
      snapshot = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Request body must be valid JSON." },
        { status: 400 }
      );
    }

    // Basic validation
    if (!snapshot.as_of || snapshot.checking_balance === undefined) {
      return NextResponse.json(
        {
          error:
            "Invalid FinancialSnapshot. Must include at least 'as_of' and 'checking_balance'.",
        },
        { status: 400 }
      );
    }

    // Get eligible actions for this snapshot
    const eligibleActions = getEligibleActions(snapshot);

    // Convert to SelectedAction[] with priority scores
    const selectedActions: SelectedAction[] = eligibleActions.map(
      (action, idx) => ({
        id: action.id,
        name: action.name,
        description: action.description,
        estimated_monthly_impact: action.estimated_monthly_impact,
        risk_reduction: action.risk_reduction,
        effort_minutes: action.effort_minutes,
        cash_buffer_effect: action.cash_buffer_effect,
        goal_weights: action.goal_weights,
        priority: eligibleActions.length - idx, // higher index = lower priority
      })
    );

    // Identify required actions: automate_min_payments if debts exist,
    // set_overdraft_alert if any risk windows
    const requiredIds: string[] = [];
    if (snapshot.debts.length > 0) {
      const hasAutomate = selectedActions.find(
        (a) => a.id === "automate_min_payments"
      );
      if (hasAutomate) requiredIds.push("automate_min_payments");
    }
    if (snapshot.risk_windows.some((w) => w.risk_level === "critical" || w.risk_level === "high")) {
      const hasAlert = selectedActions.find(
        (a) => a.id === "set_overdraft_alert"
      );
      if (hasAlert) requiredIds.push("set_overdraft_alert");
    }

    // Build QUBO input
    const quboInput: QUBOInput = {
      actions: selectedActions,
      effort_budget_minutes: DEFAULT_EFFORT_BUDGET_MINUTES,
      min_cash_buffer: DEFAULT_MIN_CASH_BUFFER,
      current_balance: snapshot.checking_balance,
      required_action_ids: requiredIds,
    };

    // Solve
    const quboResult = solveQUBO(quboInput, snapshot.goal);

    // Filter to just the selected actions for the response
    const chosen = selectedActions.filter((a) =>
      quboResult.selected_action_ids.includes(a.id)
    );

    return NextResponse.json({
      qubo_result: quboResult,
      selected_actions: chosen,
    });
  } catch (err: unknown) {
    console.error("[optimize] Unexpected error:", err);
    const message =
      err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json(
      { error: `Optimization failed: ${message}` },
      { status: 500 }
    );
  }
}
