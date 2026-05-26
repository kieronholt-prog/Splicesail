"use server";

import { boatPyFromEmbeddedPnRelation } from "@/lib/boat-class-pn-from-embed";
import { boatHasRacingHistory } from "@/lib/boat-has-racing-history";
import { crewTemplateFromForm } from "@/lib/boat-crew";
import { isBoatActiveInFleet, BOAT_ACTIVE_VALID_TO_ISO } from "@/lib/boat-validity";
import { handednessFromCrewCount } from "@/lib/rya-crew";
import { getServerAuth } from "@/lib/supabase/auth-cache";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";

function fleetRedirect(error: string): never {
  redirect("/fleet?error=" + encodeURIComponent(error));
}

async function catalogueRowForKey(
  supabase: SupabaseClient,
  classKey: string,
): Promise<{ display_name: string | null; py: number | null; crew_count: number | null } | null> {
  const { data } = await supabase
    .from("boat_classes")
    .select("display_name, crew_count, boat_class_pn(py)")
    .eq("class_key", classKey)
    .maybeSingle();

  if (!data) return null;
  const embed = Array.isArray(data.boat_class_pn) ? data.boat_class_pn[0] : data.boat_class_pn;
  const py = boatPyFromEmbeddedPnRelation(embed);

  let crew_count: number | null = null;
  if (data.crew_count != null && String(data.crew_count).trim() !== "") {
    const n = Math.trunc(Number(data.crew_count));
    if (Number.isFinite(n)) crew_count = n;
  }

  return {
    display_name: data.display_name,
    py,
    crew_count,
  };
}

export async function createBoatAction(formData: FormData) {
  const { supabase, user } = await getServerAuth();

  if (!user) redirect("/login");

  const label = String(formData.get("label") ?? "").trim();
  const rya_class_key = String(formData.get("rya_class_key") ?? "").trim();
  const default_sail_number = String(formData.get("default_sail_number") ?? "").trim();

  if (!default_sail_number) fleetRedirect("Sail number is required.");
  if (!rya_class_key) fleetRedirect("Choose a boat class from the RYA list.");

  const ryaRow = await catalogueRowForKey(supabase, rya_class_key);
  if (!ryaRow) fleetRedirect("Unknown boat class.");

  const handedness = handednessFromCrewCount(
    ryaRow.crew_count != null ? Math.trunc(Number(ryaRow.crew_count)) : null,
  );
  const crew_template = crewTemplateFromForm(formData, handedness);
  if (!crew_template) fleetRedirect("Could not read crew configuration.");

  const py_rating =
    ryaRow.py != null && Number.isFinite(Number(ryaRow.py))
      ? Math.trunc(Number(ryaRow.py))
      : null;

  const { error } = await supabase.from("boats").insert({
    owner_user_id: user.id,
    label: label.length ? label : "",
    rya_class_key,
    class_name: ryaRow.display_name ?? null,
    default_sail_number,
    handedness,
    crew_template,
    py_rating,
  });

  if (error) fleetRedirect(error.message);

  redirect("/fleet");
}

export async function updateBoatAction(formData: FormData) {
  const { supabase, user } = await getServerAuth();

  if (!user) redirect("/login");

  const boatId = String(formData.get("boat_id") ?? "").trim();
  if (!boatId) fleetRedirect("Missing boat.");

  const { data: existingBoat } = await supabase
    .from("boats")
    .select("id, valid_to")
    .eq("id", boatId)
    .eq("owner_user_id", user.id)
    .maybeSingle();

  if (!existingBoat?.id) fleetRedirect("Boat not found.");
  if (!isBoatActiveInFleet(existingBoat.valid_to as string | null | undefined)) {
    fleetRedirect("This boat has been removed from your fleet.");
  }

  const label = String(formData.get("label") ?? "").trim();
  const rya_class_key = String(formData.get("rya_class_key") ?? "").trim();
  const default_sail_number = String(formData.get("default_sail_number") ?? "").trim();

  if (!default_sail_number) fleetRedirect("Sail number is required.");
  if (!rya_class_key) fleetRedirect("Choose a boat class from the RYA list.");

  const ryaRow = await catalogueRowForKey(supabase, rya_class_key);
  if (!ryaRow) fleetRedirect("Unknown boat class.");

  const handedness = handednessFromCrewCount(
    ryaRow.crew_count != null ? Math.trunc(Number(ryaRow.crew_count)) : null,
  );

  const crew_template = crewTemplateFromForm(formData, handedness);
  if (!crew_template) fleetRedirect("Could not read crew configuration.");

  const py_rating =
    ryaRow.py != null && Number.isFinite(Number(ryaRow.py))
      ? Math.trunc(Number(ryaRow.py))
      : null;

  const { error } = await supabase
    .from("boats")
    .update({
      label: label.length ? label : "",
      rya_class_key,
      class_name: ryaRow.display_name ?? null,
      default_sail_number,
      handedness,
      crew_template,
      py_rating,
    })
    .eq("id", boatId)
    .eq("owner_user_id", user.id);

  if (error) fleetRedirect(error.message);

  redirect("/fleet");
}

export async function removeBoatFromFleetAction(formData: FormData) {
  const { supabase, user } = await getServerAuth();

  if (!user) redirect("/login");

  const boatId = String(formData.get("boat_id") ?? "").trim();
  if (!boatId) fleetRedirect("Missing boat.");

  const { data: boat } = await supabase
    .from("boats")
    .select("id, valid_to")
    .eq("id", boatId)
    .eq("owner_user_id", user.id)
    .maybeSingle();

  if (!boat?.id) fleetRedirect("Boat not found.");

  if (!isBoatActiveInFleet(boat.valid_to as string | null | undefined)) {
    fleetRedirect("This boat is already removed from your fleet.");
  }

  const nowIso = new Date().toISOString();
  const hasHistory = await boatHasRacingHistory(supabase, boatId);

  if (hasHistory) {
    await supabase.from("series_registration_boats").delete().eq("boat_id", boatId);

    const { error } = await supabase
      .from("boats")
      .update({ valid_to: nowIso })
      .eq("id", boatId)
      .eq("owner_user_id", user.id);

    if (error) fleetRedirect(error.message);

    redirect("/fleet?boat_removed=soft");
  }

  const { error: delErr } = await supabase.from("boats").delete().eq("id", boatId).eq("owner_user_id", user.id);

  if (delErr) fleetRedirect(delErr.message);

  redirect("/fleet?boat_removed=hard");
}

export async function undoRemoveBoatFromFleetAction(formData: FormData) {
  const { supabase, user } = await getServerAuth();

  if (!user) redirect("/login");

  const boatId = String(formData.get("boat_id") ?? "").trim();
  if (!boatId) fleetRedirect("Missing boat.");

  const { data: boat } = await supabase
    .from("boats")
    .select("id, valid_to")
    .eq("id", boatId)
    .eq("owner_user_id", user.id)
    .maybeSingle();

  if (!boat?.id) fleetRedirect("Boat not found.");

  if (isBoatActiveInFleet(boat.valid_to as string | null | undefined)) {
    fleetRedirect("This boat is already active in your fleet.");
  }

  const { error } = await supabase
    .from("boats")
    .update({ valid_to: BOAT_ACTIVE_VALID_TO_ISO })
    .eq("id", boatId)
    .eq("owner_user_id", user.id);

  if (error) fleetRedirect(error.message);

  redirect("/fleet?boat_restored=1");
}

/** Alias for forms that still reference the old name. */
export const deleteBoatAction = removeBoatFromFleetAction;
