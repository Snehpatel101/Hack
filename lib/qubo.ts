// ============================================================
// Equity Finance Copilot — QUBO Optimizer (Quantum-Ready)
// ============================================================
//
// Formulation:
//   Decision variables: x_i ∈ {0, 1} for each candidate action i
//
//   Objective (minimize):
//     H(x) = -Σ_i w_i·x_i
//            + λ_effort · max(0, Σ_i e_i·x_i − E_max)²
//            + λ_cash  · max(0, C_min − C_cur − Σ_i c_i·x_i)²
//            + λ_req   · Σ_{j∈required} (1 − x_j)²
//
//   Where:
//     w_i = weighted benefit score for action i
//     e_i = effort in minutes
//     E_max = weekly effort budget
//     c_i = cash buffer effect
//     C_min = minimum required cash buffer
//     C_cur = current checking balance
//     λ = penalty multipliers
//
// Solvers:
//   1. Exact enumeration (n ≤ 20): try all 2^n states
//   2. Simulated annealing: for larger instances
//   3. Greedy fallback: sort by benefit/effort, add greedily
//
// Quantum-ready: this QUBO can be submitted directly to
// D-Wave quantum annealers or converted to QAOA circuits.
// ============================================================

import { QUBOInput, QUBOResult, SelectedAction } from "./types";

// Penalty weights
const LAMBDA_EFFORT = 10.0;
const LAMBDA_CASH = 15.0;
const LAMBDA_REQUIRED = 50.0;

interface QUBOState {
  bits: number[]; // 0 or 1 for each action
  energy: number;
}

/** Compute benefit weight for an action given the user's goal */
function computeWeight(action: SelectedAction, goal: string): number {
  const gw = action.goal_weights;
  let goalMultiplier: { stability: number; debt: number; emergency: number };

  switch (goal) {
    case "stability":
      goalMultiplier = { stability: 1.5, debt: 0.8, emergency: 0.7 };
      break;
    case "debt":
      goalMultiplier = { stability: 0.8, debt: 1.5, emergency: 0.7 };
      break;
    case "emergency":
      goalMultiplier = { stability: 0.8, debt: 0.7, emergency: 1.5 };
      break;
    default: // auto — balanced
      goalMultiplier = { stability: 1.0, debt: 1.0, emergency: 1.0 };
  }

  const base =
    gw.stability * goalMultiplier.stability +
    gw.debt * goalMultiplier.debt +
    gw.emergency * goalMultiplier.emergency;

  // Factor in risk reduction and estimated impact
  const avgImpact = (action.estimated_monthly_impact[0] + action.estimated_monthly_impact[1]) / 2;
  return base + action.risk_reduction * 0.05 + avgImpact * 0.002;
}

/** Evaluate the QUBO energy for a given bit vector */
function evaluateEnergy(
  bits: number[],
  actions: SelectedAction[],
  weights: number[],
  input: QUBOInput
): number {
  const n = bits.length;
  let energy = 0;

  // Objective: -Σ w_i · x_i
  for (let i = 0; i < n; i++) {
    energy -= weights[i] * bits[i];
  }

  // Effort penalty
  let totalEffort = 0;
  for (let i = 0; i < n; i++) {
    totalEffort += actions[i].effort_minutes * bits[i];
  }
  const effortViolation = Math.max(0, totalEffort - input.effort_budget_minutes);
  energy += LAMBDA_EFFORT * effortViolation * effortViolation;

  // Cash buffer penalty
  let cashAfter = input.current_balance;
  for (let i = 0; i < n; i++) {
    cashAfter += actions[i].cash_buffer_effect * bits[i];
  }
  const cashViolation = Math.max(0, input.min_cash_buffer - cashAfter);
  energy += LAMBDA_CASH * cashViolation * cashViolation;

  // Required action penalty
  for (const reqId of input.required_action_ids) {
    const idx = actions.findIndex((a) => a.id === reqId);
    if (idx >= 0 && bits[idx] === 0) {
      energy += LAMBDA_REQUIRED;
    }
  }

  return energy;
}

/** Exact enumeration for small instances (n ≤ 20) */
function solveExact(
  actions: SelectedAction[],
  weights: number[],
  input: QUBOInput
): QUBOState {
  const n = actions.length;
  const total = 1 << n;
  let bestBits = new Array(n).fill(0);
  let bestEnergy = Infinity;

  for (let mask = 0; mask < total; mask++) {
    const bits = [];
    for (let i = 0; i < n; i++) {
      bits.push((mask >> i) & 1);
    }
    const e = evaluateEnergy(bits, actions, weights, input);
    if (e < bestEnergy) {
      bestEnergy = e;
      bestBits = [...bits];
    }
  }

  return { bits: bestBits, energy: bestEnergy };
}

/** Simulated annealing for larger instances */
function solveSA(
  actions: SelectedAction[],
  weights: number[],
  input: QUBOInput,
  maxIter: number = 10000
): QUBOState & { iterations: number } {
  const n = actions.length;

  // Random initial state
  const bits = actions.map(() => (Math.random() > 0.5 ? 1 : 0));
  // Force required actions on
  for (const reqId of input.required_action_ids) {
    const idx = actions.findIndex((a) => a.id === reqId);
    if (idx >= 0) bits[idx] = 1;
  }

  let energy = evaluateEnergy(bits, actions, weights, input);
  let bestBits = [...bits];
  let bestEnergy = energy;

  let temp = 2.0;
  const coolingRate = 0.9995;

  for (let iter = 0; iter < maxIter; iter++) {
    // Flip a random bit
    const flipIdx = Math.floor(Math.random() * n);
    // Don't flip required actions off
    if (input.required_action_ids.includes(actions[flipIdx].id) && bits[flipIdx] === 1) {
      continue;
    }

    bits[flipIdx] = (1 - bits[flipIdx]) as 0 | 1;
    const newEnergy = evaluateEnergy(bits, actions, weights, input);
    const delta = newEnergy - energy;

    if (delta < 0 || Math.random() < Math.exp(-delta / temp)) {
      energy = newEnergy;
      if (energy < bestEnergy) {
        bestEnergy = energy;
        bestBits = [...bits];
      }
    } else {
      bits[flipIdx] = (1 - bits[flipIdx]) as 0 | 1; // revert
    }

    temp *= coolingRate;
  }

  return { bits: bestBits, energy: bestEnergy, iterations: maxIter };
}

/** Greedy fallback: sort by benefit/effort, add greedily */
function solveGreedy(
  actions: SelectedAction[],
  weights: number[],
  input: QUBOInput
): QUBOState {
  const n = actions.length;
  const bits = new Array(n).fill(0);

  // Force required actions
  let usedEffort = 0;
  let cashAfter = input.current_balance;
  for (const reqId of input.required_action_ids) {
    const idx = actions.findIndex((a) => a.id === reqId);
    if (idx >= 0) {
      bits[idx] = 1;
      usedEffort += actions[idx].effort_minutes;
      cashAfter += actions[idx].cash_buffer_effect;
    }
  }

  // Sort remaining by weight / effort ratio
  const indices = actions
    .map((a, i) => ({ i, ratio: weights[i] / Math.max(a.effort_minutes, 1) }))
    .filter(({ i }) => bits[i] === 0)
    .sort((a, b) => b.ratio - a.ratio);

  for (const { i } of indices) {
    const newEffort = usedEffort + actions[i].effort_minutes;
    const newCash = cashAfter + actions[i].cash_buffer_effect;
    if (newEffort <= input.effort_budget_minutes && newCash >= input.min_cash_buffer) {
      bits[i] = 1;
      usedEffort = newEffort;
      cashAfter = newCash;
    }
  }

  const energy = evaluateEnergy(bits, actions, weights, input);
  return { bits, energy };
}

/** Main QUBO solver — selects best strategy automatically */
export function solveQUBO(
  input: QUBOInput,
  goal: string = "auto"
): QUBOResult {
  const actions = input.actions;
  const n = actions.length;

  if (n === 0) {
    return {
      selected_action_ids: [],
      objective_value: 0,
      solver_used: "greedy_fallback",
    };
  }

  // Compute weights
  const weights = actions.map((a) => computeWeight(a, goal));

  let result: QUBOState & { iterations?: number };
  let solver: QUBOResult["solver_used"];

  if (n <= 20) {
    // Exact enumeration is feasible
    result = solveExact(actions, weights, input);
    solver = "exact_enumeration";
  } else {
    // Simulated annealing
    result = solveSA(actions, weights, input);
    solver = "simulated_annealing";
  }

  // Validate: if SA/exact produced a worse solution than greedy, use greedy
  const greedyResult = solveGreedy(actions, weights, input);
  if (greedyResult.energy < result.energy) {
    result = greedyResult;
    solver = "greedy_fallback";
  }

  const selectedIds = actions
    .filter((_, i) => result.bits[i] === 1)
    .map((a) => a.id);

  return {
    selected_action_ids: selectedIds,
    objective_value: result.energy,
    solver_used: solver,
    iterations: result.iterations,
  };
}
