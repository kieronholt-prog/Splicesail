"use server";

import { getServerAuth } from "@/lib/supabase/auth-cache";
import { redirect } from "next/navigation";

export async function completeAccountIntroAction() {
  const { supabase, user } = await getServerAuth();
  if (!user) redirect("/login");
  await supabase
    .from("profiles")
    .update({ has_finished_account_intro: true })
    .eq("id", user.id);
  redirect("/");
}
