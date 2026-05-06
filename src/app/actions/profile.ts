"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

function checkboxOn(formData: FormData, name: string): boolean {
  const v = formData.get(name);
  return v === "true" || v === "on";
}

export async function updateProfileAction(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const displayNameRaw = String(formData.get("display_name") ?? "").trim();
  const phoneRaw = String(formData.get("phone") ?? "").trim();

  const payload = {
    display_name: displayNameRaw.length ? displayNameRaw : null,
    phone: phoneRaw.length ? phoneRaw : null,
    share_track_for_enhanced_analytics: checkboxOn(formData, "share_track"),
    share_start_finish_times_for_results: checkboxOn(formData, "share_times"),
  };

  const { error } = await supabase.from("profiles").update(payload).eq("id", user.id);

  if (error) {
    redirect("/account?error=" + encodeURIComponent(error.message));
  }

  redirect("/account?saved=1");
}
