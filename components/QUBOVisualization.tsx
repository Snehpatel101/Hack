"use client";

import type { QUBOResult, SelectedAction } from "../lib/types";

interface QUBOVisualizationProps {
  quboResult: QUBOResult;
  allActions: SelectedAction[];
}

const SOLVER_LABELS: Record<QUBOResult["solver_used"], string> = {
  exact_enumeration: "Exact Enumeration",
  simulated_annealing: "Simulated Annealing",
  greedy_fallback: "Greedy Fallback",
};

export default function QUBOVisualization({
  quboResult,
  allActions,
}: QUBOVisualizationProps) {
  const selectedIds = new Set(quboResult.selected_action_ids);

  const selectedActions = allActions.filter((a) => selectedIds.has(a.id));
  const rejectedActions = allActions.filter((a) => !selectedIds.has(a.id));

  return (
    <div className="rounded-xl bg-[#1e293b] border border-slate-600/50 p-6 shadow-lg shadow-black/20 card-glow transition-all duration-300 animate-fade-in">
      <h3 className="text-sm font-semibold text-slate-100">
        QUBO Optimization Results
      </h3>
      <p className="mt-1 text-xs text-slate-500">
        Actions selected by the quantum-inspired optimizer to maximize impact
        within your constraints.
      </p>

      {/* Solver Stats */}
      <div className="mt-4 grid grid-cols-3 gap-3">
        <div className="rounded-lg bg-[#1e293b] border border-slate-600/50 px-3 py-2 text-center">
          <p className="text-xs text-slate-500">Solver</p>
          <p className="mt-0.5 text-sm font-medium text-slate-200">
            {SOLVER_LABELS[quboResult.solver_used]}
          </p>
        </div>
        <div className="rounded-lg bg-[#1e293b] border border-slate-600/50 px-3 py-2 text-center">
          <p className="text-xs text-slate-500">Objective Value</p>
          <p className="mt-0.5 text-sm font-medium text-teal-400">
            {quboResult.objective_value.toFixed(2)}
          </p>
        </div>
        <div className="rounded-lg bg-[#1e293b] border border-slate-600/50 px-3 py-2 text-center">
          <p className="text-xs text-slate-500">Iterations</p>
          <p className="mt-0.5 text-sm font-medium text-slate-200">
            {quboResult.iterations !== undefined
              ? quboResult.iterations.toLocaleString()
              : "N/A"}
          </p>
        </div>
      </div>

      {/* Selected Actions */}
      <div className="mt-5">
        <p className="text-xs font-medium uppercase tracking-wide text-teal-400">
          Selected ({selectedActions.length})
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {selectedActions.length > 0 ? (
            selectedActions.map((action) => (
              <ActionChip key={action.id} action={action} selected />
            ))
          ) : (
            <p className="text-xs text-slate-600">No actions selected</p>
          )}
        </div>
      </div>

      {/* Rejected Actions */}
      {rejectedActions.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Not Selected ({rejectedActions.length})
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {rejectedActions.map((action) => (
              <ActionChip key={action.id} action={action} selected={false} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ActionChip({
  action,
  selected,
}: {
  action: SelectedAction;
  selected: boolean;
}) {
  const [low, high] = action.estimated_monthly_impact;

  return (
    <div
      className={`
        group relative inline-flex items-center gap-1.5 rounded-full px-3 py-1.5
        text-xs font-medium transition-all duration-300
        ${
          selected
            ? "bg-teal-500/15 text-teal-300 border border-teal-500/30"
            : "bg-slate-700 text-slate-500 border border-slate-600/50"
        }
      `}
    >
      {/* Status indicator */}
      <span
        className={`h-2 w-2 rounded-full ${
          selected ? "bg-teal-500" : "bg-slate-600"
        }`}
        aria-hidden="true"
      />

      <span>{action.name}</span>

      {/* Tooltip-style detail on hover */}
      <div
        className="pointer-events-none absolute -top-10 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-900 border border-slate-700 px-2.5 py-1 text-xs text-slate-200 opacity-0 shadow-lg transition-opacity group-hover:opacity-100"
        role="tooltip"
      >
        ${low}&ndash;${high}/mo | Risk: -{action.risk_reduction}
      </div>
    </div>
  );
}
