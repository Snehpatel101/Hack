"use client";

interface RiskAlertProps {
  alerts: string[];
}

export default function RiskAlert({ alerts }: RiskAlertProps) {
  if (alerts.length === 0) return null;

  return (
    <div
      role="alert"
      className="rounded-xl border border-red-500/30 bg-gradient-to-r from-red-900/30 to-red-800/20 p-4 shadow-lg shadow-red-500/10 animate-pulse-glow animate-slide-up"
      style={{
        animationName: "pulseGlow",
        // Override the glow color for red
        "--tw-shadow": "0 0 15px rgba(239, 68, 68, 0.2)",
      } as React.CSSProperties}
    >
      <div className="flex items-start gap-3">
        {/* Warning icon */}
        <svg
          className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-400"
          fill="currentColor"
          viewBox="0 0 20 20"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.168 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 6a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 6zm0 9a1 1 0 100-2 1 1 0 000 2z"
            clipRule="evenodd"
          />
        </svg>

        <div className="flex-1">
          <h3 className="text-sm font-semibold text-red-300">
            {alerts.length === 1 ? "Risk Alert" : `${alerts.length} Risk Alerts`}
          </h3>
          <ul className="mt-2 space-y-1">
            {alerts.map((alert, index) => (
              <li
                key={index}
                className="flex items-start gap-2 text-sm text-red-400/90"
              >
                <span
                  className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-red-500"
                  aria-hidden="true"
                />
                {alert}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
