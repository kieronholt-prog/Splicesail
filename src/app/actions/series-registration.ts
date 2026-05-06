"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export async function registerForSeriesAction(formData: FormData) {
  const groupId = String(formData.get("group_id") ?? "").trim();
  const seriesId = String(formData.get("series_id") ?? "").trim();

  if (!groupId || !seriesId) {
    redirect(
      "/groups?error=" +
        encodeURIComponent("Missing group or series — try registering again."),
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: series, error: seriesError } = await supabase
    .from("series")
    .select("id, group_id")
    .eq("id", seriesId)
    .maybeSingle();

  if (seriesError || !series || series.group_id !== groupId) {
    redirect(
      `/groups/${groupId}/series?error=` +
        encodeURIComponent("Series not found for this club."),
    );
  }

  const { error } = await supabase.from("series_registrations").insert({
    series_id: seriesId,
    user_id: user.id,
  });

  if (error) {
    const msg =
      error.code === "23505"
        ? "You are already registered for this series."
        : error.message;
    redirect(
      `/groups/${groupId}/series/${seriesId}?error=` + encodeURIComponent(msg),
    );
  }

  redirect(`/groups/${groupId}/series/${seriesId}?registered=1`);
}

export async function withdrawSeriesRegistrationAction(formData: FormData) {
  const groupId = String(formData.get("group_id") ?? "").trim();
  const seriesId = String(formData.get("series_id") ?? "").trim();

  if (!groupId || !seriesId) {
    redirect(
      "/groups?error=" +
        encodeURIComponent("Missing group or series — try again."),
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { error } = await supabase
    .from("series_registrations")
    .delete()
    .eq("series_id", seriesId)
    .eq("user_id", user.id);

  if (error) {
    redirect(
      `/groups/${groupId}/series/${seriesId}?error=` + encodeURIComponent(error.message),
    );
  }

  redirect(`/groups/${groupId}/series/${seriesId}?withdrawn=1`);
}
