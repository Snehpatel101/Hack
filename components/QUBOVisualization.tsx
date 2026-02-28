"use client";

import { useState } from "react";
import type { QUBOResult, SelectedAction } from "../lib/types";
import { t } from "../lib/translations";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
interface QUBOVisualizationProps {
  quboResult: QUBOResult;
  allActions: SelectedAction[];
  lang?: string;
}

// ---------------------------------------------------------------------------
// Solver display names
// ---------------------------------------------------------------------------
const SOLVER_LABELS: Record<QUBOResult["solver"]["solver_type"], string> = {
  qubo_sim: "QUBO Exact (2\u207F)",
  greedy_fallback: "Greedy Fallback",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function formatCash(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1000) return `$${(abs / 1000).toFixed(1)}k`;
  return `$${abs.toFixed(0)}`;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** A single metric card in the top row. */
function MetricCard({
  label,
  children,
  sublabel,
}: {
  label: string;
  children: React.ReactNode;
  sublabel?: string;
}) {
  return (
    <div className="bg-white/[0.03] backdrop-blur-sm border border-white/[0.06] rounded-lg px-4 py-3 text-center flex flex-col items-center justify-center">
      <p className="text-xs text-slate-500 font-medium">{label}</p>
      <div className="mt-1 text-lg font-semibold">{children}</div>
      {sublabel && (
        <p className="mt-0.5 text-[11px] text-slate-500">{sublabel}</p>
      )}
    </div>
  );
}

/** A single selected-action chip. */
function ActionChip({ action }: { action: SelectedAction }) {
  const [low, high] = action.estimated_monthly_impact;

  return (
    <div className="group relative inline-flex items-center gap-1.5 rounded-full bg-cyan-500/15 border border-cyan-500/30 px-3 py-1.5 text-xs font-medium text-cyan-300 transition-all duration-200">
      <span
        className="h-1.5 w-1.5 rounded-full bg-cyan-400"
        aria-hidden="true"
      />
      <span>{action.name}</span>

      {/* Hover tooltip */}
      <div
        role="tooltip"
        className="pointer-events-none absolute -top-10 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-900 border border-slate-700 px-2.5 py-1 text-xs text-slate-200 opacity-0 shadow-lg transition-opacity group-hover:opacity-100"
      >
        ${low}&ndash;${high}/mo &middot; Risk: &minus;{action.risk_reduction}
      </div>
    </div>
  );
}

/** Expandable "Why These Actions?" section. */
function WhyTheseActions({
  explain,
  allActions,
  lang = "en",
}: {
  explain: QUBOResult["explain"];
  allActions: SelectedAction[];
  lang?: string;
}) {
  const [open, setOpen] = useState(false);

  const actionNameMap = new Map(allActions.map((a) => [a.id, a.name]));

  return (
    <div className="mt-5 rounded-lg border border-white/[0.06] bg-white/[0.03] backdrop-blur-sm">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center justify-between px-4 py-2.5 text-left text-xs font-medium text-slate-400 hover:text-slate-300 transition-colors"
        aria-expanded={open}
      >
        <span className="flex items-center gap-1.5">
          <InfoIcon />
          {t(lang, "whyTheseActions")}
        </span>
        <ChevronIcon open={open} />
      </button>

      {open && (
        <div className="px-4 pb-4 text-xs leading-relaxed text-slate-400 space-y-4 animate-fade-in">
          {/* Top reasons */}
          {explain.top_reasons.length > 0 && (
            <ul className="list-disc list-inside space-y-1">
              {explain.top_reasons.map((reason, i) => (
                <li key={i}>{reason}</li>
              ))}
            </ul>
          )}

          {/* Action contributions */}
          {explain.action_contributions.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-2">
                {t(lang, "valueBreakdown")}
              </p>
              <div className="space-y-1.5">
                {explain.action_contributions.map((ac) => (
                  <div
                    key={ac.id}
                    className="flex items-center justify-between gap-2 rounded-md bg-white/[0.03] border border-white/[0.04] px-3 py-1.5"
                  >
                    <span className="text-slate-300 truncate">
                      {actionNameMap.get(ac.id) ?? ac.id}
                    </span>
                    <div className="flex items-center gap-3 text-[11px] text-slate-500 shrink-0">
                      <span>
                        {t(lang, "cashComponent")}:{" "}
                        <span className="text-cyan-400">
                          {ac.cash_component > 0 ? "+" : ""}
                          {ac.cash_component.toFixed(1)}
                        </span>
                      </span>
                      <span>
                        {t(lang, "riskComponent")}:{" "}
                        <span className="text-cyan-400">
                          {ac.risk_component > 0 ? "+" : ""}
                          {ac.risk_component.toFixed(1)}
                        </span>
                      </span>
                      {ac.penalties !== 0 && (
                        <span>
                          {t(lang, "penalties")}:{" "}
                          <span className="text-amber-400">
                            {ac.penalties.toFixed(1)}
                          </span>
                        </span>
                      )}
                      <span className="text-slate-300 font-medium">
                        = {ac.value.toFixed(1)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Constraint notes */}
          {explain.constraint_notes.length > 0 && (
            <div className="border-t border-white/[0.06] pt-3 text-[11px] text-slate-500 space-y-1">
              {explain.constraint_notes.map((note, i) => (
                <p key={i}>{note}</p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Expandable "How does this work?" section. */
function HowItWorks({ lang = "en" }: { lang?: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-3 rounded-lg border border-white/[0.06] bg-white/[0.03] backdrop-blur-sm">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center justify-between px-4 py-2.5 text-left text-xs font-medium text-slate-400 hover:text-slate-300 transition-colors"
        aria-expanded={open}
      >
        <span className="flex items-center gap-1.5">
          <InfoIcon />
          {t(lang, "howDoesThisWork")}
        </span>
        <ChevronIcon open={open} />
      </button>

      {open && (
        <div className="px-4 pb-4 text-xs leading-relaxed text-slate-400 space-y-3 animate-fade-in">
          <p>
            The optimization is <strong className="text-slate-300">Backed by Math</strong>.
            A QUBO (Quadratic Unconstrained Binary Optimization) formulation
            treats each financial action as a binary variable (do it or skip it).
            The optimizer finds the combination that maximizes impact while
            respecting your time budget, cash constraints, and minimum balance buffer.
          </p>
          <ul className="list-disc list-inside space-y-1 text-slate-500">
            <li>
              QUBO formulation encodes goals, penalties, and synergies into a
              single objective function
            </li>
            <li>
              Exact solver evaluates all 2&#x207F; combinations for small action
              sets; greedy fallback handles larger sets
            </li>
            <li>Conflict and synergy relationships between actions are respected</li>
          </ul>
        </div>
      )}
    </div>
  );
}

/** Small info circle icon (inline SVG to avoid extra deps). */
function InfoIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      className="h-3.5 w-3.5"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z"
        clipRule="evenodd"
      />
    </svg>
  );
}

/** Chevron that rotates when the section is open. */
function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      className={`h-4 w-4 transition-transform duration-200 ${
        open ? "rotate-180" : ""
      }`}
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M5.22 8.22a.75.75 0 011.06 0L10 11.94l3.72-3.72a.75.75 0 111.06 1.06l-4.25 4.25a.75.75 0 01-1.06 0L5.22 9.28a.75.75 0 010-1.06z"
        clipRule="evenodd"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export default function QUBOVisualization({
  quboResult,
  allActions,
  lang = "en",
}: QUBOVisualizationProps) {
  const selectedIds = new Set(quboResult.selected_action_ids);
  const selectedActions = allActions.filter((a) => selectedIds.has(a.id));
  const totalActions = allActions.length;
  const selectedCount = quboResult.selected_action_ids.length;
  const hasSelections = selectedCount > 0;

  const solverType = quboResult.solver.solver_type;
  const solverName = SOLVER_LABELS[solverType];
  const timeLabel = `${quboResult.solver.time_ms}ms`;

  const cashImpact = quboResult.metrics.estimated_monthly_cash_impact;
  const bufferOk = quboResult.metrics.buffer_respected;

  return (
    <div className="glass-card p-6 card-glow animate-fade-in">
      {/* ---- Header ---- */}
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-100">
            {t(lang, "optimizationEngine")}
          </h3>
          <p className="mt-1 text-xs text-slate-500 max-w-md">
            {t(lang, "quboDesc")}
          </p>
        </div>
        <span className="bg-gradient-to-r from-violet-500/20 to-purple-500/20 text-violet-300 text-xs px-2.5 py-0.5 rounded-full font-medium whitespace-nowrap border border-violet-500/30">
          {t(lang, "backedByMath")}
        </span>
      </div>

      {/* ---- Key Metrics Row ---- */}
      <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* Actions Selected */}
        <MetricCard label={t(lang, "actionsSelected")}>
          <span className={hasSelections ? "text-cyan-400" : "text-red-400"}>
            {selectedCount}
          </span>
          <span className="text-slate-500 text-sm font-normal">
            {" "}
            {t(lang, "of")} {totalActions}
          </span>
        </MetricCard>

        {/* Solver */}
        <MetricCard label={t(lang, "solver")} sublabel={timeLabel}>
          <span className="text-slate-200 text-sm">{solverName}</span>
        </MetricCard>

        {/* Optimization Score */}
        <MetricCard
          label={t(lang, "optimizationScore")}
          sublabel={t(lang, "lowerBetter")}
        >
          <span className="text-cyan-400">
            {Math.abs(quboResult.score.optimization_score).toFixed(1)}
          </span>
        </MetricCard>

        {/* Monthly Impact */}
        <MetricCard label={t(lang, "monthlyImpact")}>
          <span className={cashImpact >= 0 ? "text-cyan-400" : "text-red-400"}>
            {cashImpact >= 0 ? "+" : "-"}
            {formatCash(cashImpact)}/mo
          </span>
        </MetricCard>
      </div>

      {/* ---- Constraint Status ---- */}
      <div className="mt-5">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-2">
          {t(lang, "constraintStatus")}
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {/* Effort */}
          <div className="flex items-center gap-2 rounded-lg bg-white/[0.03] border border-white/[0.06] px-3 py-2">
            <span className="text-xs text-slate-500">{t(lang, "effortBudget")}</span>
            <span className="ml-auto text-xs font-medium text-slate-300">
              {quboResult.metrics.effort_minutes_used} {t(lang, "minUsed")}
            </span>
          </div>

          {/* Upfront Cash */}
          <div className="flex items-center gap-2 rounded-lg bg-white/[0.03] border border-white/[0.06] px-3 py-2">
            <span className="text-xs text-slate-500">{t(lang, "upfrontCash")}</span>
            <span className="ml-auto text-xs font-medium text-slate-300">
              ${quboResult.metrics.upfront_cash_used.toLocaleString()} used
            </span>
          </div>

          {/* Buffer */}
          <div className="flex items-center gap-2 rounded-lg bg-white/[0.03] border border-white/[0.06] px-3 py-2">
            <span className="text-xs text-slate-500">{t(lang, "cashBuffer")}</span>
            <span
              className={`ml-auto text-xs font-medium ${
                bufferOk ? "text-emerald-400" : "text-red-400"
              }`}
            >
              {bufferOk ? `${t(lang, "respected")} \u2713` : `${t(lang, "violated")} \u2717`}
            </span>
          </div>
        </div>
      </div>

      {/* ---- Selected Actions ---- */}
      <div className="mt-5">
        {hasSelections ? (
          <>
            <p className="text-xs font-medium uppercase tracking-wide text-cyan-400 mb-2">
              {t(lang, "selectedActions")}
            </p>
            <div className="flex flex-wrap gap-2">
              {selectedActions.length > 0
                ? selectedActions.map((action) => (
                    <ActionChip key={action.id} action={action} />
                  ))
                : quboResult.selected_action_ids.map((id) => (
                    <span
                      key={id}
                      className="inline-flex items-center rounded-full bg-cyan-500/15 border border-cyan-500/30 px-3 py-1.5 text-xs font-medium text-cyan-300"
                    >
                      {id}
                    </span>
                  ))}
            </div>
          </>
        ) : (
          <div className="flex items-start gap-2.5 rounded-lg border border-white/[0.06] bg-white/[0.03] backdrop-blur-sm px-4 py-3">
            <InfoIcon />
            <p className="text-xs leading-relaxed text-slate-400">
              {t(lang, "noActionsOptimized")}
            </p>
          </div>
        )}
      </div>

      {/* ---- Why These Actions? (expandable, collapsed by default) ---- */}
      {hasSelections && (
        <WhyTheseActions
          explain={quboResult.explain}
          allActions={allActions}
          lang={lang}
        />
      )}

      {/* ---- How It Works (expandable) ---- */}
      <HowItWorks lang={lang} />
    </div>
  );
}
