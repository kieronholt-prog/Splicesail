import type { SailingCourseRow } from "./types";

/** Lap-1 mark names from a course letter definition (preamble then sequence). */
export function markNamesForCourse(course: SailingCourseRow | null | undefined): string[] {
  if (!course) return [];
  const names: string[] = [];
  const add = (pair: unknown) => {
    if (Array.isArray(pair) && typeof pair[0] === "string") {
      const name = pair[0].trim();
      if (name) names.push(name);
    }
  };
  for (const p of course.marks_preamble ?? []) add(p);
  for (const m of course.mark_sequence ?? []) add(m);
  return [...new Set(names)];
}
