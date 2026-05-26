import type { SupabaseClient } from "@supabase/supabase-js";
import { computePursuitStartSlots } from "@/lib/pursuit-start-slots";
import { parsePursuitStartIncrementSeconds } from "@/lib/race-type";

export type PursuitSlotView = {
  slotId: string;
  slotIndex: number;
  startAt: string;
  classes: { classKey: string; displayName: string; effectivePy: number }[];
};

/** Resolve PY per class_key: race override → series → club → boat_class_pn. */
export async function resolveClassPyMap(
  supabase: SupabaseClient,
  ctx: { groupId: string; seriesId: string; raceId: string },
  classKeys: string[],
): Promise<Map<string, number | null>> {
  if (!classKeys.length) return new Map();

  const [raceOv, seriesRows, groupRows, baseRows] = await Promise.all([
    supabase
      .from("race_pursuit_py_overrides")
      .select("class_key, py")
      .eq("race_id", ctx.raceId)
      .in("class_key", classKeys),
    supabase.from("series_class_py").select("class_key, py").eq("series_id", ctx.seriesId).in("class_key", classKeys),
    supabase.from("group_class_py").select("class_key, py").eq("group_id", ctx.groupId).in("class_key", classKeys),
    supabase.from("boat_class_pn").select("class_key, py").in("class_key", classKeys),
  ]);

  const raceMap = new Map((raceOv.data ?? []).map((r) => [r.class_key, r.py]));
  const seriesMap = new Map((seriesRows.data ?? []).map((r) => [r.class_key, r.py]));
  const groupMap = new Map((groupRows.data ?? []).map((r) => [r.class_key, r.py]));
  const baseMap = new Map((baseRows.data ?? []).map((r) => [r.class_key, r.py]));

  const out = new Map<string, number | null>();
  for (const key of classKeys) {
    const py = raceMap.get(key) ?? seriesMap.get(key) ?? groupMap.get(key) ?? baseMap.get(key) ?? null;
    out.set(key, py);
  }
  return out;
}

export async function recomputeAndPersistPursuitSlots(
  supabase: SupabaseClient,
  ctx: { groupId: string; seriesId: string; raceId: string },
): Promise<{ error?: string }> {
  const { data: race, error: raceErr } = await supabase
    .from("races")
    .select(
      "id, race_type, pursuit_finish_at, pursuit_first_start_at, pursuit_start_increment_seconds, pursuit_group_fleet_id",
    )
    .eq("id", ctx.raceId)
    .maybeSingle();

  if (raceErr || !race) return { error: raceErr?.message ?? "Race not found." };
  if (race.race_type !== "pursuit") return { error: "Race is not a pursuit race." };

  const finishAt = race.pursuit_finish_at;
  const firstStart = race.pursuit_first_start_at;
  const increment = parsePursuitStartIncrementSeconds(race.pursuit_start_increment_seconds);
  const fleetId = race.pursuit_group_fleet_id;

  if (!finishAt || !firstStart || !increment || !fleetId) {
    return { error: "Set finish time, first start, increment, and fleet before calculating pursuit starts." };
  }

  const finishMs = new Date(finishAt).getTime();
  const firstMs = new Date(firstStart).getTime();
  if (!Number.isFinite(finishMs) || !Number.isFinite(firstMs) || finishMs <= firstMs) {
    return { error: "Finish time must be after first boat start time." };
  }

  const { data: fleetClasses, error: fcErr } = await supabase
    .from("group_fleet_classes")
    .select("class_key")
    .eq("fleet_id", fleetId);

  if (fcErr) return { error: fcErr.message };

  const classKeys = [...new Set((fleetClasses ?? []).map((r) => String(r.class_key ?? "").trim()).filter(Boolean))];
  if (!classKeys.length) {
    return { error: "Selected fleet has no boat classes." };
  }

  const pyMap = await resolveClassPyMap(supabase, ctx, classKeys);
  const missing = classKeys.filter((k) => {
    const py = pyMap.get(k);
    return py == null || !(py > 0);
  });
  if (missing.length) {
    return { error: `Missing Portsmouth number for: ${missing.join(", ")}.` };
  }

  const computed = computePursuitStartSlots(
    firstMs,
    finishMs,
    increment,
    classKeys.map((classKey) => ({ classKey, py: pyMap.get(classKey)! })),
  );

  const { error: delErr } = await supabase.from("race_pursuit_start_slots").delete().eq("race_id", ctx.raceId);
  if (delErr) return { error: delErr.message };

  for (const slot of computed) {
    const { data: inserted, error: insErr } = await supabase
      .from("race_pursuit_start_slots")
      .insert({
        race_id: ctx.raceId,
        slot_index: slot.slotIndex,
        start_at: new Date(slot.startAtMs).toISOString(),
        sort_order: slot.slotIndex,
      })
      .select("id")
      .single();

    if (insErr || !inserted) return { error: insErr?.message ?? "Could not save pursuit slot." };

    const classRows = slot.classes.map((c) => ({
      slot_id: inserted.id,
      class_key: c.classKey,
      effective_py: c.py,
    }));

    const { error: clsErr } = await supabase.from("race_pursuit_start_slot_classes").insert(classRows);
    if (clsErr) return { error: clsErr.message };
  }

  return {};
}

export async function loadPursuitSlotsForRace(
  supabase: SupabaseClient,
  raceId: string,
): Promise<PursuitSlotView[]> {
  const { data: slots } = await supabase
    .from("race_pursuit_start_slots")
    .select("id, slot_index, start_at")
    .eq("race_id", raceId)
    .order("sort_order", { ascending: true });

  if (!slots?.length) return [];

  const slotIds = slots.map((s) => s.id);
  const { data: slotClasses } = await supabase
    .from("race_pursuit_start_slot_classes")
    .select("slot_id, class_key, effective_py")
    .in("slot_id", slotIds);

  const keys = [...new Set((slotClasses ?? []).map((r) => r.class_key))];
  const displayByKey = new Map<string, string>();
  if (keys.length) {
    const { data: cat } = await supabase.from("boat_classes").select("class_key, display_name").in("class_key", keys);
    for (const r of cat ?? []) {
      displayByKey.set(r.class_key, r.display_name ?? r.class_key);
    }
  }

  const classesBySlot = new Map<string, PursuitSlotView["classes"]>();
  for (const sc of slotClasses ?? []) {
    const list = classesBySlot.get(sc.slot_id) ?? [];
    list.push({
      classKey: sc.class_key,
      displayName: displayByKey.get(sc.class_key) ?? sc.class_key,
      effectivePy: sc.effective_py,
    });
    classesBySlot.set(sc.slot_id, list);
  }

  return slots.map((s) => ({
    slotId: s.id,
    slotIndex: s.slot_index,
    startAt: s.start_at,
    classes: classesBySlot.get(s.id) ?? [],
  }));
}

/** class_key → slot start_at ISO for pursuit races. */
export async function pursuitClassStartAtByKey(
  supabase: SupabaseClient,
  raceId: string,
): Promise<Map<string, string>> {
  const slots = await loadPursuitSlotsForRace(supabase, raceId);
  const out = new Map<string, string>();
  for (const slot of slots) {
    for (const c of slot.classes) {
      out.set(c.classKey, slot.startAt);
    }
  }
  return out;
}
