"use server";

import { resolveClubIanaTimeZone } from "@/lib/club-time";
import { getServerAuth } from "@/lib/supabase/auth-cache";
import { redirect } from "next/navigation";

export async function updateClubIanaTimezoneAction(formData: FormData) {
  const groupId = String(formData.get("group_id") ?? "").trim();
  const rawTz = String(formData.get("iana_timezone") ?? "").trim();

  if (!groupId) {
    redirect("/club-admin?error=" + encodeURIComponent("Missing club."));
  }

  const iana_timezone = resolveClubIanaTimeZone(rawTz);

  const { supabase, user } = await getServerAuth();
  if (!user) redirect("/login");

  const { data: row } = await supabase
    .from("group_memberships")
    .select("role")
    .eq("group_id", groupId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (row?.role !== "club_admin") {
    redirect(
      `/groups/${groupId}?error=` +
        encodeURIComponent("Only club admins can change the club time zone."),
    );
  }

  const { error } = await supabase.from("groups").update({ iana_timezone }).eq("id", groupId);

  if (error) {
    redirect(`/groups/${groupId}/club-admin?error=` + encodeURIComponent(error.message));
  }

  redirect(`/groups/${groupId}/club-admin?timezone_saved=1`);
}

function parseClubYesNo(raw: string): boolean {
  const v = raw.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

export async function updateClubRoAddedBoatsSeriesSettingsAction(formData: FormData) {
  const groupId = String(formData.get("group_id") ?? "").trim();
  const startLine = parseClubYesNo(String(formData.get("ro_added_boats_series_start_line") ?? ""));
  const standings = parseClubYesNo(String(formData.get("ro_added_boats_series_standings") ?? ""));

  if (!groupId) {
    redirect("/club-admin?error=" + encodeURIComponent("Missing club."));
  }

  const { supabase, user } = await getServerAuth();
  if (!user) redirect("/login");

  const { data: row } = await supabase
    .from("group_memberships")
    .select("role")
    .eq("group_id", groupId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (row?.role !== "club_admin") {
    redirect(
      `/groups/${groupId}?error=` +
        encodeURIComponent("Only club admins can change RO-added boat series settings."),
    );
  }

  const { error } = await supabase
    .from("groups")
    .update({
      ro_added_boats_series_start_line: startLine,
      ro_added_boats_series_standings: standings,
    })
    .eq("id", groupId);

  if (error) {
    redirect(`/groups/${groupId}/club-admin?error=` + encodeURIComponent(error.message));
  }

  redirect(`/groups/${groupId}/club-admin?ro_added_series_saved=1`);
}
