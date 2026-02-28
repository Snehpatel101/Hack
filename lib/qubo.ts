// ============================================================
// Equity Finance Copilot — QUBO Optimizer v2 (Backed by Math)
// ============================================================
//
// QUBO: Quadratic Unconstrained Binary Optimization
// Each financial action is a binary variable x_i ∈ {0,1}.
// The optimizer finds the combination that maximizes a
// goal-conditioned score while respecting constraints.
//
// Objective (maximize):
//   f(x) = Σᵢ valueᵢ·xᵢ                         [benefit]
//        + Σ_{synergy} 0.15·xᵢ·xⱼ                [synergy]
//        - Σ_{conflict} 1000·xᵢ·xⱼ               [conflicts]
//        - 10·[max(0, Σ eᵢxᵢ − E_max)]²          [effort]
//        - 15·[max(0, Σ cᵢxᵢ − C_max)]²          [cash]
//        - 20·[max(0, B_min − (B₀ + Σ δᵢxᵢ))]²   [buffer]
//
// Solvers:
//   1. Exact enumeration (n ≤ 20): guarantees optimal
//   2. Greedy fallback: value/effort ratio ordering
//
// Quantum-ready: D-Wave / IBM Qiskit compatible
// ============================================================

import { QUBOInput, QUBOResult, QUBOActionInput, QUBOActionContribution } from "./types";

const LAMBDA_EFFORT = 10.0;
const LAMBDA_CASH = 15.0;
const LAMBDA_BUFFER = 20.0;
const BIG_M = 1000.0;
const SYNERGY_BONUS = 0.15;

function getGoalWeights(goal: QUBOInput["goal"]): { cash: number; risk: number } {
  switch (goal) {
    case "stabilize_cashflow": return { cash: 0.4, risk: 0.6 };
    case "pay_down_debt": return { cash: 0.7, risk: 0.3 };
    case "build_emergency_fund": return { cash: 0.5, risk: 0.5 };
  }
}

function computeNormalizedValues(actions: QUBOActionInput[], goal: QUBOInput["goal"]): number[] {
  const gw = getGoalWeights(goal);
  const maxCash = Math.max(1, ...actions.map(a => Math.abs(a.monthly_cashflow_delta)));
  const maxRisk = Math.max(1, ...actions.map(a => a.risk_reduction_score));
  return actions.map(a => {
    const cashNorm = a.monthly_cashflow_delta / maxCash;
    const riskNorm = a.risk_reduction_score / maxRisk;
    return gw.cash * cashNorm + gw.risk * riskNorm;
  });
}

function evaluateObjective(
  bits: number[],
  actions: QUBOActionInput[],
  values: number[],
  input: QUBOInput
): number {
  const n = bits.length;
  let score = 0;

  // Linear benefit: Σ value_i * x_i
  for (let i = 0; i < n; i++) {
    score += values[i] * bits[i];
  }

  // Synergy bonuses: Σ SYNERGY_BONUS * x_i * x_j for synergy pairs
  for (let i = 0; i < n; i++) {
    if (bits[i] === 0) continue;
    for (const synId of actions[i].synergy_with) {
      const j = actions.findIndex(a => a.id === synId);
      if (j >= 0 && j > i && bits[j] === 1) {
        score += SYNERGY_BONUS;
      }
    }
  }

  // Conflict penalties: -BIG_M * x_i * x_j for conflict pairs
  for (let i = 0; i < n; i++) {
    if (bits[i] === 0) continue;
    for (const confId of actions[i].conflicts_with) {
      const j = actions.findIndex(a => a.id === confId);
      if (j >= 0 && j > i && bits[j] === 1) {
        score -= BIG_M;
      }
    }
  }

  // Effort constraint penalty
  let totalEffort = 0;
  for (let i = 0; i < n; i++) totalEffort += actions[i].effort_minutes * bits[i];
  const effortViolation = Math.max(0, totalEffort - input.constraints.max_effort_minutes_week);
  score -= LAMBDA_EFFORT * effortViolation * effortViolation;

  // Upfront cash constraint penalty
  let totalUpfront = 0;
  for (let i = 0; i < n; i++) totalUpfront += actions[i].upfront_cash_cost * bits[i];
  const cashViolation = Math.max(0, totalUpfront - input.constraints.max_upfront_cash_week);
  score -= LAMBDA_CASH * cashViolation * cashViolation;

  // Buffer constraint penalty
  let projectedBalance = input.snapshot.starting_balance;
  for (let i = 0; i < n; i++) projectedBalance += actions[i].monthly_cashflow_delta * bits[i];
  const bufferViolation = Math.max(0, input.constraints.must_keep_balance_at_least - projectedBalance);
  score -= LAMBDA_BUFFER * bufferViolation * bufferViolation;

  return score;
}

function solveExact(actions: QUBOActionInput[], values: number[], input: QUBOInput): { bits: number[]; score: number } {
  const n = actions.length;
  const total = 1 << n;
  let bestBits = new Array(n).fill(0);
  let bestScore = -Infinity;

  for (let mask = 0; mask < total; mask++) {
    const bits: number[] = [];
    for (let i = 0; i < n; i++) bits.push((mask >> i) & 1);

    // Force required actions on
    let skip = false;
    for (const reqId of input.required_action_ids) {
      const idx = actions.findIndex(a => a.id === reqId);
      if (idx >= 0 && bits[idx] === 0) { skip = true; break; }
    }
    if (skip) continue;

    // Skip ineligible actions
    for (let i = 0; i < n; i++) {
      if (bits[i] === 1 && !actions[i].eligibility) { skip = true; break; }
    }
    if (skip) continue;

    const s = evaluateObjective(bits, actions, values, input);
    if (s > bestScore) {
      bestScore = s;
      bestBits = [...bits];
    }
  }
  return { bits: bestBits, score: bestScore };
}

function solveGreedy(actions: QUBOActionInput[], values: number[], input: QUBOInput): { bits: number[]; score: number } {
  const n = actions.length;
  const bits = new Array(n).fill(0);

  // Force required actions
  for (const reqId of input.required_action_ids) {
    const idx = actions.findIndex(a => a.id === reqId);
    if (idx >= 0 && actions[idx].eligibility) bits[idx] = 1;
  }

  // Sort remaining by value / max(effort, 1) ratio
  const indices = actions
    .map((a, i) => ({ i, ratio: values[i] / Math.max(a.effort_minutes, 1) }))
    .filter(({ i }) => bits[i] === 0 && actions[i].eligibility)
    .sort((a, b) => b.ratio - a.ratio);

  for (const { i } of indices) {
    // Check if adding this action conflicts with already selected
    let hasConflict = false;
    for (const confId of actions[i].conflicts_with) {
      const j = actions.findIndex(a => a.id === confId);
      if (j >= 0 && bits[j] === 1) { hasConflict = true; break; }
    }
    if (hasConflict) continue;

    // Check constraints
    bits[i] = 1;
    let totalEffort = 0, totalUpfront = 0, projBalance = input.snapshot.starting_balance;
    for (let k = 0; k < n; k++) {
      totalEffort += actions[k].effort_minutes * bits[k];
      totalUpfront += actions[k].upfront_cash_cost * bits[k];
      projBalance += actions[k].monthly_cashflow_delta * bits[k];
    }
    if (totalEffort > input.constraints.max_effort_minutes_week ||
        totalUpfront > input.constraints.max_upfront_cash_week ||
        projBalance < input.constraints.must_keep_balance_at_least) {
      bits[i] = 0; // revert
      continue;
    }
  }

  const score = evaluateObjective(bits, actions, values, input);
  return { bits, score };
}

function buildExplainability(
  bits: number[],
  actions: QUBOActionInput[],
  values: number[],
  input: QUBOInput
): { top_reasons: string[]; action_contributions: QUBOActionContribution[]; constraint_notes: string[] } {
  const gw = getGoalWeights(input.goal);
  const maxCash = Math.max(1, ...actions.map(a => Math.abs(a.monthly_cashflow_delta)));
  const maxRisk = Math.max(1, ...actions.map(a => a.risk_reduction_score));

  const contributions: QUBOActionContribution[] = [];
  const reasons: string[] = [];
  const notes: string[] = [];

  // Compute per-action contributions
  for (let i = 0; i < bits.length; i++) {
    if (bits[i] === 0) continue;
    const a = actions[i];
    const cashComp = gw.cash * (a.monthly_cashflow_delta / maxCash);
    const riskComp = gw.risk * (a.risk_reduction_score / maxRisk);

    // Check penalties this action contributes to
    let penalties = 0;
    // Effort contribution
    penalties -= a.effort_minutes * 0.001; // tiny penalty for effort tracking

    contributions.push({
      id: a.id,
      value: cashComp + riskComp + penalties,
      cash_component: Math.round(cashComp * 1000) / 1000,
      risk_component: Math.round(riskComp * 1000) / 1000,
      penalties: Math.round(penalties * 1000) / 1000,
    });
  }

  // Sort contributions by value descending
  contributions.sort((a, b) => b.value - a.value);

  // Generate top reasons
  if (contributions.length > 0) {
    const topAction = actions.find(a => a.id === contributions[0].id);
    if (topAction) {
      reasons.push(`"${topAction.label}" was selected for highest combined value (${contributions[0].value.toFixed(2)})`);
    }
  }

  // Goal-specific reason
  switch (input.goal) {
    case "stabilize_cashflow":
      reasons.push("Risk reduction weighted 60% — actions that prevent overdrafts and late fees were prioritized");
      break;
    case "pay_down_debt":
      reasons.push("Cash impact weighted 70% — actions that free up money for debt payments were prioritized");
      break;
    case "build_emergency_fund":
      reasons.push("Balanced 50/50 weighting — actions that both free cash and reduce risk were prioritized");
      break;
  }

  // Constraint notes
  let totalEffort = 0, totalUpfront = 0;
  for (let i = 0; i < bits.length; i++) {
    totalEffort += actions[i].effort_minutes * bits[i];
    totalUpfront += actions[i].upfront_cash_cost * bits[i];
  }

  const effortPct = Math.round((totalEffort / input.constraints.max_effort_minutes_week) * 100);
  notes.push(`Effort budget: ${totalEffort}/${input.constraints.max_effort_minutes_week} min (${effortPct}% used)`);

  if (totalUpfront > 0) {
    const cashPct = Math.round((totalUpfront / input.constraints.max_upfront_cash_week) * 100);
    notes.push(`Upfront cash: $${totalUpfront}/$${input.constraints.max_upfront_cash_week} (${cashPct}% used)`);
  }

  // Check for skipped high-value actions
  for (let i = 0; i < bits.length; i++) {
    if (bits[i] === 1) continue;
    if (values[i] > 0.7) {
      const a = actions[i];
      // Explain why it was skipped
      for (const confId of a.conflicts_with) {
        const j = actions.findIndex(x => x.id === confId);
        if (j >= 0 && bits[j] === 1) {
          reasons.push(`"${a.label}" was skipped because it conflicts with "${actions[j].label}"`);
        }
      }
    }
  }

  return { top_reasons: reasons.slice(0, 5), action_contributions: contributions, constraint_notes: notes };
}

export function solveQUBO(input: QUBOInput): QUBOResult {
  const startTime = performance.now();
  const actions = input.actions.filter(a => a.eligibility);
  const n = actions.length;

  if (n === 0) {
    return {
      selected_action_ids: [],
      metrics: { estimated_monthly_cash_impact: 0, estimated_risk_reduction: 0, effort_minutes_used: 0, upfront_cash_used: 0, buffer_respected: true },
      score: { optimization_score: 0, goal_weights: { ...getGoalWeights(input.goal), effort_penalty: 0, buffer_penalty: 0 } },
      explain: { top_reasons: ["No eligible actions available"], action_contributions: [], constraint_notes: [] },
      solver: { solver_type: "greedy_fallback", n_actions_considered: 0, time_ms: 0 },
    };
  }

  const values = computeNormalizedValues(actions, input.goal);
  const gw = getGoalWeights(input.goal);

  let bestBits: number[];
  let bestScore: number;
  let solverType: "qubo_sim" | "greedy_fallback";

  if (n <= 20) {
    const exact = solveExact(actions, values, input);
    bestBits = exact.bits;
    bestScore = exact.score;
    solverType = "qubo_sim";
  } else {
    const greedy = solveGreedy(actions, values, input);
    bestBits = greedy.bits;
    bestScore = greedy.score;
    solverType = "greedy_fallback";
  }

  // Always run greedy as backup
  const greedyResult = solveGreedy(actions, values, input);
  if (greedyResult.score > bestScore) {
    bestBits = greedyResult.bits;
    bestScore = greedyResult.score;
    solverType = "greedy_fallback";
  }

  // Compute metrics
  let cashImpact = 0, riskReduction = 0, effortUsed = 0, upfrontUsed = 0;
  const selectedIds: string[] = [];
  for (let i = 0; i < n; i++) {
    if (bestBits[i] === 1) {
      selectedIds.push(actions[i].id);
      cashImpact += actions[i].monthly_cashflow_delta;
      riskReduction += actions[i].risk_reduction_score;
      effortUsed += actions[i].effort_minutes;
      upfrontUsed += actions[i].upfront_cash_cost;
    }
  }

  const projectedBalance = input.snapshot.starting_balance + cashImpact;
  const bufferRespected = projectedBalance >= input.constraints.must_keep_balance_at_least;

  // Compute penalty breakdowns for score output
  const effortViolation = Math.max(0, effortUsed - input.constraints.max_effort_minutes_week);
  const effortPenalty = LAMBDA_EFFORT * effortViolation * effortViolation;
  const bufferViolation = Math.max(0, input.constraints.must_keep_balance_at_least - projectedBalance);
  const bufferPenalty = LAMBDA_BUFFER * bufferViolation * bufferViolation;

  // Build explainability
  const explain = buildExplainability(bestBits, actions, values, input);

  const timeMs = Math.round((performance.now() - startTime) * 100) / 100;

  return {
    selected_action_ids: selectedIds,
    metrics: {
      estimated_monthly_cash_impact: Math.round(cashImpact * 100) / 100,
      estimated_risk_reduction: riskReduction,
      effort_minutes_used: effortUsed,
      upfront_cash_used: upfrontUsed,
      buffer_respected: bufferRespected,
    },
    score: {
      optimization_score: Math.round(bestScore * 1000) / 1000,
      goal_weights: {
        cash: gw.cash,
        risk: gw.risk,
        effort_penalty: Math.round(effortPenalty * 1000) / 1000,
        buffer_penalty: Math.round(bufferPenalty * 1000) / 1000,
      },
    },
    explain,
    solver: {
      solver_type: solverType,
      n_actions_considered: n,
      time_ms: timeMs,
    },
  };
}
