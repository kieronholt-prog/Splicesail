import type { SupabaseClient } from "@supabase/supabase-js";
import type { BoatPyRow } from "@/lib/resolve-class-py";
import { boatEffectivePyByIdMap } from "@/lib/resolve-class-py";
import { isRaceOnlyAdhocGuestRow } from "@/lib/ro-added-boat-series";
import type { RaceEntryScoringInput, RaceScoringMode } from "@/lib/scoring/race-low-point";

export type GuestAppendixDisplay = {
  boatLabel: string;
  sailDisplay: string;
  outcomeDisplay: string;
  fleetLabel: string;
  /** Scratch / +ADDED row for this race only (no series signup). */
  isRaceOnlyAdhoc?: boolean;
};

export type FetchRaceGuestScoringOptions = {
  /** Include ad-hoc race-only guest rows in scoring/display (race results only — not series standings). */
  includeRaceOnlyAdhoc?: boolean;
};

/** Synthetic user id so ad-hoc guests score independently (not a real auth.users row). */
export function raceOnlyAdhocScoringUserId(guestEntryId: string): string {
  return `race-only:${guestEntryId}`;
}

export function unwrapRelation<T>(rel: T | T[] | null | undefined): T | null {
  if (rel === null || rel === undefined) return null;
  return Array.isArray(rel) ? rel[0] ?? null : rel;
}

/** Guest rows that may still contribute to scoring (confirmed links are audit-only). */
export const SCORABLE_GUEST_LINK_STATUSES = ["unlinked", "pending_admin"] as const;

export type RaceGuestLinkRow = {
  link_status?: string | null;
  linked_race_entry_id?: string | null;
  pending_matched_user_id?: string | null;
  pending_matched_boat_id?: string | null;
};

/** Official entries on this race that already have a recorded finish (user:boat keys). */
export async function loadFinishedOfficialUserBoatKeysForRace(
  supabase: SupabaseClient,
  raceId: string,
): Promise<Set<string>> {
  const { data: entries } = await supabase
    .from("race_entries")
    .select("user_id, boat_id, race_finishes ( official_finish_at, ro_finish_at )")
    .eq("race_id", raceId);

  const out = new Set<string>();
  for (const raw of entries ?? []) {
    const row = raw as {
      user_id?: string | null;
      boat_id?: string | null;
      race_finishes?: unknown;
    };
    const fin = unwrapRelation(
      row.race_finishes as
        | { official_finish_at?: string | null; ro_finish_at?: string | null }
        | { official_finish_at?: string | null; ro_finish_at?: string | null }[]
        | null,
    );
    const hasFinish = Boolean(fin?.official_finish_at ?? fin?.ro_finish_at);
    if (!hasFinish || !row.user_id || !row.boat_id) continue;
    out.add(`${row.user_id}:${row.boat_id}`);
  }
  return out;
}

/**
 * Skip guest/adhoc scoring when the result has been adopted on an official entry
 * (confirmed link, or pending admin match with official finish already copied).
 */
export function shouldSkipGuestRowForLinkedOfficial(
  row: RaceGuestLinkRow,
  finishedOfficialUserBoatKeys: Set<string>,
): boolean {
  if (row.link_status === "confirmed" || row.linked_race_entry_id) return true;
  if (row.link_status !== "pending_admin") return false;
  const uid = row.pending_matched_user_id;
  const bid = row.pending_matched_boat_id;
  if (!uid || !bid) return false;
  return finishedOfficialUserBoatKeys.has(`${uid}:${bid}`);
}

/**
 * Appendix A scoring inputs for guest boats whose club_guest_sailor has linked_user_id.
 * Skips guests when an official race_entries row exists for the same user on this race.
 * If multiple guest entries share the same linked member on one race, only the first is scored
 * (avoid duplicate user_id points in one race).
 */
export async function fetchRaceGuestScoringInputs(
  supabase: SupabaseClient,
  ctx: { groupId: string; seriesId: string },
  raceId: string,
  normalEntryUserIds: Set<string>,
  boatPyById: Map<string, number | null>,
  startByFleetId: Map<string, number | null> = new Map(),
  raceDefaultStartMs: number | null = null,
  scoringMode: RaceScoringMode = "handicap",
  options: FetchRaceGuestScoringOptions = {},
): Promise<{ inputs: RaceEntryScoringInput[]; appendixDisplayByEntryId: Map<string, GuestAppendixDisplay> }> {
  const finishedOfficialUserBoatKeys = await loadFinishedOfficialUserBoatKeysForRace(
    supabase,
    raceId,
  );

  const { data: rows } = await supabase
    .from("race_guest_entries")
    .select(
      `
      id,
      boat_id,
      fleet_id,
      link_status,
      linked_race_entry_id,
      pending_matched_user_id,
      pending_matched_boat_id,
      sail_number_override,
      adhoc_sail_number,
      adhoc_rya_class_key,
      started_marked_at,
      race_guest_finishes ( official_finish_at, elapsed_seconds, corrected_seconds, finish_position ),
      boats!boat_id (
        id,
        label,
        linked_boat_id,
        class_name,
        rya_class_key,
        default_sail_number,
        club_guest_sailors ( linked_user_id )
      )
    `,
    )
    .eq("race_id", raceId)
    .in("link_status", [...SCORABLE_GUEST_LINK_STATUSES]);

  type GuestBoatNest = {
    id: string;
    label: string;
    linked_boat_id: string | null;
    class_name: string | null;
    rya_class_key: string | null;
    default_sail_number: string | null;
    club_guest_sailors?: { linked_user_id: string | null } | { linked_user_id: string | null }[] | null;
  };

  const hullRowsForPy: BoatPyRow[] = [];
  const staged: {
    guestEntryId: string;
    fleetId: string | null;
    linkedUserId: string;
    gb: GuestBoatNest;
    officialFinish: string | null;
    storedElapsedSeconds: number | null;
    storedCorrectedSeconds: number | null;
    finishPosition: number | null;
    started: string | null;
    sailOverride: string | null;
  }[] = [];

  const stagedAdhoc: {
    guestEntryId: string;
    fleetId: string | null;
    classKey: string;
    sailNumber: string;
    officialFinish: string | null;
    storedElapsedSeconds: number | null;
    storedCorrectedSeconds: number | null;
    finishPosition: number | null;
    started: string | null;
  }[] = [];

  for (const raw of rows ?? []) {
    const row = raw as {
      id: string;
      boat_id?: string | null;
      fleet_id?: string | null;
      link_status?: string | null;
      linked_race_entry_id?: string | null;
      pending_matched_user_id?: string | null;
      pending_matched_boat_id?: string | null;
      adhoc_sail_number?: string | null;
      adhoc_rya_class_key?: string | null;
      sail_number_override?: string | null;
      started_marked_at?: string | null;
      race_guest_finishes?: unknown;
      boats?: GuestBoatNest | GuestBoatNest[] | null;
    };

    if (
      shouldSkipGuestRowForLinkedOfficial(row, finishedOfficialUserBoatKeys)
    ) {
      continue;
    }

    if (options.includeRaceOnlyAdhoc && isRaceOnlyAdhocGuestRow(row)) {
      const fin = unwrapRelation(
        row.race_guest_finishes as
          | {
              official_finish_at: string | null;
              elapsed_seconds?: number | null;
              corrected_seconds?: number | null;
              finish_position?: number | null;
            }
          | {
              official_finish_at: string | null;
              elapsed_seconds?: number | null;
              corrected_seconds?: number | null;
              finish_position?: number | null;
            }[]
          | null,
      );
      stagedAdhoc.push({
        guestEntryId: row.id,
        fleetId: row.fleet_id ?? null,
        classKey: row.adhoc_rya_class_key!.trim(),
        sailNumber: row.adhoc_sail_number!.trim(),
        officialFinish: fin?.official_finish_at ?? null,
        storedElapsedSeconds: fin != null ? (fin.elapsed_seconds ?? null) : null,
        storedCorrectedSeconds: fin != null ? (fin.corrected_seconds ?? null) : null,
        finishPosition: fin?.finish_position ?? null,
        started: row.started_marked_at ?? null,
      });
      continue;
    }

    const gb = unwrapRelation(row.boats);
    const gs = gb ? unwrapRelation(gb.club_guest_sailors) : null;
    const uid = gs?.linked_user_id ?? null;
    if (!gb || !uid) continue;

    const fin = unwrapRelation(
      row.race_guest_finishes as
        | {
            official_finish_at: string | null;
            elapsed_seconds?: number | null;
            corrected_seconds?: number | null;
            finish_position?: number | null;
          }
        | {
            official_finish_at: string | null;
            elapsed_seconds?: number | null;
            corrected_seconds?: number | null;
            finish_position?: number | null;
          }[]
        | null,
    );
    staged.push({
      guestEntryId: row.id,
      fleetId: row.fleet_id ?? null,
      linkedUserId: uid,
      gb,
      officialFinish: fin?.official_finish_at ?? null,
      storedElapsedSeconds: fin != null ? (fin.elapsed_seconds ?? null) : null,
      storedCorrectedSeconds: fin != null ? (fin.corrected_seconds ?? null) : null,
      finishPosition: fin?.finish_position ?? null,
      started: row.started_marked_at ?? null,
      sailOverride: row.sail_number_override ?? null,
    });

    if (!gb.linked_boat_id) {
      hullRowsForPy.push({
        id: gb.id,
        class_name: gb.class_name,
        py_rating: null,
        rya_class_key: gb.rya_class_key,
      });
    }
  }

  const guestHullPyById =
    hullRowsForPy.length > 0
      ? await boatEffectivePyByIdMap(supabase, ctx, hullRowsForPy)
      : new Map<string, number | null>();

  const adhocClassLabelByKey = new Map<string, string>();
  const adhocPyByGuestEntryId = new Map<string, number | null>();
  if (stagedAdhoc.length) {
    const classKeys = [...new Set(stagedAdhoc.map((s) => s.classKey))];
    const { data: classRows } = await supabase
      .from("boat_classes")
      .select("class_key, display_name")
      .in("class_key", classKeys);
    for (const cr of classRows ?? []) {
      adhocClassLabelByKey.set(cr.class_key, cr.display_name ?? cr.class_key);
    }
    const adhocPyMap = await boatEffectivePyByIdMap(
      supabase,
      ctx,
      stagedAdhoc.map((s) => ({
        id: s.guestEntryId,
        class_name: null,
        py_rating: null,
        rya_class_key: s.classKey,
      })),
    );
    for (const s of stagedAdhoc) {
      adhocPyByGuestEntryId.set(s.guestEntryId, adhocPyMap.get(s.guestEntryId) ?? null);
    }
  }

  const permanentBoatIds = [
    ...new Set(staged.map((s) => s.gb.linked_boat_id).filter(Boolean) as string[]),
  ];
  const permLabelById = new Map<string, string>();
  if (permanentBoatIds.length) {
    const { data: lbs } = await supabase.from("boats").select("id, label").in("id", permanentBoatIds);
    for (const b of lbs ?? []) permLabelById.set(b.id, b.label);
  }

  const appendixDisplayByEntryId = new Map<string, GuestAppendixDisplay>();
  const inputs: RaceEntryScoringInput[] = [];
  const guestUserSeen = new Set<string>();

  for (const s of staged) {
    if (normalEntryUserIds.has(s.linkedUserId)) continue;
    if (guestUserSeen.has(s.linkedUserId)) continue;
    guestUserSeen.add(s.linkedUserId);

    const entryKey = `guest:${s.guestEntryId}`;
    const boatPy = s.gb.linked_boat_id
      ? (boatPyById.get(s.gb.linked_boat_id) ?? null)
      : (guestHullPyById.get(s.gb.id) ?? null);

    const sailDisp =
      (s.sailOverride?.trim() || s.gb.default_sail_number?.trim() || "").trim() || "—";
    const boatLbl = s.gb.linked_boat_id
      ? permLabelById.get(s.gb.linked_boat_id) ?? s.gb.label.trim()
      : s.gb.label.trim();

    appendixDisplayByEntryId.set(entryKey, {
      boatLabel: boatLbl || "—",
      sailDisplay: sailDisp,
      outcomeDisplay: s.officialFinish ? "finished" : "pending",
      fleetLabel: "Guest",
    });

    const fleetMs = s.fleetId ? startByFleetId.get(s.fleetId) : null;
    const entryStart =
      fleetMs != null && Number.isFinite(fleetMs) ? fleetMs : raceDefaultStartMs;

    inputs.push({
      entryId: entryKey,
      userId: s.linkedUserId,
      fleetId: s.fleetId,
      outcome: s.officialFinish || (scoringMode === "positional" && s.finishPosition != null) ? "finished" : null,
      startedMarkedAt: s.started,
      startSignalMs: entryStart,
      boatPy,
      pyOverride: null,
      officialFinishAt: s.officialFinish,
      finishPosition: s.finishPosition,
      storedElapsedSeconds: s.officialFinish ? s.storedElapsedSeconds : undefined,
      storedCorrectedSeconds: s.officialFinish ? s.storedCorrectedSeconds : undefined,
    });
  }

  for (const s of stagedAdhoc) {
    const entryKey = `guest:${s.guestEntryId}`;
    const scoringUserId = raceOnlyAdhocScoringUserId(s.guestEntryId);
    const boatType =
      (adhocClassLabelByKey.get(s.classKey) ?? s.classKey).trim() || "—";
    const sailDisp = s.sailNumber.trim() || "—";

    appendixDisplayByEntryId.set(entryKey, {
      boatLabel: boatType,
      sailDisplay: sailDisp,
      outcomeDisplay: s.officialFinish ? "finished" : "pending",
      fleetLabel: "Race only",
      isRaceOnlyAdhoc: true,
    });

    const fleetMs = s.fleetId ? startByFleetId.get(s.fleetId) : null;
    const entryStart =
      fleetMs != null && Number.isFinite(fleetMs) ? fleetMs : raceDefaultStartMs;

    inputs.push({
      entryId: entryKey,
      userId: scoringUserId,
      fleetId: s.fleetId,
      outcome: s.officialFinish || (scoringMode === "positional" && s.finishPosition != null) ? "finished" : null,
      startedMarkedAt: s.started,
      startSignalMs: entryStart,
      boatPy: adhocPyByGuestEntryId.get(s.guestEntryId) ?? null,
      pyOverride: null,
      officialFinishAt: s.officialFinish,
      finishPosition: s.finishPosition,
      storedElapsedSeconds: s.officialFinish ? s.storedElapsedSeconds : undefined,
      storedCorrectedSeconds: s.officialFinish ? s.storedCorrectedSeconds : undefined,
    });
  }

  return { inputs, appendixDisplayByEntryId };
}
