import { NextRequest, NextResponse } from "next/server";
import { FinancialSnapshot, QUBOInput, QUBOActionInput } from "@/lib/types";
import { getEligibleActions } from "@/lib/actions";
import { solveQUBO } from "@/lib/qubo";

// Goal mapping: app uses "stability"|"debt"|"emergency"|"auto"
// QUBO uses "stabilize_cashflow"|"pay_down_debt"|"build_emergency_fund"
function mapGoal(goal: string): QUBOInput["goal"] {
  switch (goal) {
    case "stability": return "stabilize_cashflow";
    case "debt": return "pay_down_debt";
    case "emergency": return "build_emergency_fund";
    default: return "stabilize_cashflow"; // "auto" defaults to cashflow stability
  }
}

const DEFAULT_EFFORT_BUDGET = 180;
const DEFAULT_UPFRONT_CASH = 200;
const DEFAULT_MIN_BUFFER = 50;

export async function POST(request: NextRequest) {
  try {
    let snapshot: FinancialSnapshot;
    try {
      snapshot = await request.json();
    } catch {
      return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
    }

    if (!snapshot.as_of || snapshot.checking_balance === undefined) {
      return NextResponse.json({ error: "Invalid FinancialSnapshot." }, { status: 400 });
    }

    const eligible = getEligibleActions(snapshot);

    // Convert to QUBOActionInput
    const quboActions: QUBOActionInput[] = eligible.map(a => ({
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

    // Determine required actions
    const requiredIds: string[] = [];
    if (snapshot.debts.length > 0) {
      if (quboActions.some(a => a.id === "automate_min_payments")) {
        requiredIds.push("automate_min_payments");
      }
    }
    if (snapshot.risk_windows.some(w => w.risk_level === "critical" || w.risk_level === "high")) {
      if (quboActions.some(a => a.id === "set_overdraft_alert")) {
        requiredIds.push("set_overdraft_alert");
      }
    }

    const quboInput: QUBOInput = {
      goal: mapGoal(snapshot.goal),
      constraints: {
        max_effort_minutes_week: DEFAULT_EFFORT_BUDGET,
        max_upfront_cash_week: DEFAULT_UPFRONT_CASH,
        must_keep_balance_at_least: DEFAULT_MIN_BUFFER,
      },
      snapshot: {
        starting_balance: snapshot.checking_balance,
        monthly_income_est: snapshot.monthly_income,
        monthly_essential_spend_est: snapshot.monthly_spending.essentials,
        risk_flags: snapshot.risk_windows
          .filter(w => w.risk_level === "critical" || w.risk_level === "high")
          .map(w => w.description),
      },
      actions: quboActions,
      required_action_ids: requiredIds,
    };

    const quboResult = solveQUBO(quboInput);

    // Build selected actions list for response
    const selectedActions = eligible
      .filter(a => quboResult.selected_action_ids.includes(a.id))
      .map((a, i) => ({
        ...a,
        priority: i + 1,
      }));

    return NextResponse.json({
      qubo_result: quboResult,
      selected_actions: selectedActions,
    });
  } catch (err: unknown) {
    console.error("[optimize] Unexpected error:", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: `Optimization failed: ${message}` }, { status: 500 });
  }
}
