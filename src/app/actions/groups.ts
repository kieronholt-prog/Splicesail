"use server";

import { getServerAuth } from "@/lib/supabase/auth-cache";
import { redirect } from "next/navigation";

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export async function createGroupAction(formData: FormData) {
  const { supabase, user } = await getServerAuth();

  if (!user) {
    redirect("/login");
  }

  const name = String(formData.get("name") ?? "").trim();
  const slugRaw = String(formData.get("slug") ?? "").trim().toLowerCase();
  const slug = slugRaw.length > 0 ? slugRaw : null;

  if (!name) {
    redirect("/groups/new?error=" + encodeURIComponent("Group name is required."));
  }

  if (slug !== null && !slugPattern.test(slug)) {
    redirect(
      "/groups/new?error=" +
        encodeURIComponent(
          "Slug must be lowercase letters, numbers, and hyphens (e.g. wembley-sc).",
        ),
    );
  }

  const { error: insertErr } = await supabase.from("groups").insert({
    name,
    slug,
    created_by: user.id,
  });

  if (insertErr) {
    redirect("/groups/new?error=" + encodeURIComponent(insertErr.message));
  }

  // Avoid INSERT … RETURNING + SELECT RLS: membership row is added in an AFTER trigger,
  // but returning the new row requires SELECT before that membership always passes policies.
  const { data: row, error: readErr } = await supabase
    .from("groups")
    .select("id")
    .eq("created_by", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (readErr || !row) {
    redirect(
      "/groups/new?error=" +
        encodeURIComponent(
          readErr?.message ??
            "Group was created but could not be loaded — refresh Groups.",
        ),
    );
  }

  redirect(`/groups/${row.id}`);
}
