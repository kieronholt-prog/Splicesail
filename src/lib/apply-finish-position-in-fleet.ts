import type { SupabaseClient } from "@supabase/supabase-js";

export type FinishPositionTarget =
  | { kind: "official"; raceEntryId: string }
  | { kind: "guest"; raceGuestEntryId: string };

type FleetFinishRow = FinishPositionTarget & {
  finishPosition: number;
  roFinishAt: string | null;
  officialFinishAt: string | null;
};

function targetKey(t: FinishPositionTarget): string {
  return t.kind === "official" ? `o:${t.raceEntryId}` : `g:${t.raceGuestEntryId}`;
}

function isSameTarget(a: FinishPositionTarget, b: FinishPositionTarget): boolean {
  return targetKey(a) === targetKey(b);
}

/** Compute finish positions after assigning one boat, optionally shifting others down. */
export function planFleetFinishPositions(
  rows: FleetFinishRow[],
  target: FinishPositionTarget,
  newPosition: number,
  allowEqualPosition: boolean,
): FleetFinishRow[] {
  const byKey = new Map(rows.map((r) => [targetKey(r), { ...r }]));
  const others = [...byKey.values()].filter((r) => !isSameTarget(r, target));
  const conflict = others.some((r) => r.finishPosition === newPosition);

  const existing = byKey.get(targetKey(target));
  const targetRow: FleetFinishRow = existing ?? {
    ...target,
    finishPosition: newPosition,
    roFinishAt: null,
    officialFinishAt: null,
  };

  if (allowEqualPosition || !conflict) {
    byKey.set(targetKey(target), { ...targetRow, finishPosition: newPosition });
    return [...byKey.values()];
  }

  for (const [key, row] of byKey) {
    if (isSameTarget(row, target)) {
      byKey.set(key, { ...row, finishPosition: newPosition });
    } else if (row.finishPosition >= newPosition) {
      byKey.set(key, { ...row, finishPosition: row.finishPosition + 1 });
    }
  }

  if (!byKey.has(targetKey(target))) {
    byKey.set(targetKey(target), { ...targetRow, finishPosition: newPosition });
  }

  return [...byKey.values()];
}

export async function loadFleetFinishRows(
  supabase: SupabaseClient,
  raceId: string,
  fleetId: string | null,
): Promise<FleetFinishRow[]> {
  const rows: FleetFinishRow[] = [];

  const { data: entries } = await supabase
    .from("race_entries")
    .select("id, fleet_id")
    .eq("race_id", raceId);

  const officialIds = (entries ?? [])
    .filter((e) => (e.fleet_id ?? null) === fleetId)
    .map((e) => e.id);

  if (officialIds.length) {
    const { data: finishes } = await supabase
      .from("race_finishes")
      .select("race_entry_id, ro_finish_at, official_finish_at, finish_position")
      .in("race_entry_id", officialIds)
      .not("finish_position", "is", null);

    for (const f of finishes ?? []) {
      const pos = f.finish_position;
      if (pos == null || pos < 1) continue;
      rows.push({
        kind: "official",
        raceEntryId: f.race_entry_id,
        finishPosition: pos,
        roFinishAt: f.ro_finish_at,
        officialFinishAt: f.official_finish_at,
      });
    }
  }

  const { data: guestEntries } = await supabase
    .from("race_guest_entries")
    .select("id, fleet_id")
    .eq("race_id", raceId);

  const guestIds = (guestEntries ?? [])
    .filter((e) => (e.fleet_id ?? null) === fleetId)
    .map((e) => e.id);

  if (guestIds.length) {
    const { data: guestFinishes } = await supabase
      .from("race_guest_finishes")
      .select("race_guest_entry_id, ro_finish_at, official_finish_at, finish_position")
      .in("race_guest_entry_id", guestIds)
      .not("finish_position", "is", null);

    for (const f of guestFinishes ?? []) {
      const pos = f.finish_position;
      if (pos == null || pos < 1) continue;
      rows.push({
        kind: "guest",
        raceGuestEntryId: f.race_guest_entry_id,
        finishPosition: pos,
        roFinishAt: f.ro_finish_at,
        officialFinishAt: f.official_finish_at,
      });
    }
  }

  return rows;
}

export async function applyFinishPositionInFleet(
  supabase: SupabaseClient,
  options: {
    raceId: string;
    fleetId: string | null;
    target: FinishPositionTarget;
    newPosition: number;
    allowEqualPosition: boolean;
    nowIso: string;
  },
): Promise<{ error?: string }> {
  const { raceId, fleetId, target, newPosition, allowEqualPosition, nowIso } = options;

  const current = await loadFleetFinishRows(supabase, raceId, fleetId);
  const planned = planFleetFinishPositions(current, target, newPosition, allowEqualPosition);
  const currentByKey = new Map(current.map((r) => [targetKey(r), r]));

  for (const row of planned) {
    const prev = currentByKey.get(targetKey(row));
    if (prev && prev.finishPosition === row.finishPosition) continue;

    const roFinishAt = row.roFinishAt ?? nowIso;
    const officialFinishAt = row.officialFinishAt ?? nowIso;

    if (row.kind === "official") {
      const { error } = await supabase.from("race_finishes").upsert(
        {
          race_entry_id: row.raceEntryId,
          ro_finish_at: roFinishAt,
          official_finish_at: officialFinishAt,
          finish_position: row.finishPosition,
        },
        { onConflict: "race_entry_id" },
      );
      if (error) return { error: error.message };
    } else {
      const { error } = await supabase.from("race_guest_finishes").upsert(
        {
          race_guest_entry_id: row.raceGuestEntryId,
          ro_finish_at: roFinishAt,
          official_finish_at: officialFinishAt,
          finish_position: row.finishPosition,
        },
        { onConflict: "race_guest_entry_id" },
      );
      if (error) return { error: error.message };
    }
  }

  return {};
}

/** After removing one boat's finish position, shift higher positions down by one. */
export function planRemoveFinishPosition(
  rows: FleetFinishRow[],
  target: FinishPositionTarget,
): { removedPosition: number | null; shifted: FleetFinishRow[] } {
  const targetRow = rows.find((r) => isSameTarget(r, target));
  if (!targetRow) return { removedPosition: null, shifted: rows };
  const removedPosition = targetRow.finishPosition;
  const shifted = rows
    .filter((r) => !isSameTarget(r, target))
    .map((r) =>
      r.finishPosition > removedPosition ? { ...r, finishPosition: r.finishPosition - 1 } : r,
    );
  return { removedPosition, shifted };
}

export async function removeFinishPositionInFleet(
  supabase: SupabaseClient,
  options: {
    raceId: string;
    fleetId: string | null;
    target: FinishPositionTarget;
  },
): Promise<{ error?: string }> {
  const { raceId, fleetId, target } = options;
  const current = await loadFleetFinishRows(supabase, raceId, fleetId);
  const { removedPosition, shifted } = planRemoveFinishPosition(current, target);
  const currentByKey = new Map(current.map((r) => [targetKey(r), r]));

  if (target.kind === "official") {
    const { error } = await supabase.from("race_finishes").delete().eq("race_entry_id", target.raceEntryId);
    if (error) return { error: error.message };
  } else {
    const { error } = await supabase
      .from("race_guest_finishes")
      .delete()
      .eq("race_guest_entry_id", target.raceGuestEntryId);
    if (error) return { error: error.message };
  }

  if (removedPosition == null) return {};

  for (const row of shifted) {
    const prev = currentByKey.get(targetKey(row));
    if (!prev || prev.finishPosition === row.finishPosition) continue;

    const roFinishAt = row.roFinishAt ?? prev.roFinishAt;
    const officialFinishAt = row.officialFinishAt ?? prev.officialFinishAt;
    if (!roFinishAt || !officialFinishAt) continue;

    if (row.kind === "official") {
      const { error } = await supabase.from("race_finishes").upsert(
        {
          race_entry_id: row.raceEntryId,
          ro_finish_at: roFinishAt,
          official_finish_at: officialFinishAt,
          finish_position: row.finishPosition,
        },
        { onConflict: "race_entry_id" },
      );
      if (error) return { error: error.message };
    } else {
      const { error } = await supabase.from("race_guest_finishes").upsert(
        {
          race_guest_entry_id: row.raceGuestEntryId,
          ro_finish_at: roFinishAt,
          official_finish_at: officialFinishAt,
          finish_position: row.finishPosition,
        },
        { onConflict: "race_guest_entry_id" },
      );
      if (error) return { error: error.message };
    }
  }

  return {};
}
