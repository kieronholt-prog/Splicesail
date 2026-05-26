"use server";

import { createClient } from "@/lib/supabase/server";
import { getServerAuth } from "@/lib/supabase/auth-cache";
import { redirect } from "next/navigation";

function parsePy(raw: string): number | null {
  const n = Math.trunc(Number(raw));
  if (!Number.isFinite(n) || n < 400 || n > 2500) return null;
  return n;
}

async function requireClubAdminRedirect(groupId: string, userId: string) {
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
        encodeURIComponent("Only club admins can change club Portsmouth handicap settings."),
    );
  }
}

function clubAdminClubPyNotice(groupId: string, qs: string): never {
  redirect(`/groups/${groupId}/club-admin?${qs}`);
}

async function requireSeriesClubAdminRedirect(groupId: string, seriesId: string, userId: string) {
  await requireClubAdminRedirect(groupId, userId);
  const supabase = await createClient();
  const { data: s } = await supabase.from("series").select("group_id").eq("id", seriesId).maybeSingle();
  if (!s || s.group_id !== groupId) {
    redirect("/groups?error=" + encodeURIComponent("Series does not belong to this club."));
  }
}

export async function upsertGroupClassPyAction(formData: FormData) {
  const groupId = String(formData.get("group_id") ?? "").trim();
  const classRaw = String(formData.get("class_key") ?? "").trim();
  const pyRaw = String(formData.get("py") ?? "").trim();

  const class_key_raw = classRaw.trim().toLowerCase();
  const class_key = class_key_raw.length ? class_key_raw : null;
  const py = parsePy(pyRaw);

  if (!groupId || !class_key || py == null) {
    const msg = encodeURIComponent("Choose a national class and enter a valid PN (400–2500).");
    if (groupId) {
      redirect(`/groups/${groupId}/club-admin?error=${msg}`);
    }
    redirect(`/club-admin?error=${msg}`);
  }

  const { supabase, user } = await getServerAuth();
  if (!user) redirect("/login");
  await requireClubAdminRedirect(groupId, user.id);

  const { data: ryaProbe } = await supabase
    .from("boat_classes")
    .select("created_for_group_id")
    .eq("class_key", class_key)
    .maybeSingle();

  if (!ryaProbe) {
    clubAdminClubPyNotice(
      groupId,
      "error=" + encodeURIComponent("Unknown hull class — pick a national RYA catalogue entry."),
    );
  }

  if (ryaProbe.created_for_group_id != null) {
    clubAdminClubPyNotice(
      groupId,
      "error=" +
        encodeURIComponent(
          "Club-defined hulls are edited under “Club hull classes”. Overrides here apply only to national RYA classes.",
        ),
    );
  }

  const { error } = await supabase.from("group_class_py").upsert(
    { group_id: groupId, class_key, py },
    { onConflict: "group_id,class_key" },
  );

  if (error) {
    clubAdminClubPyNotice(groupId, `error=${encodeURIComponent(error.message)}`);
  }

  clubAdminClubPyNotice(groupId, "py_saved=1");
}

export async function deleteGroupClassPyAction(formData: FormData) {
  const groupId = String(formData.get("group_id") ?? "").trim();
  const class_key = String(formData.get("class_key") ?? "").trim();

  if (!groupId || !class_key) {
    const msg = encodeURIComponent("Missing club Portsmouth row to remove.");
    if (groupId) {
      redirect(`/groups/${groupId}/club-admin?error=${msg}`);
    }
    redirect(`/club-admin?error=${msg}`);
  }

  const { supabase, user } = await getServerAuth();
  if (!user) redirect("/login");
  await requireClubAdminRedirect(groupId, user.id);

  const { error } = await supabase
    .from("group_class_py")
    .delete()
    .eq("group_id", groupId)
    .eq("class_key", class_key);

  if (error) {
    clubAdminClubPyNotice(groupId, `error=${encodeURIComponent(error.message)}`);
  }

  clubAdminClubPyNotice(groupId, "py_removed=1");
}

export async function upsertSeriesClassPyAction(formData: FormData) {
  const groupId = String(formData.get("group_id") ?? "").trim();
  const seriesId = String(formData.get("series_id") ?? "").trim();
  const classRaw = String(formData.get("class_key") ?? "").trim();
  const pyRaw = String(formData.get("py") ?? "").trim();

  const class_key_raw = classRaw.trim().toLowerCase();
  const class_key = class_key_raw.length ? class_key_raw : null;
  const py = parsePy(pyRaw);

  if (!groupId || !seriesId || !class_key || py == null) {
    redirect(
      `/groups/${groupId}/series/${seriesId}?error=` +
        encodeURIComponent("Choose a class and enter a valid PN (400–2500)."),
    );
  }

  const { supabase, user } = await getServerAuth();
  if (!user) redirect("/login");
  await requireSeriesClubAdminRedirect(groupId, seriesId, user.id);

  const { error } = await supabase.from("series_class_py").upsert(
    { series_id: seriesId, class_key, py },
    { onConflict: "series_id,class_key" },
  );

  if (error) {
    redirect(
      `/groups/${groupId}/series/${seriesId}?error=` + encodeURIComponent(error.message),
    );
  }

  redirect(`/groups/${groupId}/series/${seriesId}?py_saved=1`);
}

export async function deleteSeriesClassPyAction(formData: FormData) {
  const groupId = String(formData.get("group_id") ?? "").trim();
  const seriesId = String(formData.get("series_id") ?? "").trim();
  const class_key = String(formData.get("class_key") ?? "").trim();

  if (!groupId || !seriesId || !class_key) {
    redirect("/groups?error=" + encodeURIComponent("Missing row to delete."));
  }

  const { supabase, user } = await getServerAuth();
  if (!user) redirect("/login");
  await requireSeriesClubAdminRedirect(groupId, seriesId, user.id);

  const { error } = await supabase
    .from("series_class_py")
    .delete()
    .eq("series_id", seriesId)
    .eq("class_key", class_key);

  if (error) {
    redirect(
      `/groups/${groupId}/series/${seriesId}?error=` + encodeURIComponent(error.message),
    );
  }

  redirect(`/groups/${groupId}/series/${seriesId}?py_removed=1`);
}
