// ============================================================
// Equity Finance Copilot — POST /api/planner
// Accepts snapshot + selectedActions + quboResult,
// calls OpenAI to generate a WeeklyPlan.
// ============================================================
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import {
  FinancialSnapshot,
  SelectedAction,
  QUBOResult,
  WeeklyPlan,
} from "@/lib/types";
import {
  SYSTEM_PROMPT,
  DEVELOPER_PROMPT,
  buildUserMessage,
} from "@/lib/prompts";

interface PlannerBody {
  snapshot: FinancialSnapshot;
  selectedActions: SelectedAction[];
  quboResult: QUBOResult;
}

/**
 * Generate a deterministic fallback plan when OpenAI is unavailable.
 * This ensures the user always gets actionable guidance.
 */
function buildFallbackPlan(
  snapshot: FinancialSnapshot,
  selectedActions: SelectedAction[]
): WeeklyPlan {
  // Sort actions: highest risk_reduction first for week 1
  const sorted = [...selectedActions].sort(
    (a, b) => b.risk_reduction - a.risk_reduction
  );

  const week1 = sorted.slice(0, Math.min(3, sorted.length));
  const week2 = sorted.slice(3, Math.min(6, sorted.length));
  const ongoing = sorted.slice(6);

  const mapAction = (
    a: SelectedAction,
    priority: "must_do" | "should_do" | "nice_to_have"
  ) => ({
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
    risk_alerts: riskAlerts.length > 0 ? riskAlerts : ["No urgent risk alerts at this time."],
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
  try {
    let body: PlannerBody;

    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Request body must be valid JSON." },
        { status: 400 }
      );
    }

    const { snapshot, selectedActions, quboResult } = body;

    // Validate required fields
    if (!snapshot || !snapshot.as_of) {
      return NextResponse.json(
        { error: "Missing or invalid 'snapshot' in request body." },
        { status: 400 }
      );
    }
    if (!selectedActions || !Array.isArray(selectedActions)) {
      return NextResponse.json(
        { error: "Missing or invalid 'selectedActions' array in request body." },
        { status: 400 }
      );
    }
    if (!quboResult || !quboResult.selected_action_ids) {
      return NextResponse.json(
        { error: "Missing or invalid 'quboResult' in request body." },
        { status: 400 }
      );
    }

    // If no actions were selected, return a minimal plan
    if (selectedActions.length === 0) {
      return NextResponse.json(
        buildFallbackPlan(snapshot, selectedActions)
      );
    }

    // Check for API key
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.warn(
        "[planner] OPENAI_API_KEY not set. Using fallback plan generator."
      );
      return NextResponse.json(buildFallbackPlan(snapshot, selectedActions));
    }

    // Build the prompt
    const userMessage = buildUserMessage(
      snapshot,
      selectedActions,
      snapshot.goal || "auto"
    );

    try {
      const openai = new OpenAI({ apiKey });

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

      if (!content) {
        console.warn("[planner] Empty response from OpenAI. Using fallback.");
        return NextResponse.json(buildFallbackPlan(snapshot, selectedActions));
      }

      // Parse and validate the LLM response
      let plan: WeeklyPlan;
      try {
        plan = JSON.parse(content) as WeeklyPlan;
      } catch {
        console.warn("[planner] Failed to parse OpenAI response as JSON. Using fallback.");
        return NextResponse.json(buildFallbackPlan(snapshot, selectedActions));
      }

      // Ensure required fields exist (defensive)
      if (!plan.summary || !plan.week_1 || !plan.disclaimer) {
        console.warn("[planner] OpenAI response missing required fields. Using fallback.");
        return NextResponse.json(buildFallbackPlan(snapshot, selectedActions));
      }

      return NextResponse.json(plan);
    } catch (err: unknown) {
      console.error("[planner] OpenAI API error:", err);
      // Fallback: generate plan without LLM
      return NextResponse.json(buildFallbackPlan(snapshot, selectedActions));
    }
  } catch (err: unknown) {
    console.error("[planner] Unexpected error:", err);
    const message =
      err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json(
      { error: `Planner failed: ${message}` },
      { status: 500 }
    );
  }
}
