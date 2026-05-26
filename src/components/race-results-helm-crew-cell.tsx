import { RACE_ONLY_ADHOC_HELM_LINE } from "@/lib/race-results-display";

export function RaceResultsHelmCrewCell({
  helmLine,
  crewLine,
  compact = false,
}: {
  helmLine: string;
  crewLine: string;
  compact?: boolean;
}) {
  const cellClass = compact
    ? "max-w-[6.5rem] px-2 py-1.5 align-top"
    : "px-3 py-2 align-top";

  if (helmLine === RACE_ONLY_ADHOC_HELM_LINE) {
    return (
      <td className={cellClass}>
        <span className="block text-[10px] leading-tight text-splice-ocean dark:text-splice-water">
          Make Entry for
        </span>
        <span className="block text-[10px] leading-tight text-splice-ocean dark:text-splice-water">
          Series Result
        </span>
      </td>
    );
  }

  const title = [helmLine, crewLine !== "—" ? crewLine : ""].filter(Boolean).join(" · ");

  return (
    <td className={cellClass} title={title || undefined}>
      <span
        className={
          compact
            ? "block text-xs leading-tight text-splice-navy-light line-clamp-2 dark:text-splice-sky"
            : "block text-sm leading-snug text-splice-navy-light dark:text-splice-sky"
        }
      >
        {helmLine}
      </span>
      {crewLine !== "—" ? (
        <span
          className={
            compact
              ? "mt-0.5 block text-[11px] leading-tight text-splice-blue line-clamp-2 dark:text-splice-water"
              : "mt-0.5 block text-xs leading-snug text-splice-blue dark:text-splice-water"
          }
        >
          {crewLine}
        </span>
      ) : null}
    </td>
  );
}
