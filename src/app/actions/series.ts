"use server";

import { recordRaceCalendarTombstones } from "@/lib/calendar-event-tombstone";
import { createClient } from "@/lib/supabase/server";
import { getServerAuth } from "@/lib/supabase/auth-cache";
import { redirect } from "next/navigation";

/** Race dates and times are set on the series page (race / series generator). */

export async function createSeriesAction(formData: FormData) {
  const groupId = String(formData.get("group_id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();

  if (!groupId) {
    redirect(
      "/groups?error=" + encodeURIComponent("Missing group — try creating a series again."),
    );
  }

  if (!name) {
    redirect(
      `/groups/${groupId}/series/new?error=` +
        encodeURIComponent("Series name is required."),
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("series")
    .insert({
      group_id: groupId,
      name,
      description: description.length ? description : null,
      starts_on: null,
      ends_on: null,
    })
    .select("id")
    .single();

  if (error) {
    redirect(
      `/groups/${groupId}/series/new?error=` + encodeURIComponent(error.message),
    );
  }

  redirect(`/groups/${groupId}/series/${data.id}`);
}

export async function deleteSeriesAction(formData: FormData) {
  const groupId = String(formData.get("group_id") ?? "").trim();
  const seriesId = String(formData.get("series_id") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!groupId || !seriesId) {
    redirect("/groups?error=" + encodeURIComponent("Missing club or series."));
  }

  const { supabase, user } = await getServerAuth();

  if (!user) {
    redirect("/login");
  }

  const email = user.email;
  if (!email) {
    redirect(`/groups/${groupId}?error=` + encodeURIComponent("Your account needs an email address to verify password."));
  }

  const { data: membership } = await supabase
    .from("group_memberships")
    .select("role")
    .eq("group_id", groupId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (membership?.role !== "club_admin") {
    redirect(`/groups/${groupId}?error=` + encodeURIComponent("Only club admins can delete a series."));
  }

  if (!password.trim()) {
    redirect(
      `/groups/${groupId}?error=` +
        encodeURIComponent("Enter your account password to confirm deleting this series."),
    );
  }
  const { verifyUserPassword } = await import("@/lib/auth/verify-password");
  const ok = await verifyUserPassword(email, password);
  if (!ok) {
    redirect(`/groups/${groupId}?error=` + encodeURIComponent("Password did not match."));
  }

  const [{ data: seriesRow }, { data: races }] = await Promise.all([
    supabase.from("series").select("name").eq("id", seriesId).eq("group_id", groupId).maybeSingle(),
    supabase.from("races").select("id, name, scheduled_at").eq("series_id", seriesId),
  ]);

  if (!seriesRow) {
    redirect(`/groups/${groupId}?error=` + encodeURIComponent("Series not found."));
  }

  if ((races ?? []).length > 0) {
    const tomb = await recordRaceCalendarTombstones(supabase, races ?? [], {
      groupId,
      seriesId,
      seriesName: seriesRow.name,
    });
    if (tomb.error) {
      redirect(`/groups/${groupId}?error=` + encodeURIComponent(tomb.error));
    }
  }

  const { error: delErr } = await supabase.from("series").delete().eq("id", seriesId).eq("group_id", groupId);

  if (delErr) {
    redirect(`/groups/${groupId}?error=` + encodeURIComponent(delErr.message));
  }

  redirect(`/groups/${groupId}?series_deleted=1`);
}
