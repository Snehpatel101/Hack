"use client";

import { useState } from "react";

interface SchemaMapping {
  sourceColumn: string;
  internalField: string;
  confidence: number;
  method: string;
}

interface SchemaInferencePanelProps {
  schemaMap: SchemaMapping[];
  warnings: string[];
  transactionCount: number;
  isCollapsible?: boolean;
  defaultOpen?: boolean;
}

function confidenceTier(confidence: number) {
  if (confidence >= 0.8)
    return { label: "High", bg: "bg-teal-500/15", text: "text-teal-400", bar: "bg-teal-500" } as const;
  if (confidence >= 0.5)
    return { label: "Medium", bg: "bg-amber-400/15", text: "text-amber-400", bar: "bg-amber-400" } as const;
  return { label: "Low", bg: "bg-red-400/15", text: "text-red-400", bar: "bg-red-400" } as const;
}

/* ---------- Inline SVG icons ---------- */

function SparkleIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {/* four-point sparkle */}
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
    </svg>
  );
}

function WarningTriangleIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.168 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 6a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 6zm0 9a1 1 0 100-2 1 1 0 000 2z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
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
  );
}

/* ---------- Sub-components ---------- */

function ConfidenceBadge({ confidence }: { confidence: number }) {
  const tier = confidenceTier(confidence);
  const pct = Math.round(confidence * 100);

  return (
    <div className="flex flex-col items-start gap-1.5 min-w-[90px]">
      <span
        className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full ${tier.bg} ${tier.text}`}
      >
        {tier.label}
        <span className="opacity-70">{pct}%</span>
      </span>
      {/* thin progress bar */}
      <div className="w-full h-1 rounded-full bg-slate-700/60 overflow-hidden">
        <div
          className={`h-full rounded-full ${tier.bar} transition-all duration-500 ease-out`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function MappingRow({ mapping }: { mapping: SchemaMapping }) {
  return (
    <tr className="group border-b border-slate-600/30 last:border-b-0 hover:bg-slate-700/30 transition-colors">
      <td className="py-3 px-4">
        <code className="text-sm font-mono text-teal-300 bg-slate-800/80 px-2 py-0.5 rounded">
          {mapping.sourceColumn}
        </code>
      </td>
      <td className="py-3 px-4 text-sm text-slate-200">
        {mapping.internalField}
      </td>
      <td className="py-3 px-4">
        <ConfidenceBadge confidence={mapping.confidence} />
      </td>
      <td className="py-3 px-4">
        <span className="text-xs text-slate-500 font-mono">
          {mapping.method}
        </span>
      </td>
    </tr>
  );
}

function WarningsBlock({ warnings }: { warnings: string[] }) {
  if (warnings.length === 0) return null;

  return (
    <div className="mt-4 rounded-lg border border-amber-400/30 bg-amber-400/5 p-4">
      <div className="flex items-start gap-3">
        <WarningTriangleIcon className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-400" />
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-semibold text-amber-300">
            {warnings.length === 1
              ? "1 Inference Warning"
              : `${warnings.length} Inference Warnings`}
          </h4>
          <ul className="mt-2 space-y-1.5">
            {warnings.map((warning, i) => (
              <li
                key={i}
                className="flex items-start gap-2 text-sm text-amber-400/90"
              >
                <span
                  className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-amber-400"
                  aria-hidden="true"
                />
                {warning}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-slate-500">
            These warnings are non-critical. Mappings may still be correct but
            should be reviewed for accuracy.
          </p>
        </div>
      </div>
    </div>
  );
}

/* ---------- Panel body ---------- */

function PanelBody({
  schemaMap,
  warnings,
}: {
  schemaMap: SchemaMapping[];
  warnings: string[];
}) {
  if (schemaMap.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-slate-500 text-sm">
        No schema inference data available.
      </div>
    );
  }

  return (
    <>
      {/* Schema Mapping Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-slate-600/50">
              <th className="py-2.5 px-4 text-xs font-semibold uppercase tracking-wider text-slate-400">
                Source Column
              </th>
              <th className="py-2.5 px-4 text-xs font-semibold uppercase tracking-wider text-slate-400">
                Mapped To
              </th>
              <th className="py-2.5 px-4 text-xs font-semibold uppercase tracking-wider text-slate-400">
                Confidence
              </th>
              <th className="py-2.5 px-4 text-xs font-semibold uppercase tracking-wider text-slate-400">
                Method
              </th>
            </tr>
          </thead>
          <tbody className="bg-slate-800/40">
            {schemaMap.map((mapping, i) => (
              <MappingRow key={`${mapping.sourceColumn}-${i}`} mapping={mapping} />
            ))}
          </tbody>
        </table>
      </div>

      {/* Warnings */}
      <WarningsBlock warnings={warnings} />
    </>
  );
}

/* ---------- Main component ---------- */

export default function SchemaInferencePanel({
  schemaMap,
  warnings,
  transactionCount,
  isCollapsible = false,
  defaultOpen = true,
}: SchemaInferencePanelProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  const header = (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2.5">
        <SparkleIcon className="h-5 w-5 text-teal-400" />
        <h3 className="text-lg font-semibold text-slate-100">
          Data Intelligence
        </h3>
        <span className="ml-1 inline-flex items-center text-xs font-medium px-2.5 py-0.5 rounded-full bg-teal-500/15 text-teal-400">
          {transactionCount.toLocaleString()}{" "}
          {transactionCount === 1 ? "transaction" : "transactions"} parsed
        </span>
      </div>

      {isCollapsible && (
        <ChevronIcon
          className={`
            w-5 h-5 text-slate-400 flex-shrink-0
            transition-transform duration-300 ease-in-out
            ${isOpen ? "rotate-0" : "-rotate-90"}
          `}
        />
      )}
    </div>
  );

  const body = <PanelBody schemaMap={schemaMap} warnings={warnings} />;

  /* --- Non-collapsible variant --- */
  if (!isCollapsible) {
    return (
      <div className="rounded-xl border border-slate-600/50 bg-[#1e293b] shadow-lg">
        <div className="px-6 py-4 border-b border-slate-600/50">
          {header}
        </div>
        <div className="px-6 py-4">{body}</div>
      </div>
    );
  }

  /* --- Collapsible variant --- */
  return (
    <div className="rounded-xl border border-slate-600/50 bg-[#1e293b] shadow-lg">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className={`
          w-full text-left px-6 py-4 cursor-pointer
          hover:bg-[#263548] transition-colors
          ${isOpen ? "border-b border-slate-600/50" : ""}
        `}
        aria-expanded={isOpen}
      >
        {header}
      </button>

      <div
        className={`
          overflow-hidden transition-all duration-500 ease-in-out
          ${isOpen ? "max-h-[5000px] opacity-100" : "max-h-0 opacity-0"}
        `}
      >
        <div className="px-6 py-4">{body}</div>
      </div>
    </div>
  );
}
