"use client";

import React, { useState, useMemo, useEffect, useRef } from "react";
import type { FinancialSnapshot, RawIncome, RiskWindow } from "@/lib/types";

// ---- Data Types ----

interface DataPoint {
  day: number;
  date: string;
  balance: number;
  event?: string;
}

interface EquityCurveProps {
  snapshot: FinancialSnapshot;
}

// ---- Helpers ----

function formatCurrency(value: number, decimals: number = 0): string {
  const abs = Math.abs(value);
  const formatted =
    decimals > 0
      ? abs.toLocaleString("en-US", {
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals,
        })
      : abs.toLocaleString("en-US", {
          minimumFractionDigits: 0,
          maximumFractionDigits: 0,
        });
  return value < 0 ? `-$${formatted}` : `$${formatted}`;
}

function formatShortDate(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function addDays(base: Date, days: number): Date {
  const result = new Date(base);
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * Check if income hits on a specific date based on its frequency and next_date.
 */
function incomeHitsOnDate(income: RawIncome, targetDate: Date): boolean {
  const nextDate = new Date(income.next_date + "T00:00:00");
  if (isNaN(nextDate.getTime())) return false;

  if (income.frequency === "monthly") {
    return targetDate.getDate() === nextDate.getDate();
  }

  if (income.frequency === "biweekly") {
    const diffMs = targetDate.getTime() - nextDate.getTime();
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
    return diffDays >= 0 && diffDays % 14 === 0;
  }

  if (income.frequency === "weekly") {
    const diffMs = targetDate.getTime() - nextDate.getTime();
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
    return diffDays >= 0 && diffDays % 7 === 0;
  }

  return false;
}

/**
 * Project the checking account balance forward 90 days.
 */
function projectBalance(snapshot: FinancialSnapshot): DataPoint[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const points: DataPoint[] = [];
  let runningBalance = snapshot.checking_balance;

  for (let day = 0; day <= 90; day++) {
    const currentDate = addDays(today, day);
    const dayOfMonth = currentDate.getDate();
    const events: string[] = [];

    // Check for bills due on this day of the month
    for (const bill of snapshot.recurring_bills) {
      if (bill.due_day === dayOfMonth && day > 0) {
        runningBalance -= bill.amount;
        events.push(`${bill.name} -${formatCurrency(bill.amount)}`);
      }
    }

    // Check for income hitting on this date
    for (const income of snapshot.income_schedule) {
      if (day > 0 && incomeHitsOnDate(income, currentDate)) {
        runningBalance += income.amount;
        events.push(`${income.source} +${formatCurrency(income.amount)}`);
      }
    }

    points.push({
      day,
      date: day === 0 ? "Today" : formatShortDate(currentDate),
      balance: runningBalance,
      event: events.length > 0 ? events.join(", ") : undefined,
    });
  }

  return points;
}

// ---- Chart Layout Constants ----

const SVG_WIDTH = 700;
const SVG_HEIGHT = 300;
const PADDING = { top: 20, right: 20, bottom: 40, left: 65 };
const CHART_WIDTH = SVG_WIDTH - PADDING.left - PADDING.right;
const CHART_HEIGHT = SVG_HEIGHT - PADDING.top - PADDING.bottom;

// ---- Coordinate Mapping ----

function dataX(day: number): number {
  return PADDING.left + (day / 90) * CHART_WIDTH;
}

function dataY(balance: number, minY: number, maxY: number): number {
  const range = maxY - minY;
  if (range === 0) return PADDING.top + CHART_HEIGHT / 2;
  return PADDING.top + CHART_HEIGHT - ((balance - minY) / range) * CHART_HEIGHT;
}

/**
 * Build a smooth SVG path through data points using monotone cubic interpolation
 * for a natural curve that passes through every point.
 */
function buildSmoothPath(
  points: DataPoint[],
  minY: number,
  maxY: number
): string {
  if (points.length === 0) return "";
  if (points.length === 1) {
    const x = dataX(points[0].day);
    const y = dataY(points[0].balance, minY, maxY);
    return `M${x},${y}`;
  }

  const coords = points.map((p) => ({
    x: dataX(p.day),
    y: dataY(p.balance, minY, maxY),
  }));

  if (coords.length === 2) {
    return `M${coords[0].x},${coords[0].y}L${coords[1].x},${coords[1].y}`;
  }

  // Monotone cubic spline (Fritsch-Carlson)
  const n = coords.length;
  const dx: number[] = [];
  const dy: number[] = [];
  const slopes: number[] = [];

  for (let i = 0; i < n - 1; i++) {
    dx.push(coords[i + 1].x - coords[i].x);
    dy.push(coords[i + 1].y - coords[i].y);
    slopes.push(dx[i] === 0 ? 0 : dy[i] / dx[i]);
  }

  const tangents: number[] = [slopes[0]];
  for (let i = 1; i < n - 1; i++) {
    if (slopes[i - 1] * slopes[i] <= 0) {
      tangents.push(0);
    } else {
      tangents.push((slopes[i - 1] + slopes[i]) / 2);
    }
  }
  tangents.push(slopes[n - 2]);

  // Fritsch-Carlson monotonicity correction
  for (let i = 0; i < n - 1; i++) {
    if (Math.abs(slopes[i]) < 1e-10) {
      tangents[i] = 0;
      tangents[i + 1] = 0;
    } else {
      const alpha = tangents[i] / slopes[i];
      const beta = tangents[i + 1] / slopes[i];
      const s = alpha * alpha + beta * beta;
      if (s > 9) {
        const tau = 3 / Math.sqrt(s);
        tangents[i] = tau * alpha * slopes[i];
        tangents[i + 1] = tau * beta * slopes[i];
      }
    }
  }

  let path = `M${coords[0].x},${coords[0].y}`;
  for (let i = 0; i < n - 1; i++) {
    const segLen = dx[i] / 3;
    const cp1x = coords[i].x + segLen;
    const cp1y = coords[i].y + tangents[i] * segLen;
    const cp2x = coords[i + 1].x - segLen;
    const cp2y = coords[i + 1].y - tangents[i + 1] * segLen;
    path += `C${cp1x},${cp1y},${cp2x},${cp2y},${coords[i + 1].x},${coords[i + 1].y}`;
  }

  return path;
}

/**
 * Build a closed area path for the gradient fill under the line.
 */
function buildAreaPath(
  points: DataPoint[],
  minY: number,
  maxY: number
): string {
  const linePath = buildSmoothPath(points, minY, maxY);
  if (!linePath || points.length === 0) return "";

  const lastX = dataX(points[points.length - 1].day);
  const firstX = dataX(points[0].day);
  const bottomY = PADDING.top + CHART_HEIGHT;

  return `${linePath}L${lastX},${bottomY}L${firstX},${bottomY}Z`;
}

/**
 * Compute Y axis ticks: 4-5 evenly spaced values.
 */
function computeYTicks(minY: number, maxY: number): number[] {
  const range = maxY - minY;
  if (range === 0) return [minY];

  const tickCount = 5;
  const rawStep = range / (tickCount - 1);

  // Round step to a nice number
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const residual = rawStep / magnitude;
  let niceStep: number;
  if (residual <= 1.5) niceStep = magnitude;
  else if (residual <= 3.5) niceStep = 2 * magnitude;
  else if (residual <= 7.5) niceStep = 5 * magnitude;
  else niceStep = 10 * magnitude;

  const niceMin = Math.floor(minY / niceStep) * niceStep;
  const niceMax = Math.ceil(maxY / niceStep) * niceStep;

  const ticks: number[] = [];
  for (let v = niceMin; v <= niceMax + niceStep * 0.01; v += niceStep) {
    ticks.push(Math.round(v));
  }

  // Limit to max 7 ticks
  if (ticks.length > 7) {
    const filtered: number[] = [];
    const skip = Math.ceil(ticks.length / 5);
    for (let i = 0; i < ticks.length; i += skip) {
      filtered.push(ticks[i]);
    }
    if (filtered[filtered.length - 1] !== ticks[ticks.length - 1]) {
      filtered.push(ticks[ticks.length - 1]);
    }
    return filtered;
  }

  return ticks;
}

/**
 * Parse risk window dates and return day offsets from today.
 */
function riskWindowDayOffsets(
  riskWindows: RiskWindow[],
  today: Date
): { day: number; risk: RiskWindow }[] {
  const results: { day: number; risk: RiskWindow }[] = [];
  for (const rw of riskWindows) {
    if (rw.risk_level !== "critical" && rw.risk_level !== "high") continue;
    const rwDate = new Date(rw.date + "T00:00:00");
    if (isNaN(rwDate.getTime())) continue;
    const diffMs = rwDate.getTime() - today.getTime();
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays >= 0 && diffDays <= 90) {
      results.push({ day: diffDays, risk: rw });
    }
  }
  return results;
}

// ---- Component ----

export default function EquityCurve({ snapshot }: EquityCurveProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [showArea, setShowArea] = useState(false);
  const lineRef = useRef<SVGPathElement>(null);

  // Project balance data
  const dataPoints = useMemo(() => projectBalance(snapshot), [snapshot]);

  // Compute Y axis bounds
  const { minY, maxY } = useMemo(() => {
    const balances = dataPoints.map((p) => p.balance);
    const rawMin = Math.min(...balances);
    const rawMax = Math.max(...balances);

    // Include 0 if balance goes below $50 (to show the $0 line)
    let computedMin = Math.min(rawMin, 0);
    // Cap minimum at -500 or lowest balance
    if (computedMin < -500) {
      computedMin = Math.max(computedMin, -500);
    }

    const padding = (rawMax - computedMin) * 0.1 || 50;
    return {
      minY: computedMin - padding,
      maxY: rawMax + padding,
    };
  }, [dataPoints]);

  // Y axis ticks
  const yTicks = useMemo(() => computeYTicks(minY, maxY), [minY, maxY]);

  // X axis ticks
  const xTicks = useMemo(() => {
    const ticks = [0, 15, 30, 45, 60, 75, 90];
    return ticks;
  }, []);

  // SVG paths
  const linePath = useMemo(
    () => buildSmoothPath(dataPoints, minY, maxY),
    [dataPoints, minY, maxY]
  );
  const areaPath = useMemo(
    () => buildAreaPath(dataPoints, minY, maxY),
    [dataPoints, minY, maxY]
  );

  // Risk window markers
  const riskMarkers = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return riskWindowDayOffsets(snapshot.risk_windows, today);
  }, [snapshot.risk_windows]);

  // Find lowest point
  const { lowestBalance, lowestDay } = useMemo(() => {
    let lowest = dataPoints[0];
    for (const p of dataPoints) {
      if (p.balance < lowest.balance) lowest = p;
    }
    return { lowestBalance: lowest.balance, lowestDay: lowest.day };
  }, [dataPoints]);

  // Ending balance
  const endingBalance = dataPoints[dataPoints.length - 1]?.balance ?? 0;

  // Danger zone: find regions where balance < $50
  const dangerZeroY = dataY(0, minY, maxY);
  const dangerThresholdY = dataY(50, minY, maxY);
  const hasDangerZone = dataPoints.some((p) => p.balance < 50);

  // Event point indices (for circles)
  const eventIndices = useMemo(() => {
    const indices: number[] = [];
    for (let i = 0; i < dataPoints.length; i++) {
      if (dataPoints[i].event) indices.push(i);
    }
    return indices;
  }, [dataPoints]);

  // Line draw-in animation
  useEffect(() => {
    const lineEl = lineRef.current;
    if (!lineEl) return;

    const length = lineEl.getTotalLength();
    lineEl.style.strokeDasharray = `${length}`;
    lineEl.style.strokeDashoffset = `${length}`;

    // Force reflow
    lineEl.getBoundingClientRect();

    lineEl.style.transition = "stroke-dashoffset 1.5s ease-in-out";
    lineEl.style.strokeDashoffset = "0";

    const timer = setTimeout(() => {
      setShowArea(true);
    }, 1500);

    return () => clearTimeout(timer);
  }, [linePath]);

  // Tooltip positioning
  const getTooltipPosition = (
    index: number
  ): { x: number; y: number; anchor: "left" | "right" | "center" } => {
    const p = dataPoints[index];
    const x = dataX(p.day);
    const y = dataY(p.balance, minY, maxY);
    let anchor: "left" | "right" | "center" = "center";
    if (p.day <= 5) anchor = "left";
    else if (p.day >= 85) anchor = "right";
    return { x, y, anchor };
  };

  return (
    <div className="bg-[#1e293b] rounded-xl shadow-lg shadow-black/20 border border-slate-600/50 p-6 card-glow">
      {/* Title */}
      <h3 className="text-lg font-semibold text-slate-100 mb-4">
        90-Day Balance Projection
      </h3>

      {/* SVG Chart */}
      <div className="w-full aspect-[7/3]">
        <svg
          viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
          className="w-full h-full"
          role="img"
          aria-label="90-day balance projection chart showing projected checking account balance over the next 90 days"
        >
          <defs>
            {/* Area gradient */}
            <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#2dd4bf" stopOpacity="0.2" />
              <stop offset="100%" stopColor="#2dd4bf" stopOpacity="0" />
            </linearGradient>

            {/* Danger zone gradient */}
            <linearGradient id="dangerGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ef4444" stopOpacity="0.05" />
              <stop offset="100%" stopColor="#ef4444" stopOpacity="0.15" />
            </linearGradient>

            {/* Risk band gradient */}
            <linearGradient id="riskBandGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ef4444" stopOpacity="0.08" />
              <stop offset="50%" stopColor="#ef4444" stopOpacity="0.12" />
              <stop offset="100%" stopColor="#ef4444" stopOpacity="0.08" />
            </linearGradient>
          </defs>

          {/* Horizontal grid lines */}
          {yTicks.map((tick) => {
            const y = dataY(tick, minY, maxY);
            return (
              <line
                key={`grid-${tick}`}
                x1={PADDING.left}
                y1={y}
                x2={SVG_WIDTH - PADDING.right}
                y2={y}
                stroke="rgb(51 65 85 / 0.3)"
                strokeDasharray="4 4"
                strokeWidth="1"
              />
            );
          })}

          {/* Danger zone: shade below $50 */}
          {hasDangerZone && (
            <>
              <rect
                x={PADDING.left}
                y={dangerThresholdY}
                width={CHART_WIDTH}
                height={PADDING.top + CHART_HEIGHT - dangerThresholdY}
                fill="url(#dangerGradient)"
              />
              {/* $0 line */}
              <line
                x1={PADDING.left}
                y1={dangerZeroY}
                x2={SVG_WIDTH - PADDING.right}
                y2={dangerZeroY}
                stroke="#ef4444"
                strokeDasharray="6 4"
                strokeWidth="1"
                strokeOpacity="0.4"
              />
              <text
                x={SVG_WIDTH - PADDING.right + 4}
                y={dangerZeroY + 4}
                fill="#ef4444"
                fontSize="10"
                fontFamily="monospace"
                opacity="0.6"
              >
                $0
              </text>
            </>
          )}

          {/* Risk window bands */}
          {riskMarkers.map(({ day }, i) => {
            const x = dataX(day);
            const bandWidth = Math.max(CHART_WIDTH / 90, 8);
            return (
              <g key={`risk-band-${i}`}>
                <rect
                  x={x - bandWidth / 2}
                  y={PADDING.top}
                  width={bandWidth}
                  height={CHART_HEIGHT}
                  fill="url(#riskBandGradient)"
                />
                {/* Red triangle marker at top */}
                <polygon
                  points={`${x - 5},${PADDING.top - 2} ${x + 5},${PADDING.top - 2} ${x},${PADDING.top + 8}`}
                  fill="#ef4444"
                  opacity="0.7"
                />
              </g>
            );
          })}

          {/* Today marker */}
          <line
            x1={dataX(0)}
            y1={PADDING.top}
            x2={dataX(0)}
            y2={PADDING.top + CHART_HEIGHT}
            stroke="#94a3b8"
            strokeDasharray="4 3"
            strokeWidth="1"
            opacity="0.5"
          />
          <text
            x={dataX(0)}
            y={PADDING.top - 6}
            fill="#94a3b8"
            fontSize="10"
            textAnchor="middle"
            fontFamily="sans-serif"
          >
            Today
          </text>

          {/* Area fill (fades in after line animation) */}
          <path
            d={areaPath}
            fill="url(#areaGradient)"
            opacity={showArea ? 1 : 0}
            style={{
              transition: "opacity 0.5s ease-in-out",
            }}
          />

          {/* Main line */}
          <path
            ref={lineRef}
            d={linePath}
            fill="none"
            stroke="#2dd4bf"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Event data point circles */}
          {eventIndices.map((idx) => {
            const p = dataPoints[idx];
            const cx = dataX(p.day);
            const cy = dataY(p.balance, minY, maxY);

            // Determine dot color by event type
            const isIncomeEvent = p.event && p.event.includes("+");
            const isExpenseEvent = p.event && p.event.includes("-");
            const isBillCausingDanger =
              p.balance < 100 && isExpenseEvent;
            const circleColor = isIncomeEvent
              ? "#10b981"
              : isBillCausingDanger
                ? "#ef4444"
                : isExpenseEvent
                  ? "#f59e0b"
                  : "#2dd4bf";

            return (
              <g key={`event-${idx}`}>
                <circle
                  cx={cx}
                  cy={cy}
                  r={hoveredIndex === idx ? 5 : 3}
                  fill={circleColor}
                  stroke="#0f172a"
                  strokeWidth="1.5"
                  style={{
                    cursor: "pointer",
                    transition: "r 0.15s ease",
                    opacity: showArea ? 1 : 0,
                  }}
                  onMouseEnter={() => setHoveredIndex(idx)}
                  onMouseLeave={() => setHoveredIndex(null)}
                />
                {/* Larger invisible hover target */}
                <circle
                  cx={cx}
                  cy={cy}
                  r={12}
                  fill="transparent"
                  style={{ cursor: "pointer" }}
                  onMouseEnter={() => setHoveredIndex(idx)}
                  onMouseLeave={() => setHoveredIndex(null)}
                />
              </g>
            );
          })}

          {/* Y axis labels */}
          {yTicks.map((tick) => {
            const y = dataY(tick, minY, maxY);
            return (
              <text
                key={`y-label-${tick}`}
                x={PADDING.left - 10}
                y={y + 4}
                fill="#94a3b8"
                fontSize="11"
                textAnchor="end"
                fontFamily="sans-serif"
              >
                {formatCurrency(tick)}
              </text>
            );
          })}

          {/* X axis labels */}
          {xTicks.map((day) => {
            const x = dataX(day);
            let label: string;
            if (day === 0) label = "Today";
            else if (day === 30) label = "Month 1";
            else if (day === 60) label = "Month 2";
            else if (day === 90) label = "Month 3";
            else label = `Day ${day}`;
            return (
              <text
                key={`x-label-${day}`}
                x={x}
                y={PADDING.top + CHART_HEIGHT + 20}
                fill="#94a3b8"
                fontSize="10"
                textAnchor="middle"
                fontFamily="sans-serif"
              >
                {label}
              </text>
            );
          })}

          {/* X axis line */}
          <line
            x1={PADDING.left}
            y1={PADDING.top + CHART_HEIGHT}
            x2={SVG_WIDTH - PADDING.right}
            y2={PADDING.top + CHART_HEIGHT}
            stroke="rgb(51 65 85 / 0.5)"
            strokeWidth="1"
          />

          {/* Y axis line */}
          <line
            x1={PADDING.left}
            y1={PADDING.top}
            x2={PADDING.left}
            y2={PADDING.top + CHART_HEIGHT}
            stroke="rgb(51 65 85 / 0.5)"
            strokeWidth="1"
          />

          {/* Tooltip */}
          {hoveredIndex !== null && (() => {
            const p = dataPoints[hoveredIndex];
            const { x, y, anchor } = getTooltipPosition(hoveredIndex);

            const tooltipWidth = 180;
            const tooltipHeight = p.event ? 58 : 40;
            let tooltipX: number;
            if (anchor === "left") tooltipX = x + 10;
            else if (anchor === "right") tooltipX = x - tooltipWidth - 10;
            else tooltipX = x - tooltipWidth / 2;

            // Keep tooltip within chart bounds
            tooltipX = Math.max(
              PADDING.left,
              Math.min(tooltipX, SVG_WIDTH - PADDING.right - tooltipWidth)
            );

            const tooltipY = y - tooltipHeight - 12;
            const clampedY = Math.max(PADDING.top, tooltipY);

            return (
              <g>
                {/* Vertical hover guide line */}
                <line
                  x1={x}
                  y1={PADDING.top}
                  x2={x}
                  y2={PADDING.top + CHART_HEIGHT}
                  stroke="#2dd4bf"
                  strokeWidth="1"
                  strokeDasharray="3 3"
                  opacity="0.3"
                />

                {/* Tooltip background */}
                <rect
                  x={tooltipX}
                  y={clampedY}
                  width={tooltipWidth}
                  height={tooltipHeight}
                  rx="6"
                  fill="#0f172a"
                  stroke="#334155"
                  strokeWidth="1"
                  opacity="0.95"
                />

                {/* Tooltip date + balance */}
                <text
                  x={tooltipX + 10}
                  y={clampedY + 16}
                  fill="#e2e8f0"
                  fontSize="11"
                  fontWeight="600"
                  fontFamily="sans-serif"
                >
                  {p.date} &mdash; {formatCurrency(p.balance, 2)}
                </text>

                {/* Tooltip event */}
                {p.event && (
                  <text
                    x={tooltipX + 10}
                    y={clampedY + 34}
                    fill={
                      p.event.includes("+")
                        ? "#34d399"
                        : p.event.includes("-") && p.balance < 100
                          ? "#f87171"
                          : p.event.includes("-")
                            ? "#fbbf24"
                            : "#94a3b8"
                    }
                    fontSize="10"
                    fontFamily="sans-serif"
                  >
                    {p.event.length > 28
                      ? p.event.substring(0, 28) + "..."
                      : p.event}
                  </text>
                )}

                {/* Second event line if event is long */}
                {p.event && p.event.length > 28 && (
                  <text
                    x={tooltipX + 10}
                    y={clampedY + 48}
                    fill="#94a3b8"
                    fontSize="9"
                    fontFamily="sans-serif"
                  >
                    {p.event.substring(28, 56)}
                    {p.event.length > 56 ? "..." : ""}
                  </text>
                )}
              </g>
            );
          })()}
        </svg>
      </div>

      {/* Stats row */}
      <div className="flex flex-wrap gap-3 mt-4">
        <div className="bg-[#0f172a] rounded-lg px-3 py-1.5">
          <span className="text-xs text-slate-400">Starting</span>
          <span className="ml-2 text-sm font-medium text-slate-200">
            {formatCurrency(snapshot.checking_balance)}
          </span>
        </div>

        <div className="bg-[#0f172a] rounded-lg px-3 py-1.5">
          <span className="text-xs text-slate-400">Lowest</span>
          <span
            className={`ml-2 text-sm font-medium ${
              lowestBalance < 50 ? "text-red-400" : "text-slate-200"
            }`}
          >
            {formatCurrency(lowestBalance)} on Day {lowestDay}
          </span>
        </div>

        <div className="bg-[#0f172a] rounded-lg px-3 py-1.5">
          <span className="text-xs text-slate-400">Ending</span>
          <span className="ml-2 text-sm font-medium text-slate-200">
            {formatCurrency(endingBalance)}
          </span>
        </div>
      </div>
    </div>
  );
}
