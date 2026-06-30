import type { SailingCourseRow } from "./types";
import {
  courseToDisplayEntries,
  courseToEntries,
  expandEntriesForLaps,
  type MarkEntry,
  type ExpandedCourseMark,
} from "./course-mark-entries";

export type { MarkEntry, ExpandedCourseMark };

export { courseToDisplayEntries, courseToEntries };

/** Full rounding order used by leg detection and RO confirmation UI. */
export function expandAnalysisRoundingSequence(
  course: SailingCourseRow | null,
  laps: number,
  markKindByName?: Map<string, string>,
): ExpandedCourseMark<{ name: string; tack: "P" | "S" }>[] {
  if (!course) return [];
  const entries = courseToEntries(course, markKindByName);
  return expandEntriesForLaps(entries, laps, (i) => ({
    name: entries[i]!.name,
    tack: entries[i]!.tack,
  }));
}
