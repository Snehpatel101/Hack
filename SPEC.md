# Equity Finance Copilot — Full Hackathon Specification

---

## 0) Executive Summary

**What we built:** An agentic AI financial coaching platform that reads a user's bank
transactions (CSV/JSON), detects cashflow risks, finds subscription leaks, compares debt
payoff strategies, and uses a quantum-ready QUBO optimizer to select the best set of
actions under real-world constraints (time, cash buffer, mandatory payments). The LLM
then generates a personalized weekly coaching plan in plain, shame-free language.

**Why it wins:**
- **Real agentic pipeline:** The system dynamically selects and chains tools — it doesn't
  just summarize. Each tool call is traced and visible in the UI.
- **Quantum-ready optimization:** A real QUBO formulation (binary action selection under
  constraints) solved via exact enumeration or simulated annealing, directly portable to
  D-Wave quantum annealers or QAOA circuits.
- **Equity-first design:** Fee-awareness, overdraft prevention, no-shame language,
  simple English, prioritizes essentials. Designed for the 64% of Americans living
  paycheck to paycheck.
- **Working MVP:** Fully functional Next.js app with demo data that reliably shows
  subscription leaks, overdraft risk, and multi-debt optimization.

---

## 1) Pitch

**One sentence:** Equity Finance Copilot is an agentic AI that reads your bank
transactions, detects hidden risks, and uses quantum-ready optimization to build
a personalized weekly plan for cashflow stability — designed for the people
traditional fintech ignores.

**30-second pitch:**
"64% of Americans live paycheck to paycheck. One overdraft fee — $35 — can cascade
into a cycle of late fees and debt. Equity Finance Copilot changes that. Upload your
bank transactions, and our AI agent analyzes your cashflow, finds subscription leaks
you forgot about, and uses a quantum-ready optimizer to select the best combination of
actions that fit your time and budget. The result: a plain-language weekly plan that
prioritizes keeping the lights on, stopping fee bleeding, and building your first $500
emergency fund. No shame. No jargon. Just a clear path forward."

---

## 2) MVP Scope (24 Hours)

### MUST (ship tonight)
- CSV upload → parse → categorize → detect recurring → build snapshot
- JSON profile input (checking balance, debts, income, goal)
- Financial snapshot with risk windows, subscription leaks, debt analysis
- QUBO optimizer that selects actions under constraints (effort, cash, required)
- LLM planner that generates WeeklyPlan JSON from snapshot + selected actions
- Next.js App Router frontend: upload → profile → loading → results
- Workflow trace showing each tool call with timing
- Demo CSV + JSON that reliably show: subscription leak, overdraft risk, 2+ debts
- Safety guardrails: essentials-first, no-shame language, educational disclaimers

### SHOULD (if time allows)
- Debt payoff comparison chart (avalanche vs snowball)
- QUBO visualization (selected vs rejected actions)
- Multilingual support (Spanish)
- Export plan as PDF
- Dark mode

### WON'T (post-hackathon)
- Plaid/bank API integration
- Screenshot/OCR input
- User accounts or data persistence
- Real quantum hardware integration (we use classical solvers with quantum-ready formulation)
- Regulated financial advice

---

## 3) Data Model Schemas

### RawTransaction
```json
{
  "date": "2026-02-01",
  "description": "RENT PAYMENT - APT 4B",
  "amount": -1100.00,
  "category": "housing"
}
```

### RawIncome
```json
{
  "source": "EMPLOYER",
  "amount": 1400.00,
  "frequency": "biweekly",
  "next_date": "2026-03-01"
}
```

### RawDebt
```json
{
  "name": "Chase Visa (credit card)",
  "balance": 3200.00,
  "apr": 24.99,
  "minimum_payment": 96.00,
  "due_day": 5
}
```

### RecurringBill
```json
{
  "name": "RENT PAYMENT - APT 4B",
  "amount": 1100.00,
  "due_day": 1,
  "category": "housing",
  "is_essential": true
}
```

### Subscription
```json
{
  "name": "PLANET FITNESS",
  "amount": 29.99,
  "last_charge_date": "2026-02-13",
  "is_leak": true,
  "leak_reason": "No usage detected in 30+ days. Consider canceling."
}
```

### RiskWindow
```json
{
  "date": "2026-03-01",
  "description": "After RENT PAYMENT: $-760.00",
  "projected_balance": -760.00,
  "risk_level": "critical",
  "suggestion": "You may overdraft. Paycheck arrives same day — if it's late, you'll be overdrawn."
}
```

### DebtInfo (enriched)
```json
{
  "name": "Chase Visa (credit card)",
  "balance": 3200.00,
  "apr": 24.99,
  "minimum_payment": 96.00,
  "due_day": 5,
  "monthly_interest": 66.65,
  "payoff_months_minimum": 56
}
```

---

## 4) Data Aggregation Pipeline

### CSV Mapping Rules
| CSV Column | Maps To | Required | Fallback |
|---|---|---|---|
| date / Date | transaction.date | Yes | Error |
| description / memo / name | transaction.description | No | "" |
| amount / amt | transaction.amount | Yes | Error |
| category / cat / type | transaction.category | No | Auto-inferred |

### Validation & Anomaly Flags
- Missing date or amount → skip row, log warning
- Amount = 0 → skip
- Duplicate (same date + description + amount) → flag, keep first
- Future dates → flag as anomaly
- Very large amounts (>$10,000) → flag for review

### Feature Extraction List
1. **Recurring transaction detection** — group by normalized description, check amount consistency (±20%)
2. **Category inference** — regex matching against 17 known patterns (housing, utilities, subscriptions, etc.)
3. **Income schedule detection** — find recurring positive amounts, determine frequency
4. **Subscription identification** — match against known subscription names, flag potential leaks
5. **Monthly spending aggregation** — essentials, discretionary, debt payments, subscriptions
6. **Cashflow projection** — project balance forward 30 days using bill schedule + income schedule
7. **Risk window detection** — find dates where projected balance < $50 (high), < $0 (critical)
8. **Free cash calculation** — monthly income minus total monthly spending
9. **Debt interest calculation** — monthly interest = balance × (APR/100/12)
10. **Payoff timeline estimation** — months to payoff at minimum payment

### Output: financial_snapshot.json (demo example)
```json
{
  "as_of": "2026-02-27",
  "checking_balance": 340.00,
  "monthly_income": 3038,
  "income_schedule": [
    { "source": "EMPLOYER", "amount": 1400, "frequency": "biweekly", "next_date": "2026-03-01" }
  ],
  "recurring_bills": [
    { "name": "RENT PAYMENT", "amount": 1100, "due_day": 1, "category": "housing", "is_essential": true },
    { "name": "T-MOBILE", "amount": 85, "due_day": 10, "category": "phone", "is_essential": true },
    { "name": "ELECTRIC COMPANY", "amount": 95, "due_day": 15, "category": "utilities", "is_essential": true },
    { "name": "CITY WATER DEPT", "amount": 45, "due_day": 15, "category": "utilities", "is_essential": true },
    { "name": "SPECTRUM INTERNET", "amount": 55, "due_day": 16, "category": "internet", "is_essential": true }
  ],
  "debts": [
    { "name": "Chase Visa", "balance": 3200, "apr": 24.99, "minimum_payment": 96, "due_day": 5, "monthly_interest": 66.65, "payoff_months_minimum": 56 },
    { "name": "SoFi Personal Loan", "balance": 1800, "apr": 12.0, "minimum_payment": 75, "due_day": 6, "monthly_interest": 18.0, "payoff_months_minimum": 28 }
  ],
  "subscriptions": [
    { "name": "NETFLIX", "amount": 15.99, "last_charge_date": "2026-02-12", "is_leak": false },
    { "name": "HULU", "amount": 17.99, "last_charge_date": "2026-02-12", "is_leak": false },
    { "name": "SPOTIFY", "amount": 10.99, "last_charge_date": "2026-02-12", "is_leak": false },
    { "name": "PLANET FITNESS", "amount": 29.99, "last_charge_date": "2026-02-13", "is_leak": true, "leak_reason": "No usage detected in 30+ days. Consider canceling." },
    { "name": "AMAZON PRIME", "amount": 14.99, "last_charge_date": "2026-02-14", "is_leak": false }
  ],
  "monthly_spending": {
    "essentials": 1865,
    "discretionary": 250,
    "debt_payments": 171,
    "subscriptions": 90
  },
  "risk_windows": [
    { "date": "2026-03-01", "description": "After RENT PAYMENT: projected $-760", "projected_balance": -760, "risk_level": "critical", "suggestion": "Rent and paycheck hit the same day. If paycheck is late, you could overdraft." },
    { "date": "2026-03-05", "description": "After CHASE VISA MIN: projected $44", "projected_balance": 44, "risk_level": "high", "suggestion": "Balance will be very low. Avoid extra spending." }
  ],
  "subscription_leaks": [
    { "name": "PLANET FITNESS", "amount": 29.99, "last_charge_date": "2026-02-13", "is_leak": true, "leak_reason": "No usage detected in 30+ days. Consider canceling." }
  ],
  "free_cash_monthly": 662,
  "goal": "stability"
}
```

---

## 5) Agentic Architecture

### Single Planner Agent + Tool Pipeline
The system uses a **single orchestrator** pattern: one pipeline function calls tools
in sequence, builds a workflow trace, then passes results to the LLM for plan generation.

```
User Upload → parse_upload → build_snapshot → cashflow_risk_scan
                                            → subscription_leak_finder
                                            → debt_payoff_calc
                                            → qubo_optimize_actions
                                            → generate_weekly_plan (LLM)
```

### Tool-Calling Decision Policy
| Condition | Tools Called |
|---|---|
| Always | parse_upload, build_snapshot, cashflow_risk_scan, subscription_leak_finder |
| If debts exist | debt_payoff_calc |
| Always | qubo_optimize_actions (selects best action set) |
| Always | generate_weekly_plan (LLM generates the coaching plan) |

### Missing-Data Behavior
- No checking_balance → assume $500, state assumption
- No income data → infer from transaction deposits, flag uncertainty
- No debts → skip debt tools, focus on stability/emergency
- No category on transactions → auto-categorize via regex rules
- Ambiguous recurring → require 2+ occurrences with ±20% amount consistency

### Workflow Trace
Every tool call is recorded with:
- Tool name
- Input summary (truncated to 100 chars)
- Output summary (key metrics)
- Timestamp and duration_ms

This trace is returned to the UI and displayed in a collapsible "How we analyzed your data" panel.

---

## 6) Prompts

### SYSTEM Prompt
```
You are the Equity Finance Copilot, an AI coaching assistant that helps people
stabilize their finances. You provide educational guidance only — never personalized
investment advice or guaranteed returns.

CORE VALUES:
- Safety first: Always prioritize rent, utilities, food, medicine, and minimum debt
  payments before any other action.
- No shame: Use encouraging, judgment-free language. Everyone's financial situation
  is valid. Never say "you should have" or "you failed to."
- Fee awareness: Actively look for overdraft risks, late fees, unnecessary subscriptions,
  and surprise charges.
- Simple language: Short sentences. Plain English. Avoid jargon. If you must use a
  financial term, explain it in parentheses.
- Equity focus: Assume the user may have limited financial literacy. Explain WHY each
  step matters. Be aware that bank fees hit low-income households hardest.

GUARDRAILS — YOU MUST FOLLOW THESE:
1. NEVER recommend skipping essential expenses (rent, utilities, food, medication).
2. NEVER recommend skipping minimum debt payments — this causes late fees and credit damage.
3. NEVER guarantee specific savings amounts or investment returns.
4. NEVER provide tax advice, investment recommendations, or insurance advice.
5. NEVER suggest payday loans, title loans, or high-interest borrowing.
6. ALWAYS flag overdraft risk if checking balance could go below $0 in the next 14 days.
7. ALWAYS recommend setting up low-balance alerts for anyone at overdraft risk.
8. If data is missing or unclear, state your assumption: "I'm assuming X because..."
9. Every plan MUST include the disclaimer at the end.

TONE EXAMPLES:
- Good: "Here is one option that could help free up some cash."
- Bad: "You need to stop spending on subscriptions immediately."
- Good: "Many people find that canceling unused subscriptions saves $20–$60/month."
- Bad: "You are wasting money on Netflix."
```

### DEVELOPER Prompt
```
RESPONSE FORMAT: You MUST respond with valid JSON matching the WeeklyPlan schema.
Do not include any text outside the JSON object.

SCHEMA:
{
  "summary": "string — 2-3 sentence overview",
  "total_estimated_monthly_savings": [number, number],
  "risk_alerts": ["string"],
  "week_1": [{ "action_id": "string", "action_name": "string", "why": "string",
               "how": "string", "estimated_savings": "string", "priority": "must_do|should_do|nice_to_have" }],
  "week_2": [same],
  "ongoing": [same],
  "encouragement": "string",
  "disclaimer": "This is educational coaching, not financial advice. Results vary.
                  Always consult a qualified financial advisor for personal decisions."
}

TOOL USAGE:
- Organize selected actions into a practical weekly plan
- Assign higher-risk-reduction actions to week_1
- For each action, provide concrete "how" with 2-3 steps
- If risk_alerts exist, they MUST appear in your risk_alerts array
- Do NOT add or remove actions from the selected list
```

### USER Message Template
```
Here is my financial situation and the actions selected by the optimizer.
Please create my weekly coaching plan.

FINANCIAL SNAPSHOT:
```json
{{SNAPSHOT}}
```

SELECTED ACTIONS (from optimizer):
```json
{{SELECTED_ACTIONS}}
```

MY GOAL: {{GOAL}}

Please generate the WeeklyPlan JSON now.
```

### Output JSON Schema: WeeklyPlan
```typescript
interface WeeklyPlan {
  summary: string;
  total_estimated_monthly_savings: [number, number];
  risk_alerts: string[];
  week_1: WeeklyPlanAction[];
  week_2: WeeklyPlanAction[];
  ongoing: WeeklyPlanAction[];
  encouragement: string;
  disclaimer: string;
}
```

---

## 7) Tools / APIs

### Tool 1: parse_upload
**Purpose:** Parse CSV or JSON file into structured transactions.
```json
{
  "name": "parse_upload",
  "input": { "file_content": "string (CSV or JSON text)", "file_type": "csv | json" },
  "output": { "transactions": "RawTransaction[]", "row_count": "number", "warnings": "string[]" }
}
```
**Example input:** `"date,description,amount\n2026-02-01,RENT,-1100"`
**Example output:** `{ "transactions": [{"date":"2026-02-01","description":"RENT","amount":-1100}], "row_count": 1, "warnings": [] }`

### Tool 2: build_snapshot
**Purpose:** Build the full financial snapshot from transactions + profile.
```json
{
  "name": "build_snapshot",
  "input": { "transactions": "RawTransaction[]", "income": "RawIncome[]", "debts": "RawDebt[]", "checking_balance": "number", "goal": "string" },
  "output": "FinancialSnapshot"
}
```

### Tool 3: cashflow_risk_scan
**Purpose:** Identify dates where projected balance drops dangerously low.
```json
{
  "name": "cashflow_risk_scan",
  "input": { "snapshot": "FinancialSnapshot" },
  "output": { "risk_windows": "RiskWindow[]", "highest_risk": "string", "days_until_risk": "number" }
}
```
**Example output:** `{ "risk_windows": [{"date":"2026-03-01","risk_level":"critical","projected_balance":-760}], "highest_risk": "critical", "days_until_risk": 2 }`

### Tool 4: subscription_leak_finder
**Purpose:** Find subscriptions the user may be paying for but not using.
```json
{
  "name": "subscription_leak_finder",
  "input": { "snapshot": "FinancialSnapshot" },
  "output": { "leaks": "Subscription[]", "total_monthly_leak": "number" }
}
```
**Example output:** `{ "leaks": [{"name":"PLANET FITNESS","amount":29.99,"is_leak":true}], "total_monthly_leak": 29.99 }`

### Tool 5: debt_payoff_calc
**Purpose:** Compare avalanche vs snowball strategies for the user's debts.
```json
{
  "name": "debt_payoff_calc",
  "input": { "debts": "DebtInfo[]", "extra_monthly": "number" },
  "output": { "avalanche": { "total_interest": "number", "months": "number", "order": "string[]" }, "snowball": { "total_interest": "number", "months": "number", "order": "string[]" }, "recommended": "avalanche | snowball", "interest_saved": "number" }
}
```

### Tool 6: qubo_optimize_actions
**Purpose:** Select optimal action set using QUBO binary optimization.
```json
{
  "name": "qubo_optimize_actions",
  "input": { "actions": "SelectedAction[]", "effort_budget_minutes": "number", "min_cash_buffer": "number", "current_balance": "number", "required_action_ids": "string[]" },
  "output": { "selected_action_ids": "string[]", "objective_value": "number", "solver_used": "string", "iterations": "number" }
}
```

### Tool 7: generate_weekly_plan
**Purpose:** LLM generates a structured coaching plan from snapshot + selected actions.
```json
{
  "name": "generate_weekly_plan",
  "input": { "snapshot": "FinancialSnapshot", "selected_actions": "SelectedAction[]" },
  "output": "WeeklyPlan"
}
```

---

## 8) Action Library (15 Actions)

| # | ID | Name | Monthly Impact | Risk Reduction | Effort (min) | Cash Buffer Effect | Goal Weights (S/D/E) |
|---|---|---|---|---|---|---|---|
| 1 | cancel_unused_sub | Cancel unused subscriptions | $10–$60 | 2 | 15 | +$30 | 0.5/0.3/0.2 |
| 2 | negotiate_bill | Negotiate a bill reduction | $10–$50 | 1 | 30 | +$20 | 0.4/0.3/0.3 |
| 3 | switch_phone_plan | Switch to cheaper phone plan | $25–$55 | 1 | 45 | +$40 | 0.4/0.3/0.3 |
| 4 | set_overdraft_alert | Set up low-balance alerts | $0–$35 | 8 | 5 | $0 | 0.9/0.05/0.05 |
| 5 | automate_min_payments | Automate minimum payments | $0–$70 | 9 | 15 | $0 | 0.8/0.15/0.05 |
| 6 | avalanche_extra_payment | Extra payment on highest APR | $20–$80 | 3 | 10 | −$50 | 0.1/0.8/0.1 |
| 7 | snowball_extra_payment | Extra payment on smallest balance | $15–$60 | 2 | 10 | −$50 | 0.1/0.7/0.2 |
| 8 | build_micro_emergency | Start micro emergency fund | $0 | 7 | 10 | −$15 | 0.3/0.0/0.7 |
| 9 | request_due_date_change | Request due date alignment | $0–$35 | 7 | 20 | $0 | 0.9/0.05/0.05 |
| 10 | hardship_program | Apply for hardship program | $30–$150 | 5 | 30 | +$50 | 0.5/0.4/0.1 |
| 11 | reduce_discretionary | Reduce discretionary spending | $30–$100 | 4 | 15 | +$60 | 0.4/0.3/0.3 |
| 12 | meal_prep | Meal prep weekly | $40–$120 | 2 | 120 | +$80 | 0.3/0.3/0.4 |
| 13 | sell_unused_items | Sell unused items | $50–$200 | 1 | 60 | +$100 | 0.2/0.3/0.5 |
| 14 | set_bill_reminders | Set bill payment reminders | $0–$50 | 6 | 10 | $0 | 0.8/0.1/0.1 |
| 15 | review_bank_fees | Review and dispute bank fees | $0–$40 | 3 | 20 | +$20 | 0.6/0.2/0.2 |

**Eligibility rules are encoded in `lib/actions.ts`:**
- Debt actions require debts to exist
- Cancel subs requires detected leaks
- Phone/bill negotiation requires bills > $60
- Extra payments require free cash > $50
- Micro emergency requires free cash > $25

---

## 9) QUBO Module

### Decision Variables
x_i ∈ {0, 1} for each of n candidate actions (after eligibility filtering).
x_i = 1 means "select action i for the plan."

### Objective Function (to minimize)

```
H(x) = −Σᵢ wᵢ·xᵢ
       + λ_effort · max(0, Σᵢ eᵢ·xᵢ − E_max)²
       + λ_cash  · max(0, C_min − C_cur − Σᵢ cᵢ·xᵢ)²
       + λ_req   · Σⱼ∈required (1 − xⱼ)²
```

Where:
- **wᵢ** = weighted benefit score (combines goal weights, risk reduction, estimated impact)
- **eᵢ** = effort in minutes for action i
- **E_max** = weekly effort budget (default: 120 minutes)
- **cᵢ** = cash buffer effect of action i
- **C_min** = minimum required cash buffer (default: $100)
- **C_cur** = current checking balance
- **λ_effort = 10**, **λ_cash = 15**, **λ_req = 50** (penalty weights)

### Constraints (encoded as penalties)
1. **Effort budget:** Total effort ≤ 120 minutes/week
2. **Cash buffer:** Balance after actions ≥ $100
3. **Required actions:** Minimum payments (automate_min_payments) and overdraft alerts (set_overdraft_alert) must be selected when applicable

### Solver Strategy
- **n ≤ 20:** Exact enumeration (2²⁰ = 1M states, ~100ms)
- **n > 20:** Simulated annealing (10K iterations, temp=2.0, cooling=0.9995)
- **Fallback:** Greedy sort by benefit/effort ratio (always runs as quality check)
- Best of SA/exact and greedy is returned.

### Quantum Readiness
The QUBO matrix Q where H(x) = xᵀQx can be submitted directly to:
- **D-Wave quantum annealers** via Ocean SDK
- **Gate-based quantum computers** via QAOA (Qiskit, Cirq)
- **Hybrid solvers** via D-Wave Leap

### Worked Example (5 actions)

**Setup:** Maria has $340 checking, goal = stability, effort budget = 120 min, min buffer = $100.

| i | Action | wᵢ | eᵢ (min) | cᵢ ($) |
|---|---|---|---|---|
| 0 | cancel_unused_sub | 0.82 | 15 | +30 |
| 1 | avalanche_extra_payment | 0.95 | 10 | −50 |
| 2 | meal_prep | 0.71 | 120 | +80 |
| 3 | set_overdraft_alert | 0.93 | 5 | 0 |
| 4 | sell_unused_items | 0.58 | 60 | +100 |

**Required:** set_overdraft_alert (x₃ = 1 forced due to critical risk window)

**Evaluate all feasible states** (x₃ = 1 always):

| x₀ | x₁ | x₂ | x₃ | x₄ | Effort | Cash | Benefit | Feasible? |
|---|---|---|---|---|---|---|---|---|
| 1 | 1 | 0 | 1 | 1 | 90 | 420 | 3.28 | Yes |
| 1 | 1 | 0 | 1 | 0 | 30 | 320 | 2.70 | Yes |
| 1 | 0 | 0 | 1 | 1 | 80 | 470 | 2.33 | Yes |
| 0 | 1 | 0 | 1 | 1 | 75 | 390 | 2.46 | Yes |
| 1 | 1 | 1 | 1 | 0 | 150 | 400 | 3.41 | No (effort) |
| 0 | 0 | 1 | 1 | 0 | 125 | 420 | 1.64 | No (effort) |

**Winner:** x = [1, 1, 0, 1, 1] → cancel sub + avalanche + alerts + sell items
- Effort: 90 min ≤ 120 ✓
- Cash: $340 + 30 − 50 + 0 + 100 = $420 ≥ $100 ✓
- Benefit: 3.28 (highest feasible)

Meal prep is rejected (120 min alone uses entire budget, low benefit for the time).

---

## 10) Next.js Implementation Blueprint

### Folder Structure
```
Hack/
├── app/
│   ├── layout.tsx              # Root layout, metadata, fonts
│   ├── page.tsx                # Main page (client component, state machine)
│   ├── globals.css             # Tailwind base
│   ├── fonts/                  # Geist fonts
│   └── api/
│       ├── parse-upload/route.ts    # CSV/JSON parsing endpoint
│       ├── build-snapshot/route.ts  # Snapshot building endpoint
│       ├── optimize/route.ts        # QUBO optimization endpoint
│       ├── planner/route.ts         # LLM plan generation endpoint
│       └── pipeline/route.ts        # Full pipeline (main endpoint)
├── components/
│   ├── FileUpload.tsx          # Drag-and-drop upload + demo button
│   ├── ProfileForm.tsx         # Balance + goal form
│   ├── SnapshotView.tsx        # Financial snapshot display
│   ├── PlanView.tsx            # Weekly plan with action cards
│   ├── ActionCard.tsx          # Single action card
│   ├── RiskAlert.tsx           # Risk alert banner
│   ├── WorkflowTrace.tsx       # Agentic pipeline trace
│   └── QUBOVisualization.tsx   # QUBO results display
├── lib/
│   ├── types.ts                # All TypeScript interfaces
│   ├── parser.ts               # CSV parsing + feature extraction
│   ├── actions.ts              # Action library + eligibility
│   ├── qubo.ts                 # QUBO solver (exact + SA + greedy)
│   ├── prompts.ts              # LLM prompts
│   └── tools.ts                # Pipeline orchestration
├── demo/
│   ├── demo_transactions.csv   # Demo data
│   └── demo_profile.json       # Demo profile
├── public/demo/                # Static demo files
├── .env.example                # OpenAI key template
└── SPEC.md                     # This document
```

### Key Components and Props
- `FileUpload` → { onFileSelected, onDemoLoad, isLoading }
- `ProfileForm` → { onSubmit, defaultBalance? }
- `SnapshotView` → { snapshot: FinancialSnapshot }
- `PlanView` → { plan: WeeklyPlan }
- `ActionCard` → { action: WeeklyPlanAction }
- `RiskAlert` → { alerts: string[] }
- `WorkflowTrace` → { trace: WorkflowTrace }
- `QUBOVisualization` → { quboResult, allActions }

### State and Data Flow
```
page.tsx state machine:
  upload → profile → loading → results

API call: POST /api/pipeline (FormData)
  → Server parses file
  → Builds snapshot
  → Runs risk scan + leak finder + debt calc
  → Runs QUBO optimizer
  → Calls OpenAI for plan generation
  → Returns CopilotResponse { snapshot, qubo_result, plan, trace }
```

### Styling
- Tailwind CSS utility-first
- Slate-50 background, white cards with shadow-sm
- Indigo-600 primary, red for danger, amber for warning, emerald for success
- System fonts (Geist Sans/Mono from Next.js)

---

## 11) Demo Assets

### Demo CSV
See `demo/demo_transactions.csv` — 25 transactions for February 2026 showing:
- Biweekly income ($1,400 on 1st and 15th)
- Rent $1,100, utilities, phone, internet
- 5 subscriptions including Planet Fitness (leak)
- 2 debt payments (Chase Visa, SoFi)
- Groceries, gas, dining, shopping

### Demo JSON Profile
See `demo/demo_profile.json`:
- Checking balance: $340
- 2 debts: Chase Visa ($3,200, 24.99% APR) and SoFi ($1,800, 12% APR)
- Biweekly income: $1,400
- Goal: stability

### 4-Minute Demo Script

**[0:00–0:30] Problem Statement**
"64% of Americans live paycheck to paycheck. A single $35 overdraft fee can start
a spiral of late fees and debt. Traditional budgeting apps tell you what you spent.
We tell you what to DO about it — using agentic AI and quantum-ready optimization."

**[0:30–1:00] Upload + Setup**
- Open the app at localhost:3000
- Click "Try Demo Data"
- Show the profile form: "$340 checking balance, goal: stability"
- Click "Analyze My Finances"

**[1:00–2:00] Results Walkthrough**
- Point to the red risk alert: "Critical overdraft risk on March 1st"
- Walk through the weekly plan:
  - Week 1: Set up overdraft alerts, automate minimum payments, cancel Planet Fitness
  - Week 2: Negotiate T-Mobile bill, apply extra to Chase Visa
  - Ongoing: Review spending, build emergency fund
- Highlight the savings: "$55–$200/month estimated impact"

**[2:00–2:45] Technical Deep Dive**
- Scroll to the Financial Snapshot: "Our parser detected recurring bills, found the
  Planet Fitness subscription leak ($30/month), and projected an overdraft window."
- Show QUBO visualization: "The optimizer selected 8 of 12 eligible actions under
  a 120-minute effort budget. This QUBO formulation is directly portable to D-Wave
  quantum hardware."
- Expand Workflow Trace: "Every tool call is traced — parse, snapshot, risk scan,
  leak finder, debt calc, QUBO optimizer, LLM planner. The system dynamically chose
  which tools to run based on the data."

**[2:45–3:30] Equity Impact**
- "Notice the language: no shame, no jargon. We never say 'you wasted money.'
  We prioritize essentials — rent, food, medicine — before anything else."
- "The safety guardrails prevent the AI from ever recommending you skip a minimum
  payment or take a payday loan."
- "This is designed for the 160 million Americans traditional fintech ignores."

**[3:30–4:00] Architecture + Next Steps**
- Show architecture slide: "Next.js App Router, QUBO optimizer with simulated
  annealing, GPT-4o for plan generation, all running locally."
- "Next steps: Plaid integration for real bank data, Spanish language support,
  and running the QUBO on actual quantum hardware via D-Wave Leap."

### Expected Demo Outputs
- Risk alerts: "Critical: Projected overdraft on March 1st. Rent ($1,100) and paycheck arrive same day."
- Subscription leak: Planet Fitness ($29.99/month)
- Debts: Chase Visa (24.99% APR, 56 months to payoff at minimum) vs SoFi (12%, 28 months)
- QUBO selects: ~8-10 actions including overdraft alert, automate payments, cancel gym, negotiate bill, avalanche extra payment
- Weekly plan organized into week_1 (urgent), week_2 (important), ongoing (habits)
- Total estimated savings: $55–$200/month

---

## 12) QA + Demo-Proof Checklist

### Test Cases
- [ ] Upload valid demo CSV → snapshot generated correctly
- [ ] Upload valid JSON → works same as CSV
- [ ] Empty file → clear error message, no crash
- [ ] CSV with missing columns → graceful partial parse + warnings
- [ ] Profile with $0 balance → critical overdraft risk flagged
- [ ] Profile with no debts → debt tools skipped, plan still generated
- [ ] QUBO with 0 eligible actions → returns empty set, plan explains why
- [ ] QUBO with all actions exceeding budget → selects required only
- [ ] OpenAI API failure → fallback plan generated (no crash)
- [ ] Very large CSV (1000+ rows) → processes within 10 seconds
- [ ] Demo data produces all three required scenarios (leak, overdraft, multi-debt)

### Edge Cases
- [ ] All amounts positive (no expenses) → flag as unusual, still process
- [ ] Negative income (refund?) → skip from income detection
- [ ] Duplicate transactions → deduplicate, warn
- [ ] Future-dated transactions → flag, exclude from historical analysis
- [ ] Very high debt (>$100K) → still works, no overflow
- [ ] Non-USD currencies → note: MVP assumes USD only

### "What If LLM Fails?" Behavior
1. If OpenAI returns non-JSON → retry once with stricter prompt
2. If retry fails → generate a fallback plan from selected actions (no LLM needed):
   - Sort actions by risk_reduction descending
   - Put top 3 in week_1, next 3 in week_2, rest in ongoing
   - Use action descriptions as "how" text
   - Static encouragement and disclaimer
3. If OpenAI is completely unreachable → show snapshot + QUBO results + action list
   without the narrative plan. Display: "AI coaching plan temporarily unavailable.
   Here are the recommended actions based on our analysis."

### Fairness and Harm Checks
- [ ] Plan never recommends skipping rent, food, utilities, or medication
- [ ] Plan never recommends payday/title loans
- [ ] Plan never guarantees specific dollar savings
- [ ] Language is shame-free (no "you wasted" or "you should have")
- [ ] Disclaimer appears on every plan
- [ ] Low-balance users get overdraft alerts as #1 priority
- [ ] Debt payoff strategy respects minimum payments as non-negotiable
- [ ] No assumptions about family structure, employment type, or financial literacy

### Final Pre-Demo Checklist
- [ ] `.env` file has valid OPENAI_API_KEY
- [ ] `npm run dev` starts without errors
- [ ] Demo CSV loads from "Try Demo Data" button
- [ ] Full pipeline completes in < 30 seconds
- [ ] Risk alert banner appears (red, critical)
- [ ] Subscription leak (Planet Fitness) highlighted
- [ ] Both debts shown with APR comparison
- [ ] QUBO section shows solver used + selected actions
- [ ] Workflow trace expands and shows all tool calls
- [ ] "Start Over" button resets cleanly
- [ ] No console errors in browser DevTools
- [ ] Disclaimer visible at bottom of plan
- [ ] Mobile responsive (test at 375px width)

---

## Assumptions Made
1. USD only (no currency conversion)
2. Monthly billing cycle for all recurring items
3. Biweekly pay is the most common income frequency for the target demographic
4. 120 minutes/week is a reasonable effort budget for financial tasks
5. $100 minimum cash buffer is the safety floor
6. GPT-4o is available and responds within 15 seconds
7. Planet Fitness is the subscription leak (demo data choice)
8. No real bank API — CSV/JSON upload only for MVP

---

*Equity Finance Copilot — Built for the hackathon. Built for equity.*
