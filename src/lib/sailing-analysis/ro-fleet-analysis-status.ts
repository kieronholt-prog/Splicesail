import type { FleetCollatedCounts } from "./load-race-fleet-tracks";

/** Traffic-light status for RO fleet pills. */
export type FleetAnalysisUiTone = "amber" | "red" | "green";

export function fleetHasCourseSettings(
  settings: { course_letter?: string | null } | null | undefined,
): boolean {
  return Boolean(settings?.course_letter?.trim());
}

export function fleetAnalysisTone(
  counts: FleetCollatedCounts,
  hasCourseSettings: boolean,
): FleetAnalysisUiTone {
  const total = counts.pending + counts.ready;
  if (total > 0 && !hasCourseSettings) return "red";
  if (total === 0 && !hasCourseSettings) return "amber";
  return "green";
}

/** Short suffix on fleet pill buttons. */
export function fleetPillSuffix(
  counts: FleetCollatedCounts,
  hasCourseSettings: boolean,
): string {
  const total = counts.pending + counts.ready;
  const tone = fleetAnalysisTone(counts, hasCourseSettings);

  if (tone === "red") return total > 0 ? ` · ${total}` : "";
  if (tone === "amber") return "";
  if (total === 0) return " · ready";
  if (counts.pending === 0) return ` · ${total} ✓`;
  if (counts.ready === 0) return ` · ${total}`;
  return ` · ${counts.ready}/${total}`;
}

export function fleetPillClass(tone: FleetAnalysisUiTone, selected: boolean): string {
  const base = "rounded-full px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap";
  if (selected) {
    switch (tone) {
      case "red":
        return `${base} bg-red-600 text-white dark:bg-red-500`;
      case "amber":
        return `${base} bg-amber-500 text-white dark:bg-amber-400 dark:text-amber-950`;
      case "green":
        return `${base} bg-emerald-600 text-white dark:bg-emerald-500`;
    }
  }
  switch (tone) {
    case "red":
      return `${base} border-2 border-red-400 bg-red-50 text-red-900 hover:bg-red-100 dark:border-red-600 dark:bg-red-950/30 dark:text-red-100`;
    case "amber":
      return `${base} border-2 border-amber-400 bg-amber-50 text-amber-950 hover:bg-amber-100 dark:border-amber-600 dark:bg-amber-950/30 dark:text-amber-100`;
    case "green":
      return `${base} border-2 border-emerald-500 bg-emerald-50 text-emerald-900 hover:bg-emerald-100 dark:border-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-100`;
  }
}
