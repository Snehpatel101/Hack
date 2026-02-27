"use client";

import { useMemo, useState, useEffect } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CategoryPieChartProps {
  categoryTotals: Record<string, number>;
  totalSpend: number;
  title?: string;
}

interface SliceData {
  category: string;
  value: number;
  percentage: number;
  color: string;
  startAngle: number;
  endAngle: number;
}

// ---------------------------------------------------------------------------
// Cold color palette
// ---------------------------------------------------------------------------

const COLD_PALETTE = [
  "#3B82F6", // blue-500
  "#06B6D4", // cyan-500
  "#8B5CF6", // violet-500
  "#0EA5E9", // sky-500
  "#6366F1", // indigo-500
  "#14B8A6", // teal-500
  "#A78BFA", // violet-400
  "#22D3EE", // cyan-400
  "#818CF8", // indigo-400
  "#2DD4BF", // teal-400
  "#60A5FA", // blue-400
  "#7C3AED", // violet-600
];

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

function polarToCartesian(
  cx: number,
  cy: number,
  r: number,
  angleInDegrees: number
): { x: number; y: number } {
  const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180;
  return {
    x: cx + r * Math.cos(angleInRadians),
    y: cy + r * Math.sin(angleInRadians),
  };
}

function describeArc(
  cx: number,
  cy: number,
  r: number,
  startAngle: number,
  endAngle: number
): string {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";

  return [
    "M",
    cx,
    cy,
    "L",
    start.x,
    start.y,
    "A",
    r,
    r,
    0,
    largeArcFlag,
    0,
    end.x,
    end.y,
    "Z",
  ].join(" ");
}

// ---------------------------------------------------------------------------
// Data processing
// ---------------------------------------------------------------------------

function capitalize(str: string): string {
  return str
    .split(/[\s_-]+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function formatDollars(value: number): string {
  return `$${value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatPercentage(value: number): string {
  return `${value.toFixed(1)}%`;
}

function processCategories(
  categoryTotals: Record<string, number>,
  totalSpend: number
): SliceData[] {
  if (totalSpend <= 0) return [];

  // Sort by value descending
  const sorted = Object.entries(categoryTotals)
    .filter(([, value]) => value > 0)
    .sort(([, a], [, b]) => b - a);

  if (sorted.length === 0) return [];

  // Identify tiny slices (< 0.5%) and merge if more than 3
  const tinySlices = sorted.filter(
    ([, value]) => (value / totalSpend) * 100 < 0.5
  );
  const regularSlices = sorted.filter(
    ([, value]) => (value / totalSpend) * 100 >= 0.5
  );

  let finalEntries: [string, number][];

  if (tinySlices.length > 3) {
    const otherTotal = tinySlices.reduce((sum, [, value]) => sum + value, 0);
    finalEntries = [...regularSlices, ["Other", otherTotal]];
  } else {
    finalEntries = sorted;
  }

  // Re-sort after potential merge
  finalEntries.sort(([, a], [, b]) => b - a);

  // Build slice data with angles
  let currentAngle = 0;
  const slices: SliceData[] = finalEntries.map(([category, value], index) => {
    const percentage = (value / totalSpend) * 100;
    const sliceAngle = (percentage / 100) * 360;
    const startAngle = currentAngle;
    const endAngle = currentAngle + sliceAngle;
    currentAngle = endAngle;

    return {
      category,
      value,
      percentage,
      color: COLD_PALETTE[index % COLD_PALETTE.length],
      startAngle,
      endAngle,
    };
  });

  return slices;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function PieSlice({
  slice,
  cx,
  cy,
  radius,
  isHovered,
  onMouseEnter,
  onMouseLeave,
}: {
  slice: SliceData;
  cx: number;
  cy: number;
  radius: number;
  isHovered: boolean;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}) {
  const midAngle = (slice.startAngle + slice.endAngle) / 2;
  const midRad = ((midAngle - 90) * Math.PI) / 180;
  const translateX = isHovered ? Math.cos(midRad) * 8 : 0;
  const translateY = isHovered ? Math.sin(midRad) * 8 : 0;

  const d = describeArc(cx, cy, radius, slice.startAngle, slice.endAngle);

  return (
    <path
      d={d}
      fill={slice.color}
      stroke="#1e293b"
      strokeWidth={2}
      style={{
        transform: `translate(${translateX}px, ${translateY}px)`,
        transition: "transform 0.2s ease-out",
        cursor: "pointer",
      }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    />
  );
}

function FullCircleSlice({
  slice,
  cx,
  cy,
  radius,
  isHovered,
  onMouseEnter,
  onMouseLeave,
}: {
  slice: SliceData;
  cx: number;
  cy: number;
  radius: number;
  isHovered: boolean;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}) {
  const scale = isHovered ? 1.03 : 1;
  return (
    <circle
      cx={cx}
      cy={cy}
      r={radius}
      fill={slice.color}
      stroke="#1e293b"
      strokeWidth={2}
      style={{
        transform: `scale(${scale})`,
        transformOrigin: `${cx}px ${cy}px`,
        transition: "transform 0.2s ease-out",
        cursor: "pointer",
      }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    />
  );
}

function SliceLabel({
  slice,
  cx,
  cy,
  radius,
}: {
  slice: SliceData;
  cx: number;
  cy: number;
  radius: number;
}) {
  if (slice.percentage <= 5) return null;

  const midAngle = (slice.startAngle + slice.endAngle) / 2;
  const labelRadius = radius * 0.7;
  const pos = polarToCartesian(cx, cy, labelRadius, midAngle);

  return (
    <text
      x={pos.x}
      y={pos.y}
      textAnchor="middle"
      dominantBaseline="central"
      fill="white"
      fontSize={12}
      fontWeight={600}
      style={{ pointerEvents: "none" }}
    >
      {formatPercentage(slice.percentage)}
    </text>
  );
}

function LegendItem({
  slice,
  index,
  isMounted,
}: {
  slice: SliceData;
  index: number;
  isMounted: boolean;
}) {
  const delay = index * 50;

  return (
    <li
      className="flex items-center gap-2.5 py-1"
      style={{
        opacity: isMounted ? 1 : 0,
        transform: isMounted ? "translateY(0)" : "translateY(8px)",
        transition: `opacity 0.4s ease ${delay}ms, transform 0.4s ease ${delay}ms`,
      }}
    >
      <span
        className="inline-block h-3 w-3 flex-shrink-0 rounded-full"
        style={{ backgroundColor: slice.color }}
      />
      <span className="text-sm text-slate-300">
        {capitalize(slice.category)}
        <span className="mx-1.5 text-slate-600">&mdash;</span>
        {formatDollars(slice.value)}
      </span>
      <span className="text-sm text-slate-500">
        ({formatPercentage(slice.percentage)})
      </span>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function CategoryPieChart({
  categoryTotals,
  totalSpend,
  title = "Spending by Category",
}: CategoryPieChartProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [isMounted, setIsMounted] = useState(false);
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(
    new Set()
  );
  // Empty set means "show all" (default)

  useEffect(() => {
    // Small delay to trigger the mount animation after the first paint
    const raf = requestAnimationFrame(() => {
      setIsMounted(true);
    });
    return () => cancelAnimationFrame(raf);
  }, []);

  const toggleCategory = (category: string) => {
    setSelectedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  };

  // All categories sorted by value descending (before any filtering)
  const allCategories = useMemo(
    () =>
      Object.entries(categoryTotals)
        .filter(([, v]) => v > 0)
        .sort(([, a], [, b]) => b - a)
        .map(([k]) => k),
    [categoryTotals]
  );

  // Filtered totals based on selected categories
  const filteredTotals = useMemo(() => {
    if (selectedCategories.size === 0) return categoryTotals; // show all
    const filtered: Record<string, number> = {};
    Array.from(selectedCategories).forEach((cat) => {
      if (categoryTotals[cat]) filtered[cat] = categoryTotals[cat];
    });
    return filtered;
  }, [categoryTotals, selectedCategories]);

  const filteredTotal = Object.values(filteredTotals).reduce(
    (s, v) => s + v,
    0
  );

  const slices = useMemo(
    () => processCategories(filteredTotals, filteredTotal),
    [filteredTotals, filteredTotal]
  );

  const isEmpty =
    slices.length === 0 ||
    totalSpend <= 0 ||
    Object.keys(categoryTotals).length === 0;

  const CX = 200;
  const CY = 200;
  const RADIUS = 140;
  const isSingleCategory = slices.length === 1;

  return (
    <div className="bg-[#1e293b] rounded-xl shadow-lg shadow-black/20 border border-slate-600/50 p-6 card-glow">
      {/* Title */}
      <h3 className="text-lg font-semibold text-slate-100 mb-4">{title}</h3>

      {/* Category Filters */}
      {allCategories.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          <button
            onClick={() => setSelectedCategories(new Set())}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
              selectedCategories.size === 0
                ? "bg-teal-500/20 text-teal-300 border border-teal-500/40"
                : "bg-slate-700/50 text-slate-400 border border-slate-600/30 hover:bg-slate-700"
            }`}
          >
            All
          </button>
          {allCategories.map((cat) => (
            <button
              key={cat}
              onClick={() => toggleCategory(cat)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                selectedCategories.has(cat)
                  ? "bg-teal-500/20 text-teal-300 border border-teal-500/40"
                  : "bg-slate-700/50 text-slate-400 border border-slate-600/30 hover:bg-slate-700"
              }`}
            >
              {capitalize(cat)}
            </button>
          ))}
        </div>
      )}

      {isEmpty ? (
        /* Empty state */
        <div className="flex items-center justify-center py-16">
          <p className="text-slate-500 text-sm">No spending data to display</p>
        </div>
      ) : (
        /* Chart + Legend layout */
        <div className="flex flex-col lg:flex-row lg:items-start lg:gap-8 gap-6">
          {/* SVG Pie Chart */}
          <div className="flex-shrink-0 mx-auto lg:mx-0">
            <svg
              viewBox="0 0 400 400"
              className="w-full max-w-[280px] lg:max-w-[320px]"
              role="img"
              aria-label={`Pie chart: ${title}`}
            >
              {/* Clip path for circular reveal animation */}
              <defs>
                <clipPath id="pie-reveal-clip">
                  <circle
                    cx={CX}
                    cy={CY}
                    r={isMounted ? RADIUS + 20 : 0}
                    style={{
                      transition: "r 0.8s cubic-bezier(0.22, 1, 0.36, 1)",
                    }}
                  />
                </clipPath>
              </defs>

              <g clipPath="url(#pie-reveal-clip)">
                {/* Slices */}
                {isSingleCategory ? (
                  <FullCircleSlice
                    slice={slices[0]}
                    cx={CX}
                    cy={CY}
                    radius={RADIUS}
                    isHovered={hoveredIndex === 0}
                    onMouseEnter={() => setHoveredIndex(0)}
                    onMouseLeave={() => setHoveredIndex(null)}
                  />
                ) : (
                  slices.map((slice, i) => (
                    <PieSlice
                      key={slice.category}
                      slice={slice}
                      cx={CX}
                      cy={CY}
                      radius={RADIUS}
                      isHovered={hoveredIndex === i}
                      onMouseEnter={() => setHoveredIndex(i)}
                      onMouseLeave={() => setHoveredIndex(null)}
                    />
                  ))
                )}

                {/* Percentage labels inside slices */}
                {isSingleCategory ? (
                  <text
                    x={CX}
                    y={CY}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fill="white"
                    fontSize={12}
                    fontWeight={600}
                    style={{ pointerEvents: "none" }}
                  >
                    100.0%
                  </text>
                ) : (
                  slices.map((slice) => (
                    <SliceLabel
                      key={`label-${slice.category}`}
                      slice={slice}
                      cx={CX}
                      cy={CY}
                      radius={RADIUS}
                    />
                  ))
                )}
              </g>
            </svg>
          </div>

          {/* Legend */}
          <div className="flex-1 min-w-0">
            <ul className="space-y-0.5">
              {slices.map((slice, i) => (
                <LegendItem
                  key={slice.category}
                  slice={slice}
                  index={i}
                  isMounted={isMounted}
                />
              ))}
            </ul>

            {/* Total */}
            <div
              className="mt-4 pt-3 border-t border-slate-600/50"
              style={{
                opacity: isMounted ? 1 : 0,
                transition: `opacity 0.4s ease ${slices.length * 50 + 100}ms`,
              }}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-400">
                  Total
                </span>
                <span className="text-sm font-semibold text-slate-100">
                  {formatDollars(
                    selectedCategories.size > 0 ? filteredTotal : totalSpend
                  )}
                </span>
              </div>
              {selectedCategories.size > 0 && (
                <div className="text-xs text-slate-500 mt-1">
                  Showing {selectedCategories.size} of {allCategories.length}{" "}
                  categories ({formatDollars(filteredTotal)} of{" "}
                  {formatDollars(totalSpend)})
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
