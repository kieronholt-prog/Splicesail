type SpliceIconProps = {
  size?: number;
  className?: string;
  variant?: "light" | "dark";
};

/** Rope-splice app icon from brand identity. */
export function SpliceIcon({ size = 40, className, variant = "light" }: SpliceIconProps) {
  const isDark = variant === "dark";
  const bg = isDark ? "#0C447C" : "#042C53";
  const strandA = isDark ? "#85B7EB" : "#378ADD";
  const strandB = isDark ? "#B5D4F4" : "#85B7EB";
  const knot = isDark ? "#E6F1FB" : "#B5D4F4";

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
    >
      <rect width="40" height="40" rx="10" fill={bg} />
      <path
        d="M8 14 C10 14 12 18 14 20 C16 22 18 26 20 26"
        stroke={strandA}
        strokeWidth="2.5"
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M32 14 C30 14 28 18 26 20 C24 22 22 26 20 26"
        stroke={strandB}
        strokeWidth="2.5"
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M20 26 C18 26 16 28 14 30 C12 32 10 32 8 30"
        stroke={strandB}
        strokeWidth="2.5"
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M20 26 C22 26 24 28 26 30 C28 32 30 32 32 30"
        stroke={strandA}
        strokeWidth="2.5"
        fill="none"
        strokeLinecap="round"
      />
      <circle cx="20" cy="20" r="3" fill={knot} />
    </svg>
  );
}

type SpliceWordmarkProps = {
  mode?: "light" | "dark";
  showTagline?: boolean;
  className?: string;
};

/** Wordmark lockup: icon + Splice + optional tagline. */
export function SpliceWordmark({ mode = "light", showTagline = false, className }: SpliceWordmarkProps) {
  const isDark = mode === "dark";

  return (
    <span className={`inline-flex min-w-0 items-center gap-2 ${className ?? ""}`}>
      <SpliceIcon size={32} variant={mode} className="shrink-0" />
      <span className="min-w-0 truncate">
        <span
          className={`block text-lg font-medium leading-none tracking-tight ${isDark ? "text-splice-foam" : "text-splice-navy"}`}
        >
          Splice
        </span>
        {showTagline ? (
          <span
            className={`mt-0.5 block text-[10px] font-medium uppercase tracking-widest ${isDark ? "text-splice-water" : "text-splice-ocean"}`}
          >
            Dinghy racing
          </span>
        ) : null}
      </span>
    </span>
  );
}

export const SPLICE_TAGLINE = "Your race. Your club. Spliced.";
