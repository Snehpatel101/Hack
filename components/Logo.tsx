"use client";

interface LogoProps {
  size?: "sm" | "md" | "lg";
  showTagline?: boolean;
}

export default function Logo({ size = "md", showTagline = true }: LogoProps) {
  const sizes = {
    sm: { main: "text-lg", or: "text-sm", sub: "text-[8px]", gap: "mx-1.5" },
    md: { main: "text-2xl", or: "text-lg", sub: "text-[10px]", gap: "mx-2" },
    lg: { main: "text-4xl", or: "text-2xl", sub: "text-xs", gap: "mx-2.5" },
  };
  const s = sizes[size];

  return (
    <div className="flex flex-col items-start select-none">
      <div className={`${s.main} font-extrabold tracking-tight leading-tight`}>
        <span className="text-orange-500">ONE DAY</span>
        <span
          className={`${s.or} ${s.gap} text-gray-400 font-light italic animate-pulse-subtle`}
        >
          or
        </span>
        <span className="text-amber-400">DAY ONE</span>
      </div>
      {showTagline && (
        <p
          className={`${s.sub} uppercase tracking-[0.25em] text-gray-500 mt-1 font-medium`}
        >
          Equity Finance Copilot
        </p>
      )}

      {/* Scoped keyframes for the subtle pulse on "or" */}
      <style jsx>{`
        @keyframes pulse-subtle {
          0%,
          100% {
            opacity: 1;
          }
          50% {
            opacity: 0.4;
          }
        }
        :global(.animate-pulse-subtle) {
          animation: pulse-subtle 3s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}
