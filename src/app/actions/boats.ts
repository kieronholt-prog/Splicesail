"use server";

import { crewTemplateFromForm } from "@/lib/boat-crew";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

function fleetRedirect(error: string) {
  redirect("/fleet?error=" + encodeURIComponent(error));
}

export async function createBoatAction(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const label = String(formData.get("label") ?? "").trim();
  const class_name = optionalTrim(formData, "class_name");
  const default_sail_number = optionalTrim(formData, "default_sail_number");
  const handedness = String(formData.get("handedness") ?? "").trim();

  if (!label) fleetRedirect("Boat label is required.");

  if (!["single", "double", "triple_plus"].includes(handedness)) {
    fleetRedirect("Invalid handedness.");
  }

  const crew_template = crewTemplateFromForm(formData, handedness);
  if (!crew_template) fleetRedirect("Could not read crew configuration.");

  const { error } = await supabase.from("boats").insert({
    owner_user_id: user.id,
    label,
    class_name,
    default_sail_number,
    handedness,
    crew_template,
  });

  if (error) fleetRedirect(error.message);

  redirect("/fleet");
}

export async function updateBoatAction(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const boatId = String(formData.get("boat_id") ?? "").trim();
  if (!boatId) fleetRedirect("Missing boat.");

  const label = String(formData.get("label") ?? "").trim();
  const class_name = optionalTrim(formData, "class_name");
  const default_sail_number = optionalTrim(formData, "default_sail_number");
  const handedness = String(formData.get("handedness") ?? "").trim();

  if (!label) fleetRedirect("Boat label is required.");
  if (!["single", "double", "triple_plus"].includes(handedness)) {
    fleetRedirect("Invalid handedness.");
  }

  const crew_template = crewTemplateFromForm(formData, handedness);
  if (!crew_template) fleetRedirect("Could not read crew configuration.");

  const { error } = await supabase
    .from("boats")
    .update({
      label,
      class_name,
      default_sail_number,
      handedness,
      crew_template,
    })
    .eq("id", boatId)
    .eq("owner_user_id", user.id);

  if (error) fleetRedirect(error.message);

  redirect("/fleet");
}

export async function deleteBoatAction(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const boatId = String(formData.get("boat_id") ?? "").trim();
  if (!boatId) fleetRedirect("Missing boat.");

  const { error } = await supabase
    .from("boats")
    .delete()
    .eq("id", boatId)
    .eq("owner_user_id", user.id);

  if (error) fleetRedirect(error.message);

  redirect("/fleet");
}

function optionalTrim(formData: FormData, key: string): string | null {
  const s = String(formData.get(key) ?? "").trim();
  return s.length ? s : null;
}
