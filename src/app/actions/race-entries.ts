"use server";

import { crewTemplateFromForm } from "@/lib/boat-crew";
import { fleetStartOffsetMinutesForRaceBoat } from "@/lib/race-boat-fleet-start-offset";
import { recomputeFleetIdForRaceEntry } from "@/lib/recompute-race-entry-fleet";
import { fleetStartUtcMs } from "@/lib/tally-window";
import { createClient } from "@/lib/supabase/server";
import { getServerAuth } from "@/lib/supabase/auth-cache";
import { boatLinkedToSeriesSignup } from "@/lib/series-registration-boats";
import {
  isRoOnlyFinishOutcome,
  isSailorDeclarationOutcome,
} from "@/lib/finish-outcome-labels";
import { redirect } from "next/navigation";

async function requireOwnRaceEntry(
  supabase: Awaited<ReturnType<typeof createClient>>,
  raceId: string,
  userId: string,
) {
  const { data: row } = await supabase
    .from("race_entries")
    .select("id")
    .eq("race_id", raceId)
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();

  if (!row) {
    redirect(
      `/?error=${encodeURIComponent("Tally afloat or ashore on Home first to create your race entry.")}`,
    );
  }
}

async function assertRaceInGroup(
  supabase: Awaited<ReturnType<typeof createClient>>,
  raceId: string,
  seriesId: string,
  groupId: string,
): Promise<boolean> {
  const { data: race } = await supabase
    .from("races")
    .select("id, series_id")
    .eq("id", raceId)
    .maybeSingle();

  if (!race || race.series_id !== seriesId) return false;

  const { data: series } = await supabase
    .from("series")
    .select("group_id")
    .eq("id", seriesId)
    .maybeSingle();

  return !!(series && series.group_id === groupId);
}

export async function tallyAfloatAction(formData: FormData) {
  await bumpTally(formData, "afloat");
}

export async function tallyAshoreAction(formData: FormData) {
  await bumpTally(formData, "ashore");
}

export async function undoTallyAfloatAction(formData: FormData) {
  const groupId = String(formData.get("group_id") ?? "").trim();
  const seriesId = String(formData.get("series_id") ?? "").trim();
  const raceId = String(formData.get("race_id") ?? "").trim();
  const boatIdForm = String(formData.get("boat_id") ?? "").trim();

  if (!groupId || !seriesId || !raceId || !boatIdForm) {
    redirect(`/?error=${encodeURIComponent("Missing race or hull — reload Home.")}`);
  }

  const { supabase, user } = await getServerAuth();

  if (!user) redirect("/login");

  if (!(await assertRaceInGroup(supabase, raceId, seriesId, groupId))) {
    redirect(`/?error=${encodeURIComponent("Race not in this series.")}`);
  }

  await requireOwnRaceEntry(supabase, raceId, user.id);

  const { data: entryRow } = await supabase
    .from("race_entries")
    .select("id, tally_afloat_at, tally_ashore_at, fleet_id, outcome")
    .eq("race_id", raceId)
    .eq("user_id", user.id)
    .eq("boat_id", boatIdForm)
    .maybeSingle();

  if (!entryRow?.tally_afloat_at) {
    redirect(`/?error=${encodeURIComponent("Nothing to undo for that hull.")}`);
  }
  if (entryRow.tally_ashore_at) {
    redirect(
      `/?error=${encodeURIComponent(
        "Tally afloat can't be undone after tally ashore has been recorded for that hull.",
      )}`,
    );
  }

  const { data: raceRow } = await supabase
    .from("races")
    .select("scheduled_at, series_id")
    .eq("id", raceId)
    .maybeSingle();

  if (!raceRow) {
    redirect(`/?error=${encodeURIComponent("Race not found.")}`);
  }

  const fleetOffsetMinutes = await tallyFleetOffsetMinutesForHull(supabase, raceId, {
    boatId: boatIdForm,
    fleetId: entryRow.fleet_id,
    ctx: { groupId, seriesId },
  });

  const fleetStartMs = fleetStartUtcMs(raceRow.scheduled_at, fleetOffsetMinutes);
  const nowMs = Date.now();
  if (nowMs >= fleetStartMs) {
    redirect(
      `/?error=${encodeURIComponent(
        "Undo tally afloat is only available before your fleet start.",
      )}`,
    );
  }

  const preserveOcs =
    entryRow.outcome != null && String(entryRow.outcome).toLowerCase() === "ocs";

  // Keep boat_id — null would violate race_entries_race_user_null_boat_uidx when a
  // placeholder row already exists for (race_id, user_id).
  const { error } = await supabase
    .from("race_entries")
    .update({
      tally_afloat_at: null,
      tally_ashore_at: null,
      outcome: preserveOcs ? "ocs" : null,
      fleet_id: null,
    })
    .eq("id", entryRow.id);

  if (error) {
    redirect(`/?error=${encodeURIComponent(error.message)}`);
  }

  redirect("/");
}

async function tallyFleetOffsetMinutesForHull(
  supabase: Awaited<ReturnType<typeof createClient>>,
  raceId: string,
  opts: {
    boatId: string;
    fleetId: string | null;
    ctx: { groupId: string; seriesId: string };
  },
): Promise<number> {
  if (opts.fleetId) {
    const { data: rf } = await supabase
      .from("race_fleets")
      .select("start_offset_minutes")
      .eq("id", opts.fleetId)
      .eq("race_id", raceId)
      .maybeSingle();
    return rf?.start_offset_minutes != null && Number.isFinite(Number(rf.start_offset_minutes))
      ? Number(rf.start_offset_minutes)
      : 0;
  }
  return fleetStartOffsetMinutesForRaceBoat(supabase, {
    raceId,
    boatId: opts.boatId,
    groupId: opts.ctx.groupId,
    seriesId: opts.ctx.seriesId,
  });
}

async function bumpTally(
  formData: FormData,
  which: "afloat" | "ashore",
) {
  const groupId = String(formData.get("group_id") ?? "").trim();
  const seriesId = String(formData.get("series_id") ?? "").trim();
  const raceId = String(formData.get("race_id") ?? "").trim();
  const boatIdForm = String(formData.get("boat_id") ?? "").trim();

  if (!groupId || !seriesId || !raceId) {
    redirect(`/?error=${encodeURIComponent("Missing race context.")}`);
  }

  if (!boatIdForm) {
    redirect(
      `/?error=${encodeURIComponent(
        which === "afloat"
          ? "Choose which hull you are tallying — one button per boat on Home."
          : "Missing hull on tally — reload Home and try again.",
      )}`,
    );
  }

  const { supabase, user } = await getServerAuth();

  if (!user) redirect("/login");

  if (!(await assertRaceInGroup(supabase, raceId, seriesId, groupId))) {
    redirect(`/?error=${encodeURIComponent("Race not in this series.")}`);
  }

  const outcomeRaw =
    which === "ashore" ? String(formData.get("outcome") ?? "").trim() : "";

  const { data: raceRow } = await supabase
    .from("races")
    .select("scheduled_at, series_id")
    .eq("id", raceId)
    .maybeSingle();

  if (!raceRow) {
    redirect(`/?error=${encodeURIComponent("Race not found.")}`);
  }

  const ctx = { groupId, seriesId };
  const { data: existingEntryForBoat } = await supabase
    .from("race_entries")
    .select("id, fleet_id, tally_afloat_at, tally_ashore_at, boat_id, outcome")
    .eq("race_id", raceId)
    .eq("user_id", user.id)
    .eq("boat_id", boatIdForm)
    .maybeSingle();

  const fleetOffsetMinutes = await tallyFleetOffsetMinutesForHull(supabase, raceId, {
    boatId: boatIdForm,
    fleetId: existingEntryForBoat?.fleet_id ?? null,
    ctx,
  });

  const fleetStartMs = fleetStartUtcMs(raceRow.scheduled_at, fleetOffsetMinutes);
  const nowMs = Date.now();

  if (which === "afloat") {
    if (nowMs >= fleetStartMs) {
      redirect(
        `/?error=${encodeURIComponent(
          "Tally afloat is only available until your fleet start (race signal plus fleet offset).",
        )}`,
      );
    }
  } else {
    if (nowMs < fleetStartMs) {
      redirect(
        `/?error=${encodeURIComponent(
          "Tally ashore and declaration open from your fleet start onward.",
        )}`,
      );
    }
  }

  if (which === "ashore") {
    if (!outcomeRaw.length) {
      redirect(`/?error=${encodeURIComponent("Choose a declaration.")}`);
    }

    const priorOutcome =
      existingEntryForBoat?.outcome != null
        ? String(existingEntryForBoat.outcome).toLowerCase()
        : null;
    const priorRoOutcome =
      priorOutcome && isRoOnlyFinishOutcome(priorOutcome) ? priorOutcome : null;

    if (priorRoOutcome) {
      if (outcomeRaw !== priorRoOutcome) {
        redirect(
          `/?error=${encodeURIComponent(
            `The race officer recorded ${priorRoOutcome.toUpperCase()} for this entry — tally ashore only to confirm.`,
          )}`,
        );
      }
    } else if (isRoOnlyFinishOutcome(outcomeRaw)) {
      redirect(
        `/?error=${encodeURIComponent(
          `${outcomeRaw.toUpperCase()} is recorded by the race officer — you cannot declare it yourself here.`,
        )}`,
      );
    } else if (!isSailorDeclarationOutcome(outcomeRaw)) {
      redirect(`/?error=${encodeURIComponent("Invalid finish status for tally ashore.")}`);
    }
  }

  const nowIso = new Date().toISOString();

  if (which === "afloat") {
    const linked = await boatLinkedToSeriesSignup(supabase, {
      seriesId,
      userId: user.id,
      boatId: boatIdForm,
    });
    if (!linked) {
      redirect(`/?error=${encodeURIComponent("That hull is not on your series signup for this fixture.")}`);
    }
    if (existingEntryForBoat?.tally_afloat_at) {
      redirect(
        `/?error=${encodeURIComponent("You have already tallied afloat for this hull — use undo on Home to change.")}`,
      );
    }

    if (!existingEntryForBoat) {
      const { error } = await supabase.from("race_entries").insert({
        race_id: raceId,
        user_id: user.id,
        boat_id: boatIdForm,
        tally_afloat_at: nowIso,
      });
      if (error) {
        redirect(`/?error=${encodeURIComponent(error.message)}`);
      }
    } else {
      const { error } = await supabase
        .from("race_entries")
        .update({ tally_afloat_at: nowIso })
        .eq("id", existingEntryForBoat.id);
      if (error) {
        redirect(`/?error=${encodeURIComponent(error.message)}`);
      }
    }

    await recomputeFleetIdForRaceEntry(supabase, ctx, raceId, user.id);
    redirect("/?afloat=1");
  }

  const linked = await boatLinkedToSeriesSignup(supabase, {
    seriesId,
    userId: user.id,
    boatId: boatIdForm,
  });
  if (!linked) {
    redirect(`/?error=${encodeURIComponent("That hull is not on your series signup for this fixture.")}`);
  }

  const basePatch = {
    tally_ashore_at: nowIso,
    outcome: outcomeRaw.length ? outcomeRaw : null,
  };

  if (!existingEntryForBoat) {
    const { error: insErr } = await supabase.from("race_entries").insert({
      race_id: raceId,
      user_id: user.id,
      boat_id: boatIdForm,
      ...basePatch,
    });

    if (insErr) {
      redirect(`/?error=${encodeURIComponent(insErr.message)}`);
    }

    await recomputeFleetIdForRaceEntry(supabase, ctx, raceId, user.id);
    redirect("/?ashore=1");
  }

  const { error: ashErr } = await supabase
    .from("race_entries")
    .update(basePatch)
    .eq("id", existingEntryForBoat.id);

  if (ashErr) {
    redirect(`/?error=${encodeURIComponent(ashErr.message)}`);
  }

  await recomputeFleetIdForRaceEntry(supabase, ctx, raceId, user.id);
  redirect("/?ashore=1");
}

export async function updateRaceEntrySailNumberForHomeAction(formData: FormData) {
  const groupId = String(formData.get("group_id") ?? "").trim();
  const seriesId = String(formData.get("series_id") ?? "").trim();
  const raceId = String(formData.get("race_id") ?? "").trim();
  const raceEntryId = String(formData.get("race_entry_id") ?? "").trim();
  const sail_raw = String(formData.get("sail_number_override") ?? "").trim();

  if (!groupId || !seriesId || !raceId || !raceEntryId) {
    redirect(`/?error=${encodeURIComponent("Missing race context.")}`);
  }

  const { supabase, user } = await getServerAuth();

  if (!user) redirect("/login");

  if (!(await assertRaceInGroup(supabase, raceId, seriesId, groupId))) {
    redirect(`/?error=${encodeURIComponent("Race not in this series.")}`);
  }

  await requireOwnRaceEntry(supabase, raceId, user.id);

  const { data: tgt } = await supabase
    .from("race_entries")
    .select("id")
    .eq("id", raceEntryId)
    .eq("race_id", raceId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!tgt?.id) {
    redirect(`/?error=${encodeURIComponent("Race entry not found.")}`);
  }

  const { error } = await supabase
    .from("race_entries")
    .update({
      sail_number_override: sail_raw.length ? sail_raw : null,
    })
    .eq("id", tgt.id);

  if (error) {
    redirect(`/?error=${encodeURIComponent(error.message)}`);
  }

  redirect("/?details_saved=1");
}

export async function updateRaceEntryCrewOverrideForHomeAction(formData: FormData) {
  const groupId = String(formData.get("group_id") ?? "").trim();
  const seriesId = String(formData.get("series_id") ?? "").trim();
  const raceId = String(formData.get("race_id") ?? "").trim();
  const raceEntryId = String(formData.get("race_entry_id") ?? "").trim();
  const clear = String(formData.get("clear_crew_override") ?? "").trim() === "1";

  if (!groupId || !seriesId || !raceId || !raceEntryId) {
    redirect(`/?error=${encodeURIComponent("Missing race context.")}`);
  }

  const { supabase, user } = await getServerAuth();

  if (!user) redirect("/login");

  if (!(await assertRaceInGroup(supabase, raceId, seriesId, groupId))) {
    redirect(`/?error=${encodeURIComponent("Race not in this series.")}`);
  }

  await requireOwnRaceEntry(supabase, raceId, user.id);

  if (clear) {
    const { data: tgt } = await supabase
      .from("race_entries")
      .select("id")
      .eq("id", raceEntryId)
      .eq("race_id", raceId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!tgt?.id) {
      redirect(`/?error=${encodeURIComponent("Race entry not found.")}`);
    }

    const { error } = await supabase
      .from("race_entries")
      .update({ crew_template_override: null })
      .eq("id", tgt.id);

    if (error) {
      redirect(`/?error=${encodeURIComponent(error.message)}`);
    }
    redirect("/?details_saved=1");
  }

  const { data: entry } = await supabase
    .from("race_entries")
    .select("boat_id")
    .eq("id", raceEntryId)
    .eq("race_id", raceId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!entry?.boat_id) {
    redirect(`/?error=${encodeURIComponent("Race entry needs a boat before crew overrides.")}`);
  }

  const { data: boat } = await supabase
    .from("boats")
    .select("handedness")
    .eq("id", entry.boat_id)
    .eq("owner_user_id", user.id)
    .maybeSingle();

  if (!boat?.handedness) {
    redirect(`/?error=${encodeURIComponent("Could not load hull handedness.")}`);
  }

  const tpl = crewTemplateFromForm(formData, boat.handedness);
  if (!tpl) {
    redirect(`/?error=${encodeURIComponent("Could not read crew configuration.")}`);
  }

  const { error } = await supabase.from("race_entries").update({ crew_template_override: tpl }).eq("id", raceEntryId);

  if (error) {
    redirect(`/?error=${encodeURIComponent(error.message)}`);
  }

  redirect("/?details_saved=1");
}
