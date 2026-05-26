import type { ParsedApplicableFleetRow } from "@/lib/seed-race-fleets-from-group";

/** JSON stored on `series.schedule_template_fleets`. */
export type ScheduleTemplateFleetRow = {
  group_fleet_id: string;
  start_offset_minutes: number;
};

export function scheduleTemplateFleetsFromJson(raw: unknown): ParsedApplicableFleetRow[] | null {
  if (raw == null) return null;
  if (!Array.isArray(raw)) return null;
  const out: ParsedApplicableFleetRow[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") return null;
    const r = row as Record<string, unknown>;
    const id = String(r.group_fleet_id ?? "").trim();
    if (!id) return null;
    const offset = Number(r.start_offset_minutes ?? 0);
    if (!Number.isFinite(offset) || offset < 0 || offset > 60) return null;
    out.push({ groupFleetId: id, startOffsetMinutes: Math.trunc(offset) });
  }
  return out.length > 0 ? out : null;
}

export function scheduleTemplateFleetsToJson(selection: ParsedApplicableFleetRow[]): ScheduleTemplateFleetRow[] {
  return selection.map((s) => ({
    group_fleet_id: s.groupFleetId,
    start_offset_minutes: s.startOffsetMinutes,
  }));
}
