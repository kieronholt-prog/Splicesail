"use server";

import { randomBytes } from "node:crypto";
import { normalizeBoatClassKey } from "@/lib/normalize-class";
import { createClient } from "@/lib/supabase/server";
import { getServerAuth } from "@/lib/supabase/auth-cache";
import { redirect } from "next/navigation";

function parsePy(raw: string): number | null {
  const n = Math.trunc(Number(raw));
  if (!Number.isFinite(n) || n < 400 || n > 2500) return null;
  return n;
}

function makeClubHullClassKey(groupId: string, displayLabel: string): string {
  const gid = groupId.replace(/-/g, "").slice(0, 8);
  const base = normalizeBoatClassKey(displayLabel) ?? "boat";
  const suf = randomBytes(3).toString("hex");
  return `club_${gid}_${base}_${suf}`.slice(0, 200);
}

async function requireClubAdminRedirect(groupId: string, userId: string): Promise<void> {
  const supabase = await createClient();
  const { data: m } = await supabase
    .from("group_memberships")
    .select("role")
    .eq("group_id", groupId)
    .eq("user_id", userId)
    .maybeSingle();

  if (m?.role !== "club_admin") {
    redirect(
      `/groups/${groupId}?error=` +
        encodeURIComponent("Only club admins can manage club hull catalogue rows."),
    );
  }
}

function clubAdminHullRedirect(groupId: string, qs: string): never {
  redirect(`/groups/${groupId}/club-admin?${qs}`);
}

function optionalText(formData: FormData, key: string): string | null {
  const s = String(formData.get(key) ?? "").trim();
  return s.length ? s : null;
}

function optionalCrewCount(formData: FormData): number | null {
  const s = optionalText(formData, "crew_count");
  if (!s) return null;
  const n = Math.trunc(Number(s));
  if (!Number.isFinite(n) || n < 1 || n > 20) return null;
  return n;
}

/** Club admin adjusts baseline handicap for a hull defined for this venue (stored in boat_class_pn). */
export async function upsertBoatClassBaselinePyAction(formData: FormData) {
  const groupId = String(formData.get("group_id") ?? "").trim();
  const classKey = String(formData.get("class_key") ?? "").trim();
  const pyRaw = String(formData.get("py") ?? "").trim();
  const py = parsePy(pyRaw);

  if (!groupId || !classKey || py == null) {
    const msg = encodeURIComponent("Choose a hull class and enter a valid baseline PN (400–2500).");
    redirect(`/groups/${groupId}/club-admin?error=${msg}`);
  }

  const { supabase, user } = await getServerAuth();
  if (!user) redirect("/login");
  await requireClubAdminRedirect(groupId, user.id);

  const { data: bc } = await supabase
    .from("boat_classes")
    .select("created_for_group_id")
    .eq("class_key", classKey)
    .maybeSingle();

  if (!bc || bc.created_for_group_id !== groupId) {
    clubAdminHullRedirect(groupId, "error=" + encodeURIComponent("Hull class must belong to this club."));
  }

  const { error } = await supabase.from("boat_class_pn").upsert(
    { class_key: classKey, py },
    { onConflict: "class_key" },
  );

  if (error) {
    clubAdminHullRedirect(groupId, `error=${encodeURIComponent(error.message)}`);
  }

  clubAdminHullRedirect(groupId, "baseline_saved=1");
}

export async function updateClubHullClassDescriptorsAction(formData: FormData) {
  const groupId = String(formData.get("group_id") ?? "").trim();
  const classKey = String(formData.get("class_key") ?? "").trim();
  const displayName = String(formData.get("display_name") ?? "").trim();

  if (!groupId || !classKey || !displayName) {
    const msg = encodeURIComponent("Class key and label are required.");
    if (groupId) {
      clubAdminHullRedirect(groupId, `error=${msg}`);
    }
    redirect(`/club-admin?error=${msg}`);
  }

  const { supabase, user } = await getServerAuth();
  if (!user) redirect("/login");
  await requireClubAdminRedirect(groupId, user.id);

  const { data: bc } = await supabase
    .from("boat_classes")
    .select("created_for_group_id")
    .eq("class_key", classKey)
    .maybeSingle();

  if (!bc || bc.created_for_group_id !== groupId) {
    clubAdminHullRedirect(
      groupId,
      "error=" + encodeURIComponent("Only venue-defined hull classes can be amended here."),
    );
  }

  const crew = optionalCrewCount(formData);

  const { error } = await supabase
    .from("boat_classes")
    .update({
      display_name: displayName,
      category: optionalText(formData, "category"),
      crew_count: crew,
      rig: optionalText(formData, "rig"),
      spinnaker: optionalText(formData, "spinnaker"),
      keel: optionalText(formData, "keel"),
      engine: optionalText(formData, "engine"),
    })
    .eq("class_key", classKey)
    .eq("created_for_group_id", groupId);

  if (error) {
    clubAdminHullRedirect(groupId, "error=" + encodeURIComponent(error.message));
  }

  clubAdminHullRedirect(groupId, "hull_meta_saved=1");
}

export async function createClubHullClassAction(formData: FormData) {
  const groupId = String(formData.get("group_id") ?? "").trim();
  const displayName = String(formData.get("display_name") ?? "").trim();

  if (!groupId || !displayName) {
    const msg = encodeURIComponent("Hull class label is required.");
    if (groupId) {
      redirect(`/groups/${groupId}/club-admin?error=${msg}`);
    }
    redirect(`/club-admin?error=${msg}`);
  }

  const { supabase, user } = await getServerAuth();
  if (!user) redirect("/login");
  await requireClubAdminRedirect(groupId, user.id);

  const class_key = makeClubHullClassKey(groupId, displayName);
  const crew = optionalCrewCount(formData);

  const { error } = await supabase.from("boat_classes").insert({
    class_key,
    display_name: displayName,
    category: optionalText(formData, "category"),
    crew_count: crew,
    rig: optionalText(formData, "rig"),
    spinnaker: optionalText(formData, "spinnaker"),
    keel: optionalText(formData, "keel"),
    engine: optionalText(formData, "engine"),
    created_for_group_id: groupId,
  });

  if (error) {
    clubAdminHullRedirect(groupId, "error=" + encodeURIComponent(error.message));
  }

  clubAdminHullRedirect(groupId, "hull_saved=1&class_list=1");
}

export async function deleteClubHullClassAction(formData: FormData) {
  const groupId = String(formData.get("group_id") ?? "").trim();
  const class_key = String(formData.get("class_key") ?? "").trim();

  if (!groupId || !class_key) {
    const msg = encodeURIComponent("Missing hull class.");
    if (groupId) {
      redirect(`/groups/${groupId}/club-admin?error=${msg}`);
    }
    redirect(`/club-admin?error=${msg}`);
  }

  const { supabase, user } = await getServerAuth();
  if (!user) redirect("/login");
  await requireClubAdminRedirect(groupId, user.id);

  const { error } = await supabase
    .from("boat_classes")
    .delete()
    .eq("class_key", class_key)
    .eq("created_for_group_id", groupId);

  if (error) {
    clubAdminHullRedirect(groupId, "error=" + encodeURIComponent(error.message));
  }

  clubAdminHullRedirect(groupId, "hull_removed=1");
}
