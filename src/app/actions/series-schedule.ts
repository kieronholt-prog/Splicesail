"use server";

import { selectGroupIanaTimeZone, zonedDatetimeLocalToUtcIso } from "@/lib/club-time";
import { generateRaceScheduleUtc } from "@/lib/series-schedule-gen";
import type { ParsedApplicableFleetRow } from "@/lib/seed-race-fleets-from-group";
import { getServerAuth } from "@/lib/supabase/auth-cache";
import { redirect } from "next/navigation";

const SEQUENCE_LIST = ["10_5_1_go", "5_4_1_go", "3_2_1_go"] as const;
const PERIOD_LIST = ["daily", "weekly", "monthly"] as const;

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
  const race_periodicity = String(formData.get("race_periodicity") ?? "").trim();
  const races_per_period_raw = String(formData.get("races_per_period") ?? "").trim();
  const minutes_between_races_raw = String(formData.get("minutes_between_races") ?? "").trim();
  const schedule_first_start_raw = String(formData.get("schedule_first_start_at") ?? "").trim();

  if (!isSequence(start_sequence)) {
    redirect(urlError("Invalid start sequence."));
  }

  let race_periodicityOut: string | null = race_periodicity || null;
  if (race_periodicityOut && !isPeriod(race_periodicityOut)) {
    race_periodicityOut = null;
  }

  let races_per_period: number | null =
    races_per_period_raw.length > 0 ? parseInt(races_per_period_raw, 10) : null;
  if (races_per_period != null && (!Number.isFinite(races_per_period) || races_per_period < 1)) {
    races_per_period = null;
  }
  if (races_per_period != null) races_per_period = Math.min(20, races_per_period);

  let minutes_between_races: number | null =
    minutes_between_races_raw.length > 0 ? parseInt(minutes_between_races_raw, 10) : null;
  if (
    minutes_between_races != null &&
    (!Number.isFinite(minutes_between_races) || minutes_between_races < 1)
  ) {
    minutes_between_races = null;
  }

  let schedule_first_start_at: string | null = null;
  if (schedule_first_start_raw.length) {
    const tz = await selectGroupIanaTimeZone(supabase, groupId);
    schedule_first_start_at = zonedDatetimeLocalToUtcIso(schedule_first_start_raw, tz);
    if (!schedule_first_start_at) {
      redirect(urlError("First race start falls in a non-existent local time (clock change). Adjust the time."));
    }
  }

  const { data: gfRows } = await supabase.from("group_fleets").select("id").eq("group_id", groupId).limit(1);
  const clubHasFleets = (gfRows ?? []).length > 0;

  const { parseApplicableGroupFleetsFromForm } = await import("@/lib/seed-race-fleets-from-group");
  const { scheduleTemplateFleetsToJson } = await import("@/lib/schedule-template-fleets");

  /** When present, fleets on all non–results-final races are replaced after saving the template. */
  let templateFleetSelection: ParsedApplicableFleetRow[] | null = null;

  let schedule_template_fleets: ReturnType<typeof scheduleTemplateFleetsToJson> | null = null;
  if (clubHasFleets) {
    const fleetParse = parseApplicableGroupFleetsFromForm(formData);
    if ("error" in fleetParse) {
      redirect(urlError(fleetParse.error));
    }
    schedule_template_fleets = scheduleTemplateFleetsToJson(fleetParse);
    templateFleetSelection = fleetParse;
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
      start_sequence,
      race_periodicity: race_periodicityOut,
      races_per_period: races_per_period,
      minutes_between_races:
        races_per_period != null && races_per_period > 1 ? minutes_between_races : null,
      schedule_first_start_at,
      tally_open_hours_before_fleet_start: null,
      tally_close_hours_after_fleet_start: null,
      schedule_template_fleets,
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
      fleets_skipped_final: String(res.skippedFinal),
    });
    redirect(`/groups/${groupId}/series/${seriesId}?${qp.toString()}`);
  }

  redirect(`/groups/${groupId}/series/${seriesId}?schedule_saved=1`);
}

export async function generateSeriesRacesAction(formData: FormData) {
  const groupId = String(formData.get("group_id") ?? "").trim();
  const seriesId = String(formData.get("series_id") ?? "").trim();

  const seriesUrlErr = (msg: string) =>
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
    redirect(seriesUrlErr("Only club admins can generate races."));
  }

  const { data: series, error: sErr } = await supabase
    .from("series")
    .select(
      "id, group_id, name, starts_on, ends_on, race_periodicity, races_per_period, minutes_between_races, schedule_first_start_at, schedule_template_fleets",
    )
    .eq("id", seriesId)
    .maybeSingle();

  if (sErr || !series || series.group_id !== groupId) {
    redirect(seriesUrlErr("Series not found."));
  }

  const { parseApplicableGroupFleetsFromForm, seedRaceFleetsFromGroupSelection } =
    await import("@/lib/seed-race-fleets-from-group");
  const { scheduleTemplateFleetsFromJson } = await import("@/lib/schedule-template-fleets");

  const fleetParse = parseApplicableGroupFleetsFromForm(formData);
  const fleetSelection =
    "error" in fleetParse
      ? scheduleTemplateFleetsFromJson(series.schedule_template_fleets)
      : fleetParse;

  if (!fleetSelection) {
    const msg =
      "error" in fleetParse
        ? fleetParse.error
        : "Save applicable fleets on the template first, or select at least one fleet before generating.";
    redirect(seriesUrlErr(msg));
  }

  if (
    !series.starts_on ||
    !series.ends_on ||
    !series.schedule_first_start_at ||
    !series.race_periodicity ||
    !series.races_per_period
  ) {
    redirect(
      seriesUrlErr(
        "Set season dates, periodicity, races per period, and first race start before generating.",
      ),
    );
  }

  const anchorMs = new Date(series.schedule_first_start_at).getTime();
  if (!Number.isFinite(anchorMs)) {
    redirect(seriesUrlErr("Invalid schedule first start."));
  }

  /** Remove unpublished races before regenerating (avoids duplicates). */
  await supabase
    .from("races")
    .delete()
    .eq("series_id", seriesId)
    .eq("results_final", false);

  const dates = generateRaceScheduleUtc({
    startsOnYmd: series.starts_on,
    endsOnYmd: series.ends_on,
    scheduleFirstStartAtMs: anchorMs,
    periodicity: series.race_periodicity as "daily" | "weekly" | "monthly",
    racesPerPeriod: series.races_per_period,
    minutesBetweenRaces: series.minutes_between_races,
  });

  if (!dates.length) {
    redirect(seriesUrlErr("No races fit the season window — check dates and times."));
  }

  const rows = dates.map((d, i) => ({
    series_id: seriesId,
    name: `Race ${i + 1}`,
    scheduled_at: d.toISOString(),
  }));

  const { data: insertedRaces, error: insErr } = await supabase.from("races").insert(rows).select("id");
  if (insErr) {
    redirect(seriesUrlErr(insErr.message));
  }
  if (!insertedRaces?.length) {
    redirect(seriesUrlErr("Races could not be created."));
  }

  const newRaceIds = (insertedRaces ?? []).map((r) => r.id);

  for (const r of insertedRaces ?? []) {
    const seeded = await seedRaceFleetsFromGroupSelection(supabase, r.id, groupId, fleetSelection);
    if (seeded.error) {
      if (newRaceIds.length > 0) {
        await supabase.from("races").delete().in("id", newRaceIds);
      }
      redirect(seriesUrlErr(`Generated races rolled back: ${seeded.error}`));
    }
  }

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

  const { error } = await supabase
    .from("races")
    .update({ name, scheduled_at })
    .eq("id", raceId)
    .eq("series_id", seriesId);

  if (error) {
    redirect(urlErr(error.message));
  }

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
  const { data: race } = await supabase
    .from("races")
    .select("results_final")
    .eq("id", raceId)
    .eq("series_id", seriesId)
    .maybeSingle();

  if (race?.results_final) {
    redirect(
      `/groups/${groupId}/series/${seriesId}?error=` +
        encodeURIComponent("Cannot delete a results-final race."),
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
