"use server";

import { recordRaceCalendarTombstones } from "@/lib/calendar-event-tombstone";
import { selectGroupIanaTimeZone } from "@/lib/club-time-server";
import { zonedDatetimeLocalToUtcIso } from "@/lib/club-time";
import { RACE_START_TIME_LOCKED_MESSAGE, sameScheduledInstant } from "@/lib/race-start-time-locked";
import { computeReplanSyncPlan } from "@/lib/series-replan-sync";
import { raceIdsWithRecordedFinishes } from "@/lib/series-recorded-results";
import { generateRaceScheduleUtc } from "@/lib/series-schedule-gen";
import type { ParsedApplicableFleetRow } from "@/lib/seed-race-fleets-from-group";
import { applyPrimaryRaceScheduledStart } from "@/lib/sync-race-fleet-start";
import { getServerAuth } from "@/lib/supabase/auth-cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  type ScheduleGenerationMode,
  normalizeScheduleGenerationMode,
} from "@/lib/schedule-generation-mode";
import { normalizeRaceType, parsePursuitStartIncrementSeconds, type RaceType } from "@/lib/race-type";
import { raceDayAtTemplateWallTime } from "@/lib/pursuit-race-day-times";

function parseScheduleGenerationModeFromForm(formData: FormData): ScheduleGenerationMode {
  return normalizeScheduleGenerationMode(String(formData.get("schedule_generation_mode") ?? ""));
}

type SeriesRaceGenRow = {
  id: string;
  group_id: string;
  name: string;
  starts_on: string | null;
  ends_on: string | null;
  race_periodicity: string | null;
  races_per_period: number | null;
  minutes_between_races: number | null;
  schedule_first_start_at: string | null;
  schedule_template_fleets: unknown;
  schedule_generation_mode?: string | null;
  default_race_type?: string | null;
  pursuit_template_fleet_id?: string | null;
  pursuit_template_finish_at?: string | null;
  pursuit_template_start_increment_seconds?: number | null;
};

type LoadedRaceGeneration =
  | { ok: false; error: string; groupId: string; seriesId: string }
  | {
      ok: true;
      supabase: SupabaseClient;
      groupId: string;
      seriesId: string;
      series: SeriesRaceGenRow;
      fleetSelection: ParsedApplicableFleetRow[];
      genMode: ScheduleGenerationMode;
    };

async function loadRaceGenerationContext(formData: FormData): Promise<LoadedRaceGeneration> {
  const groupId = String(formData.get("group_id") ?? "").trim();
  const seriesId = String(formData.get("series_id") ?? "").trim();

  if (!groupId || !seriesId) {
    return { ok: false, error: "Missing series context.", groupId, seriesId };
  }

  const { supabase, user } = await getServerAuth();
  if (!user) {
    return { ok: false, error: "You must be signed in.", groupId, seriesId };
  }

  const { data: membership } = await supabase
    .from("group_memberships")
    .select("role")
    .eq("group_id", groupId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (membership?.role !== "club_admin") {
    return { ok: false, error: "Only club admins can generate races.", groupId, seriesId };
  }

  const { data: series, error: sErr } = await supabase
    .from("series")
    .select(
      "id, group_id, name, starts_on, ends_on, race_periodicity, races_per_period, minutes_between_races, schedule_first_start_at, schedule_template_fleets, schedule_generation_mode, default_race_type, pursuit_template_fleet_id, pursuit_template_finish_at, pursuit_template_start_increment_seconds",
    )
    .eq("id", seriesId)
    .maybeSingle();

  if (sErr || !series || series.group_id !== groupId) {
    return { ok: false, error: "Series not found.", groupId, seriesId };
  }

  const seriesRow = series as SeriesRaceGenRow;
  const formRaceType = normalizeRaceType(String(formData.get("default_race_type") ?? ""));
  const effectiveRaceType = normalizeRaceType(formRaceType || seriesRow.default_race_type);

  const { parseApplicableGroupFleetsFromForm } = await import("@/lib/seed-race-fleets-from-group");
  const { scheduleTemplateFleetsFromJson } = await import("@/lib/schedule-template-fleets");

  let fleetSelection: ParsedApplicableFleetRow[] | null = null;

  if (effectiveRaceType === "pursuit") {
    const pursuitFleetId = String(
      formData.get("pursuit_template_fleet_id") ?? seriesRow.pursuit_template_fleet_id ?? "",
    ).trim();
    if (!pursuitFleetId) {
      return {
        ok: false,
        error: "Select a pursuit fleet and save the generator before creating pursuit races.",
        groupId,
        seriesId,
      };
    }
    if (!seriesRow.pursuit_template_finish_at) {
      return {
        ok: false,
        error: "Set pursuit finish time and save the generator before creating pursuit races.",
        groupId,
        seriesId,
      };
    }
    if (!parsePursuitStartIncrementSeconds(seriesRow.pursuit_template_start_increment_seconds)) {
      return {
        ok: false,
        error: "Set pursuit start interval and save the generator before creating pursuit races.",
        groupId,
        seriesId,
      };
    }
    fleetSelection = [{ groupFleetId: pursuitFleetId, startOffsetMinutes: 0 }];
  } else {
    const fleetParse = parseApplicableGroupFleetsFromForm(formData);
    fleetSelection =
      "error" in fleetParse
        ? scheduleTemplateFleetsFromJson(seriesRow.schedule_template_fleets)
        : fleetParse;

    if (!fleetSelection) {
      const msg =
        "error" in fleetParse
          ? fleetParse.error
          : "Save applicable fleets on the template first, or select at least one fleet before generating.";
      return { ok: false, error: msg, groupId, seriesId };
    }
  }

  const genMode = normalizeScheduleGenerationMode(seriesRow.schedule_generation_mode);

  return {
    ok: true,
    supabase,
    groupId,
    seriesId,
    series: seriesRow,
    fleetSelection,
    genMode,
  };
}

export type RaceGenerationIntent = "replan_all" | "add_races";

export type PreviewGenerateSeriesRacesResult =
  | {
      ok: true;
      mode: ScheduleGenerationMode;
      intent: RaceGenerationIntent;
      /** Current count of races that are not results-final (for totals on “add”). */
      unpublishedNotFinalCount: number;
      /** For replan: same as count removed; for add: 0 (display-only). */
      unpublishedRemoved: number;
      /** For replan: existing unpublished rows matched to a planned slot (reused). */
      racesReused: number;
      /** For replan: matched rows that keep their start time (recorded finishes). */
      startTimeLockedCount: number;
      finalKept: number;
      racesToCreate: number;
      skippedDuplicateSlots: number;
      plannedSlotCount: number;
    }
  | { ok: false; error: string };

function parseRaceGenerationIntent(formData: FormData): RaceGenerationIntent {
  return String(formData.get("race_generation_intent") ?? "").trim() === "add_races"
    ? "add_races"
    : "replan_all";
}

/** Treat starts as duplicates if within this window (timestamptz rounding / UI noise). */
const SCHEDULE_DEDUP_MS = 45_000;

function resolvePlannedRaceDates(
  series: SeriesRaceGenRow,
  genMode: ScheduleGenerationMode,
): { ok: true; dates: Date[] } | { ok: false; error: string } {
  if (!series.schedule_first_start_at) {
    return {
      ok: false,
      error: "Set first start time and save the generator before creating races.",
    };
  }
  const anchorMs = new Date(series.schedule_first_start_at).getTime();
  if (!Number.isFinite(anchorMs)) {
    return { ok: false, error: "Invalid schedule first start — save the generator again." };
  }

  if (genMode === "single_day") {
    if (!series.starts_on) {
      return {
        ok: false,
        error: "Set season start / race date and save the generator before creating races.",
      };
    }
    const rp = series.races_per_period ?? 1;
    if (rp > 1) {
      if (series.minutes_between_races == null || series.minutes_between_races < 1) {
        return {
          ok: false,
          error:
            "For more than one race on the same day, set minutes between races and save the generator.",
        };
      }
    }
    const dates = generateRaceScheduleUtc({
      startsOnYmd: series.starts_on,
      endsOnYmd: series.starts_on,
      scheduleFirstStartAtMs: anchorMs,
      periodicity: "daily",
      racesPerPeriod: rp,
      minutesBetweenRaces: series.minutes_between_races,
    });
    if (!dates.length) {
      return { ok: false, error: "No races could be planned for that day — check times and settings." };
    }
    return { ok: true, dates };
  }

  if (
    !series.starts_on ||
    !series.ends_on ||
    !series.race_periodicity ||
    !series.races_per_period ||
    !isPeriod(series.race_periodicity)
  ) {
    return {
      ok: false,
      error:
        "Set season dates, periodicity, races per period, and first race start — then save the generator.",
    };
  }
  if (series.races_per_period > 1) {
    if (series.minutes_between_races == null || series.minutes_between_races < 1) {
      return {
        ok: false,
        error:
          "For more than one race per race day, set minutes between races and save the generator.",
      };
    }
  }

  const dates = generateRaceScheduleUtc({
    startsOnYmd: series.starts_on,
    endsOnYmd: series.ends_on,
    scheduleFirstStartAtMs: anchorMs,
    periodicity: series.race_periodicity,
    racesPerPeriod: series.races_per_period,
    minutesBetweenRaces: series.minutes_between_races,
  });
  if (!dates.length) {
    return { ok: false, error: "No races fit the season window — check dates and times." };
  }
  return { ok: true, dates };
}

function filterNovelScheduledDates(planned: Date[], existingStartMs: number[]): Date[] {
  return planned.filter(
    (d) => !existingStartMs.some((e) => Math.abs(e - d.getTime()) < SCHEDULE_DEDUP_MS),
  );
}

/** Preview counts for Create races — same validation as generate actions without mutating. */
export async function previewGenerateSeriesRacesAction(
  formData: FormData,
): Promise<PreviewGenerateSeriesRacesResult> {
  const ctx = await loadRaceGenerationContext(formData);
  if (!ctx.ok) {
    return { ok: false, error: ctx.error };
  }

  const intent = parseRaceGenerationIntent(formData);
  const { supabase, seriesId, series, genMode } = ctx;

  const { count: unpublishedRaw } = await supabase
    .from("races")
    .select("id", { count: "exact", head: true })
    .eq("series_id", seriesId)
    .eq("results_final", false);

  const { count: finalRaw } = await supabase
    .from("races")
    .select("id", { count: "exact", head: true })
    .eq("series_id", seriesId)
    .eq("results_final", true);

  const unpublishedNotFinal = unpublishedRaw ?? 0;
  const finalKept = finalRaw ?? 0;

  const planned = resolvePlannedRaceDates(series, genMode);
  if (!planned.ok) {
    return { ok: false, error: planned.error };
  }

  const plannedSlotCount = planned.dates.length;

  if (intent === "replan_all") {
    const { data: existingUnpublishedRows } = await supabase
      .from("races")
      .select("id, name, scheduled_at")
      .eq("series_id", seriesId)
      .eq("results_final", false);

    const existingUnpublished = existingUnpublishedRows ?? [];
    const finLock = await raceIdsWithRecordedFinishes(
      supabase,
      existingUnpublished.map((r) => r.id),
    );
    if (finLock.error) {
      return { ok: false, error: finLock.error };
    }

    const plan = computeReplanSyncPlan(planned.dates, existingUnpublished, {
      lockedStartTimeRaceIds: finLock.raceIds,
    });

    return {
      ok: true,
      mode: genMode,
      intent: "replan_all",
      unpublishedNotFinalCount: unpublishedNotFinal,
      unpublishedRemoved: plan.toRemove.length,
      racesReused: plan.matchedCount,
      startTimeLockedCount: plan.startTimeLockedCount,
      finalKept,
      racesToCreate: plan.toInsert.length,
      skippedDuplicateSlots: 0,
      plannedSlotCount,
    };
  }

  const { data: existingRows } = await supabase
    .from("races")
    .select("scheduled_at")
    .eq("series_id", seriesId);

  const existingStartMs = (existingRows ?? []).map((r) => new Date(r.scheduled_at).getTime());
  const novel = filterNovelScheduledDates(planned.dates, existingStartMs);

  if (novel.length === 0) {
    return {
      ok: false,
      error:
        "No new races to add — every planned start time from the generator already exists on this series.",
    };
  }

  return {
    ok: true,
    mode: genMode,
    intent: "add_races",
    unpublishedNotFinalCount: unpublishedNotFinal,
    unpublishedRemoved: 0,
    racesReused: 0,
    startTimeLockedCount: 0,
    finalKept,
    racesToCreate: novel.length,
    skippedDuplicateSlots: plannedSlotCount - novel.length,
    plannedSlotCount,
  };
}

const SEQUENCE_LIST = ["10_5_1_go", "5_4_1_go", "3_2_1_go"] as const;
const PERIOD_LIST = ["daily", "weekly", "monthly"] as const;

function parseOptionalPostgresDate(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return s;
}

function isSequence(v: string): v is (typeof SEQUENCE_LIST)[number] {
  return (SEQUENCE_LIST as readonly string[]).includes(v);
}
function isPeriod(v: string): v is (typeof PERIOD_LIST)[number] {
  return (PERIOD_LIST as readonly string[]).includes(v);
}

export async function updateSeriesScheduleAction(formData: FormData) {
  const groupId = String(formData.get("group_id") ?? "").trim();
  const seriesId = String(formData.get("series_id") ?? "").trim();
  const urlError = (msg: string) =>
    `/groups/${groupId}/series/${seriesId}?error=` + encodeURIComponent(msg);

  if (!groupId || !seriesId) {
    redirect("/groups?error=" + encodeURIComponent("Missing series context."));
  }

  const { supabase, user } = await getServerAuth();
  if (!user) redirect("/login");

  const { data: membership } = await supabase
    .from("group_memberships")
    .select("role")
    .eq("group_id", groupId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (membership?.role !== "club_admin") {
    redirect(`/groups/${groupId}?error=` + encodeURIComponent("Only club admins can edit series schedule."));
  }

  const start_sequence = String(formData.get("start_sequence") ?? "").trim();
  const schedule_generation_mode = parseScheduleGenerationModeFromForm(formData);

  let starts_on = parseOptionalPostgresDate(String(formData.get("starts_on") ?? ""));
  let ends_on = parseOptionalPostgresDate(String(formData.get("ends_on") ?? ""));
  if (schedule_generation_mode === "single_day") {
    ends_on = starts_on;
  } else if ((starts_on && !ends_on) || (!starts_on && ends_on)) {
    redirect(urlError("Season start and season end must both be set, or both left blank."));
  } else if (starts_on && ends_on && starts_on > ends_on) {
    redirect(urlError("Season start must be on or before season end."));
  }

  const schedule_first_start_time = String(formData.get("schedule_first_start_time") ?? "").trim();

  if (!isSequence(start_sequence)) {
    redirect(urlError("Invalid start sequence."));
  }

  let race_periodicityOut: string | null = null;
  let races_per_period: number | null = null;
  let minutes_between_races: number | null = null;

  if (schedule_generation_mode === "single_day") {
    race_periodicityOut = null;

    const races_per_period_raw = String(formData.get("races_per_period") ?? "").trim();
    races_per_period =
      races_per_period_raw.length > 0 ? parseInt(races_per_period_raw, 10) : null;
    if (races_per_period != null && (!Number.isFinite(races_per_period) || races_per_period < 1)) {
      races_per_period = null;
    }
    if (races_per_period != null) races_per_period = Math.min(20, races_per_period);

    const minutes_between_races_raw = String(formData.get("minutes_between_races") ?? "").trim();
    minutes_between_races =
      minutes_between_races_raw.length > 0 ? parseInt(minutes_between_races_raw, 10) : null;
    if (
      minutes_between_races != null &&
      (!Number.isFinite(minutes_between_races) || minutes_between_races < 1)
    ) {
      minutes_between_races = null;
    }
  } else if (schedule_generation_mode === "date_range") {
    const race_periodicity = String(formData.get("race_periodicity") ?? "").trim();
    race_periodicityOut = race_periodicity || null;
    if (race_periodicityOut && !isPeriod(race_periodicityOut)) {
      race_periodicityOut = null;
    }

    const races_per_period_raw = String(formData.get("races_per_period") ?? "").trim();
    races_per_period =
      races_per_period_raw.length > 0 ? parseInt(races_per_period_raw, 10) : null;
    if (races_per_period != null && (!Number.isFinite(races_per_period) || races_per_period < 1)) {
      races_per_period = null;
    }
    if (races_per_period != null) races_per_period = Math.min(20, races_per_period);

    const minutes_between_races_raw = String(formData.get("minutes_between_races") ?? "").trim();
    minutes_between_races =
      minutes_between_races_raw.length > 0 ? parseInt(minutes_between_races_raw, 10) : null;
    if (
      minutes_between_races != null &&
      (!Number.isFinite(minutes_between_races) || minutes_between_races < 1)
    ) {
      minutes_between_races = null;
    }
  }

  let schedule_first_start_at: string | null = null;
  if (schedule_first_start_time.length > 0) {
    if (!starts_on) {
      redirect(
        urlError(
          schedule_generation_mode === "single_day"
            ? "Set a race date when you set a first start time."
            : "Set season start when you set a first start time.",
        ),
      );
    }
    const tz = await selectGroupIanaTimeZone(supabase, groupId);
    const localStr = `${starts_on}T${schedule_first_start_time}`;
    schedule_first_start_at = zonedDatetimeLocalToUtcIso(localStr, tz);
    if (!schedule_first_start_at) {
      redirect(
        urlError(
          "First start time is invalid or falls in a non-existent local clock-change window — adjust the time.",
        ),
      );
    }
  }

  const { data: gfRows } = await supabase.from("group_fleets").select("id").eq("group_id", groupId).limit(1);
  const clubHasFleets = (gfRows ?? []).length > 0;

  const defaultRaceType = normalizeRaceType(String(formData.get("default_race_type") ?? "handicap"));
  const pursuitTemplateFleetId =
    defaultRaceType === "pursuit"
      ? String(formData.get("pursuit_template_fleet_id") ?? "").trim() || null
      : null;

  if (defaultRaceType === "pursuit" && !pursuitTemplateFleetId) {
    redirect(urlError("Select a pursuit fleet."));
  }
  if (defaultRaceType === "pursuit" && !clubHasFleets) {
    redirect(urlError("Define at least one club fleet before saving a pursuit generator."));
  }

  const { parseApplicableGroupFleetsFromForm } = await import("@/lib/seed-race-fleets-from-group");
  const { scheduleTemplateFleetsToJson } = await import("@/lib/schedule-template-fleets");

  /** When present, fleets on races without results-final and without recorded finishes are replaced after saving the template. */
  let templateFleetSelection: ParsedApplicableFleetRow[] | null = null;

  let schedule_template_fleets: ReturnType<typeof scheduleTemplateFleetsToJson> | null = null;

  if (defaultRaceType === "pursuit") {
    if (pursuitTemplateFleetId) {
      templateFleetSelection = [{ groupFleetId: pursuitTemplateFleetId, startOffsetMinutes: 0 }];
    }
    schedule_template_fleets = null;
  } else if (clubHasFleets) {
    const fleetParse = parseApplicableGroupFleetsFromForm(formData);
    if ("error" in fleetParse) {
      redirect(urlError(fleetParse.error));
    }
    schedule_template_fleets = scheduleTemplateFleetsToJson(fleetParse);
    templateFleetSelection = fleetParse;
  }

  const pursuit_finish_time = String(formData.get("pursuit_finish_time") ?? "").trim();
  let pursuit_template_finish_at: string | null = null;
  let pursuit_template_start_increment_seconds: number | null = null;

  if (defaultRaceType === "pursuit") {
    if (!starts_on) {
      redirect(
        urlError(
          schedule_generation_mode === "single_day"
            ? "Set a race date when you set pursuit finish time."
            : "Set season start when you set pursuit finish time.",
        ),
      );
    }
    if (!pursuit_finish_time) {
      redirect(urlError("Set pursuit finish time."));
    }
    const increment = parsePursuitStartIncrementSeconds(
      String(formData.get("pursuit_template_start_increment_seconds") ?? ""),
    );
    if (!increment) {
      redirect(urlError("Select a pursuit start interval (30 seconds, 1 minute, or 2 minutes)."));
    }
    pursuit_template_start_increment_seconds = increment;
    const tz = await selectGroupIanaTimeZone(supabase, groupId);
    pursuit_template_finish_at = zonedDatetimeLocalToUtcIso(`${starts_on}T${pursuit_finish_time}`, tz);
    if (!pursuit_template_finish_at) {
      redirect(urlError("Pursuit finish time is invalid for the club time zone."));
    }
    if (schedule_first_start_at) {
      const finishMs = new Date(pursuit_template_finish_at).getTime();
      const startMs = new Date(schedule_first_start_at).getTime();
      if (!Number.isFinite(finishMs) || !Number.isFinite(startMs) || finishMs <= startMs) {
        redirect(urlError("Pursuit finish time must be after first boat start on the template date."));
      }
    }
  }

  const { data: existing } = await supabase
    .from("series")
    .select("id, group_id")
    .eq("id", seriesId)
    .maybeSingle();

  if (!existing || existing.group_id !== groupId) {
    redirect(urlError("Series not found."));
  }

  const { error } = await supabase
    .from("series")
    .update({
      schedule_generation_mode,
      starts_on,
      ends_on,
      start_sequence,
      race_periodicity: race_periodicityOut,
      races_per_period: races_per_period,
      minutes_between_races:
        races_per_period != null && races_per_period > 1 ? minutes_between_races : null,
      schedule_first_start_at,
      tally_open_hours_before_fleet_start: null,
      tally_close_hours_after_fleet_start: null,
      schedule_template_fleets,
      default_race_type: defaultRaceType,
      pursuit_template_fleet_id: pursuitTemplateFleetId,
      pursuit_template_finish_at: defaultRaceType === "pursuit" ? pursuit_template_finish_at : null,
      pursuit_template_start_increment_seconds:
        defaultRaceType === "pursuit" ? pursuit_template_start_increment_seconds : null,
    })
    .eq("id", seriesId)
    .eq("group_id", groupId);

  if (error) {
    redirect(urlError(error.message));
  }

  if (templateFleetSelection?.length) {
    const { reseedRaceFleetsFromSeriesTemplateForNonFinalRaces } =
      await import("@/lib/reseed-series-race-fleets");
    const res = await reseedRaceFleetsFromSeriesTemplateForNonFinalRaces(supabase, {
      groupId,
      seriesId,
      fleetSelection: templateFleetSelection,
    });
    if (res.error) {
      redirect(urlError(res.error));
    }
    const qp = new URLSearchParams({
      schedule_saved: "1",
      fleets_updated: String(res.updatedRaces),
      fleets_skipped: String(res.skippedProtected),
    });
    redirect(`/groups/${groupId}/series/${seriesId}?${qp.toString()}`);
  }

  redirect(`/groups/${groupId}/series/${seriesId}?schedule_saved=1`);
}

function resolveRaceGenerationParams(
  series: SeriesRaceGenRow,
  fleetSelection: ParsedApplicableFleetRow[],
  seriesUrlErr: (msg: string) => string,
): {
  raceType: RaceType;
  pursuitFleetId: string | null;
  effectiveFleetSelection: ParsedApplicableFleetRow[];
} {
  const raceType = normalizeRaceType(series.default_race_type);
  if (raceType === "pursuit") {
    const pursuitFleetId = String(series.pursuit_template_fleet_id ?? "").trim();
    if (!pursuitFleetId) {
      redirect(
        seriesUrlErr("Select a pursuit fleet on the generator and save before creating pursuit races."),
      );
    }
    return {
      raceType,
      pursuitFleetId,
      effectiveFleetSelection: [{ groupFleetId: pursuitFleetId, startOffsetMinutes: 0 }],
    };
  }
  return { raceType, pursuitFleetId: null, effectiveFleetSelection: fleetSelection };
}

function buildRaceScheduleFields(
  row: { name: string; scheduled_at: string },
  opts: {
    seriesId: string;
    raceType: RaceType;
    pursuitFleetId: string | null;
    scheduleFirstStartAt: string | null;
    pursuitTemplateFinishAt: string | null;
    pursuitTemplateStartIncrementSeconds: number | null;
    clubTz: string;
  },
) {
  const base = {
    series_id: opts.seriesId,
    name: row.name,
    scheduled_at: row.scheduled_at,
    race_type: opts.raceType,
  };
  if (opts.raceType !== "pursuit" || !opts.pursuitFleetId) {
    return base;
  }
  const pursuit_first_start_at =
    opts.scheduleFirstStartAt != null
      ? raceDayAtTemplateWallTime(row.scheduled_at, opts.scheduleFirstStartAt, opts.clubTz) ??
        row.scheduled_at
      : row.scheduled_at;
  const pursuit_finish_at =
    opts.pursuitTemplateFinishAt != null
      ? raceDayAtTemplateWallTime(row.scheduled_at, opts.pursuitTemplateFinishAt, opts.clubTz)
      : null;
  return {
    ...base,
    pursuit_group_fleet_id: opts.pursuitFleetId,
    pursuit_first_start_at,
    pursuit_finish_at,
    pursuit_start_increment_seconds: opts.pursuitTemplateStartIncrementSeconds ?? 60,
  };
}

async function executeReplanSync(
  supabase: SupabaseClient,
  opts: {
    groupId: string;
    seriesId: string;
    series: SeriesRaceGenRow;
    plannedDates: Date[];
    fleetSelection: ParsedApplicableFleetRow[];
    genParams: ReturnType<typeof resolveRaceGenerationParams>;
    clubTz: string;
    seriesUrlErr: (msg: string) => string;
  },
): Promise<void> {
  const { groupId, seriesId, series, plannedDates, genParams, clubTz, seriesUrlErr } = opts;
  const sortedPlanned = [...plannedDates].sort((a, b) => a.getTime() - b.getTime());

  const { data: existingUnpublished, error: loadErr } = await supabase
    .from("races")
    .select("id, name, scheduled_at")
    .eq("series_id", seriesId)
    .eq("results_final", false);

  if (loadErr) {
    redirect(seriesUrlErr(loadErr.message));
  }

  const existingRows = existingUnpublished ?? [];
  const { raceIds: lockedStartIds, error: finErr } = await raceIdsWithRecordedFinishes(
    supabase,
    existingRows.map((r) => r.id),
  );
  if (finErr) {
    redirect(seriesUrlErr(finErr));
  }

  const plan = computeReplanSyncPlan(sortedPlanned, existingRows, {
    lockedStartTimeRaceIds: lockedStartIds,
  });
  const scheduleFieldOpts = {
    seriesId,
    raceType: genParams.raceType,
    pursuitFleetId: genParams.pursuitFleetId,
    scheduleFirstStartAt: series.schedule_first_start_at,
    pursuitTemplateFinishAt: series.pursuit_template_finish_at ?? null,
    pursuitTemplateStartIncrementSeconds: series.pursuit_template_start_increment_seconds ?? null,
    clubTz,
  };

  if (plan.toRemove.length > 0) {
    const tomb = await recordRaceCalendarTombstones(supabase, plan.toRemove, {
      groupId,
      seriesId,
      seriesName: series.name,
    });
    if (tomb.error) {
      redirect(seriesUrlErr(tomb.error));
    }

    const removeIds = plan.toRemove.map((r) => r.id);
    const { error: delErr } = await supabase.from("races").delete().in("id", removeIds);
    if (delErr) {
      redirect(seriesUrlErr(delErr.message));
    }
  }

  const previousScheduledById = new Map(existingRows.map((r) => [r.id, r.scheduled_at] as const));

  for (const upd of plan.toUpdate) {
    if (upd.startTimeLocked) {
      const { error: nameErr } = await supabase
        .from("races")
        .update({ name: upd.name })
        .eq("id", upd.id);
      if (nameErr) {
        redirect(seriesUrlErr(nameErr.message));
      }
      continue;
    }

    const patch = buildRaceScheduleFields(upd, scheduleFieldOpts);
    const { error: upErr } = await supabase.from("races").update(patch).eq("id", upd.id);
    if (upErr) {
      redirect(seriesUrlErr(upErr.message));
    }

    const prevScheduled = previousScheduledById.get(upd.id);
    if (prevScheduled && prevScheduled !== upd.scheduled_at) {
      const startSync = await applyPrimaryRaceScheduledStart(supabase, {
        raceId: upd.id,
        startAtIso: upd.scheduled_at,
      });
      if ("error" in startSync) {
        redirect(seriesUrlErr(startSync.error));
      }
    }
  }

  if (plan.toInsert.length > 0) {
    await insertRacesAndSeedFleets(supabase, {
      seriesId,
      groupId,
      fleetSelection: genParams.effectiveFleetSelection,
      races: plan.toInsert,
      raceType: genParams.raceType,
      pursuitFleetId: genParams.pursuitFleetId,
      scheduleFirstStartAt: series.schedule_first_start_at,
      pursuitTemplateFinishAt: series.pursuit_template_finish_at ?? null,
      pursuitTemplateStartIncrementSeconds: series.pursuit_template_start_increment_seconds ?? null,
      clubTz,
      seriesUrlErr,
    });
  }

  const { reseedRaceFleetsFromSeriesTemplateForNonFinalRaces } = await import(
    "@/lib/reseed-series-race-fleets"
  );
  const reseed = await reseedRaceFleetsFromSeriesTemplateForNonFinalRaces(supabase, {
    groupId,
    seriesId,
    fleetSelection: genParams.effectiveFleetSelection,
  });
  if (reseed.error) {
    redirect(seriesUrlErr(reseed.error));
  }
}

async function insertRacesAndSeedFleets(
  supabase: SupabaseClient,
  opts: {
    seriesId: string;
    groupId: string;
    fleetSelection: ParsedApplicableFleetRow[];
    races: { name: string; scheduled_at: string }[];
    raceType: RaceType;
    pursuitFleetId: string | null;
    scheduleFirstStartAt: string | null;
    pursuitTemplateFinishAt: string | null;
    pursuitTemplateStartIncrementSeconds: number | null;
    clubTz: string;
    seriesUrlErr: (msg: string) => string;
  },
): Promise<void> {
  const {
    seriesId,
    groupId,
    fleetSelection,
    races,
    raceType,
    pursuitFleetId,
    scheduleFirstStartAt,
    pursuitTemplateFinishAt,
    pursuitTemplateStartIncrementSeconds,
    clubTz,
    seriesUrlErr,
  } = opts;
  const { seedRaceFleetsFromGroupSelection } = await import("@/lib/seed-race-fleets-from-group");

  const rows = races.map((r) =>
    buildRaceScheduleFields(r, {
      seriesId,
      raceType,
      pursuitFleetId,
      scheduleFirstStartAt,
      pursuitTemplateFinishAt,
      pursuitTemplateStartIncrementSeconds,
      clubTz,
    }),
  );

  const { data: insertedRaces, error: insErr } = await supabase.from("races").insert(rows).select("id");
  if (insErr) {
    redirect(seriesUrlErr(insErr.message));
  }
  if (!insertedRaces?.length) {
    redirect(seriesUrlErr("Races could not be created."));
  }

  const newRaceIds = insertedRaces.map((r) => r.id);

  for (const r of insertedRaces) {
    const seeded = await seedRaceFleetsFromGroupSelection(supabase, r.id, groupId, fleetSelection);
    if (seeded.error) {
      if (newRaceIds.length > 0) {
        await supabase.from("races").delete().in("id", newRaceIds);
      }
      redirect(seriesUrlErr(`Generated races rolled back: ${seeded.error}`));
    }
  }
}

export async function generateSeriesRacesAction(formData: FormData) {
  const ctx = await loadRaceGenerationContext(formData);
  if (!ctx.ok) {
    if (ctx.error === "You must be signed in.") {
      redirect("/login");
    }
    if (!ctx.groupId || !ctx.seriesId) {
      redirect("/groups?error=" + encodeURIComponent(ctx.error));
    }
    redirect(
      `/groups/${ctx.groupId}/series/${ctx.seriesId}?error=` + encodeURIComponent(ctx.error),
    );
  }

  const { supabase, groupId, seriesId, series, fleetSelection, genMode } = ctx;
  const seriesUrlErr = (msg: string) =>
    `/groups/${groupId}/series/${seriesId}?error=` + encodeURIComponent(msg);
  const clubTz = await selectGroupIanaTimeZone(supabase, groupId);

  const intent = parseRaceGenerationIntent(formData);

  const planned = resolvePlannedRaceDates(series, genMode);
  if (!planned.ok) {
    redirect(seriesUrlErr(planned.error));
  }

  const sortedAll = [...planned.dates].sort((a, b) => a.getTime() - b.getTime());

  if (intent === "replan_all") {
    const genParams = resolveRaceGenerationParams(series, fleetSelection, seriesUrlErr);

    await executeReplanSync(supabase, {
      groupId,
      seriesId,
      series,
      plannedDates: sortedAll,
      fleetSelection,
      genParams,
      clubTz,
      seriesUrlErr,
    });

    redirect(`/groups/${groupId}/series/${seriesId}?generated=1`);
  }

  const { data: existingRows } = await supabase
    .from("races")
    .select("scheduled_at")
    .eq("series_id", seriesId);
  const existingStartMs = (existingRows ?? []).map((r) => new Date(r.scheduled_at).getTime());
  const novel = filterNovelScheduledDates(planned.dates, existingStartMs).sort(
    (a, b) => a.getTime() - b.getTime(),
  );

  if (novel.length === 0) {
    redirect(
      seriesUrlErr(
        "No new races to add — every planned start time from the generator already exists on this series.",
      ),
    );
  }

  const { count: existingCount } = await supabase
    .from("races")
    .select("id", { count: "exact", head: true })
    .eq("series_id", seriesId);
  const startN = existingCount ?? 0;

  const races = novel.map((d, i) => ({
    name: `Race ${startN + i + 1}`,
    scheduled_at: d.toISOString(),
  }));

  const genParams = resolveRaceGenerationParams(series, fleetSelection, seriesUrlErr);

  await insertRacesAndSeedFleets(supabase, {
    seriesId,
    groupId,
    fleetSelection: genParams.effectiveFleetSelection,
    races,
    raceType: genParams.raceType,
    pursuitFleetId: genParams.pursuitFleetId,
    scheduleFirstStartAt: series.schedule_first_start_at,
    pursuitTemplateFinishAt: series.pursuit_template_finish_at ?? null,
    pursuitTemplateStartIncrementSeconds: series.pursuit_template_start_increment_seconds ?? null,
    clubTz,
    seriesUrlErr,
  });

  redirect(`/groups/${groupId}/series/${seriesId}?generated=1`);
}

export async function updateRaceScheduledAtAction(formData: FormData) {
  const groupId = String(formData.get("group_id") ?? "").trim();
  const seriesId = String(formData.get("series_id") ?? "").trim();
  const raceId = String(formData.get("race_id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const scheduledRaw = String(formData.get("scheduled_at") ?? "").trim();

  const urlErr = (msg: string) =>
    `/groups/${groupId}/series/${seriesId}?error=` + encodeURIComponent(msg);

  if (!groupId || !seriesId || !raceId || !name) {
    redirect(urlErr("Race update: name and start time required."));
  }

  const { supabase, user } = await getServerAuth();
  if (!user) redirect("/login");

  const { data: membership } = await supabase
    .from("group_memberships")
    .select("role")
    .eq("group_id", groupId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (membership?.role !== "club_admin") {
    redirect(`/groups/${groupId}?error=` + encodeURIComponent("Only club admins can edit race starts."));
  }

  const tz = await selectGroupIanaTimeZone(supabase, groupId);
  const scheduled_at = zonedDatetimeLocalToUtcIso(scheduledRaw, tz);
  if (!scheduled_at) {
    redirect(
      urlErr(
        scheduledRaw.trim()
          ? "That local start time is invalid or falls in a non-existent clock-change window."
          : "Race update: name and start time required.",
      ),
    );
  }

  const { data: raceRow, error: raceLoadErr } = await supabase
    .from("races")
    .select("scheduled_at")
    .eq("id", raceId)
    .eq("series_id", seriesId)
    .maybeSingle();

  if (raceLoadErr || !raceRow) {
    redirect(urlErr(raceLoadErr?.message ?? "Race not found."));
  }

  const { raceIds: lockedStartIds, error: finErr } = await raceIdsWithRecordedFinishes(supabase, [raceId]);
  if (finErr) {
    redirect(urlErr(finErr));
  }

  const startTimeLocked = lockedStartIds.has(raceId);
  if (startTimeLocked && !sameScheduledInstant(raceRow.scheduled_at, scheduled_at)) {
    redirect(urlErr(RACE_START_TIME_LOCKED_MESSAGE));
  }

  const { error: nameErr } = await supabase
    .from("races")
    .update({ name })
    .eq("id", raceId)
    .eq("series_id", seriesId);

  if (nameErr) {
    redirect(urlErr(nameErr.message));
  }

  if (startTimeLocked) {
    revalidatePath(`/groups/${groupId}/series/${seriesId}/races/${raceId}/manage`);
    revalidatePath(`/groups/${groupId}/series/${seriesId}/races/${raceId}/finishes`);
    revalidatePath("/");
    redirect(`/groups/${groupId}/series/${seriesId}?race_updated=1`);
  }

  const startSync = await applyPrimaryRaceScheduledStart(supabase, {
    raceId,
    startAtIso: scheduled_at,
  });
  if ("error" in startSync) {
    redirect(urlErr(startSync.error));
  }

  revalidatePath(`/groups/${groupId}/series/${seriesId}/races/${raceId}/manage`);
  revalidatePath(`/groups/${groupId}/series/${seriesId}/races/${raceId}/finishes`);
  revalidatePath("/");

  redirect(`/groups/${groupId}/series/${seriesId}?race_updated=1`);
}

export async function deleteRaceAction(formData: FormData) {
  const groupId = String(formData.get("group_id") ?? "").trim();
  const seriesId = String(formData.get("series_id") ?? "").trim();
  const raceId = String(formData.get("race_id") ?? "").trim();

  if (!groupId || !seriesId || !raceId) {
    redirect("/groups?error=" + encodeURIComponent("Missing race."));
  }

  const { supabase, user } = await getServerAuth();
  if (!user) redirect("/login");

  const [{ data: race }, { data: series }] = await Promise.all([
    supabase
      .from("races")
      .select("id, name, scheduled_at, results_final")
      .eq("id", raceId)
      .eq("series_id", seriesId)
      .maybeSingle(),
    supabase.from("series").select("name").eq("id", seriesId).eq("group_id", groupId).maybeSingle(),
  ]);

  if (!race || !series) {
    redirect(
      `/groups/${groupId}/series/${seriesId}?error=` + encodeURIComponent("Race not found."),
    );
  }

  if (race.results_final) {
    redirect(
      `/groups/${groupId}/series/${seriesId}?error=` +
        encodeURIComponent("Cannot delete a results-final race."),
    );
  }

  const tomb = await recordRaceCalendarTombstones(supabase, [race], {
    groupId,
    seriesId,
    seriesName: series.name,
  });
  if (tomb.error) {
    redirect(
      `/groups/${groupId}/series/${seriesId}?error=` + encodeURIComponent(tomb.error),
    );
  }

  const { error } = await supabase.from("races").delete().eq("id", raceId).eq("series_id", seriesId);

  if (error) {
    redirect(
      `/groups/${groupId}/series/${seriesId}?error=` + encodeURIComponent(error.message),
    );
  }

  redirect(`/groups/${groupId}/series/${seriesId}?race_deleted=1`);
}
