// ============================================================
// Equity Finance Copilot — Action Library (15 actions)
// ============================================================
import { Action, FinancialSnapshot } from "./types";

export const ACTION_LIBRARY: Omit<Action, "eligibility">[] = [
  {
    id: "cancel_unused_sub",
    name: "Cancel unused subscriptions",
    description: "Cancel subscriptions you have not used in the past 30 days. This is free money back in your pocket.",
    estimated_monthly_impact: [10, 60],
    risk_reduction: 2,
    effort_minutes: 15,
    cash_buffer_effect: 30,
    goal_weights: { stability: 0.5, debt: 0.3, emergency: 0.2 },
  },
  {
    id: "negotiate_bill",
    name: "Negotiate a bill reduction",
    description: "Call your phone, internet, or insurance provider and ask for a lower rate or loyalty discount.",
    estimated_monthly_impact: [10, 50],
    risk_reduction: 1,
    effort_minutes: 30,
    cash_buffer_effect: 20,
    goal_weights: { stability: 0.4, debt: 0.3, emergency: 0.3 },
  },
  {
    id: "switch_phone_plan",
    name: "Switch to a cheaper phone plan",
    description: "Move to a prepaid or MVNO carrier plan. Many cost $15–$30/month instead of $85+.",
    estimated_monthly_impact: [25, 55],
    risk_reduction: 1,
    effort_minutes: 45,
    cash_buffer_effect: 40,
    goal_weights: { stability: 0.4, debt: 0.3, emergency: 0.3 },
  },
  {
    id: "set_overdraft_alert",
    name: "Set up low-balance alerts",
    description: "Enable bank alerts when your balance drops below $100. This helps you avoid overdraft fees ($35 each).",
    estimated_monthly_impact: [0, 35],
    risk_reduction: 8,
    effort_minutes: 5,
    cash_buffer_effect: 0,
    goal_weights: { stability: 0.9, debt: 0.05, emergency: 0.05 },
  },
  {
    id: "automate_min_payments",
    name: "Automate minimum debt payments",
    description: "Set up autopay for minimum payments on all debts. This prevents late fees and credit score damage.",
    estimated_monthly_impact: [0, 70],
    risk_reduction: 9,
    effort_minutes: 15,
    cash_buffer_effect: 0,
    goal_weights: { stability: 0.8, debt: 0.15, emergency: 0.05 },
  },
  {
    id: "avalanche_extra_payment",
    name: "Pay extra on highest-APR debt",
    description: "Put any extra cash toward your highest-interest debt first. This saves the most money over time.",
    estimated_monthly_impact: [20, 80],
    risk_reduction: 3,
    effort_minutes: 10,
    cash_buffer_effect: -50,
    goal_weights: { stability: 0.1, debt: 0.8, emergency: 0.1 },
  },
  {
    id: "snowball_extra_payment",
    name: "Pay extra on smallest debt",
    description: "Put extra cash toward your smallest balance to pay it off faster. Great for motivation.",
    estimated_monthly_impact: [15, 60],
    risk_reduction: 2,
    effort_minutes: 10,
    cash_buffer_effect: -50,
    goal_weights: { stability: 0.1, debt: 0.7, emergency: 0.2 },
  },
  {
    id: "build_micro_emergency",
    name: "Start a micro emergency fund",
    description: "Save $10–$25 per week into a separate savings account. Even $100 can prevent a crisis.",
    estimated_monthly_impact: [0, 0],
    risk_reduction: 7,
    effort_minutes: 10,
    cash_buffer_effect: -15,
    goal_weights: { stability: 0.3, debt: 0.0, emergency: 0.7 },
  },
  {
    id: "request_due_date_change",
    name: "Request due date alignment",
    description: "Call creditors and ask to move due dates closer to your payday. This reduces overdraft risk.",
    estimated_monthly_impact: [0, 35],
    risk_reduction: 7,
    effort_minutes: 20,
    cash_buffer_effect: 0,
    goal_weights: { stability: 0.9, debt: 0.05, emergency: 0.05 },
  },
  {
    id: "hardship_program",
    name: "Apply for a hardship program",
    description: "Ask your creditor about hardship or forbearance programs. Many will lower your rate or pause payments.",
    estimated_monthly_impact: [30, 150],
    risk_reduction: 5,
    effort_minutes: 30,
    cash_buffer_effect: 50,
    goal_weights: { stability: 0.5, debt: 0.4, emergency: 0.1 },
  },
  {
    id: "reduce_discretionary",
    name: "Reduce discretionary spending",
    description: "Cut back on non-essential spending by 20%. Focus on dining out, entertainment, and impulse purchases.",
    estimated_monthly_impact: [30, 100],
    risk_reduction: 4,
    effort_minutes: 15,
    cash_buffer_effect: 60,
    goal_weights: { stability: 0.4, debt: 0.3, emergency: 0.3 },
  },
  {
    id: "meal_prep",
    name: "Meal prep weekly",
    description: "Plan and prep meals for the week. This can cut grocery and dining costs by 20–30%.",
    estimated_monthly_impact: [40, 120],
    risk_reduction: 2,
    effort_minutes: 120,
    cash_buffer_effect: 80,
    goal_weights: { stability: 0.3, debt: 0.3, emergency: 0.4 },
  },
  {
    id: "sell_unused_items",
    name: "Sell unused items",
    description: "Sell clothes, electronics, or furniture you no longer need on Facebook Marketplace or Craigslist.",
    estimated_monthly_impact: [50, 200],
    risk_reduction: 1,
    effort_minutes: 60,
    cash_buffer_effect: 100,
    goal_weights: { stability: 0.2, debt: 0.3, emergency: 0.5 },
  },
  {
    id: "set_bill_reminders",
    name: "Set bill payment reminders",
    description: "Add calendar reminders 3 days before each bill is due. This prevents late fees.",
    estimated_monthly_impact: [0, 50],
    risk_reduction: 6,
    effort_minutes: 10,
    cash_buffer_effect: 0,
    goal_weights: { stability: 0.8, debt: 0.1, emergency: 0.1 },
  },
  {
    id: "review_bank_fees",
    name: "Review and dispute bank fees",
    description: "Check your statements for overdraft fees, maintenance fees, or surprise charges. Call to dispute them.",
    estimated_monthly_impact: [0, 40],
    risk_reduction: 3,
    effort_minutes: 20,
    cash_buffer_effect: 20,
    goal_weights: { stability: 0.6, debt: 0.2, emergency: 0.2 },
  },
];

/** Filter actions by eligibility based on the snapshot */
export function getEligibleActions(snapshot: FinancialSnapshot): typeof ACTION_LIBRARY {
  return ACTION_LIBRARY.filter((action) => {
    // Avalanche only if debts exist
    if (action.id === "avalanche_extra_payment" && snapshot.debts.length === 0) return false;
    if (action.id === "snowball_extra_payment" && snapshot.debts.length === 0) return false;
    // Hardship only if debt balance > $1000
    if (action.id === "hardship_program" && !snapshot.debts.some((d) => d.balance > 1000)) return false;
    // Cancel subs only if leaks found
    if (action.id === "cancel_unused_sub" && snapshot.subscription_leaks.length === 0) return false;
    // Negotiate bill only if phone/internet bill > $60
    if (action.id === "negotiate_bill") {
      const hasBigBill = snapshot.recurring_bills.some(
        (b) => ["phone", "internet"].includes(b.category) && b.amount > 60
      );
      if (!hasBigBill) return false;
    }
    // Switch phone only if phone bill > $60
    if (action.id === "switch_phone_plan") {
      const phoneBill = snapshot.recurring_bills.find((b) => b.category === "phone");
      if (!phoneBill || phoneBill.amount <= 60) return false;
    }
    // Extra payment only if free cash > $50
    if (
      (action.id === "avalanche_extra_payment" || action.id === "snowball_extra_payment") &&
      snapshot.free_cash_monthly < 50
    )
      return false;
    // Micro emergency only if free cash > $25
    if (action.id === "build_micro_emergency" && snapshot.free_cash_monthly < 25) return false;
    return true;
  });
}
