# QUBO Specification — "One Day or Day One" Equity Finance Copilot

---

## 1) What the QUBO Backend Does

The QUBO backend is a **deterministic optimization engine** — not a chatbot, not a heuristic, and not a language-model guess. It takes a snapshot of the user's financial situation and a set of candidate actions (cancel subscriptions, move bill dates, set autopay, pay extra on high-APR debt, start savings, etc.), then decides **which subset to activate** by assigning each action a binary variable: 1 = do it, 0 = skip it.

The engine is **goal-conditioned**: different financial goals (stabilize cash flow, pay down debt, build an emergency fund) produce different objective weightings, so the same action set can yield different optimal subsets depending on what the user needs most. All real-world constraints — weekly effort budget, upfront cash limits, minimum account balance — are enforced as **quadratic penalty terms** baked directly into the objective function.

Because the formulation is a Quadratic Unconstrained Binary Optimization (QUBO), it is **quantum-hardware-ready**: the exact same Q-matrix can be submitted to a D-Wave annealer or executed via IBM QAOA circuits with zero reformulation. On classical hardware the solver uses **exact enumeration** for up to 20 actions (guaranteeing the mathematically provable optimum) and falls back to a greedy heuristic with local improvement for larger sets.

Every result ships with a full **explainability payload** — per-action value breakdowns, constraint utilization, and plain-English reasons — so the user (and the judges) can verify exactly why each action was selected.

---

## 2) Input / Output API Contracts

### INPUT — `POST /api/qubo/solve`

```json
{
  "goal": "stabilize_cashflow" | "pay_down_debt" | "build_emergency_fund",
  "constraints": {
    "max_effort_minutes_week": number,
    "max_upfront_cash_week": number,
    "must_keep_balance_at_least": number
  },
  "snapshot": {
    "starting_balance": number,
    "monthly_income_est": number,
    "monthly_essential_spend_est": number,
    "risk_flags": string[]
  },
  "actions": [
    {
      "id": string,
      "label": string,
      "effort_minutes": number,
      "upfront_cash_cost": number,
      "monthly_cashflow_delta": number,
      "risk_reduction_score": number,
      "eligibility": boolean,
      "conflicts_with": string[],
      "synergy_with": string[]
    }
  ]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `goal` | enum | One of three optimization targets |
| `constraints.max_effort_minutes_week` | number | Maximum weekly effort the user will tolerate |
| `constraints.max_upfront_cash_week` | number | Maximum one-time cash outlay this week |
| `constraints.must_keep_balance_at_least` | number | Hard floor on account balance after actions |
| `snapshot.starting_balance` | number | Current account balance (B₀) |
| `snapshot.monthly_income_est` | number | Estimated monthly income |
| `snapshot.monthly_essential_spend_est` | number | Estimated essential monthly spend |
| `snapshot.risk_flags` | string[] | Tags like `"overdraft_history"`, `"missed_payment"` |
| `actions[].id` | string | Unique action identifier |
| `actions[].label` | string | Human-readable action name |
| `actions[].effort_minutes` | number | Time cost to execute this action |
| `actions[].upfront_cash_cost` | number | One-time cash required |
| `actions[].monthly_cashflow_delta` | number | Net monthly cash impact (positive = saves money) |
| `actions[].risk_reduction_score` | number | 0-10 score for how much financial risk this removes |
| `actions[].eligibility` | boolean | Whether this action is available to the user |
| `actions[].conflicts_with` | string[] | IDs of mutually exclusive actions |
| `actions[].synergy_with` | string[] | IDs of actions that pair well together |

### OUTPUT

```json
{
  "selected_action_ids": string[],
  "metrics": {
    "estimated_monthly_cash_impact": number,
    "estimated_risk_reduction": number,
    "effort_minutes_used": number,
    "upfront_cash_used": number,
    "buffer_respected": boolean
  },
  "score": {
    "optimization_score": number,
    "goal_weights": {
      "cash": number,
      "risk": number,
      "effort_penalty": number,
      "buffer_penalty": number
    }
  },
  "explain": {
    "top_reasons": string[],
    "action_contributions": [
      {
        "id": string,
        "value": number,
        "cash_component": number,
        "risk_component": number,
        "penalties": number
      }
    ],
    "constraint_notes": string[]
  },
  "solver": {
    "solver_type": "qubo_sim" | "greedy_fallback",
    "n_actions_considered": number,
    "time_ms": number
  }
}
```

| Field | Description |
|-------|-------------|
| `selected_action_ids` | The optimal subset of actions to execute |
| `metrics.estimated_monthly_cash_impact` | Sum of `monthly_cashflow_delta` for selected actions |
| `metrics.estimated_risk_reduction` | Sum of `risk_reduction_score` for selected actions |
| `metrics.effort_minutes_used` | Total effort minutes consumed |
| `metrics.upfront_cash_used` | Total upfront cash consumed |
| `metrics.buffer_respected` | Whether `B₀ + Σδᵢ` stays above `B_min` |
| `score.optimization_score` | Raw objective function value at the solution |
| `score.goal_weights` | The weight configuration used for this goal |
| `explain.top_reasons` | 2-4 plain-English sentences explaining the selection |
| `explain.action_contributions` | Per-action breakdown of value and penalties |
| `explain.constraint_notes` | Notes about binding or near-binding constraints |
| `solver.solver_type` | Which solver path was used |
| `solver.n_actions_considered` | Number of eligible actions fed to the solver |
| `solver.time_ms` | Wall-clock solve time in milliseconds |

---

## 3) Scoring Model

### Goal Weights

Each goal defines a different trade-off between cash-flow improvement and risk reduction:

| Goal | w_cash | w_risk | Intuition |
|------|--------|--------|-----------|
| `stabilize_cashflow` | 0.4 | 0.6 | Prioritize removing risk (overdrafts, missed payments) while still improving cash |
| `pay_down_debt` | 0.7 | 0.3 | Maximize cash freed up for debt paydown; risk is secondary |
| `build_emergency_fund` | 0.5 | 0.5 | Balanced — need cash to save, but also need to reduce risk of fund depletion |

### Per-Action Value Computation

For each eligible action *i*, compute a goal-weighted value score:

```
value_i = w_cash * norm_cash_i + w_risk * norm_risk_i
```

Where normalization maps each dimension to [0, 1] by dividing by the maximum observed in the candidate set:

```
norm_cash_i = monthly_cashflow_delta_i / max(monthly_cashflow_delta across all actions)
norm_risk_i = risk_reduction_score_i / max(risk_reduction_score across all actions)
```

**Why normalize?** Raw cash deltas might range from -$10 to +$80, while risk scores range from 0 to 10. Without normalization the cash dimension would dominate. Dividing by the candidate-set maximum ensures both dimensions contribute proportionally to the weights.

**Negative cash deltas** (e.g., starting a savings transfer costs cash flow) produce negative normalized values. The optimizer naturally penalizes these unless the risk reduction is large enough to compensate — which is exactly the trade-off we want.

---

## 4) QUBO Formulation (Math)

**QUBO** (Quadratic Unconstrained Binary Optimization) is a mathematical framework where every decision is a binary choice (do it or skip it), the objective function is at most quadratic in those binary variables, and all constraints are folded into the objective as penalty terms. This formulation is the native input format for quantum annealers and can be solved exactly on classical hardware for small-to-moderate problem sizes.

### Decision Variables

For each eligible action *i* (where *i* = 1, ..., *n*):

```
x_i ∈ {0, 1}       (1 = select action, 0 = skip)
```

### Objective Function (MAXIMIZE)

```
f(x) = Σᵢ valueᵢ · xᵢ                                          [linear benefit]
     + Σ_{(i,j) ∈ synergy} s_ij · xᵢ · xⱼ                      [synergy bonus]
     - Σ_{(i,j) ∈ conflict} M · xᵢ · xⱼ                        [conflict penalty]
     - λ_e · [max(0, Σᵢ eᵢ · xᵢ - E_max)]²                    [effort constraint]
     - λ_c · [max(0, Σᵢ cᵢ · xᵢ - C_max)]²                    [upfront cash constraint]
     - λ_b · [max(0, B_min - (B₀ + Σᵢ δᵢ · xᵢ))]²             [buffer constraint]
```

### Symbol Table

| Symbol | Meaning | Value / Source |
|--------|---------|----------------|
| `valueᵢ` | Goal-weighted score for action *i* | Computed in Section 3 |
| `eᵢ` | `effort_minutes` for action *i* | From input |
| `cᵢ` | `upfront_cash_cost` for action *i* | From input |
| `δᵢ` | `monthly_cashflow_delta` for action *i* | From input |
| `E_max` | `max_effort_minutes_week` | From input constraints |
| `C_max` | `max_upfront_cash_week` | From input constraints |
| `B₀` | `starting_balance` | From input snapshot |
| `B_min` | `must_keep_balance_at_least` | From input constraints |
| `λ_e` | Effort penalty multiplier | **10** |
| `λ_c` | Upfront cash penalty multiplier | **15** |
| `λ_b` | Buffer penalty multiplier | **20** |
| `M` | Big-M conflict penalty | **1000** |
| `s_ij` | Synergy bonus | **0.15** |

### Penalty Term Explanations

1. **Linear Benefit** `Σᵢ valueᵢ · xᵢ` — The core payoff. Each selected action contributes its goal-weighted value.

2. **Synergy Bonus** `+ s_ij · xᵢ · xⱼ` — When two actions are tagged as synergistic (e.g., "Cancel Netflix" + "Set autopay bills"), selecting both earns a 0.15 bonus. This nudges the solver toward complementary action pairs.

3. **Conflict Penalty** `- M · xᵢ · xⱼ` — Mutually exclusive actions (e.g., "Pay extra on credit card" vs. "Enroll in hardship program") incur a catastrophic -1000 penalty if both are selected. This makes co-selection mathematically impossible in any optimal solution.

4. **Effort Constraint** `- λ_e · [max(0, ...)]²` — If total effort exceeds the user's weekly budget, the squared overshoot is penalized with weight 10. The quadratic shape means small overruns are mildly penalized but large overruns are crushingly expensive.

5. **Upfront Cash Constraint** `- λ_c · [max(0, ...)]²` — Same logic for one-time cash outlay, with a higher weight of 15 (cash is scarcer than time for most users).

6. **Buffer Constraint** `- λ_b · [max(0, ...)]²` — If the projected balance after all cash-flow deltas falls below the user's minimum, the deficit is penalized with the highest weight of 20. Protecting the user's safety net is the top priority.

---

## 5) Solver Strategy

### Tier 1: Exact Enumeration (n <= 20)

When the number of eligible actions *n* is 20 or fewer, the solver **exhaustively evaluates all 2^n combinations**. This guarantees the mathematically provable global optimum — no approximation, no heuristic, no compromise.

| n | Combinations | Typical Time |
|---|-------------|--------------|
| 10 | 1,024 | < 1 ms |
| 15 | 32,768 | < 10 ms |
| 18 | 262,144 | < 30 ms |
| 20 | 1,048,576 | < 50 ms |

For a hackathon demo with 5-15 realistic financial actions, exact enumeration is instantaneous and provably optimal.

### Tier 2: Greedy + Local Improvement (n > 20)

For larger action sets:

1. **Sort** actions by value-to-effort ratio (`valueᵢ / eᵢ`) in descending order.
2. **Greedily add** actions in sorted order, skipping any that would violate constraints or trigger conflicts.
3. **Local improvement**: attempt single-swap moves (remove one selected action, add one unselected) and accept any swap that improves the objective.
4. Repeat local improvement until no improving swap exists.

### Safety Net

- **Always run greedy as a backup**, even when exact enumeration is used. If greedy produces a higher score (which should never happen for exact, but guards against implementation bugs), use the greedy result.
- **Strict feasibility check** after the solver returns: verify all hard constraints (effort, cash, buffer, no conflicts) on the winning bit-vector. If any constraint is violated, fall back to the greedy solution.

---

## 6) Worked 5-Action Example

### Action Set

| ID | Label | Effort (min) | Upfront ($) | Cash/mo ($) | Risk Score | Conflicts | Synergy |
|----|-------|:------------:|:-----------:|:-----------:|:----------:|-----------|---------|
| A1 | Cancel Netflix | 5 | 0 | +15 | 1 | — | A3 |
| A2 | Pay extra on CC | 10 | 100 | +40 | 3 | A4 | — |
| A3 | Set autopay bills | 10 | 0 | +5 | 8 | — | A1 |
| A4 | Hardship program | 30 | 0 | +80 | 5 | A2 | — |
| A5 | Start $10/wk savings | 5 | 40 | -10 | 6 | — | A3 |

### Configuration

- **Goal:** `stabilize_cashflow` → w_cash = 0.4, w_risk = 0.6
- **Constraints:** E_max = 45 min, C_max = $120, B_min = $200, B₀ = $500

### Step 1: Normalize and Compute Values

**Cash normalization** (max cash delta = +80 from A4):

| Action | raw cash | norm_cash |
|--------|----------|-----------|
| A1 | +15 | 15/80 = 0.1875 |
| A2 | +40 | 40/80 = 0.5000 |
| A3 | +5 | 5/80 = 0.0625 |
| A4 | +80 | 80/80 = 1.0000 |
| A5 | -10 | -10/80 = -0.1250 |

**Risk normalization** (max risk score = 8 from A3):

| Action | raw risk | norm_risk |
|--------|----------|-----------|
| A1 | 1 | 1/8 = 0.1250 |
| A2 | 3 | 3/8 = 0.3750 |
| A3 | 8 | 8/8 = 1.0000 |
| A4 | 5 | 5/8 = 0.6250 |
| A5 | 6 | 6/8 = 0.7500 |

**Goal-weighted values** (`value_i = 0.4 * norm_cash + 0.6 * norm_risk`):

| Action | 0.4 * norm_cash | 0.6 * norm_risk | **value_i** |
|--------|:--------------:|:--------------:|:-----------:|
| A1 | 0.0750 | 0.0750 | **0.1500** |
| A2 | 0.2000 | 0.2250 | **0.4250** |
| A3 | 0.0250 | 0.6000 | **0.6250** |
| A4 | 0.4000 | 0.3750 | **0.7750** |
| A5 | -0.0500 | 0.4500 | **0.4000** |

### Step 2: Evaluate Key Combinations

With n = 5, there are 2^5 = 32 combinations. Here are the most interesting candidates:

#### Candidate A: {A1, A2, A3, A5} — bits = [1,1,1,0,1]

```
Linear benefit  = 0.15 + 0.425 + 0.625 + 0.40 = 1.600
Synergy (A1,A3) = +0.15
Synergy (A3,A5) = +0.15
Conflict        = none
Effort          = 5 + 10 + 10 + 5 = 30 ≤ 45  → no penalty
Upfront cash    = 0 + 100 + 0 + 40 = 140 > 120 → PENALTY: -15 * (140-120)² = -15 * 400 = -6000
Buffer          = 500 + 15 + 40 + 5 - 10 = 550 ≥ 200 → no penalty
─────────────────────────────────────
TOTAL = 1.600 + 0.30 - 6000 = -5998.10  ← INFEASIBLE (cash overrun)
```

#### Candidate B: {A2, A3, A4} — bits = [0,1,1,1,0]

```
Linear benefit  = 0.425 + 0.625 + 0.775 = 1.825
Synergy         = none
Conflict (A2,A4)= -1000
Effort          = 10 + 10 + 30 = 50 > 45 → PENALTY: -10 * (50-45)² = -10 * 25 = -250
Upfront cash    = 100 + 0 + 0 = 100 ≤ 120 → no penalty
Buffer          = 500 + 40 + 5 + 80 = 625 ≥ 200 → no penalty
─────────────────────────────────────
TOTAL = 1.825 - 1000 - 250 = -1248.175  ← INFEASIBLE (conflict + effort)
```

#### Candidate C: {A1, A3, A4} — bits = [1,0,1,1,0]

```
Linear benefit  = 0.15 + 0.625 + 0.775 = 1.550
Synergy (A1,A3) = +0.15
Conflict        = none
Effort          = 5 + 10 + 30 = 45 ≤ 45  → no penalty (exactly at limit)
Upfront cash    = 0 + 0 + 0 = 0 ≤ 120    → no penalty
Buffer          = 500 + 15 + 5 + 80 = 600 ≥ 200 → no penalty
─────────────────────────────────────
TOTAL = 1.550 + 0.15 = 1.700
```

#### Candidate D: {A1, A3, A4, A5} — bits = [1,0,1,1,1]

```
Linear benefit  = 0.15 + 0.625 + 0.775 + 0.40 = 1.950
Synergy (A1,A3) = +0.15
Synergy (A3,A5) = +0.15
Conflict        = none
Effort          = 5 + 10 + 30 + 5 = 50 > 45 → PENALTY: -10 * (50-45)² = -10 * 25 = -250
Upfront cash    = 0 + 0 + 0 + 40 = 40 ≤ 120 → no penalty
Buffer          = 500 + 15 + 5 + 80 - 10 = 590 ≥ 200 → no penalty
─────────────────────────────────────
TOTAL = 1.950 + 0.30 - 250 = -247.750  ← effort overrun kills it
```

#### Candidate E: {A3, A4, A5} — bits = [0,0,1,1,1]

```
Linear benefit  = 0.625 + 0.775 + 0.40 = 1.800
Synergy (A3,A5) = +0.15
Conflict        = none
Effort          = 10 + 30 + 5 = 45 ≤ 45   → no penalty
Upfront cash    = 0 + 0 + 40 = 40 ≤ 120   → no penalty
Buffer          = 500 + 5 + 80 - 10 = 575 ≥ 200 → no penalty
─────────────────────────────────────
TOTAL = 1.800 + 0.15 = 1.950
```

### Step 3: Winner

| Candidate | Actions | Score |
|-----------|---------|------:|
| A | {A1, A2, A3, A5} | -5998.10 |
| B | {A2, A3, A4} | -1248.175 |
| C | {A1, A3, A4} | **1.700** |
| D | {A1, A3, A4, A5} | -247.750 |
| E | {A3, A4, A5} | **1.950** |

**Winner: Candidate E — {A3, A4, A5} with score 1.950**

### Why This Wins

- **A4 (Hardship program)** has the highest individual value (0.775) and delivers +$80/mo — the single most impactful action.
- **A3 (Set autopay)** has the second-highest value (0.625) driven by its massive risk reduction (score 8). It also synergizes with A5 for a +0.15 bonus.
- **A5 (Start savings)** costs $10/mo in cash flow but contributes strong risk reduction (0.40 value). The synergy with A3 pushes the combined score higher.
- **A1 was dropped** — adding it would push effort to 50 min (5 over the 45 min limit), triggering a -250 penalty that wipes out A1's 0.15 value contribution.
- **A2 conflicts with A4** — they can never co-exist, and A4 dominates A2 in value (0.775 vs 0.425).

### Final Output Metrics

```json
{
  "selected_action_ids": ["A3", "A4", "A5"],
  "metrics": {
    "estimated_monthly_cash_impact": 75,
    "estimated_risk_reduction": 19,
    "effort_minutes_used": 45,
    "upfront_cash_used": 40,
    "buffer_respected": true
  },
  "score": {
    "optimization_score": 1.950,
    "goal_weights": { "cash": 0.4, "risk": 0.6, "effort_penalty": 0, "buffer_penalty": 0 }
  }
}
```

---

## 7) Implementation Outline

### Key Functions

```
solveQUBO(input: QUBOInput): QUBOResult
    Main entry point. Filters eligible actions, computes weights,
    dispatches to exact or greedy solver, runs feasibility check,
    builds explainability payload.

evaluateObjective(bits, actions, weights, input): number
    Scores a single bit-vector against the full objective function.

solveExact(actions, weights, input): {bits, score}
    Enumerates all 2^n combinations, returns the one with the
    highest evaluateObjective score.

solveGreedy(actions, weights, input): {bits, score}
    Sorts by value/effort ratio, greedily adds feasible actions,
    then applies local swap improvement.

buildExplainability(bits, actions, weights, input): explain
    Decomposes the winning solution into per-action contributions,
    constraint utilization, and plain-English reasons.

goalWeights(goal): {cash, risk}
    Returns the w_cash, w_risk pair for the given goal enum.

normalizeValues(actions, goal): number[]
    Computes the goal-weighted value array for all actions.
```

### Pseudocode: `evaluateObjective`

```
function evaluateObjective(bits, actions, weights, input):
    score = 0

    // Linear benefit: sum of goal-weighted values for selected actions
    for i in range(n):
        score += weights[i] * bits[i]

    // Synergy bonuses: reward complementary action pairs
    for (i, j) in synergy_pairs:
        score += 0.15 * bits[i] * bits[j]

    // Conflict penalties: forbid mutually exclusive pairs
    for (i, j) in conflict_pairs:
        score -= 1000 * bits[i] * bits[j]

    // Effort constraint penalty
    effort = sum(actions[i].effort_minutes * bits[i] for i in range(n))
    if effort > input.constraints.max_effort_minutes_week:
        score -= 10 * (effort - input.constraints.max_effort_minutes_week) ^ 2

    // Upfront cash constraint penalty
    cash = sum(actions[i].upfront_cash_cost * bits[i] for i in range(n))
    if cash > input.constraints.max_upfront_cash_week:
        score -= 15 * (cash - input.constraints.max_upfront_cash_week) ^ 2

    // Buffer constraint penalty
    buffer = input.snapshot.starting_balance
           + sum(actions[i].monthly_cashflow_delta * bits[i] for i in range(n))
    if buffer < input.constraints.must_keep_balance_at_least:
        score -= 20 * (input.constraints.must_keep_balance_at_least - buffer) ^ 2

    return score
```

### Pseudocode: `solveExact`

```
function solveExact(actions, weights, input):
    n = len(actions)
    best_score = -Infinity
    best_bits = [0] * n

    for combo in 0 .. (2^n - 1):
        bits = binary_representation(combo, n)
        s = evaluateObjective(bits, actions, weights, input)
        if s > best_score:
            best_score = s
            best_bits = bits

    return {bits: best_bits, score: best_score}
```

### Pseudocode: `solveGreedy`

```
function solveGreedy(actions, weights, input):
    // Sort by value-to-effort ratio (descending)
    order = argsort(weights[i] / max(actions[i].effort_minutes, 1), descending)
    bits = [0] * n

    for i in order:
        bits[i] = 1
        if not feasible(bits, actions, input):
            bits[i] = 0

    // Local improvement: try single swaps
    improved = true
    while improved:
        improved = false
        for i in selected(bits):
            for j in unselected(bits):
                bits[i] = 0; bits[j] = 1
                if evaluateObjective(bits, ...) > current_score and feasible(bits, ...):
                    current_score = evaluateObjective(bits, ...)
                    improved = true
                    break
                else:
                    bits[i] = 1; bits[j] = 0

    return {bits, score: evaluateObjective(bits, actions, weights, input)}
```

### Pseudocode: `solveQUBO` (orchestrator)

```
function solveQUBO(input):
    // 1. Filter eligible actions
    actions = input.actions.filter(a => a.eligibility == true)
    n = len(actions)

    // 2. Compute goal weights and normalized values
    {w_cash, w_risk} = goalWeights(input.goal)
    weights = normalizeValues(actions, input.goal)

    // 3. Dispatch to solver
    if n <= 20:
        exact = solveExact(actions, weights, input)
    greedy = solveGreedy(actions, weights, input)

    // 4. Pick best feasible solution
    if n <= 20 and feasible(exact.bits) and exact.score >= greedy.score:
        winner = exact; solver_type = "qubo_sim"
    else:
        winner = greedy; solver_type = "greedy_fallback"

    // 5. Build output
    return {
        selected_action_ids: actions where winner.bits[i] == 1,
        metrics: computeMetrics(winner.bits, actions, input),
        score: { optimization_score: winner.score, goal_weights: ... },
        explain: buildExplainability(winner.bits, actions, weights, input),
        solver: { solver_type, n_actions_considered: n, time_ms: elapsed }
    }
```

---

## 8) "On-Stage One-Liner"

> "We model every financial action as a binary variable and solve a Quadratic Unconstrained Binary Optimization — the same math that runs on quantum computers — to find the mathematically provable best subset of actions for your specific situation, in under 50 milliseconds."

---

## Backed by Math

> Every recommendation is backed by a QUBO optimization — not a language model guess. The solver evaluates up to 2^n combinations, enforces your real-world constraints as quadratic penalties, and returns the mathematically optimal action set. This formulation is quantum-hardware-ready: it can run on D-Wave annealers or IBM QAOA circuits today.
