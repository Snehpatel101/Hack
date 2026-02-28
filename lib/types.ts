// ============================================================
// Equity Finance Copilot — Canonical Type Definitions
// ============================================================

// ---- Raw Input Types ----
export interface RawTransaction {
  date: string;
  description: string;
  amount: number;
  category?: string;
}

export interface RawDebt {
  name: string;
  balance: number;
  apr: number;
  minimum_payment: number;
  due_day: number;
}

export interface RawIncome {
  source: string;
  amount: number;
  frequency: "weekly" | "biweekly" | "monthly";
  next_date: string;
}

export interface UploadPayload {
  transactions?: RawTransaction[];
  income?: RawIncome[];
  debts?: RawDebt[];
  checking_balance?: number;
  goal?: "stability" | "debt" | "emergency" | "auto";
}

// ---- Financial Snapshot ----
export interface RecurringBill {
  name: string;
  amount: number;
  due_day: number;
  category: string;
  is_essential: boolean;
}

export interface Subscription {
  name: string;
  amount: number;
  last_charge_date: string;
  is_leak: boolean;
  leak_reason?: string;
}

export interface RiskWindow {
  date: string;
  description: string;
  projected_balance: number;
  risk_level: "low" | "medium" | "high" | "critical";
  suggestion: string;
}

export interface DebtInfo {
  name: string;
  balance: number;
  apr: number;
  minimum_payment: number;
  due_day: number;
  monthly_interest: number;
  payoff_months_minimum: number;
}

export interface FinancialSnapshot {
  as_of: string;
  checking_balance: number;
  monthly_income: number;
  income_schedule: RawIncome[];
  recurring_bills: RecurringBill[];
  debts: DebtInfo[];
  subscriptions: Subscription[];
  monthly_spending: {
    essentials: number;
    discretionary: number;
    debt_payments: number;
    subscriptions: number;
  };
  risk_windows: RiskWindow[];
  subscription_leaks: Subscription[];
  free_cash_monthly: number;
  goal: "stability" | "debt" | "emergency" | "auto";
}

// ---- Action Library ----
export interface Action {
  id: string;
  name: string;
  description: string;
  estimated_monthly_impact: [number, number]; // [low, high]
  risk_reduction: number; // 0-10
  effort_minutes: number;
  cash_buffer_effect: number;
  upfront_cash_cost: number;
  conflicts_with: string[];
  synergy_with: string[];
  eligibility: (snapshot: FinancialSnapshot) => boolean;
  goal_weights: { stability: number; debt: number; emergency: number };
}

export interface SelectedAction {
  id: string;
  name: string;
  description: string;
  estimated_monthly_impact: [number, number];
  risk_reduction: number;
  effort_minutes: number;
  cash_buffer_effect: number;
  upfront_cash_cost: number;
  conflicts_with: string[];
  synergy_with: string[];
  goal_weights: { stability: number; debt: number; emergency: number };
  priority: number;
}

// ---- QUBO Types ----
export interface QUBOActionInput {
  id: string;
  label: string;
  effort_minutes: number;
  upfront_cash_cost: number;
  monthly_cashflow_delta: number;
  risk_reduction_score: number;
  eligibility: boolean;
  conflicts_with: string[];
  synergy_with: string[];
}

export interface QUBOInput {
  goal: "stabilize_cashflow" | "pay_down_debt" | "build_emergency_fund";
  constraints: {
    max_effort_minutes_week: number;
    max_upfront_cash_week: number;
    must_keep_balance_at_least: number;
  };
  snapshot: {
    starting_balance: number;
    monthly_income_est: number;
    monthly_essential_spend_est: number;
    risk_flags: string[];
  };
  actions: QUBOActionInput[];
  required_action_ids: string[];
}

export interface QUBOActionContribution {
  id: string;
  value: number;
  cash_component: number;
  risk_component: number;
  penalties: number;
}

export interface QUBOResult {
  selected_action_ids: string[];
  metrics: {
    estimated_monthly_cash_impact: number;
    estimated_risk_reduction: number;
    effort_minutes_used: number;
    upfront_cash_used: number;
    buffer_respected: boolean;
  };
  score: {
    optimization_score: number;
    goal_weights: {
      cash: number;
      risk: number;
      effort_penalty: number;
      buffer_penalty: number;
    };
  };
  explain: {
    top_reasons: string[];
    action_contributions: QUBOActionContribution[];
    constraint_notes: string[];
  };
  solver: {
    solver_type: "qubo_sim" | "greedy_fallback";
    n_actions_considered: number;
    time_ms: number;
  };
}

// ---- Weekly Plan (LLM Output) ----
export interface WeeklyPlanAction {
  action_id: string;
  action_name: string;
  why: string;
  how: string;
  estimated_savings: string;
  priority: "must_do" | "should_do" | "nice_to_have";
}

export interface WeeklyPlan {
  summary: string;
  total_estimated_monthly_savings: [number, number];
  risk_alerts: string[];
  week_1: WeeklyPlanAction[];
  week_2: WeeklyPlanAction[];
  ongoing: WeeklyPlanAction[];
  encouragement: string;
  disclaimer: string;
}

// ---- Workflow Trace ----
export interface TraceStep {
  tool: string;
  input_summary: string;
  output_summary: string;
  timestamp: string;
  duration_ms: number;
}

export interface WorkflowTrace {
  id: string;
  steps: TraceStep[];
  started_at: string;
  completed_at?: string;
}

// ---- Normalizer Summary (subset shipped to client) ----
export interface NormalizerSummary {
  categoryTotals: Record<string, number>;
  totalSpend: number;
  schemaMap: { sourceColumn: string; internalField: string; confidence: number; method: string }[];
  warnings: string[];
  transactionCount: number;
}

// ---- API Response ----
export interface CopilotResponse {
  snapshot: FinancialSnapshot;
  qubo_result: QUBOResult;
  plan: WeeklyPlan;
  trace: WorkflowTrace;
  normalizer?: NormalizerSummary;
}
