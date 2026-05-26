export type ScheduleGenerationMode = "single_day" | "date_range";

/** Normalize DB/form values; accepts legacy single_race / series. */
export function normalizeScheduleGenerationMode(raw: string | null | undefined): ScheduleGenerationMode {
  const s = String(raw ?? "").trim();
  if (s === "single_day" || s === "single_race") return "single_day";
  return "date_range";
}
