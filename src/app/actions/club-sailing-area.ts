"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getServerAuth } from "@/lib/supabase/auth-cache";

async function requireClubAdmin(groupId: string) {
  const { supabase, user } = await getServerAuth();
  if (!user) redirect("/login");

  const { data: me } = await supabase
    .from("group_memberships")
    .select("role")
    .eq("group_id", groupId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (me?.role !== "club_admin") {
    redirect(`/groups/${groupId}?error=` + encodeURIComponent("Club admin only."));
  }

  return { supabase, user };
}

export async function importWscSeedAction(formData: FormData) {
  const groupId = String(formData.get("group_id") ?? "").trim();
  if (!groupId) redirect("/club-admin?error=" + encodeURIComponent("Missing club."));

  const { supabase } = await requireClubAdmin(groupId);

  const { data: seeded, error } = await supabase.rpc("seed_wsc_sailing_area", {
    p_group_id: groupId,
  });

  if (error) {
    redirect(
      `/groups/${groupId}/club-admin/sailing-area?error=` + encodeURIComponent(error.message),
    );
  }

  if (!seeded) {
    const { count } = await supabase
      .from("group_sailing_marks")
      .select("*", { count: "exact", head: true })
      .eq("group_id", groupId);

    if ((count ?? 0) > 0) {
      redirect(`/groups/${groupId}/club-admin/sailing-area?already_loaded=1`);
    }

    redirect(
      `/groups/${groupId}/club-admin/sailing-area?error=` +
        encodeURIComponent("Could not import WSC marks and courses."),
    );
  }

  revalidatePath(`/groups/${groupId}/club-admin/sailing-area`);
  redirect(`/groups/${groupId}/club-admin/sailing-area?seeded=1`);
}

export async function saveSailingMarkAction(formData: FormData) {
  const groupId = String(formData.get("group_id") ?? "").trim();
  const markId = String(formData.get("mark_id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const lat = Number(formData.get("lat"));
  const lon = Number(formData.get("lon"));
  const markKind = String(formData.get("mark_kind") ?? "laid") as "fixed" | "laid";

  if (!groupId || !name || !Number.isFinite(lat) || !Number.isFinite(lon)) {
    redirect(`/groups/${groupId}/club-admin/sailing-area?error=` + encodeURIComponent("Invalid mark fields."));
  }

  const { supabase } = await requireClubAdmin(groupId);

  const payload = {
    group_id: groupId,
    name,
    lat,
    lon,
    mark_kind: markKind === "fixed" ? "fixed" : "laid",
    description: String(formData.get("description") ?? "").trim() || null,
    updated_at: new Date().toISOString(),
  };

  if (markId) {
    await supabase.from("group_sailing_marks").update(payload).eq("id", markId).eq("group_id", groupId);
  } else {
    await supabase.from("group_sailing_marks").insert({ ...payload, sort_order: 0 });
  }

  revalidatePath(`/groups/${groupId}/club-admin/sailing-area`);
  redirect(`/groups/${groupId}/club-admin/sailing-area?mark_saved=1`);
}

export async function deleteSailingMarkAction(formData: FormData) {
  const groupId = String(formData.get("group_id") ?? "").trim();
  const markId = String(formData.get("mark_id") ?? "").trim();
  const { supabase } = await requireClubAdmin(groupId);
  await supabase.from("group_sailing_marks").delete().eq("id", markId).eq("group_id", groupId);
  revalidatePath(`/groups/${groupId}/club-admin/sailing-area`);
  redirect(`/groups/${groupId}/club-admin/sailing-area?mark_removed=1`);
}

export async function saveSailingCourseAction(formData: FormData) {
  const groupId = String(formData.get("group_id") ?? "").trim();
  const courseId = String(formData.get("course_id") ?? "").trim();
  const courseLetter = String(formData.get("course_letter") ?? "").trim();
  const displayName = String(formData.get("display_name") ?? "").trim();
  const courseType = String(formData.get("course_type") ?? "SC");
  const markSequenceRaw = String(formData.get("mark_sequence") ?? "[]");
  const preambleRaw = String(formData.get("marks_preamble") ?? "[]");

  let mark_sequence: unknown = [];
  let marks_preamble: unknown = [];
  try {
    mark_sequence = JSON.parse(markSequenceRaw);
    marks_preamble = JSON.parse(preambleRaw);
  } catch {
    redirect(`/groups/${groupId}/club-admin/sailing-area?error=` + encodeURIComponent("Invalid course JSON."));
  }

  const { supabase } = await requireClubAdmin(groupId);

  const payload = {
    group_id: groupId,
    course_letter: courseLetter,
    display_name: displayName,
    course_type: courseType,
    mark_sequence,
    marks_preamble,
    updated_at: new Date().toISOString(),
  };

  if (courseId) {
    await supabase.from("group_sailing_courses").update(payload).eq("id", courseId).eq("group_id", groupId);
  } else {
    await supabase.from("group_sailing_courses").insert({ ...payload, sort_order: 0 });
  }

  revalidatePath(`/groups/${groupId}/club-admin/sailing-area`);
  redirect(`/groups/${groupId}/club-admin/sailing-area?course_saved=1`);
}

export async function deleteSailingCourseAction(formData: FormData) {
  const groupId = String(formData.get("group_id") ?? "").trim();
  const courseId = String(formData.get("course_id") ?? "").trim();
  const { supabase } = await requireClubAdmin(groupId);
  await supabase.from("group_sailing_courses").delete().eq("id", courseId).eq("group_id", groupId);
  revalidatePath(`/groups/${groupId}/club-admin/sailing-area`);
  redirect(`/groups/${groupId}/club-admin/sailing-area?course_removed=1`);
}

export async function disconnectStravaAction() {
  const { supabase, user } = await getServerAuth();
  if (!user) redirect("/login");
  await supabase.from("user_strava_connections").delete().eq("user_id", user.id);
  revalidatePath("/account");
  redirect("/account?strava_disconnected=1");
}
