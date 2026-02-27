"use client";

import { useState } from "react";
import type { WorkflowTrace as WorkflowTraceType, TraceStep } from "../lib/types";

interface WorkflowTraceProps {
  trace: WorkflowTraceType;
}

export default function WorkflowTrace({ trace }: WorkflowTraceProps) {
  const [isOpen, setIsOpen] = useState(false);

  const totalDuration = trace.steps.reduce((sum, s) => sum + s.duration_ms, 0);

  return (
    <div className="rounded-xl bg-[#1e293b] border border-slate-600/50 shadow-lg shadow-black/20 card-glow transition-all duration-300">
      {/* Collapsible Header */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        className="flex w-full items-center justify-between rounded-xl px-6 py-4 text-left transition-all duration-300 hover:bg-[#334155]"
      >
        <div className="flex items-center gap-3">
          <svg
            className="h-5 w-5 text-teal-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
            />
          </svg>
          <div>
            <h3 className="text-sm font-semibold text-slate-100">
              Agentic Pipeline Trace
            </h3>
            <p className="text-xs text-slate-500">
              {trace.steps.length} steps &middot;{" "}
              {totalDuration >= 1000
                ? `${(totalDuration / 1000).toFixed(1)}s`
                : `${totalDuration}ms`}{" "}
              total
            </p>
          </div>
        </div>

        <svg
          className={`h-5 w-5 text-slate-500 transition-transform duration-300 ${
            isOpen ? "rotate-180" : ""
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {/* Timeline Content */}
      {isOpen && (
        <div className="border-t border-slate-600/50 px-6 pb-6 pt-4 animate-fade-in">
          <div className="relative">
            {/* Vertical line */}
            <div
              className="absolute left-3 top-0 h-full w-px bg-gradient-to-b from-teal-500/50 to-slate-700/30"
              aria-hidden="true"
            />

            <ol className="space-y-4">
              {trace.steps.map((step, index) => (
                <TraceStepItem
                  key={index}
                  step={step}
                  index={index}
                  isLast={index === trace.steps.length - 1}
                />
              ))}
            </ol>
          </div>

          {/* Footer */}
          <div className="mt-4 flex items-center justify-between border-t border-slate-600/50 pt-3 text-xs text-slate-500">
            <span>Trace ID: {trace.id}</span>
            {trace.completed_at && (
              <span>Completed: {formatTimestamp(trace.completed_at)}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function TraceStepItem({
  step,
}: {
  step: TraceStep;
  index?: number;
  isLast?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <li className="relative pl-8 animate-slide-in-right">
      {/* Checkmark node */}
      <div
        className="absolute left-0 flex h-6 w-6 items-center justify-center rounded-full bg-teal-500/20"
        aria-hidden="true"
      >
        <svg
          className="h-3.5 w-3.5 text-teal-400"
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path
            fillRule="evenodd"
            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
            clipRule="evenodd"
          />
        </svg>
      </div>

      {/* Step content */}
      <div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-slate-200">
            {step.tool}
          </span>
          <span className="rounded-full bg-slate-700 border border-slate-600/50 px-2 py-0.5 text-xs text-slate-400">
            {step.duration_ms >= 1000
              ? `${(step.duration_ms / 1000).toFixed(1)}s`
              : `${step.duration_ms}ms`}
          </span>
        </div>

        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="mt-1 text-xs text-teal-400 hover:text-teal-300 transition-colors duration-200"
          aria-expanded={expanded}
        >
          {expanded ? "Hide details" : "Show details"}
        </button>

        {expanded && (
          <div className="mt-2 space-y-2 rounded-lg bg-[#1e293b] border border-slate-600/50 p-3 text-xs animate-fade-in">
            <div>
              <span className="font-medium text-slate-500">Input: </span>
              <span className="text-slate-300">{step.input_summary}</span>
            </div>
            <div>
              <span className="font-medium text-slate-500">Output: </span>
              <span className="text-slate-300">{step.output_summary}</span>
            </div>
            <div>
              <span className="font-medium text-slate-500">Timestamp: </span>
              <span className="text-slate-300">
                {formatTimestamp(step.timestamp)}
              </span>
            </div>
          </div>
        )}
      </div>
    </li>
  );
}

function formatTimestamp(ts: string): string {
  try {
    return new Date(ts).toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return ts;
  }
}
