/** Match series generator fields — explicit colors avoid blank inputs in RO / dark OS. */
export const spliceFieldLabelClass =
  "text-[11px] font-medium uppercase tracking-wide text-splice-navy dark:text-splice-foam";

export const spliceFieldHintClass = "text-[10px] leading-snug text-splice-ocean dark:text-splice-water";

export const spliceFieldClass =
  "rounded-lg border border-splice-water bg-white px-3 py-2 text-sm text-splice-navy dark:border-splice-ocean dark:bg-splice-navy dark:text-splice-foam";

export const spliceFieldClassNarrow =
  "w-full max-w-[5.5rem] rounded-lg border border-splice-water bg-white px-3 py-2 text-sm text-splice-navy dark:border-splice-ocean dark:bg-splice-navy dark:text-splice-foam";

export const spliceFieldClassMono =
  "w-full rounded-lg border border-splice-water bg-white px-3 py-2 font-mono text-sm text-splice-navy dark:border-splice-ocean dark:bg-splice-navy dark:text-splice-foam";

export const spliceFieldClassWind =
  "w-full max-w-[8rem] rounded-lg border border-splice-water bg-white px-3 py-2 text-sm text-splice-navy dark:border-splice-ocean dark:bg-splice-navy dark:text-splice-foam";

export function defaultCourseLetterValue(
  saved: string | null | undefined,
  courses: { course_letter: string }[],
): string {
  const trimmed = saved?.trim();
  if (trimmed) return trimmed;
  return courses[0]?.course_letter ?? "";
}
