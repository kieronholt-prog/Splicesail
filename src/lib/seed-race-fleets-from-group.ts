import type { SupabaseClient } from "@supabase/supabase-js";
import { RACE_FLEET_ICS_PLACEHOLDER } from "@/lib/race-fleet-club-flag";
import { MAX_RACE_FLEET_START_OFFSET_MINUTES } from "@/lib/race-fleet-offset-limits";

export type ParsedApplicableFleetRow = {
  groupFleetId: string;
  startOffsetMinutes: number;
};

/** Read checkbox `applicable_group_fleet` plus `fleet_start_offset_<uuid>` from the form. */
export function parseApplicableGroupFleetsFromForm(formData: FormData): ParsedApplicableFleetRow[] | { error: string } {
  const rawIds = formData.getAll("applicable_group_fleet").map((v) => String(v ?? "").trim());
  const ids = [...new Set(rawIds.filter((id) => id.length > 0))];
  if (ids.length === 0) {
    return { error: "Select at least one applicable club fleet (or add fleets under the club first)." };
  }

  const out: ParsedApplicableFleetRow[] = [];
  for (const groupFleetId of ids) {
    const offsetRaw = String(formData.get(`fleet_start_offset_${groupFleetId}`) ?? "").trim();
    const n = offsetRaw.length ? Math.trunc(Number(offsetRaw)) : 0;
    if (!Number.isFinite(n) || n < 0 || n > MAX_RACE_FLEET_START_OFFSET_MINUTES) {
      return {
        error: `Each selected fleet needs a start offset from 0 to ${MAX_RACE_FLEET_START_OFFSET_MINUTES} minutes after the first start.`,
      };
    }
    out.push({ groupFleetId, startOffsetMinutes: n });
  }
  return out;
}

type GroupFleetMeta = { id: string; name: string; sort_order: number };

/**
 * Inserts `race_fleets` rows from club `group_fleets` + `group_fleet_classes`.
 * Skips sort order: uses `group_fleets.sort_order`, then name for stability.
 */
export async function seedRaceFleetsFromGroupSelection(
  supabase: SupabaseClient,
  raceId: string,
  groupId: string,
  selection: ParsedApplicableFleetRow[],
): Promise<{ error?: string }> {
  if (selection.length === 0) {
    return { error: "No fleets to apply." };
  }

  const fleetIds = selection.map((s) => s.groupFleetId);
  const { data: metaRows, error: metaErr } = await supabase
    .from("group_fleets")
    .select("id, name, sort_order")
    .eq("group_id", groupId)
    .in("id", fleetIds);

  if (metaErr) return { error: metaErr.message };

  const metaById = new Map((metaRows ?? []).map((m) => [m.id, m as GroupFleetMeta]));
  for (const id of fleetIds) {
    if (!metaById.has(id)) {
      return { error: "One or more selected fleets are not part of this club." };
    }
  }

  const { data: classRows, error: classErr } = await supabase
    .from("group_fleet_classes")
    .select("fleet_id, class_key")
    .in("fleet_id", fleetIds);

  if (classErr) return { error: classErr.message };

  const keysByFleet = new Map<string, string[]>();
  for (const row of classRows ?? []) {
    const k = String(row.class_key ?? "").trim();
    if (!k.length) continue;
    const list = keysByFleet.get(row.fleet_id) ?? [];
    list.push(k);
    keysByFleet.set(row.fleet_id, list);
  }

  const offsetById = new Map(selection.map((s) => [s.groupFleetId, s.startOffsetMinutes] as const));

  const ordered = [...selection].sort((a, b) => {
    const ma = metaById.get(a.groupFleetId)!;
    const mb = metaById.get(b.groupFleetId)!;
    if (ma.sort_order !== mb.sort_order) return ma.sort_order - mb.sort_order;
    return ma.name.localeCompare(mb.name);
  });

  const inserts: {
    race_id: string;
    group_fleet_id: string;
    sort_order: number;
    name: string;
    start_offset_minutes: number;
    filter_mode: "class_keys";
    class_keys: string[];
    py_min: null;
    py_max: null;
    flag_mode: "ics";
    ics_signal: string;
    flag_image_url: null;
  }[] = [];

  for (let index = 0; index < ordered.length; index++) {
    const sel = ordered[index]!;
    const meta = metaById.get(sel.groupFleetId)!;
    const class_keys = [...new Set(keysByFleet.get(sel.groupFleetId) ?? [])];
    if (class_keys.length === 0) {
      return { error: `Fleet “${meta.name}” has no hull classes — add classes on the fleet page first.` };
    }
    const start_offset_minutes = offsetById.get(sel.groupFleetId) ?? 0;
    inserts.push({
      race_id: raceId,
      group_fleet_id: sel.groupFleetId,
      sort_order: index,
      name: meta.name,
      start_offset_minutes,
      filter_mode: "class_keys",
      class_keys,
      py_min: null,
      py_max: null,
      flag_mode: "ics",
      ics_signal: RACE_FLEET_ICS_PLACEHOLDER,
      flag_image_url: null,
    });
  }

  const { error: insErr } = await supabase.from("race_fleets").insert(inserts);

  if (insErr) return { error: insErr.message };
  return {};
}
