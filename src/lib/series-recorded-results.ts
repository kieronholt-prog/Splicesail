import type { SupabaseClient } from "@supabase/supabase-js";

const IN_CHUNK = 400;

/**
 * True when the series has any recorded race outcomes or recorded finishes (whether or not races are marked results-final).
 */
export async function seriesHasRecordedResults(
  supabase: SupabaseClient,
  seriesId: string,
): Promise<boolean> {
  const set = await seriesIdsRequiringPasswordToDelete(supabase, [seriesId]);
  return set.has(seriesId);
}

/**
 * Series ids that have any recorded outcomes or finishes (used to detect “has results” state).
 */
export async function seriesIdsRequiringPasswordToDelete(
  supabase: SupabaseClient,
  seriesIds: string[],
): Promise<Set<string>> {
  const out = new Set<string>();
  if (!seriesIds.length) return out;

  const { data: races, error: racesErr } = await supabase
    .from("races")
    .select("id, series_id")
    .in("series_id", seriesIds);

  if (racesErr) throw new Error(racesErr.message);

  const raceRows = races ?? [];
  if (!raceRows.length) return out;

  const raceIdToSeriesId = new Map(raceRows.map((r) => [r.id, r.series_id] as const));
  const raceIds = raceRows.map((r) => r.id);

  for (let i = 0; i < raceIds.length; i += IN_CHUNK) {
    const slice = raceIds.slice(i, i + IN_CHUNK);
    const { data: withOutcome, error: oe } = await supabase
      .from("race_entries")
      .select("race_id")
      .in("race_id", slice)
      .not("outcome", "is", null);
    if (oe) throw new Error(oe.message);
    for (const row of withOutcome ?? []) {
      const sid = raceIdToSeriesId.get(row.race_id);
      if (sid) out.add(sid);
    }
  }

  const entryIdToRaceId = new Map<string, string>();

  for (let i = 0; i < raceIds.length; i += IN_CHUNK) {
    const slice = raceIds.slice(i, i + IN_CHUNK);
    const { data: entries, error: ee } = await supabase
      .from("race_entries")
      .select("id, race_id")
      .in("race_id", slice);
    if (ee) throw new Error(ee.message);
    for (const e of entries ?? []) {
      entryIdToRaceId.set(e.id, e.race_id);
    }
  }

  const entryIds = [...entryIdToRaceId.keys()];
  for (let i = 0; i < entryIds.length; i += IN_CHUNK) {
    const slice = entryIds.slice(i, i + IN_CHUNK);
    const { data: fins, error: fe } = await supabase
      .from("race_finishes")
      .select("race_entry_id")
      .in("race_entry_id", slice);
    if (fe) throw new Error(fe.message);
    for (const f of fins ?? []) {
      const rid = entryIdToRaceId.get(f.race_entry_id);
      const sid = rid ? raceIdToSeriesId.get(rid) : undefined;
      if (sid) out.add(sid);
    }
  }

  for (let i = 0; i < raceIds.length; i += IN_CHUNK) {
    const slice = raceIds.slice(i, i + IN_CHUNK);
    const { data: guestFinished, error: gfErr } = await supabase
      .from("race_guest_entries")
      .select("race_id, race_guest_finishes!inner(id)")
      .in("race_id", slice);
    if (gfErr) throw new Error(gfErr.message);
    for (const row of guestFinished ?? []) {
      const sid = raceIdToSeriesId.get(row.race_id);
      if (sid) out.add(sid);
    }
  }

  return out;
}

/**
 * `race_ids` from the subset of `candidateRaceIds` that have at least one recorded finish —
 * RO/official lanes on {@link race_finishes}, or guest rows on {@link race_guest_finishes}.
 */
export async function raceIdsWithRecordedFinishes(
  supabase: SupabaseClient,
  candidateRaceIds: string[],
): Promise<{ raceIds: Set<string>; error?: string }> {
  const out = new Set<string>();
  if (!candidateRaceIds.length) {
    return { raceIds: out };
  }

  const { data: guestRows, error: gErr } = await supabase
    .from("race_guest_entries")
    .select("race_id, race_guest_finishes!inner(id)")
    .in("race_id", candidateRaceIds);

  if (gErr) {
    return { raceIds: out, error: gErr.message };
  }
  for (const row of guestRows ?? []) {
    out.add(row.race_id);
  }

  const { data: entries, error: eErr } = await supabase
    .from("race_entries")
    .select("id, race_id")
    .in("race_id", candidateRaceIds);

  if (eErr) {
    return { raceIds: out, error: eErr.message };
  }

  const entryIdToRaceId = new Map((entries ?? []).map((e) => [e.id, e.race_id] as const));
  const entryIds = [...entryIdToRaceId.keys()];

  for (let i = 0; i < entryIds.length; i += IN_CHUNK) {
    const slice = entryIds.slice(i, i + IN_CHUNK);
    const { data: fins, error: fe } = await supabase
      .from("race_finishes")
      .select("race_entry_id")
      .in("race_entry_id", slice);
    if (fe) {
      return { raceIds: out, error: fe.message };
    }
    for (const f of fins ?? []) {
      const rid = entryIdToRaceId.get(f.race_entry_id);
      if (rid) {
        out.add(rid);
      }
    }
  }

  return { raceIds: out };
}

/**
 * Subset of `candidateRaceIds` that have recorded scoring activity (provisional or
 * results-final): any non-null entry outcome, official finish, or guest finish.
 * Used for series standings columns and discard race-count.
 */
export async function raceIdsWithRecordedScoringInputs(
  supabase: SupabaseClient,
  candidateRaceIds: string[],
): Promise<Set<string>> {
  const out = new Set<string>();
  if (!candidateRaceIds.length) return out;

  const { raceIds: withFinishes, error: finErr } = await raceIdsWithRecordedFinishes(
    supabase,
    candidateRaceIds,
  );
  if (finErr) throw new Error(finErr);
  for (const id of withFinishes) out.add(id);

  for (let i = 0; i < candidateRaceIds.length; i += IN_CHUNK) {
    const slice = candidateRaceIds.slice(i, i + IN_CHUNK);
    const { data: withOutcome, error: oe } = await supabase
      .from("race_entries")
      .select("race_id")
      .in("race_id", slice)
      .not("outcome", "is", null);
    if (oe) throw new Error(oe.message);
    for (const row of withOutcome ?? []) {
      if (row.race_id) out.add(row.race_id);
    }
  }

  return out;
}
