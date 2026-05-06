"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export async function createGroupAction(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

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

  const { data, error } = await supabase
    .from("groups")
    .insert({
      name,
      slug,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error) {
    redirect("/groups/new?error=" + encodeURIComponent(error.message));
  }

  redirect(`/groups/${data.id}`);
}
