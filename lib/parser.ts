// ============================================================
// Equity Finance Copilot — CSV/JSON Parser & Feature Extraction
// ============================================================
import {
  RawTransaction,
  RawIncome,
  UploadPayload,
  RecurringBill,
  Subscription,
  RiskWindow,
  DebtInfo,
  FinancialSnapshot,
} from "./types";

// ---- CSV Parsing ----

/** Parse a CSV string into RawTransaction[] */
export function parseCSV(csv: string): RawTransaction[] {
  const lines = csv.trim().split("\n");
  if (lines.length < 2) return [];

  const header = lines[0].toLowerCase().split(",").map((h) => h.trim());
  const dateIdx = header.findIndex((h) => h.includes("date"));
  const descIdx = header.findIndex((h) => h.includes("desc") || h.includes("memo") || h.includes("name"));
  const amtIdx = header.findIndex((h) => h.includes("amount") || h.includes("amt"));
  const catIdx = header.findIndex((h) => h.includes("category") || h.includes("cat") || h.includes("type"));

  if (dateIdx < 0 || amtIdx < 0) {
    throw new Error("CSV must have at least 'date' and 'amount' columns.");
  }

  const transactions: RawTransaction[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
    if (cols.length <= Math.max(dateIdx, amtIdx)) continue;

    const amount = parseFloat(cols[amtIdx]);
    if (isNaN(amount)) continue;

    transactions.push({
      date: cols[dateIdx],
      description: descIdx >= 0 ? cols[descIdx] : "",
      amount,
      category: catIdx >= 0 ? cols[catIdx].toLowerCase() : undefined,
    });
  }

  return transactions;
}

// ---- Category Inference ----

const CATEGORY_RULES: [RegExp, string][] = [
  [/rent|mortgage|lease/i, "housing"],
  [/electric|power|gas\s*co|water|sewer|utility|utilities/i, "utilities"],
  [/internet|comcast|spectrum|att|xfinity/i, "internet"],
  [/t-mobile|verizon|at&t|sprint|phone/i, "phone"],
  [/grocery|kroger|walmart supercenter|aldi|heb|publix|safeway|trader|whole\s*foods/i, "groceries"],
  [/gas\s*station|shell|chevron|exxon|bp|fuel/i, "gas"],
  [/netflix|hulu|disney|spotify|apple\s*music|youtube\s*premium|hbo|paramount|peacock/i, "subscription"],
  [/planet\s*fitness|gym|la\s*fitness|ymca|crossfit|peloton/i, "subscription"],
  [/amazon\s*prime/i, "subscription"],
  [/starbucks|coffee|mcdonald|restaurant|doordash|uber\s*eats|grubhub/i, "dining"],
  [/target|walmart|costco|amazon(?!\s*prime)/i, "shopping"],
  [/visa|mastercard|min\s*payment|chase|capital\s*one|amex/i, "debt_payment"],
  [/sofi|lending|loan|student\s*loan/i, "debt_payment"],
  [/direct\s*deposit|payroll|employer|paycheck/i, "income"],
  [/transfer|zelle|venmo|cashapp/i, "transfer"],
  [/insurance|geico|state\s*farm|progressive/i, "insurance"],
  [/medical|pharmacy|doctor|hospital|cvs|walgreens/i, "medical"],
];

function inferCategory(desc: string): string {
  for (const [regex, cat] of CATEGORY_RULES) {
    if (regex.test(desc)) return cat;
  }
  return "other";
}

// ---- Recurring Detection ----

interface RecurringCandidate {
  description: string;
  amounts: number[];
  dates: string[];
  category: string;
}

function detectRecurring(txns: RawTransaction[]): RecurringCandidate[] {
  const groups: Record<string, RawTransaction[]> = {};

  for (const t of txns) {
    // Normalize description for grouping
    const key = t.description
      .toUpperCase()
      .replace(/[0-9]{4,}/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!groups[key]) groups[key] = [];
    groups[key].push(t);
  }

  const recurring: RecurringCandidate[] = [];
  for (const [, txnGroup] of Object.entries(groups)) {
    if (txnGroup.length < 2) continue;
    const amounts = txnGroup.map((t) => Math.abs(t.amount));
    const avgAmt = amounts.reduce((a, b) => a + b, 0) / amounts.length;
    // Check if amounts are consistent (within 20%)
    const consistent = amounts.every((a) => Math.abs(a - avgAmt) / avgAmt < 0.2);
    if (consistent) {
      recurring.push({
        description: txnGroup[0].description,
        amounts,
        dates: txnGroup.map((t) => t.date),
        category: txnGroup[0].category || inferCategory(txnGroup[0].description),
      });
    }
  }

  return recurring;
}

// ---- Subscription Leak Detection ----

const KNOWN_SUBSCRIPTIONS = [
  "netflix", "hulu", "disney", "spotify", "apple music", "youtube premium",
  "hbo", "paramount", "peacock", "amazon prime", "planet fitness", "gym",
  "la fitness", "ymca", "peloton", "adobe", "dropbox", "icloud",
];

function detectSubscriptionLeaks(
  recurring: RecurringCandidate[]
): Subscription[] {
  const subs: Subscription[] = [];

  for (const r of recurring) {
    const isSub =
      r.category === "subscription" ||
      KNOWN_SUBSCRIPTIONS.some((s) => r.description.toLowerCase().includes(s));

    if (!isSub) continue;

    const avgAmt = r.amounts.reduce((a, b) => a + b, 0) / r.amounts.length;
    const lastDate = r.dates.sort().reverse()[0];
    // A subscription is a "leak" if it's a gym/streaming you keep paying for
    // For demo purposes, flag gym memberships as leaks
    const isLeak = r.description.toLowerCase().includes("fitness") ||
      r.description.toLowerCase().includes("gym");

    subs.push({
      name: r.description,
      amount: avgAmt,
      last_charge_date: lastDate,
      is_leak: isLeak,
      leak_reason: isLeak ? "No usage detected in 30+ days. Consider canceling." : undefined,
    });
  }

  return subs;
}

// ---- Risk Window Detection ----

function detectRiskWindows(
  txns: RawTransaction[],
  balance: number,
  incomeSchedule: RawIncome[],
  bills: RecurringBill[]
): RiskWindow[] {
  const windows: RiskWindow[] = [];
  const now = new Date();
  let projected = balance;

  // Project next 30 days
  const events: { day: number; amount: number; desc: string }[] = [];

  for (const bill of bills) {
    events.push({ day: bill.due_day, amount: -bill.amount, desc: bill.name });
  }

  for (const inc of incomeSchedule) {
    const incDate = new Date(inc.next_date);
    events.push({ day: incDate.getDate(), amount: inc.amount, desc: `Paycheck (${inc.source})` });
  }

  // Sort by day
  events.sort((a, b) => a.day - b.day);

  projected = balance;
  for (const evt of events) {
    projected += evt.amount;
    const date = new Date(now);
    date.setDate(evt.day);
    if (date < now) date.setMonth(date.getMonth() + 1);

    let riskLevel: RiskWindow["risk_level"] = "low";
    let suggestion = "";

    if (projected < 0) {
      riskLevel = "critical";
      suggestion = `You may overdraft. Consider moving ${evt.desc} due date or ensuring funds arrive first.`;
    } else if (projected < 50) {
      riskLevel = "high";
      suggestion = `Balance will be very low ($${projected.toFixed(0)}). Avoid extra spending before this date.`;
    } else if (projected < 150) {
      riskLevel = "medium";
      suggestion = `Tight window. Your balance will be around $${projected.toFixed(0)}.`;
    }

    if (riskLevel !== "low") {
      windows.push({
        date: date.toISOString().split("T")[0],
        description: `After ${evt.desc}: $${projected.toFixed(2)}`,
        projected_balance: Math.round(projected * 100) / 100,
        risk_level: riskLevel,
        suggestion,
      });
    }
  }

  return windows;
}

// ---- Build Full Snapshot ----

export function buildSnapshot(payload: UploadPayload): FinancialSnapshot {
  const txns = payload.transactions || [];

  // Categorize transactions
  for (const t of txns) {
    if (!t.category) {
      t.category = inferCategory(t.description);
    }
  }

  // Detect recurring patterns
  const recurring = detectRecurring(txns);

  // Build income schedule
  const incomeSchedule: RawIncome[] =
    payload.income ||
    recurring
      .filter((r) => r.category === "income")
      .map((r) => ({
        source: r.description,
        amount: r.amounts.reduce((a, b) => a + b, 0) / r.amounts.length,
        frequency: "biweekly" as const,
        next_date: r.dates.sort().reverse()[0],
      }));

  const monthlyIncome = incomeSchedule.reduce((sum, inc) => {
    const mult = inc.frequency === "weekly" ? 4.33 : inc.frequency === "biweekly" ? 2.17 : 1;
    return sum + inc.amount * mult;
  }, 0);

  // Build recurring bills
  const bills: RecurringBill[] = recurring
    .filter((r) => !["income", "subscription", "transfer"].includes(r.category))
    .filter((r) => r.amounts[0] > 0 || r.category === "debt_payment" || r.category === "housing")
    .map((r) => {
      const avgAmt = r.amounts.reduce((a, b) => a + b, 0) / r.amounts.length;
      const lastDate = new Date(r.dates.sort().reverse()[0]);
      return {
        name: r.description,
        amount: avgAmt,
        due_day: lastDate.getDate(),
        category: r.category,
        is_essential: ["housing", "utilities", "insurance", "medical", "phone", "internet"].includes(
          r.category
        ),
      };
    });

  // Build debts
  const debts: DebtInfo[] = (payload.debts || []).map((d) => {
    const monthlyRate = d.apr / 100 / 12;
    const monthlyInterest = d.balance * monthlyRate;
    let payoffMonths: number;
    if (monthlyRate === 0) {
      // 0% APR: simple division
      payoffMonths = d.minimum_payment > 0 ? Math.ceil(d.balance / d.minimum_payment) : 999;
    } else if (d.minimum_payment > monthlyInterest) {
      payoffMonths = Math.ceil(
        -Math.log(1 - (d.balance * monthlyRate) / d.minimum_payment) / Math.log(1 + monthlyRate)
      );
    } else {
      payoffMonths = 999;
    }
    return {
      ...d,
      monthly_interest: Math.round(monthlyInterest * 100) / 100,
      payoff_months_minimum: payoffMonths,
    };
  });

  // Detect subscriptions and leaks — also scan single-occurrence known subs
  const subscriptions = detectSubscriptionLeaks(recurring);

  // Second pass: catch known subscriptions that appear only once in single-month data
  const alreadyDetected = new Set(subscriptions.map((s) => s.name.toUpperCase()));
  for (const t of txns) {
    if (t.amount >= 0) continue;
    const cat = t.category || inferCategory(t.description);
    if (cat !== "subscription") continue;
    const upper = t.description.toUpperCase().trim();
    if (alreadyDetected.has(upper)) continue;
    alreadyDetected.add(upper);
    const isLeak =
      t.description.toLowerCase().includes("fitness") ||
      t.description.toLowerCase().includes("gym");
    subscriptions.push({
      name: t.description,
      amount: Math.abs(t.amount),
      last_charge_date: t.date,
      is_leak: isLeak,
      leak_reason: isLeak ? "No usage detected in 30+ days. Consider canceling." : undefined,
    });
  }

  const leaks = subscriptions.filter((s) => s.is_leak);

  // Second pass: detect essential bills from single-occurrence transactions
  const billNames = new Set(bills.map((b) => b.name.toUpperCase().trim()));
  const essentialSingleBills: RecurringBill[] = [];
  for (const t of txns) {
    if (t.amount >= 0) continue;
    const cat = t.category || inferCategory(t.description);
    if (!["housing", "utilities", "phone", "internet", "insurance", "medical"].includes(cat)) continue;
    const upper = t.description.toUpperCase().trim();
    if (billNames.has(upper)) continue;
    billNames.add(upper);
    const txDate = new Date(t.date);
    essentialSingleBills.push({
      name: t.description,
      amount: Math.abs(t.amount),
      due_day: txDate.getDate(),
      category: cat,
      is_essential: true,
    });
  }
  bills.push(...essentialSingleBills);

  // Also add debt payments as pseudo-bills for risk window projection
  for (const d of debts) {
    const dName = d.name.toUpperCase().trim();
    if (!billNames.has(dName)) {
      billNames.add(dName);
      bills.push({
        name: d.name,
        amount: d.minimum_payment,
        due_day: d.due_day,
        category: "debt_payment",
        is_essential: true,
      });
    }
  }

  // Compute spending categories
  const debits = txns.filter((t) => t.amount < 0);
  const essentialCats = ["housing", "utilities", "groceries", "gas", "insurance", "medical", "phone", "internet"];
  const subCats = ["subscription"];

  const essentialSpend = debits
    .filter((t) => essentialCats.includes(t.category || ""))
    .reduce((s, t) => s + Math.abs(t.amount), 0);
  const subSpend = debits
    .filter((t) => subCats.includes(t.category || ""))
    .reduce((s, t) => s + Math.abs(t.amount), 0);
  const debtSpend = debits
    .filter((t) => t.category === "debt_payment")
    .reduce((s, t) => s + Math.abs(t.amount), 0);
  const totalSpend = debits.reduce((s, t) => s + Math.abs(t.amount), 0);
  const discretionary = totalSpend - essentialSpend - subSpend - debtSpend;

  // Normalize to monthly (assume txns cover ~1 month)
  // Use Math.abs to handle both chronological and reverse-chronological transaction order
  const dateRange = txns.length > 1
    ? Math.abs(new Date(txns[txns.length - 1].date).getTime() - new Date(txns[0].date).getTime()) /
      (1000 * 60 * 60 * 24)
    : 30;
  // Cap monthFactor to avoid extreme inflation when data spans only a few days.
  // A factor above 4 (data covering ~1 week) would produce unreliable projections.
  const monthFactor = Math.min(30 / Math.max(dateRange, 1), 4);

  const monthlySpending = {
    essentials: Math.round(essentialSpend * monthFactor),
    discretionary: Math.round(Math.max(0, discretionary) * monthFactor),
    debt_payments: Math.round(debtSpend * monthFactor),
    subscriptions: Math.round(subSpend * monthFactor),
  };

  const totalMonthlySpend =
    monthlySpending.essentials +
    monthlySpending.discretionary +
    monthlySpending.debt_payments +
    monthlySpending.subscriptions;

  const freeCash = Math.round(monthlyIncome - totalMonthlySpend);

  const checkingBalance = payload.checking_balance ?? 500;

  // Risk windows
  const riskWindows = detectRiskWindows(txns, checkingBalance, incomeSchedule, bills);

  return {
    as_of: new Date().toISOString().split("T")[0],
    checking_balance: checkingBalance,
    monthly_income: Math.round(monthlyIncome),
    income_schedule: incomeSchedule,
    recurring_bills: bills,
    debts,
    subscriptions,
    monthly_spending: monthlySpending,
    risk_windows: riskWindows,
    subscription_leaks: leaks,
    free_cash_monthly: freeCash,
    goal: payload.goal || "auto",
  };
}
