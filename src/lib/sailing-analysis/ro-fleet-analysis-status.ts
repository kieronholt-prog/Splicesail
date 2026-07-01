import type { FleetCollatedCounts } from "./load-race-fleet-tracks";

/** Traffic-light status for RO fleet pills and banners. */
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

/** One-line fleet status for the panel below pills. */
export function fleetAnalysisSummary(
  counts: FleetCollatedCounts,
  hasCourseSettings: boolean,
): string {
  const total = counts.pending + counts.ready;
  const tone = fleetAnalysisTone(counts, hasCourseSettings);

  if (tone === "red") {
    return `${total} collated track${total !== 1 ? "s" : ""} in this fleet — save course settings to analyse.`;
  }
  if (tone === "amber") {
    return "No collated tracks yet — set course and laps below before uploads arrive.";
  }
  if (total === 0) {
    return "Course saved — new uploads in this fleet will analyse automatically.";
  }
  if (counts.pending === 0) {
    return `${counts.ready} track${counts.ready !== 1 ? "s" : ""} analysed.`;
  }
  if (counts.ready === 0) {
    return `${counts.pending} track${counts.pending !== 1 ? "s" : ""} ready — click Save & analyse.`;
  }
  return `${counts.ready} of ${total} analysed · ${counts.pending} awaiting — click Save & analyse to refresh.`;
}

export function fleetStatusBannerClass(tone: FleetAnalysisUiTone): string {
  switch (tone) {
    case "red":
      return "rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-950 dark:border-red-800 dark:bg-red-950/40 dark:text-red-100";
    case "amber":
      return "rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100";
    case "green":
      return "rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100";
  }
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
