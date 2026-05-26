type MedalTier = "gold" | "silver" | "bronze";

const MEDAL_STYLES: Record<
  MedalTier,
  { fill: string; rim: string; ribbon: string; label: string; number: string }
> = {
  gold: {
    fill: "#FACC15",
    rim: "#CA8A04",
    ribbon: "#EAB308",
    label: "1st place",
    number: "1",
  },
  silver: {
    fill: "#E5E7EB",
    rim: "#9CA3AF",
    ribbon: "#D1D5DB",
    label: "2nd place",
    number: "2",
  },
  bronze: {
    fill: "#F59E0B",
    rim: "#B45309",
    ribbon: "#D97706",
    label: "3rd place",
    number: "3",
  },
};

function MedalIcon({ tier }: { tier: MedalTier }) {
  const { fill, rim, ribbon, label, number } = MEDAL_STYLES[tier];

  return (
    <span className="inline-flex items-center justify-center" role="img" aria-label={label}>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        aria-hidden
        className="h-6 w-6"
      >
        <path d="M8.5 2 10 8.5 12 3 14 8.5 15.5 2 12 5.5Z" fill={ribbon} stroke={rim} strokeWidth="0.5" />
        <circle cx="12" cy="15" r="6.5" fill={fill} stroke={rim} strokeWidth="1.25" />
        <circle cx="12" cy="15" r="4.25" fill="none" stroke={rim} strokeOpacity="0.35" strokeWidth="0.75" />
        <text
          x="12"
          y="15.5"
          textAnchor="middle"
          dominantBaseline="middle"
          fill={rim}
          fontSize="7"
          fontWeight="700"
          fontFamily="ui-sans-serif, system-ui, sans-serif"
        >
          {number}
        </text>
      </svg>
    </span>
  );
}

/** Finish position or series rank: gold, silver, and bronze medals for 1–3; numeric or penalty codes otherwise. */
export function FinishPositionDisplay({ position }: { position: string | number }) {
  if (position === "—" || position === "" || position === 0) return <>—</>;
  const trimmed = String(position).trim();
  if (trimmed === "1") return <MedalIcon tier="gold" />;
  if (trimmed === "2") return <MedalIcon tier="silver" />;
  if (trimmed === "3") return <MedalIcon tier="bronze" />;
  return <>{trimmed}</>;
}
