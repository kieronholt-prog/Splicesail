"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

async function requireOwnRaceEntry(
  supabase: Awaited<ReturnType<typeof createClient>>,
  raceId: string,
  userId: string,
  groupId: string,
  seriesId: string,
) {
  const { data: row } = await supabase
    .from("race_entries")
    .select("id")
    .eq("race_id", raceId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!row) {
    redirect(
      raceUrl(
        groupId,
        seriesId,
        raceId,
        `error=${encodeURIComponent("Create your race entry first.")}`,
      ),
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

function raceUrl(groupId: string, seriesId: string, raceId: string, qs?: string) {
  const q = qs ? `?${qs}` : "";
  return `/groups/${groupId}/series/${seriesId}/races/${raceId}${q}`;
}

export async function createRaceEntryAction(formData: FormData) {
  const groupId = String(formData.get("group_id") ?? "").trim();
  const seriesId = String(formData.get("series_id") ?? "").trim();
  const raceId = String(formData.get("race_id") ?? "").trim();

  if (!groupId || !seriesId || !raceId) {
    redirect("/groups?error=" + encodeURIComponent("Missing race context."));
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  if (!(await assertRaceInGroup(supabase, raceId, seriesId, groupId))) {
    redirect(raceUrl(groupId, seriesId, raceId, `error=${encodeURIComponent("Race not in this series.")}`));
  }

  const { error } = await supabase.from("race_entries").insert({
    race_id: raceId,
    user_id: user.id,
  });

  if (error) {
    const msg =
      error.code === "23505"
        ? "You already have an entry for this race."
        : error.message;
    redirect(
      raceUrl(groupId, seriesId, raceId, `error=${encodeURIComponent(msg)}`),
    );
  }

  redirect(raceUrl(groupId, seriesId, raceId, "started=1"));
}

export async function updateRaceEntryBoatAction(formData: FormData) {
  const groupId = String(formData.get("group_id") ?? "").trim();
  const seriesId = String(formData.get("series_id") ?? "").trim();
  const raceId = String(formData.get("race_id") ?? "").trim();
  const boatIdRaw = String(formData.get("boat_id") ?? "").trim();
  const sail_number_override = String(formData.get("sail_number_override") ?? "").trim();

  if (!groupId || !seriesId || !raceId) {
    redirect("/groups?error=" + encodeURIComponent("Missing race context."));
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  if (!(await assertRaceInGroup(supabase, raceId, seriesId, groupId))) {
    redirect(raceUrl(groupId, seriesId, raceId, `error=${encodeURIComponent("Race not in this series.")}`));
  }

  await requireOwnRaceEntry(supabase, raceId, user.id, groupId, seriesId);

  const boat_id = boatIdRaw.length ? boatIdRaw : null;

  const { error } = await supabase
    .from("race_entries")
    .update({
      boat_id,
      sail_number_override: sail_number_override.length ? sail_number_override : null,
    })
    .eq("race_id", raceId)
    .eq("user_id", user.id);

  if (error) {
    redirect(
      raceUrl(groupId, seriesId, raceId, `error=${encodeURIComponent(error.message)}`),
    );
  }

  redirect(raceUrl(groupId, seriesId, raceId, "saved=1"));
}

export async function tallyAfloatAction(formData: FormData) {
  await bumpTally(formData, "afloat");
}

export async function tallyAshoreAction(formData: FormData) {
  await bumpTally(formData, "ashore");
}

async function bumpTally(
  formData: FormData,
  which: "afloat" | "ashore",
) {
  const groupId = String(formData.get("group_id") ?? "").trim();
  const seriesId = String(formData.get("series_id") ?? "").trim();
  const raceId = String(formData.get("race_id") ?? "").trim();

  if (!groupId || !seriesId || !raceId) {
    redirect("/groups?error=" + encodeURIComponent("Missing race context."));
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  if (!(await assertRaceInGroup(supabase, raceId, seriesId, groupId))) {
    redirect(raceUrl(groupId, seriesId, raceId, `error=${encodeURIComponent("Race not in this series.")}`));
  }

  await requireOwnRaceEntry(supabase, raceId, user.id, groupId, seriesId);

  const nowIso = new Date().toISOString();
  const patch =
    which === "afloat"
      ? { tally_afloat_at: nowIso }
      : { tally_ashore_at: nowIso };

  const { error } = await supabase
    .from("race_entries")
    .update(patch)
    .eq("race_id", raceId)
    .eq("user_id", user.id);

  if (error) {
    redirect(
      raceUrl(groupId, seriesId, raceId, `error=${encodeURIComponent(error.message)}`),
    );
  }

  const flag = which === "afloat" ? "afloat=1" : "ashore=1";
  redirect(raceUrl(groupId, seriesId, raceId, flag));
}

export async function setRaceOutcomeAction(formData: FormData) {
  const groupId = String(formData.get("group_id") ?? "").trim();
  const seriesId = String(formData.get("series_id") ?? "").trim();
  const raceId = String(formData.get("race_id") ?? "").trim();
  const outcome = String(formData.get("outcome") ?? "").trim();

  if (!groupId || !seriesId || !raceId) {
    redirect("/groups?error=" + encodeURIComponent("Missing race context."));
  }

  const allowed = ["finished", "retired", "dnf", "dns", "dsq", "ocs", ""];
  if (!allowed.includes(outcome)) {
    redirect(
      raceUrl(groupId, seriesId, raceId, `error=${encodeURIComponent("Invalid outcome.")}`),
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  if (!(await assertRaceInGroup(supabase, raceId, seriesId, groupId))) {
    redirect(raceUrl(groupId, seriesId, raceId, `error=${encodeURIComponent("Race not in this series.")}`));
  }

  await requireOwnRaceEntry(supabase, raceId, user.id, groupId, seriesId);

  const { error } = await supabase
    .from("race_entries")
    .update({ outcome: outcome.length ? outcome : null })
    .eq("race_id", raceId)
    .eq("user_id", user.id);

  if (error) {
    redirect(
      raceUrl(groupId, seriesId, raceId, `error=${encodeURIComponent(error.message)}`),
    );
  }

  redirect(raceUrl(groupId, seriesId, raceId, "outcome=1"));
}

export async function updateRaceEntryPyOverrideAction(formData: FormData) {
  const groupId = String(formData.get("group_id") ?? "").trim();
  const seriesId = String(formData.get("series_id") ?? "").trim();
  const raceId = String(formData.get("race_id") ?? "").trim();
  const pyRaw = String(formData.get("py_override") ?? "").trim();

  if (!groupId || !seriesId || !raceId) {
    redirect("/groups?error=" + encodeURIComponent("Missing race context."));
  }

  let py_override: number | null = null;
  if (pyRaw.length) {
    const n = Math.trunc(Number(pyRaw));
    if (!Number.isFinite(n) || n < 400 || n > 2500) {
      redirect(
        raceUrl(
          groupId,
          seriesId,
          raceId,
          `error=${encodeURIComponent("PY override must be between 400 and 2500, or blank.")}`,
        ),
      );
    }
    py_override = n;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  if (!(await assertRaceInGroup(supabase, raceId, seriesId, groupId))) {
    redirect(
      raceUrl(groupId, seriesId, raceId, `error=${encodeURIComponent("Race not in this series.")}`),
    );
  }

  await requireOwnRaceEntry(supabase, raceId, user.id, groupId, seriesId);

  const { error } = await supabase
    .from("race_entries")
    .update({ py_override })
    .eq("race_id", raceId)
    .eq("user_id", user.id);

  if (error) {
    redirect(
      raceUrl(groupId, seriesId, raceId, `error=${encodeURIComponent(error.message)}`),
    );
  }

  redirect(raceUrl(groupId, seriesId, raceId, "py_saved=1"));
}
