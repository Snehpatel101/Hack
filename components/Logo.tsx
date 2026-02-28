"use client";

interface LogoProps {
  size?: "sm" | "md" | "lg";
  showTagline?: boolean;
}

export default function Logo({ size = "md", showTagline = true }: LogoProps) {
  const sizes = {
    sm: { main: "text-base md:text-lg", or: "text-[10px] md:text-xs", sub: "text-[8px] md:text-[9px]", gap: "mx-1 md:mx-1.5" },
    md: { main: "text-xl md:text-2xl", or: "text-xs md:text-sm", sub: "text-[9px] md:text-[11px]", gap: "mx-1.5 md:mx-2" },
    lg: { main: "text-3xl md:text-4xl", or: "text-lg md:text-xl", sub: "text-[11px] md:text-[13px]", gap: "mx-2 md:mx-2.5" },
  };
  const s = sizes[size];

  return (
    <div className="flex flex-col items-start select-none group">
      <div className={`${s.main} font-black tracking-tighter leading-none flex items-baseline`}>
        <span className="bg-gradient-to-br from-cyan-100 to-cyan-400 bg-clip-text text-transparent">ONE DAY</span>
        <span
          className={`${s.or} ${s.gap} text-slate-600 font-medium italic animate-pulse-subtle`}
        >
          or
        </span>
        <span className="bg-gradient-to-br from-emerald-200 to-sky-400 bg-clip-text text-transparent">DAY ONE</span>
      </div>
      {showTagline && (
        <p
          className={`${s.sub} uppercase tracking-[0.4em] text-slate-500 mt-2 font-semibold transition-colors group-hover:text-cyan-300`}
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
