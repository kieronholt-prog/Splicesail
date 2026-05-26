import type { SupabaseClient } from "@supabase/supabase-js";
import type { MarkOverride } from "./types";

type SubmissionRow = {
  analysis_mode: string | null;
  race_id: string | null;
  course_letter: string | null;
  laps: number | null;
  mark_overrides: unknown;
  course_setup: unknown;
  det_settings: unknown;
};

/** Collated sailors inherit RO race settings when submission rows were not backfilled. */
export async function resolveCollatedCourseContext(
  supabase: SupabaseClient,
  sub: SubmissionRow,
): Promise<{
  courseLetter: string | null;
  laps: number;
  markOverrides: Record<string, MarkOverride>;
  courseSetup: Record<string, unknown>;
  detSettings: Record<string, unknown>;
}> {
  const base = {
    courseLetter: sub.course_letter,
    laps: sub.laps ?? 1,
    markOverrides: (sub.mark_overrides ?? {}) as Record<string, MarkOverride>,
    courseSetup: (sub.course_setup ?? {}) as Record<string, unknown>,
    detSettings: (sub.det_settings ?? {}) as Record<string, unknown>,
  };

  if (sub.analysis_mode !== "collated" || !sub.race_id || sub.course_letter) {
    return base;
  }

  const { data: settings } = await supabase
    .from("race_analysis_settings")
    .select("course_letter, laps, mark_overrides, course_setup, det_settings")
    .eq("race_id", sub.race_id)
    .maybeSingle();

  if (!settings?.course_letter) return base;

  return {
    courseLetter: settings.course_letter,
    laps: settings.laps ?? 1,
    markOverrides: (settings.mark_overrides ?? {}) as Record<string, MarkOverride>,
    courseSetup: (settings.course_setup ?? {}) as Record<string, unknown>,
    detSettings: (settings.det_settings ?? {}) as Record<string, unknown>,
  };
}
