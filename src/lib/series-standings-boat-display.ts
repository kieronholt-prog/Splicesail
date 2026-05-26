import type { SupabaseClient } from "@supabase/supabase-js";
import { helmAndCrewDisplayLabels, resolveEffectiveCrewTemplate } from "@/lib/boat-crew";
import { RACE_ONLY_ADHOC_HELM_LINE } from "@/lib/race-results-display";
import { parseSeriesRoAddedBoatId } from "@/lib/ro-added-boat-series";
import { seriesFleetKeyFromRaceFleet } from "@/lib/series-fleet-key";

export type SeriesStandingsBoatDisplayMeta = {
  sailNumber: string;
  boatType: string;
  helm: string;
  crew: string;
  primaryFleetId: string | null;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

function boatTypeFromMeta(
  className: string | null | undefined,
  ryaClassKey: string | null | undefined,
  classDisplayByKey: Map<string, string>,
): string {
  const cn = className?.trim();
  if (cn) return cn;
  const key = ryaClassKey?.trim();
  if (key) return classDisplayByKey.get(key) ?? key;
  return "—";
}

/** Sail, hull class, helm/crew for series standings rows (public + member views). */
export async function loadSeriesStandingsBoatDisplayMeta(
  supabase: SupabaseClient,
  groupId: string,
  seriesId: string,
  boatIds: string[],
): Promise<Map<string, SeriesStandingsBoatDisplayMeta>> {
  const out = new Map<string, SeriesStandingsBoatDisplayMeta>();
  if (!boatIds.length) return out;

  const { data: classRows } = await supabase
    .from("boat_classes")
    .select("class_key, display_name")
    .or(`created_for_group_id.is.null,created_for_group_id.eq.${groupId}`);
  const classDisplayByKey = new Map(
    (classRows ?? []).map((r) => [r.class_key, r.display_name ?? r.class_key] as const),
  );

  const realBoatIds = boatIds.filter(isUuid);
  const syntheticBoatIds = boatIds.filter((id) => parseSeriesRoAddedBoatId(id));

  for (const boatId of syntheticBoatIds) {
    const parsed = parseSeriesRoAddedBoatId(boatId);
    if (!parsed) continue;
    out.set(boatId, {
      sailNumber: parsed.sailNumber.trim() || "—",
      boatType: boatTypeFromMeta(null, parsed.classKey, classDisplayByKey),
      helm: RACE_ONLY_ADHOC_HELM_LINE,
      crew: "—",
      primaryFleetId: null,
    });
  }

  const boatById = new Map<
    string,
    {
      label: string;
      class_name: string | null;
      rya_class_key: string | null;
      default_sail_number: string | null;
      handedness: string | null;
      crew_template: unknown;
      owner_user_id: string | null;
    }
  >();

  if (realBoatIds.length) {
    const { data: boats } = await supabase
      .from("boats")
      .select(
        "id, label, class_name, rya_class_key, default_sail_number, handedness, crew_template, owner_user_id",
      )
      .in("id", realBoatIds);
    for (const b of boats ?? []) {
      boatById.set(b.id, b);
    }
  }

  const profileIds = new Set<string>();
  for (const b of boatById.values()) {
    if (b.owner_user_id) profileIds.add(b.owner_user_id);
  }

  const { data: raceIds } = await supabase.from("races").select("id").eq("series_id", seriesId);
  const rids = (raceIds ?? []).map((r) => r.id);

  const latestEntryByBoat = new Map<
    string,
    {
      sail_number_override: string | null;
      crew_template_override: unknown;
      fleet_id: string | null;
      user_id: string;
    }
  >();

  if (rids.length && realBoatIds.length) {
    const { data: entries } = await supabase
      .from("race_entries")
      .select(
        "boat_id, sail_number_override, crew_template_override, fleet_id, user_id, created_at, race_id",
      )
      .in("race_id", rids)
      .in("boat_id", realBoatIds);

    const raceSchedule = new Map<string, string>();
    const { data: raceRows } = await supabase
      .from("races")
      .select("id, scheduled_at")
      .in("id", rids);
    for (const r of raceRows ?? []) raceSchedule.set(r.id, r.scheduled_at);

    const sorted = [...(entries ?? [])].sort((a, b) => {
      const sa = raceSchedule.get(a.race_id) ?? "";
      const sb = raceSchedule.get(b.race_id) ?? "";
      return sb.localeCompare(sa);
    });

    for (const e of sorted) {
      if (!e.boat_id || latestEntryByBoat.has(e.boat_id)) continue;
      latestEntryByBoat.set(e.boat_id, {
        sail_number_override: e.sail_number_override,
        crew_template_override: e.crew_template_override,
        fleet_id: e.fleet_id,
        user_id: e.user_id,
      });
    }
  }

  for (const entry of latestEntryByBoat.values()) {
    profileIds.add(entry.user_id);
  }

  const raceFleetIds = [
    ...new Set(
      [...latestEntryByBoat.values()]
        .map((e) => e.fleet_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const seriesKeyByRaceFleetId = new Map<string, string>();
  if (raceFleetIds.length) {
    const { data: raceFleetRows } = await supabase
      .from("race_fleets")
      .select("id, group_fleet_id")
      .in("id", raceFleetIds);
    for (const rf of raceFleetRows ?? []) {
      seriesKeyByRaceFleetId.set(rf.id, seriesFleetKeyFromRaceFleet(rf));
    }
  }

  const nameByUser = new Map<string, string | null>();
  if (profileIds.size) {
    const { data: profs } = await supabase
      .from("profiles")
      .select("id, display_name")
      .in("id", [...profileIds]);
    for (const p of profs ?? []) nameByUser.set(p.id, p.display_name);
  }

  for (const boatId of realBoatIds) {
    const boat = boatById.get(boatId);
    const entry = latestEntryByBoat.get(boatId);
    const handedness = boat?.handedness ?? "single";
    const effective = resolveEffectiveCrewTemplate(
      entry?.crew_template_override ?? null,
      boat?.crew_template ?? null,
    );
    const ownerName = boat?.owner_user_id
      ? nameByUser.get(boat.owner_user_id)
      : entry
        ? nameByUser.get(entry.user_id)
        : null;
    const { helm, crew } = helmAndCrewDisplayLabels(effective, handedness, ownerName ?? null);

    out.set(boatId, {
      sailNumber:
        (entry?.sail_number_override?.trim() || boat?.default_sail_number?.trim() || "").trim() || "—",
      boatType: boatTypeFromMeta(boat?.class_name, boat?.rya_class_key, classDisplayByKey),
      helm,
      crew,
      primaryFleetId: entry?.fleet_id
        ? (seriesKeyByRaceFleetId.get(entry.fleet_id) ?? entry.fleet_id)
        : null,
    });
  }

  return out;
}
