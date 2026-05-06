"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

function parseOptionalDate(raw: string): string | null {
  const s = raw.trim();
  return s.length ? s : null;
}

/** datetime-local gives `YYYY-MM-DDTHH:mm`; store as UTC for MVP (label form accordingly). */
function datetimeLocalToUtcIso(raw: string): string | null {
  const s = raw.trim();
  if (!s || !s.includes("T")) return null;
  return `${s}:00Z`;
}

export async function createSeriesAction(formData: FormData) {
  const groupId = String(formData.get("group_id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const starts_on = parseOptionalDate(String(formData.get("starts_on") ?? ""));
  const ends_on = parseOptionalDate(String(formData.get("ends_on") ?? ""));

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
      starts_on,
      ends_on,
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

export async function createRaceAction(formData: FormData) {
  const groupId = String(formData.get("group_id") ?? "").trim();
  const seriesId = String(formData.get("series_id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const scheduledRaw = String(formData.get("scheduled_at") ?? "").trim();

  const scheduled_at = datetimeLocalToUtcIso(scheduledRaw);

  if (!groupId || !seriesId) {
    redirect(
      "/groups?error=" +
        encodeURIComponent("Missing group or series — try adding the race again."),
    );
  }

  if (!name || !scheduled_at) {
    redirect(
      `/groups/${groupId}/series/${seriesId}?error=` +
        encodeURIComponent(
          "Race name and scheduled date/time are required (use a complete UTC date/time).",
        ),
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.from("races").insert({
    series_id: seriesId,
    name,
    scheduled_at,
  });

  if (error) {
    redirect(
      `/groups/${groupId}/series/${seriesId}?error=` + encodeURIComponent(error.message),
    );
  }

  redirect(`/groups/${groupId}/series/${seriesId}`);
}
